import { describe, expect, it } from 'vitest'
import { createChart } from './chart'
import type { DifficultyName } from './chart'
import { BATTLEFIELD, COMBO_MULTIPLIER_STOPS, HORDE_PLAN } from './config'
import {
  arrivalTimeAt,
  comboMultiplierFor,
  decayAt,
  depthAt,
  focusedExpectedDamagePerNote,
  planMonsters,
} from './combat'

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

/* ── 墨潮生成（工单 08：波次 × 群落，生成节奏随难度，确定性） ──────── */

/** 带难度元数据的谱面构造（难度决定波宽与群落大小） */
function chartWithDifficulty(
  difficulty: DifficultyName,
  pairs: readonly (readonly [number, number])[],
  phrases?: readonly Phrase[],
): Chart {
  const meta: ChartMeta = {
    song: 'test-song',
    title: '测试曲',
    difficulty,
    keys: Array.from({ length: 7 }, (_, i) => ['C', 'D', 'E', 'F', 'G', 'A', 'B'][i]!),
    quantizeGrid: 0.25,
  }
  return createChart(pairs, { meta, ...(phrases !== undefined ? { phrases } : {}) })
}

/** 每 step 秒一音、跨 span 秒的合成谱面（带难度元数据） */
function pacedChart(difficulty: DifficultyName, step: number, count: number): Chart {
  return chartWithDifficulty(
    difficulty,
    Array.from({ length: count }, (_, i) => [1 + i * step, i % 5] as const),
  )
}

describe('墨潮生成（波次 × 群落，末波墨主压轴）', () => {
  it('按难度波宽分波：每波一群墨妖自波首错峰入场；最后一带为墨主（独行）', () => {
    const wave = HORDE_PLAN.WAVE_SECONDS.medium
    const stagger = HORDE_PLAN.GROUP_STAGGER_SECONDS
    // 跨度跨三波：1 + 2×wave + 5 < 末音符 → 第三波为墨主波
    const count = Math.ceil((2 * wave + 5) / 1) + 1
    const chart = pacedChart('medium', 1, count)
    const plan = planMonsters(chart)

    const demons = plan.filter((m) => m.kind === 'inkDemon')
    const lords = plan.filter((m) => m.kind === 'inkLord')
    expect(lords, '恰一只墨主压轴').toHaveLength(1)
    expect(lords[0]!.spawnAt, '墨主于末波波首登场').toBe(chart.notes[0]!.time + 2 * wave)
    expect(demons, '前两波各一群').toHaveLength(2 * HORDE_PLAN.GROUP_SIZE.medium)
    const wave1 = demons.filter((m) => m.spawnAt < chart.notes[0]!.time + wave)
    expect(wave1).toHaveLength(HORDE_PLAN.GROUP_SIZE.medium)
    expect(wave1.map((m) => m.spawnAt)).toEqual([
      1,
      1 + stagger,
      1 + 2 * stagger,
    ].slice(0, HORDE_PLAN.GROUP_SIZE.medium))
  })

  it('生成节奏随难度：hard 波宽更窄、群落更大', () => {
    expect(HORDE_PLAN.WAVE_SECONDS.hard).toBeLessThan(HORDE_PLAN.WAVE_SECONDS.medium)
    expect(HORDE_PLAN.GROUP_SIZE.hard).toBeGreaterThan(HORDE_PLAN.GROUP_SIZE.medium)
    // 同一谱面：hard 的第二波来得更早（取群内已越出第一波的最早入场）
    const span = HORDE_PLAN.WAVE_SECONDS.medium * 3
    const count = span + 2
    const medium = planMonsters(pacedChart('medium', 1, count))
    const hard = planMonsters(pacedChart('hard', 1, count))
    const mediumSecondWave = medium.find((m) => m.spawnAt > 1 + 20)!
    const hardSecondWave = hard.find((m) => m.spawnAt > 1 + 20)!
    expect(hardSecondWave.spawnAt).toBeLessThan(mediumSecondWave.spawnAt)
  })

  it('HP 随波内音符数缩放且为正整数', () => {
    const wave = HORDE_PLAN.WAVE_SECONDS.medium
    // 三波：波一 15 音（每 2 秒一音）、波二 30 音（每 1 秒一音）、波三墨主
    const sparse = Array.from({ length: 15 }, (_, i) => [1 + i * 2, i % 5] as const)
    const dense = Array.from({ length: 30 }, (_, i) => [2 + wave + i, i % 5] as const)
    const plan = planMonsters(
      chartWithDifficulty('medium', [...sparse, ...dense, [1 + 2 * wave + 1, 0]]),
    )
    for (const m of plan) {
      expect(Number.isInteger(m.hp)).toBe(true)
      expect(m.hp).toBeGreaterThan(0)
    }
    const demonHp = plan.filter((m) => m.kind === 'inkDemon').map((m) => m.hp)
    expect(demonHp).toHaveLength(2 * HORDE_PLAN.GROUP_SIZE.medium)
    expect(demonHp[0]!, '波一 15 音的每只妖').toBeGreaterThan(0)
    expect(demonHp[HORDE_PLAN.GROUP_SIZE.medium]!, '两倍音符的波，每只妖 HP 同倍（±取整）').toBeLessThanOrEqual(
      demonHp[0]! * 2 + 1,
    )
    expect(demonHp[HORDE_PLAN.GROUP_SIZE.medium]!).toBeGreaterThanOrEqual(demonHp[0]! * 2 - 1)
  })

  it('斩首预算不变式：带乐句谱面的墨主 HP ≤ 终章乐句预算 × LORD_HP_FRACTION', () => {
    // 两乐句谱面：末乐句 4 音；谱面跨两波使末波为墨主波
    const wave = HORDE_PLAN.WAVE_SECONDS.medium
    const notes: (readonly [number, number])[] = []
    for (let i = 0; i < wave + 4; i += 1) notes.push([1 + i, i % 5])
    const phrases = [
      { id: 0, start: 1, end: wave, sustainStart: wave, sustainEnd: wave + 0.6 },
      {
        id: 1,
        start: 1 + wave,
        end: 1 + wave + 3,
        sustainStart: 1 + wave + 3,
        sustainEnd: 1 + wave + 3.6,
      },
    ]
    const chart = chartWithDifficulty('medium', notes, phrases)
    const lord = planMonsters(chart).find((m) => m.kind === 'inkLord')!
    const finaleBudget = 4 * focusedExpectedDamagePerNote()
    expect(lord.hp).toBeLessThanOrEqual(Math.ceil(finaleBudget * HORDE_PLAN.LORD_HP_FRACTION))
  })

  it('短谱（不足两波）只有一群墨妖，不生成墨主；空谱无计划', () => {
    const short = planMonsters(pacedChart('medium', 2, 8))
    expect(short.every((m) => m.kind === 'inkDemon')).toBe(true)
    expect(planMonsters(createChart([]))).toEqual([])
  })

  it('计划是纯函数：同一谱面两次规划完全一致（同曲重开一致）', () => {
    const chart = pacedChart('hard', 1, 120)
    expect(planMonsters(chart)).toEqual(planMonsters(chart))
  })
})

/* ── 战斗结算：命中 → 剑气 → 伤害 → 血量（模拟器公共接口） ────────── */

import { BASE_DAMAGE, BATTLEFIELD, TIER_DAMAGE_FACTOR } from './config'
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

/**
 * 单怪计划的便利构造：默认 `at` 时刻已抵琴阵（纵深 0，吃全额剑气）；
 * 传入原始 spawnAt 语义的场合用 rawSpawn 计划字面量。
 */
function singleMonster(hp: number, at = 1): MonsterPlan {
  return { id: 0, kind: 'inkDemon', spawnAt: at - BATTLEFIELD.TRAVEL_SECONDS, hp }
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

describe('剑气 AoE（ADR-0012：全屏纵深衰减，无指向决策）', () => {
  it('一次命中打击全场：不同纵深的怪同时掉血，近的吃得多', () => {
    const decayed = BATTLEFIELD.AOE_DECAY_RATIO ** BATTLEFIELD.AOE_LEVEL_CAP
    const plan: readonly MonsterPlan[] = [
      { id: 0, kind: 'inkDemon', spawnAt: 1 - BATTLEFIELD.TRAVEL_SECONDS, hp: 10_000 }, // 已抵线
      { id: 1, kind: 'inkDemon', spawnAt: 1, hp: 10_000 }, // 刚生成（纵深封顶衰减）
    ]
    const sim = new Simulator(notesEverySecond(1), { monsters: plan })

    sim.keyDown(0, 1.0)

    const views = sim.monstersView()
    const base = BASE_DAMAGE * comboMultiplierFor(1)
    expect(views[0]!.hp, '前排吃全额').toBeCloseTo(10_000 - base, 9)
    expect(views[1]!.hp, '后排按纵深衰减').toBeCloseTo(10_000 - base * decayed, 9)
  })

  it('同一纵深的怪承伤相同：横向位置不在伤害模型里（散布仅视觉）', () => {
    const plan: readonly MonsterPlan[] = [
      { id: 3, kind: 'inkDemon', spawnAt: 1 - BATTLEFIELD.TRAVEL_SECONDS, hp: 10_000 },
      { id: 9, kind: 'inkDemon', spawnAt: 1 - BATTLEFIELD.TRAVEL_SECONDS, hp: 10_000 },
    ]
    const sim = new Simulator(notesEverySecond(1), { monsters: plan })

    sim.keyDown(0, 1.0)

    const views = sim.monstersView()
    expect(views[0]!.hp).toBe(views[1]!.hp)
    expect(views[0]!.hp).toBeLessThan(10_000)
  })

  it('未入场的怪不承伤：剑气够不着场外；场空时剑气劈空（monsterId 空）', () => {
    const plan: readonly MonsterPlan[] = [
      { id: 0, kind: 'inkDemon', spawnAt: 1, hp: 10_000 }, // 已入场
      { id: 1, kind: 'inkDemon', spawnAt: 5, hp: 10_000 }, // 未入场
    ]
    const sim = new Simulator(notesEverySecond(1), { monsters: plan })

    sim.keyDown(0, 1.0)
    let views = sim.monstersView()
    expect(views[1]!.hp, '场外怪不掉血').toBe(10_000)
    expect(strikesOf(sim.drainBattle())[0]!.monsterId).toBe(0)

    const emptyField = new Simulator(createChart([[2.0, 0]]), {
      monsters: [{ id: 2, kind: 'inkDemon', spawnAt: 50, hp: 10_000 }],
    })
    emptyField.keyDown(0, 2.0)
    views = emptyField.monstersView()
    expect(views[0]!.hp, '全部怪在场外：无一掉血').toBe(10_000)
    expect(strikesOf(emptyField.drainBattle())[0]!.monsterId).toBeNull()
  })

  it('击杀随扫场落地：前排被斩即 slain 入流，后排继续挨衰减剑气', () => {
    const base = BASE_DAMAGE // 首击无连击
    const plan: readonly MonsterPlan[] = [
      { id: 0, kind: 'inkDemon', spawnAt: 1 - BATTLEFIELD.TRAVEL_SECONDS, hp: base }, // 一击即斩
      { id: 1, kind: 'inkDemon', spawnAt: 1, hp: 10_000 },
    ]
    const sim = new Simulator(notesEverySecond(1), { monsters: plan })

    sim.keyDown(0, 1.0)

    const battle = sim.drainBattle()
    const slain = battle.filter((e) => e.type === 'slain')
    expect(slain).toHaveLength(1)
    expect(slain[0]!.monsterId).toBe(0)
    expect(sim.monstersView()[1]!.hp).toBeLessThan(10_000)
    expect(sim.monstersView()[1]!.hp).toBeGreaterThan(0)
  })
})

/* ── 扑空（ADR-0011：miss 不再扣血，威胁完全来自怪物到位） ─────────── */

import { JUDGMENT_WINDOWS, PLAYER_MAX_HP } from './config'

describe('扑空（miss 只留可见反馈，不掉血）', () => {
  it('Miss 产生扑空战斗事件，玩家血量不动', () => {
    const sim = new Simulator(createChart([[1.0, 0]]), { monsters: [singleMonster(100, 50)] })
    expect(sim.playerHp).toBe(PLAYER_MAX_HP)

    const judgments = sim.tick(1.0 + JUDGMENT_WINDOWS.good + 0.001)

    expect(judgments).toHaveLength(1) // 判定流仍只有 Miss 一条
    expect(sim.playerHp).toBe(PLAYER_MAX_HP) // 血量纹丝不动
    const battle = sim.drainBattle()
    expect(battle).toHaveLength(1)
    expect(battle[0]!.type).toBe('whiff')
    expect(sim.status).toBe('fighting')
  })

  it('漏接整谱也不掉血：未到线的妖咬不到玩家（因果链：miss→输出下降→墨潮逼近）', () => {
    const sim = new Simulator(notesEverySecond(20), { monsters: [singleMonster(10 ** 6, 40)] })

    sim.tick(15) // 前段漏接；妖在深处（40s 才生成，行程 18s 未走完）

    expect(sim.playerHp).toBe(PLAYER_MAX_HP)
    expect(sim.status).toBe('fighting')
    expect(sim.drainBattle().every((e) => e.type === 'whiff' || e.type === 'strike' === false)).toBe(true)
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
  it('半按：按下的成员正常命中结伤害（无重击），未按成员 Miss 走扑空', () => {
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
    expect(after.filter((e) => e.type === 'whiff')).toHaveLength(1)
    expect(sim.playerHp).toBe(PLAYER_MAX_HP) // 扑空不掉血
    expect(chordEventsOf([...before, ...after])).toHaveLength(0) // 全程无重击
    const perNote = BASE_DAMAGE * comboMultiplierFor(2)
    expect(sim.monstersView()[0]!.hp).toBeCloseTo(1000 - 2 * perNote, 9)
  })

  it('齐按超出齐按窗口（两击都命中但散）：无重击也无扑空', () => {
    const sim = new Simulator(twoNoteChordChart(), { monsters: [singleMonster(1000)] })

    sim.keyDown(2, 1.0)
    sim.keyDown(0, 2.0)
    sim.keyDown(1, 2.0 + CHORD_TOGETHER_WINDOW + 0.01) // 仍在 Good 判定窗内

    const battle = sim.drainBattle()
    expect(strikesOf(battle)).toHaveLength(3)
    expect(chordEventsOf(battle)).toHaveLength(0)
    expect(battle.filter((e) => e.type === 'whiff')).toHaveLength(0)
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

/* ── 推进模型（工单 08，ADR-0011）：纵深纯函数 ─────────────────────── */

describe('推进模型（恒速推进至琴阵，纵深=离琴阵距离）', () => {
  it('生成时刻纵深最大；随后线性递减；抵达琴阵（纵深 0）后停住', () => {
    const spawnAt = 5
    expect(depthAt(spawnAt, spawnAt)).toBe(BATTLEFIELD.SPAWN_DEPTH)
    expect(depthAt(spawnAt, spawnAt - 1), '未生成的怪在深处待命').toBe(BATTLEFIELD.SPAWN_DEPTH)

    const mid = depthAt(spawnAt, spawnAt + BATTLEFIELD.TRAVEL_SECONDS / 2)
    expect(mid).toBeCloseTo(BATTLEFIELD.SPAWN_DEPTH / 2, 9)

    const arrival = arrivalTimeAt(spawnAt)
    expect(arrival).toBeCloseTo(spawnAt + BATTLEFIELD.TRAVEL_SECONDS, 9)
    expect(depthAt(spawnAt, arrival)).toBe(0)
    expect(depthAt(spawnAt, arrival + 100), '到线后不再越过琴阵').toBe(0)
  })

  it('纵深衰减：琴阵前全额，每级 ×DECAY_RATIO，级数封顶', () => {
    const spawnAt = 0
    expect(decayAt(spawnAt, BATTLEFIELD.TRAVEL_SECONDS), '已抵琴阵：全额承伤').toBe(1)

    const oneLevel = BATTLEFIELD.TRAVEL_SECONDS - BATTLEFIELD.AOE_LEVEL_DEPTH / (BATTLEFIELD.SPAWN_DEPTH / BATTLEFIELD.TRAVEL_SECONDS)
    expect(decayAt(spawnAt, oneLevel)).toBeCloseTo(BATTLEFIELD.AOE_DECAY_RATIO, 9)

    const capped = decayAt(spawnAt, 0) // 纵深 SPAWN_DEPTH ≥ CAP×LEVEL_DEPTH → 封顶
    expect(capped).toBeCloseTo(BATTLEFIELD.AOE_DECAY_RATIO ** BATTLEFIELD.AOE_LEVEL_CAP, 9)

    let previous = 0
    for (let t = 0; t <= BATTLEFIELD.TRAVEL_SECONDS; t += 0.5) {
      const d = decayAt(spawnAt, t)
      expect(d, `t=${t} 衰减随推进单调不减`).toBeGreaterThanOrEqual(previous - 1e-12)
      previous = d
    }
  })
})
