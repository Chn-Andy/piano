import { describe, expect, it } from 'vitest'
import { createChart } from './chart'
import { COMBO_MULTIPLIER_STOPS, MONSTER_PLAN } from './config'
import { comboMultiplierFor, planMonsters } from './combat'

describe('连击倍率曲线（连击抬升伤害倍率）', () => {
  it('无连击时倍率为 1（基线伤害）', () => {
    expect(comboMultiplierFor(0)).toBe(1)
    expect(comboMultiplierFor(1)).toBe(1)
  })

  it('倍率随连击单调不减，且封顶于曲线最大档', () => {
    const maxStop = COMBO_MULTIPLIER_STOPS[COMBO_MULTIPLIER_STOPS.length - 1]!
    let previous = comboMultiplierFor(0)
    for (let combo = 1; combo <= maxStop.minCombo + 10; combo += 1) {
      const current = comboMultiplierFor(combo)
      expect(current, `连击 ${combo} 的倍率不低于前一档`).toBeGreaterThanOrEqual(previous)
      previous = current
    }
    expect(comboMultiplierFor(maxStop.minCombo + 10), '超过最高档后封顶').toBe(maxStop.multiplier)
  })

  it('各档门槛为边界含：达到门槛连击即享该档倍率', () => {
    const baseline = comboMultiplierFor(0)
    for (const stop of COMBO_MULTIPLIER_STOPS) {
      expect(comboMultiplierFor(stop.minCombo - 1), `连击 ${stop.minCombo - 1} 未达门槛`).toBeLessThan(stop.multiplier)
      expect(comboMultiplierFor(stop.minCombo), `连击 ${stop.minCombo} 恰达门槛`).toBe(stop.multiplier)
      expect(stop.multiplier, '倍率档必须真正强于基线').toBeGreaterThan(baseline)
    }
  })
})

describe('墨妖出场计划（怪物随歌分段出场，墨主压轴）', () => {
  /** 每 2 秒一音、跨 span 秒的合成谱面 */
  function chartEvery2Seconds(count: number): ReturnType<typeof createChart> {
    const pairs = Array.from({ length: count }, (_, i) => [1 + i * 2, i % 5] as const)
    return createChart(pairs)
  }

  it('按 SEGMENT_SECONDS 分段：每段一只墨妖，最后一段为墨主', () => {
    // 跨度 62 秒（1..63）→ 30s 分段 → [1,31) [31,61) [61,63] 三段
    const chart = chartEvery2Seconds(32)
    const plan = planMonsters(chart)

    expect(plan).toHaveLength(3)
    expect(plan.slice(0, -1).every((m) => m.kind === 'inkDemon')).toBe(true)
    expect(plan[plan.length - 1]!.kind).toBe('inkLord')
    const first = chart.notes[0]!.time
    expect(plan.map((m) => m.spawnAt)).toEqual([
      first,
      first + MONSTER_PLAN.SEGMENT_SECONDS,
      first + 2 * MONSTER_PLAN.SEGMENT_SECONDS,
    ])
  })

  it('短谱（不足两段）只有一只墨妖，不生成墨主', () => {
    const plan = planMonsters(chartEvery2Seconds(5))
    expect(plan).toHaveLength(1)
    expect(plan[0]!.kind).toBe('inkDemon')
  })

  it('墨妖 HP 随所在段音符数缩放（密段更厚），且为正整数', () => {
    // 第一段 [1,31) 每 2 秒一音 = 15 音；第二段 [31,60] 每 1 秒一音 = 30 音
    const sparse = Array.from({ length: 15 }, (_, i) => [1 + i * 2, i % 5] as const)
    const dense = Array.from({ length: 30 }, (_, i) => [31 + i, i % 5] as const)
    const plan = planMonsters(createChart([...sparse, ...dense]))
    for (const m of plan) {
      expect(Number.isInteger(m.hp)).toBe(true)
      expect(m.hp).toBeGreaterThan(0)
      expect(m.id).toBeGreaterThanOrEqual(0)
    }
    expect(plan[1]!.hp, '两倍音符的段，HP 至少 1.5 倍').toBeGreaterThanOrEqual(plan[0]!.hp * 1.5)
  })

  it('同样音符数的段：墨主比墨妖更厚', () => {
    // 两段各 15 音（每 2 秒一音）：[1,31) 与 [31,59]
    const chart = chartEvery2Seconds(30)
    const plan = planMonsters(chart)
    const lord = plan[plan.length - 1]!
    expect(lord.hp).toBeGreaterThan(plan[0]!.hp)
  })

  it('计划是纯函数：同一谱面两次规划完全一致', () => {
    const chart = chartEvery2Seconds(20)
    expect(planMonsters(chart)).toEqual(planMonsters(chart))
  })
})

/* ── 战斗结算：命中 → 剑气 → 伤害 → 血量（模拟器公共接口） ────────── */

import { BASE_DAMAGE, TIER_DAMAGE_FACTOR } from './config'
import type { MonsterPlan } from './combat'
import type { StrikeEvent } from './simulator'
import { Simulator } from './simulator'

import type { OutcomeEvent } from './simulator'

/** 从战斗事件流中筛出剑气（类型收窄辅助） */
function strikesOf(events: ReturnType<Simulator['drainBattle']>): readonly StrikeEvent[] {
  return events.filter((e): e is StrikeEvent => e.type === 'strike')
}

/** 取终局事件（每局至多一条） */
function outcomeOf(events: ReturnType<Simulator['drainBattle']>): OutcomeEvent {
  const found = events.find((e): e is OutcomeEvent => e.type === 'outcome')
  if (found === undefined) throw new Error('战斗流中缺少终局事件')
  return found
}

/** 单怪计划的便利构造 */
function singleMonster(hp: number, spawnAt = 0): MonsterPlan {
  return { id: 0, kind: 'inkDemon', spawnAt, hp }
}

/** 谱面便利：count 颗音符每 1 秒一颗、自 laneStart 起轮回用 5 条键位 */
function notesEverySecond(count: number, startAt = 1): ReturnType<typeof createChart> {
  return createChart(Array.from({ length: count }, (_, i) => [startAt + i, i % 5] as const))
}

describe('命中伤害（音符命中 → 对当前墨妖伤害）', () => {
  it('首击（无连击）造成基线伤害，怪物 HP 应声下降，战斗流出现剑气事件', () => {
    const chart = notesEverySecond(3)
    const sim = new Simulator(chart, { monsters: [singleMonster(100)] })

    sim.keyDown(0, 1.0)

    const monster = sim.monstersView()[0]!
    expect(monster.maxHp).toBe(100)
    expect(monster.hp).toBe(100 - BASE_DAMAGE * comboMultiplierFor(1))

    const battle = sim.drainBattle()
    expect(battle).toHaveLength(1)
    const strike = strikesOf(battle)[0]!
    expect(strike.monsterId).toBe(0)
    expect(strike.judgment).toBe('Perfect')
    expect(strike.damage).toBeCloseTo(BASE_DAMAGE * comboMultiplierFor(1), 9)
  })

  it('Good 命中按判定折扣造成伤害（Perfect × TIER_DAMAGE_FACTOR）', () => {
    const perfect = new Simulator(notesEverySecond(1), { monsters: [singleMonster(100)] })
    const good = new Simulator(notesEverySecond(1), { monsters: [singleMonster(100)] })

    perfect.keyDown(0, 1.0)
    good.keyDown(0, 1.0 + 0.06) // Good 窗口内、Perfect 窗口外

    const perfectHp = perfect.monstersView()[0]!.hp
    const goodHp = good.monstersView()[0]!.hp
    expect(goodHp).toBeCloseTo(
      perfectHp + BASE_DAMAGE * comboMultiplierFor(1) * (1 - TIER_DAMAGE_FACTOR.Good),
      9,
    )
  })

  it('连击抬升伤害：达到倍率档后，同判定命中伤害更高', () => {
    const chart = notesEverySecond(12)
    const sim = new Simulator(chart, { monsters: [singleMonster(10000)] })

    for (let i = 0; i < 11; i += 1) {
      sim.keyDown(i % 5, 1.0 + i)
      sim.keyUp(i % 5) // 键位每 5 颗轮回，先松开避免长按去重
    }

    const strikes = strikesOf(sim.drainBattle())
    const first = strikes[0]!
    const afterStop = strikes[COMBO_MULTIPLIER_STOPS[0]!.minCombo]! // 恰达第一档后的那击
    expect(first.damage).toBeCloseTo(BASE_DAMAGE, 9)
    expect(afterStop.damage).toBeCloseTo(BASE_DAMAGE * COMBO_MULTIPLIER_STOPS[0]!.multiplier, 9)
  })
})

describe('目标选择（怪物随段落出场；剑气劈空不记账）', () => {
  it('怪物未入场前的命中劈空：无伤害入账，事件 monsterId 为空', () => {
    const sim = new Simulator(notesEverySecond(3), { monsters: [singleMonster(100, 50)] })

    sim.keyDown(0, 1.0)

    const battle = sim.drainBattle()
    expect(battle).toHaveLength(1)
    const strike = strikesOf(battle)[0]!
    expect(strike.monsterId).toBeNull()
    expect(sim.monstersView()[0]!.hp, '未入场的怪不掉血').toBe(100)
  })

  it('伤害打向最早已入场的活怪；它死后溢出伤害不结转，下一只接棒', () => {
    const plan: readonly MonsterPlan[] = [
      { id: 0, kind: 'inkDemon', spawnAt: 0, hp: 20 },
      { id: 1, kind: 'inkDemon', spawnAt: 5, hp: 100 },
    ]
    const chart = createChart([
      [1.0, 0],
      [2.0, 1],
      [4.0, 2],
      [6.0, 3],
    ])
    const sim = new Simulator(chart, { monsters: plan })

    sim.keyDown(0, 1.0) // 10 伤害
    sim.keyDown(1, 2.0) // 再 10，恰耗尽 20 HP → 击杀，无溢出
    const killed = sim.drainBattle()
    expect(killed.filter((e) => e.type === 'slain')).toHaveLength(1)
    expect(killed[killed.length - 1]!.type).toBe('slain')
    expect(sim.monstersView()[0]!.hp).toBe(0)

    sim.keyDown(2, 4.0) // 下一只未入场（spawnAt=5）→ 剑气劈空
    expect(sim.monstersView()[1]!.hp).toBe(100)
    expect(strikesOf(sim.drainBattle())[0]!.monsterId).toBeNull()

    sim.keyDown(3, 6.0) // 已入场 → 接棒挨打
    expect(sim.monstersView()[1]!.hp).toBe(100 - BASE_DAMAGE * comboMultiplierFor(1))
  })
})

/* ── Miss 反击与败局面（血空 / 歌毕怪未清） ────────────────────────── */

import { COUNTER_DAMAGE, JUDGMENT_WINDOWS, PLAYER_MAX_HP } from './config'

describe('Miss 反击（漏音符 → 墨妖反击 → 玩家掉血）', () => {
  it('Miss 产生反击事件，玩家 HP 扣 COUNTER_DAMAGE，判走流不受影响', () => {
    const sim = new Simulator(createChart([[1.0, 0]]), { monsters: [singleMonster(100)] })
    expect(sim.playerHp).toBe(PLAYER_MAX_HP)

    const judgments = sim.tick(1.0 + JUDGMENT_WINDOWS.good + 0.001)

    expect(judgments).toHaveLength(1) // 判定流仍只有 Miss 一条
    expect(sim.playerHp).toBe(PLAYER_MAX_HP - COUNTER_DAMAGE)
    const battle = sim.drainBattle()
    expect(battle).toHaveLength(1)
    expect(battle[0]!.type).toBe('counter')
    expect(sim.status).toBe('fighting')
  })
})

describe('败局（血空 / 歌毕怪未清，ADR-0004）', () => {
  it('反击扣血至空 → 败局事件、状态定格，后续输入与时间推进全部失效', () => {
    const chart = notesEverySecond(20)
    const sim = new Simulator(chart, { monsters: [singleMonster(10000)] })
    const fatalMisses = Math.ceil(PLAYER_MAX_HP / COUNTER_DAMAGE)

    const judgments = sim.tick(100)
    const battle = sim.drainBattle()

    expect(sim.status).toBe('defeat')
    expect(sim.playerHp).toBe(0)
    expect(judgments).toHaveLength(fatalMisses) // 恰好打到血空的那些 Miss
    expect(battle.filter((e) => e.type === 'counter')).toHaveLength(fatalMisses)
    const outcome = outcomeOf(battle)
    expect(outcome.result).toBe('defeat')
    expect(outcome.reason).toBe('player-hp-empty')

    // 定格：再怎么按、怎么推进都无事件无变化
    const frozen = sim.keyDown(0, 50)
    expect(frozen.events).toHaveLength(0)
    expect(sim.tick(200)).toHaveLength(0)
    expect(sim.drainBattle()).toHaveLength(0)
    expect(sim.status).toBe('defeat')
  })

  it('玩家血未空但歌毕怪未清 → 败局（reason: monsters-remain）', () => {
    const sim = new Simulator(createChart([[1.0, 0]]), { monsters: [singleMonster(10000)] })

    sim.tick(1.0 + JUDGMENT_WINDOWS.good + 0.001) // 一次 Miss 反击，血未空
    expect(sim.drainBattle().at(-1)!.type).toBe('counter')

    sim.tick(3.1) // 谱面终点 3.0 已过
    const battle = sim.drainBattle()
    expect(battle).toHaveLength(1)
    const outcome = outcomeOf(battle)
    expect(outcome.result).toBe('defeat')
    expect(outcome.reason).toBe('monsters-remain')
    expect(sim.status).toBe('defeat')
    expect(sim.playerHp).toBeGreaterThan(0)
  })
})

/* ── 和弦音符（GLOSSARY）：齐按重击 / 半按各安其位 / 松散无赏 ──────── */

import { CHORD_MULTIPLIER, CHORD_TOGETHER_WINDOW } from './config'

/** 单个 2 键和弦（lanes 0+1）@ t=2，前置一颗单音热手（t=1, lane 2） */
function twoNoteChordChart(): ReturnType<typeof createChart> {
  return createChart([
    [1.0, 2],
    [2.0, 0, 0],
    [2.0, 1, 0],
  ])
}

function chordEventsOf(events: ReturnType<Simulator['drainBattle']>) {
  return events.filter((e) => e.type === 'chord')
}

describe('和弦齐按（同组齐按 → 重击）', () => {
  it('窗口内齐按：成员各自命中 + 重击加成，总伤 = 成员伤害和 × CHORD_MULTIPLIER', () => {
    const sim = new Simulator(twoNoteChordChart(), { monsters: [singleMonster(1000)] })

    sim.keyDown(2, 1.0) // 前置单音
    sim.keyDown(0, 2.0) // 和弦成员一
    const mid = sim.drainBattle()
    expect(strikesOf(mid)).toHaveLength(2)
    expect(chordEventsOf(mid)).toHaveLength(0) // 未齐，先无重击

    sim.keyDown(1, 2.0 + CHORD_TOGETHER_WINDOW / 2) // 齐按窗口内补上成员二
    const final = sim.drainBattle()
    expect(strikesOf(final)).toHaveLength(1)
    const chords = chordEventsOf(final)
    expect(chords).toHaveLength(1)
    expect(chords[0]!.monsterId).toBe(0)

    const perNote = BASE_DAMAGE * comboMultiplierFor(2) // 连击 1..2，倍率均为基线
    // 总伤 = 前置单音 + 和弦成员伤害和 × 重击倍率
    expect(sim.monstersView()[0]!.hp).toBeCloseTo(
      1000 - perNote - 2 * perNote * CHORD_MULTIPLIER,
      9,
    )
    expect(sim.combo).toBe(3) // 单音 1 + 和弦成员 2
  })

  it('加成可单独完成击杀：重击落地即 slain', () => {
    const perNote = BASE_DAMAGE * comboMultiplierFor(2)
    const hp = 3 * perNote + 1 // 三击（单音 + 两成员）打不死，重击加成收尾
    const sim = new Simulator(twoNoteChordChart(), { monsters: [singleMonster(hp)] })

    sim.keyDown(2, 1.0)
    sim.keyDown(0, 2.0)
    sim.keyDown(1, 2.0)
    const battle = sim.drainBattle()

    const chords = chordEventsOf(battle)
    expect(chords).toHaveLength(1)
    expect(chords[0]!.bonusDamage).toBeCloseTo(2 * perNote * (CHORD_MULTIPLIER - 1), 9)
    expect(battle.at(-1)!.type).toBe('slain')
    expect(sim.monstersView()[0]!.hp).toBe(0)
  })
})

describe('和弦半按与松散（语义锁定）', () => {
  it('半按：按下的成员正常命中结伤害（无重击），未按成员 Miss 招致反击', () => {
    const sim = new Simulator(twoNoteChordChart(), { monsters: [singleMonster(1000)] })

    sim.keyDown(2, 1.0) // 前置单音
    sim.keyDown(0, 2.0) // 只按了一半
    const before = sim.drainBattle()
    expect(strikesOf(before)).toHaveLength(2)

    const misses = sim.tick(2.0 + JUDGMENT_WINDOWS.good + 0.001)
    expect(misses).toHaveLength(1) // 只有未按的成员二 Miss
    expect(misses[0]!.judgment).toBe('Miss')

    const after = sim.drainBattle()
    expect(strikesOf(after)).toHaveLength(0)
    expect(after.filter((e) => e.type === 'counter')).toHaveLength(1)
    expect(sim.playerHp).toBe(PLAYER_MAX_HP - COUNTER_DAMAGE)
    expect(chordEventsOf([...before, ...after])).toHaveLength(0) // 全程无重击
    const perNote = BASE_DAMAGE * comboMultiplierFor(2)
    expect(sim.monstersView()[0]!.hp).toBeCloseTo(1000 - 2 * perNote, 9)
  })

  it('齐按超出齐按窗口（两击都命中但散）：无重击也无反击', () => {
    const sim = new Simulator(twoNoteChordChart(), { monsters: [singleMonster(1000)] })

    sim.keyDown(2, 1.0)
    sim.keyDown(0, 2.0)
    sim.keyDown(1, 2.0 + CHORD_TOGETHER_WINDOW + 0.01) // 仍在 Good 判定窗内

    const battle = sim.drainBattle()
    expect(strikesOf(battle)).toHaveLength(3)
    expect(chordEventsOf(battle)).toHaveLength(0)
    expect(battle.filter((e) => e.type === 'counter')).toHaveLength(0)
    expect(sim.playerHp).toBe(PLAYER_MAX_HP)
  })

  it('三键和弦齐按：加成随成员数缩放', () => {
    const chart = createChart([
      [2.0, 0, 7],
      [2.0, 1, 7],
      [2.0, 2, 7],
    ])
    const sim = new Simulator(chart, { monsters: [singleMonster(5000)] })

    sim.keyDown(0, 2.0)
    sim.keyDown(1, 2.0)
    sim.keyDown(2, 2.0)

    const chord = chordEventsOf(sim.drainBattle())[0]!
    const perNote = BASE_DAMAGE * comboMultiplierFor(3) // 连击 1..3，倍率均为基线
    expect(chord.size).toBe(3)
    expect(chord.bonusDamage).toBeCloseTo(3 * perNote * (CHORD_MULTIPLIER - 1), 9)
  })
})

/* ── 胜局与结算统计 ────────────────────────────────────────────────── */

describe('胜局（歌毕 + 场上怪清完）', () => {
  it('清完所有怪撑到歌末 → 胜局事件，状态定格于胜利', () => {
    const sim = new Simulator(createChart([[1.0, 0]]), { monsters: [singleMonster(10)] })

    sim.keyDown(0, 1.0)
    expect(sim.monstersView()[0]!.hp).toBe(0)
    expect(sim.status, '怪清完但歌未毕，仍是进行中').toBe('fighting')

    const judgments = sim.tick(3.1) // 谱面终点 3.0 已过
    expect(judgments).toHaveLength(0)
    const battle = sim.drainBattle()
    const outcome = outcomeOf(battle)
    expect(outcome.result).toBe('victory')
    expect(outcome.reason).toBe('cleared')
    expect(sim.status).toBe('victory')
  })

  it('summary()：最大连击、三级判定计数、总伤害', () => {
    const chart = createChart([
      [1.0, 0],
      [2.0, 1],
      [3.0, 0],
    ])
    const sim = new Simulator(chart, { monsters: [singleMonster(1000)] })

    sim.keyDown(0, 1.0)
    sim.keyUp(0)
    sim.keyDown(1, 2.0)
    sim.keyUp(1)
    sim.tick(3.0 + JUDGMENT_WINDOWS.good + 0.001)

    const s = sim.summary()
    expect(s.maxCombo).toBe(2)
    expect(s.perfect).toBe(2)
    expect(s.good).toBe(0)
    expect(s.miss).toBe(1)
    const perNote = BASE_DAMAGE * comboMultiplierFor(1)
    expect(s.damageDealt).toBeCloseTo(2 * perNote, 9)
  })
})

/* ── 定标性质：真实卡农谱面（Seam 1 吃真实谱面产物，锁「可胜可败」差距） ── */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Chart, ChartMeta, Phrase } from './chart'

interface CanonJson {
  notes: readonly { id: number; time: number; lane: number; chordId?: number }[]
  meta: ChartMeta
  phrases: readonly Phrase[]
}

function canonChart(difficulty: 'easy' | 'medium' | 'hard'): Chart {
  const path = join(import.meta.dirname, '..', 'charts', 'canon', `${difficulty}.json`)
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as CanonJson
  return createChart(
    raw.notes.map((n) => (n.chordId === undefined ? [n.time, n.lane] : [n.time, n.lane, n.chordId])),
    { meta: raw.meta, phrases: raw.phrases },
  )
}

/** 弹奏模型：是否接住某音符、按键偏移多少（独立于实现的"玩家"假设） */
interface PlayStyle {
  readonly name: string
  hits(noteId: number): boolean
  offset(noteId: number): number
}

/** 整首驱动：按模型弹完 + 冲刷 Miss + 推到歌末，返回终局模拟器 */
function playThrough(chart: Chart, style: PlayStyle): Simulator {
  const sim = new Simulator(chart)
  for (const note of chart.notes) {
    if (style.hits(note.id)) {
      sim.keyDown(note.lane, note.time + style.offset(note.id))
      sim.keyUp(note.lane)
    }
    sim.tick(note.time + JUDGMENT_WINDOWS.good + 0.01)
  }
  sim.tick(chart.duration + 0.01)
  return sim
}

const PERFECT: PlayStyle = { name: '完美', hits: () => true, offset: () => 0 }
/** 认真玩家：每音必接（每 20 颗失手一颗），抖动在 Perfect 窗内 */
const FOCUSED: PlayStyle = {
  name: '认真',
  hits: (id) => id % 20 !== 19,
  offset: (id) => ((id % 7) - 3) * 0.012,
}
/** 普通玩家：三失其一，抖动常落 Good 档 */
const CASUAL: PlayStyle = {
  name: '普通',
  hits: (id) => id % 3 !== 0,
  offset: (id) => ((id % 5) * 0.02) - 0.02,
}

describe.each(['easy', 'medium', 'hard'] as const)('卡农 %s 定标性质', (difficulty) => {
  it('完美弹奏：每个音都判出，整首不断裂，终局胜利', () => {
    const chart = canonChart(difficulty)
    const sim = playThrough(chart, PERFECT)

    const s = sim.summary()
    expect(s.perfect + s.good, '所有音符都得到判定').toBe(chart.notes.length)
    expect(sim.status).toBe('victory')
  })

  it('认真弹奏（95% 命中 + Perfect 抖动）：能撑到歌末并清场获胜', () => {
    const sim = playThrough(canonChart(difficulty), FOCUSED)
    expect(sim.status).toBe('victory')
  })

  it('普通弹奏（三失其一）：打不完这整首（败局）', () => {
    const sim = playThrough(canonChart(difficulty), CASUAL)
    expect(sim.status).toBe('defeat')
  })
})
