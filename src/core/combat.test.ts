import { describe, expect, it } from 'vitest'
import { createChart } from './chart'
import type { DifficultyName, NoteTint } from './chart'
import {
  BATTLEFIELD,
  BASE_DAMAGE,
  COMBO_MULTIPLIER_STOPS,
  HORDE_PLAN,
  JUDGMENT_WINDOWS,
  PLAYER_MAX_HP,
  QINXIN,
  SUSTAIN_STRIKE,
  TIER_DAMAGE_FACTOR,
  TINT_EFFECTS,
} from './config'
import { blastDamage, coldDelaySeconds, poisonTickCount, poisonTickDamage } from './tints'
import {
  arrivalTimeAt,
  comboMultiplierFor,
  decayAt,
  depthAt,
  focusedExpectedDamagePerNote,
  planMonsters,
} from './combat'
import type { MonsterPlan } from './combat'
import type { SustainEvent } from './sustain'

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
      chartWithDifficulty('medium', [...sparse, ...dense, [1 + 2 * wave + 6, 0]]),
    )
    for (const m of plan) {
      expect(Number.isInteger(m.hp)).toBe(true)
      expect(m.hp).toBeGreaterThan(0)
    }
    const demonHp = plan.filter((m) => m.kind === 'inkDemon').map((m) => m.hp)
    expect(demonHp).toHaveLength(2 * HORDE_PLAN.GROUP_SIZE.medium)
    expect(demonHp[0]!, '波一 14 音的每只妖').toBeGreaterThan(0)
    const secondWaveHp = demonHp[HORDE_PLAN.GROUP_SIZE.medium]!
    expect(secondWaveHp, '两倍音符的波，每只妖 HP 同倍（±取整）').toBeGreaterThan(
      demonHp[0]! * 1.8,
    )
    expect(secondWaveHp).toBeLessThan(demonHp[0]! * 2.2)
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

import type { StrikeEvent, OutcomeEvent } from './simulator'
import { Simulator } from './simulator'

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

/* ── 到线咬击（ADR-0011：玩家血量仅因怪物攻击下降） ───────────────── */

const BITE_INTERVAL = BATTLEFIELD.ATTACK_BEATS * BATTLEFIELD.BEAT_SECONDS

describe('到线咬击（抵达琴阵后每 2 拍咬一口，直至被杀）', () => {
  it('行程内不掉血；抵达琴阵后歇一个整间隔才咬第一口（边界含）', () => {
    // 长谱（duration 32）覆盖咬线时刻；spawnAt=2 → 抵达 20 → 首口 21
    const sim = new Simulator(createChart([[30.0, 0]]), { monsters: [singleMonster(10_000, 20)] })

    sim.tick(19.9)
    expect(sim.playerHp).toBe(PLAYER_MAX_HP)

    sim.tick(21.0)
    expect(sim.playerHp).toBe(PLAYER_MAX_HP - BATTLEFIELD.BITE_DAMAGE)
    const bite = sim.drainBattle().find((e) => e.type === 'bite')
    expect(bite!.time, '首口 = 抵达 + 一个整间隔（到达 20 + BITE_INTERVAL）').toBeCloseTo(
      20 + BITE_INTERVAL,
      9,
    )
  })

  it('咬线节奏确定且与 tick 粒度无关：一步跨多口补齐全部咬击', () => {
    const coarse = new Simulator(createChart([[30.0, 0]]), { monsters: [singleMonster(10_000, 20)] })
    coarse.tick(24.5) // 21..24 共 4 口（边界含：第 5 口恰在一个 BITE_INTERVAL 后，未到）

    const fine = new Simulator(createChart([[30.0, 0]]), { monsters: [singleMonster(10_000, 20)] })
    fine.tick(22.0)
    fine.tick(23.5)
    fine.tick(24.5)

    expect(coarse.playerHp).toBe(PLAYER_MAX_HP - 4 * BATTLEFIELD.BITE_DAMAGE) // 每口一拍间隔 ×2
    expect(fine.playerHp).toBe(coarse.playerHp)
  })

  it('被击杀的怪从战场移除：不再推进、不再咬线', () => {
    const sim = new Simulator(notesEverySecond(3), { monsters: [singleMonster(BASE_DAMAGE, 1)] })

    sim.keyDown(0, 1.0) // 恰好一击斩杀
    expect(sim.monstersView()[0]!.hp).toBe(0)

    sim.tick(60)
    expect(sim.playerHp).toBe(PLAYER_MAX_HP)
    expect(sim.drainBattle().filter((e) => e.type === 'bite')).toHaveLength(0)
  })

  it('咬空血量 → 败局定格（player-hp-empty），多余的口不发', () => {
    const sim = new Simulator(createChart([[30.0, 0]]), { monsters: [singleMonster(10_000, 20)] })

    const lethalBites = Math.ceil(PLAYER_MAX_HP / BATTLEFIELD.BITE_DAMAGE)
    sim.tick(21 + lethalBites * BITE_INTERVAL + 0.5) // 恰好咬到血空（咬空先于歌毕裁定）

    const battle = sim.drainBattle()
    const bites = battle.filter((e) => e.type === 'bite')
    expect(bites, '咬到血空即止，多余的口不发').toHaveLength(lethalBites)
    expect(sim.playerHp).toBe(0)
    expect(sim.status).toBe('defeat')
    const outcome = outcomeOf(battle)
    expect(outcome.result).toBe('defeat')
    expect(outcome.reason).toBe('player-hp-empty')
    // 定格：时间与输入全部失效
    expect(sim.tick(60)).toHaveLength(0)
    expect(sim.keyDown(0, 40).events).toHaveLength(0)
    expect(sim.drainBattle()).toHaveLength(0)
  })

  it('歌毕仍有怪存活 → 败局（monsters-remain）；全清空（含墨主）→ 胜', () => {
    const lose = new Simulator(createChart([[1.0, 0]]), {
      monsters: [{ id: 0, kind: 'inkDemon', spawnAt: 15, hp: 10_000 }], // 在途，未咬过人
    })
    lose.tick(3.1) // 谱面终点 3.0 已过
    const lostBattle = lose.drainBattle()
    expect(outcomeOf(lostBattle).reason).toBe('monsters-remain')
    expect(lose.playerHp).toBe(PLAYER_MAX_HP)

    const win = new Simulator(createChart([[1.0, 0]]), {
      monsters: [
        { id: 0, kind: 'inkDemon', spawnAt: 1 - BATTLEFIELD.TRAVEL_SECONDS, hp: BASE_DAMAGE },
        { id: 1, kind: 'inkLord', spawnAt: 1 - BATTLEFIELD.TRAVEL_SECONDS, hp: BASE_DAMAGE },
      ],
    })
    win.keyDown(0, 1.0) // 同纵深各吃一击 → 全灭（含墨主）
    win.tick(3.1)
    const wonBattle = win.drainBattle()
    expect(win.monstersView().every((m) => m.hp === 0)).toBe(true)
    expect(outcomeOf(wonBattle).result).toBe('victory')
    expect(outcomeOf(wonBattle).reason).toBe('cleared')
    expect(win.status).toBe('victory')
  })
})

/* ── 余韵/终章升格：真实 AoE 结伤（ADR-0007 增补 + 工单 08） ───────── */

/** 从战斗流筛出余韵事件 */
function sustainsOf(events: ReturnType<Simulator['drainBattle']>): readonly SustainEvent[] {
  return events.filter((e): e is SustainEvent => e.type === 'sustain')
}

/** 双乐句谱面（句一 4 音 t=1..4、句二 4 音 t=5.6..8.6），余韵窗口 0.6s */
function twoPhraseChart(): Chart {
  return chartWithDifficulty('medium', [
    [1.0, 0], [2.0, 1], [3.0, 0], [4.0, 2],
    [5.6, 1], [6.6, 0], [7.6, 2], [8.6, 1],
  ], [
    { id: 0, start: 1, end: 4, sustainStart: 4, sustainEnd: 4.6 },
    { id: 1, start: 5.6, end: 8.6, sustainStart: 8.6, sustainEnd: 9.2 },
  ])
}

describe('余韵结伤（表现分档 → 全场真实伤害）', () => {
  it('grand 余韵对全场每只怪全额结句预算（无视纵深）；伤害随事件携带', () => {
    const sim = new Simulator(twoPhraseChart(), {
      monsters: [
        { id: 0, kind: 'inkDemon', spawnAt: 1 - BATTLEFIELD.TRAVEL_SECONDS, hp: 10_000 }, // 在线
        { id: 1, kind: 'inkDemon', spawnAt: 4, hp: 10_000 }, // 句末刚生成，深处
      ],
    })
    for (const [i, lane] of [0, 1, 0, 2].entries()) {
      sim.keyDown(lane, 1 + i)
      sim.keyUp(lane)
    }
    sim.tick(4 + JUDGMENT_WINDOWS.good + 0.001) // 句一收束 → grand

    const battle = sim.drainBattle()
    const s = sustainsOf(battle)[0]!
    expect(s.tier).toBe('grand')
    const grandDamage = 4 * focusedExpectedDamagePerNote() * SUSTAIN_STRIKE.TIER_DAMAGE_FRACTION.grand
    expect(s.damage).toBeCloseTo(grandDamage, 9)
    const views = sim.monstersView()
    // 句内 4 击先扣（倍率均基线 ×1，在线怪全额 / 深处怪封顶衰减），随后余韵全额泼场
    expect(views[0]!.hp, '在线怪吃满').toBeCloseTo(
      10_000 - 4 * BASE_DAMAGE - grandDamage,
      9,
    )
    expect(views[1]!.hp, '深处怪同吃余韵全额（收势泼全场，直击只挨衰减零头）').toBeCloseTo(
      10_000 - BASE_DAMAGE * decayAt(4, 4) - grandDamage,
      9,
    )
  })

  it('档位越高伤害越高：minor < major < grand', () => {
    const play = (script: readonly ('hit' | 'miss')[]): number => {
      const sim = new Simulator(twoPhraseChart(), {
        monsters: [{ id: 0, kind: 'inkDemon', spawnAt: 1 - BATTLEFIELD.TRAVEL_SECONDS, hp: 10_000 }],
      })
      for (const [i, lane] of [0, 1, 0, 2].entries()) {
        if (script[i] === 'hit') {
          sim.keyDown(lane, 1 + i)
          sim.keyUp(lane)
        }
      }
      sim.tick(4 + JUDGMENT_WINDOWS.good + 0.001)
      return sustainsOf(sim.drainBattle())[0]!.damage
    }
    const minor = play(['miss', 'miss', 'miss', 'miss'])
    const grand = play(['hit', 'hit', 'hit', 'hit'])
    expect(minor).toBeCloseTo(4 * focusedExpectedDamagePerNote() * SUSTAIN_STRIKE.TIER_DAMAGE_FRACTION.minor, 9)
    expect(grand).toBeGreaterThan(minor)
  })

  it('终章 grand 可斩首满血墨主（无论墨主推进到何处）', () => {
    const sim = new Simulator(twoPhraseChart(), {
      monsters: [
        {
          id: 7,
          kind: 'inkLord',
          spawnAt: 5.6, // 末乐句起点生成，终章触发时仍在深处
          hp: Math.ceil(4 * focusedExpectedDamagePerNote() * HORDE_PLAN.LORD_HP_FRACTION),
        },
      ],
    })
    sim.tick(4 + JUDGMENT_WINDOWS.good + 0.001) // 句一全漏 → minor
    sim.drainBattle()
    expect(sim.monstersView()[0]!.hp).toBeGreaterThan(0)
    for (const [i, lane] of [1, 0, 2, 1].entries()) {
      sim.keyDown(lane, 5.6 + i * 1.0) // 句二全 Perfect
      sim.keyUp(lane)
    }
    sim.tick(8.6 + JUDGMENT_WINDOWS.good + 0.001) // 终章 grand

    const battle = sim.drainBattle()
    const finale = sustainsOf(battle)[0]!
    expect(finale.finale).toBe(true)
    expect(sim.monstersView()[0]!.hp, '满血墨主被终章斩首').toBe(0)
    expect(battle.some((e) => e.type === 'slain' && e.monsterId === 7)).toBe(true)
  })

  it('斩首不变式（构造性保证）：grand × 终章倍率 ≥ 墨主预算比例', () => {
    expect(
      SUSTAIN_STRIKE.TIER_DAMAGE_FRACTION.grand * SUSTAIN_STRIKE.FINALE_MULTIPLIER,
    ).toBeGreaterThanOrEqual(HORDE_PLAN.LORD_HP_FRACTION)
    expect(
      SUSTAIN_STRIKE.TIER_DAMAGE_FRACTION.major * SUSTAIN_STRIKE.FINALE_MULTIPLIER,
    ).toBeLessThan(HORDE_PLAN.LORD_HP_FRACTION) // 斩首只属于 grand
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
    // 在线妖在 t=2 的例行咬线（到达 1.0 后首口 2.0）；掉血来自咬线而非扑空
    expect(after.filter((e) => e.type === 'bite')).toHaveLength(1)
    expect(sim.playerHp).toBe(PLAYER_MAX_HP - BATTLEFIELD.BITE_DAMAGE)
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

/* ── 定标性质：真实谱面产物（Seam 1 吃真实 JSON，锁「可胜可败」差距）──────
 * 工单 08 立规矩、工单 11 扩到三曲 × 三难度：完美与认真玩家守得住，
 * 普通玩家（三失其一）守不住，静置必被咬空。这四条是数值改动的红线——
 * 任何常量调整都要重新跑一遍这组性质。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Chart, ChartMeta, Phrase } from './chart'

interface ChartJsonFile {
  notes: readonly { id: number; time: number; lane: number; chordId?: number; tint?: NoteTint }[]
  meta: ChartMeta
  phrases: readonly Phrase[]
}

/** 读入入库产物（与装配层同一条路：JSON → createChart 全量再校验） */
function songChart(dir: string, difficulty: 'easy' | 'medium' | 'hard'): Chart {
  const path = join(import.meta.dirname, '..', 'charts', dir, difficulty + '.json')
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as ChartJsonFile
  return createChart(
    raw.notes.map((n) => [n.time, n.lane, n.chordId, n.tint]),
    { meta: raw.meta, phrases: raw.phrases },
  )
}

/** 弹奏模型：是否接住某音符、按键偏移多少（独立于实现的「玩家」假设） */
interface PlayStyle {
  readonly name: string
  hits(noteId: number): boolean
  offset(noteId: number): number
}

/**
 * 整首驱动：按模型弹完 + 冲刷 Miss + 推到歌末，返回终局模拟器。
 * 同刻音符（和弦成员）必须**一次按完再推进时钟**——逐颗按会先 tick 一次，
 * 把和弦里还没按的成员直接判成 Miss（工单 11 扩到带和弦的谱面时暴露）。
 */
function playThrough(chart: Chart, style: PlayStyle): Simulator {
  const sim = new Simulator(chart)
  let index = 0
  while (index < chart.notes.length) {
    const time = chart.notes[index]!.time
    const group: typeof chart.notes[number][] = []
    while (index < chart.notes.length && chart.notes[index]!.time === time) {
      group.push(chart.notes[index]!)
      index += 1
    }
    for (const note of group) {
      if (!style.hits(note.id)) continue
      sim.keyDown(note.lane, note.time + style.offset(note.id))
      sim.keyUp(note.lane)
    }
    sim.tick(time + JUDGMENT_WINDOWS.good + 0.01)
  }
  sim.tick(chart.duration + 0.01)
  return sim
}

/** 静置玩家：从不按键（墨潮长驱直入） */
const IDLE: PlayStyle = { name: '静置', hits: () => false, offset: () => 0 }

const PERFECT: PlayStyle = { name: '完美', hits: () => true, offset: () => 0 }
/** 认真玩家：每 20 颗失手一颗，抖动在 Perfect 窗内 */
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

/** 三曲 × 三难度（工单 11：九张谱面全量性质） */
const CHART_MATRIX = (
  [
    { dir: 'canon', title: '卡农' },
    { dir: 'fur-elise', title: '致爱丽丝' },
    { dir: 'chun-jiang', title: '春江花月夜' },
  ] as const
).flatMap((song) =>
  (['easy', 'medium', 'hard'] as const).map((difficulty) => ({
    dir: song.dir,
    title: song.title,
    difficulty,
  })),
)

describe.each(CHART_MATRIX)('定标性质：$title $difficulty（工单 11：三曲 × 三难度）', ({ dir, difficulty }) => {
  it('完美弹奏：每个音都判出，终局胜利', () => {
    const chart = songChart(dir, difficulty)
    const sim = playThrough(chart, PERFECT)

    const s = sim.summary()
    expect(s.perfect + s.good, '所有音符都得到判定').toBe(chart.notes.length)
    expect(sim.status).toBe('victory')
  })

  it('认真弹奏（95% 命中 + Perfect 抖动）：守得住琴阵，撑到歌末清场获胜', () => {
    const sim = playThrough(songChart(dir, difficulty), FOCUSED)
    expect(sim.status).toBe('victory')
    expect(sim.playerHp, '认真玩家不该被打穿').toBeGreaterThanOrEqual(PLAYER_MAX_HP / 2)
  })

  it('普通弹奏（三失其一）：守线失败（血空或怪残留），败局', () => {
    const sim = playThrough(songChart(dir, difficulty), CASUAL)
    expect(sim.status).toBe('defeat')
  })

  it('静置弹奏：墨潮推进到琴阵咬空血量——血量威胁完全来自怪物到位', () => {
    const sim = playThrough(songChart(dir, difficulty), IDLE)
    const battle = drainedOf(sim)
    expect(sim.status).toBe('defeat')
    expect(outcomeOf(battle).reason).toBe('player-hp-empty')
    expect(
      battle.filter((e) => e.type === 'bite').length,
      '血空全靠咬（口数 = 血量上限 / 每口伤害）',
    ).toBeGreaterThanOrEqual(Math.ceil(PLAYER_MAX_HP / BATTLEFIELD.BITE_DAMAGE))
  })
})

/** 从终局模拟器取全量战斗流（drainBattle 只出一次，测试里聚合用） */
function drainedOf(sim: Simulator): ReturnType<Simulator['drainBattle']> {
  const events = sim.drainBattle()
  expect(events.length, 'drainBattle 只该在终局后调一次').toBeGreaterThan(0)
  return events
}

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

    const oneLevel =
      BATTLEFIELD.TRAVEL_SECONDS -
      BATTLEFIELD.AOE_LEVEL_DEPTH / (BATTLEFIELD.SPAWN_DEPTH / BATTLEFIELD.TRAVEL_SECONDS)
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

/* ── 异色音符（工单 09，GLOSSARY：异色音符）────────────────────────── */

describe('异色音符：三色效果（工单 09）', () => {
  /** 单颗带词缀音符的谱面（余下一颗远端音符撑住谱面时长，避免提前收场） */
  function tintedChart(time: number, tint: NoteTint): ReturnType<typeof createChart> {
    return createChart([
      [time, 0, undefined, tint],
      [time + 30, 1],
    ])
  }

  /** 一只已抵琴阵的怪（spawnAt 早于行程，t 时刻纵深 0） */
  function atLine(hp: number, at = 1, id = 0): MonsterPlan {
    return { id, kind: 'inkDemon', spawnAt: at - BATTLEFIELD.TRAVEL_SECONDS, hp }
  }

  it('寒音：全场怪物后退半步并减速——纵深变大、抵阵与咬击节奏整体后延', () => {
    const sim = new Simulator(tintedChart(1, 'cold'), { monsters: [atLine(10_000)] })
    sim.tick(0.9)
    expect(depthAt(-18, 1), '施放前恰在琴阵（纵深 0）').toBe(0)

    sim.keyDown(0, 1.0)

    const view = sim.monstersView()[0]!
    expect(view.holdBack, '行程后延 = 击退折算 + 减速折算').toBeCloseTo(coldDelaySeconds(), 9)
    expect(view.slowedUntil, '减速状态可见 3 秒').toBeCloseTo(1 + TINT_EFFECTS.cold.SLOW_SECONDS, 9)
    const pushed = depthAt(view.spawnAt, 1.0, view.holdBack)
    expect(pushed, '被推离琴阵：纵深回到 0 以上').toBeGreaterThan(0)
    expect(pushed, '半步量级：不到一个衰减级的两倍').toBeLessThan(BATTLEFIELD.AOE_LEVEL_DEPTH * 2)

    const tintEvent = sim.drainBattle().find((e) => e.type === 'tint')
    expect(tintEvent).toMatchObject({ kind: 'cold', targetIds: [0] })
  })

  it('寒音：咬击被打断——被推离琴阵的怪先走回线，再等一拍才咬', () => {
    // 对照局：同谱面但不带词缀（寒音音符当普通音符用）
    const control = new Simulator(createChart([[3, 0], [33, 1]]), { monsters: [atLine(10_000)] })
    const chilled = new Simulator(tintedChart(3, 'cold'), { monsters: [atLine(10_000)] })

    for (const sim of [control, chilled]) {
      sim.tick(2.9)
      sim.keyDown(0, 3.0)
      sim.tick(5.0)
    }

    const bitesAfter = (sim: Simulator): number =>
      sim.drainBattle().filter((e) => e.type === 'bite' && e.time > 3.0).length
    expect(bitesAfter(control), '对照局：4、5 秒各一口').toBe(2)
    expect(bitesAfter(chilled), '寒音后延 3.4 秒：推离琴阵后这段时间一口也咬不到').toBe(0)
  })

  it('寒音：后延封顶于全程行程，且不重放历史咬口（不掉二次血）', () => {
    const sim = new Simulator(
      createChart([[1, 0, undefined, 'cold'], [3, 1, undefined, 'cold'], [5, 2, undefined, 'cold']]),
      { monsters: [atLine(10_000, 1)] },
    )
    for (const at of [1, 3, 5]) {
      sim.tick(at - 0.1)
      sim.keyDown(sim.pendingNotes()[0]!.lane, at)
    }
    const view = sim.monstersView()[0]!
    expect(view.holdBack).toBeLessThanOrEqual(BATTLEFIELD.TRAVEL_SECONDS)
    const bites = sim.drainBattle().filter((e) => e.type === 'bite')
    const times = bites.map((e) => e.time)
    expect(new Set(times).size, '咬击时刻互不重复').toBe(times.length)
    expect(sim.playerHp, '咬口总伤害 = 口数 × 每口伤害').toBe(
      PLAYER_MAX_HP - bites.length * BATTLEFIELD.BITE_DAMAGE,
    )
  })

  it('毒音：最前怪中毒，每拍一跳、共 5 秒，按自身最大生命结算', () => {
    const hp = 1000
    const sim = new Simulator(tintedChart(1, 'toxic'), { monsters: [atLine(hp)] })
    sim.tick(0.9)
    sim.keyDown(0, 1.0)
    const afterStrike = sim.monstersView()[0]!.hp
    expect(afterStrike).toBeLessThan(hp)

    sim.tick(6.05)

    const poison = sim.drainBattle().filter((e) => e.type === 'poison')
    expect(poison, '跳数 = 持续时间 / 参考拍长').toHaveLength(poisonTickCount())
    for (const tick of poison) {
      expect(tick).toMatchObject({ monsterId: 0 })
      expect(tick.damage).toBeCloseTo(poisonTickDamage(hp), 9)
    }
    const total = poison.reduce((sum, e) => sum + e.damage, 0)
    expect(total).toBeCloseTo(hp * TINT_EFFECTS.toxic.POISON_FRACTION_PER_BEAT * poisonTickCount(), 9)
    expect(sim.monstersView()[0]!.hp).toBeCloseTo(afterStrike - total, 9)
  })

  it('毒音：跳时刻与 tick 粒度无关（一步跨 5 秒 = 逐帧推进）', () => {
    const coarse = new Simulator(tintedChart(1, 'toxic'), { monsters: [atLine(1000)] })
    const fine = new Simulator(tintedChart(1, 'toxic'), { monsters: [atLine(1000)] })
    coarse.tick(0.9)
    fine.tick(0.9)
    coarse.keyDown(0, 1.0)
    fine.keyDown(0, 1.0)

    coarse.tick(6.05)
    for (let t = 1.05; t <= 6.05; t += 0.05) fine.tick(t)

    const ticks = (sim: Simulator): number[] =>
      sim.drainBattle().filter((e) => e.type === 'poison').map((e) => Number(e.time.toFixed(6)))
    expect(ticks(coarse)).toEqual(ticks(fine))
    expect(coarse.monstersView()[0]!.hp).toBeCloseTo(fine.monstersView()[0]!.hp, 9)
  })

  it('毒音：毒得死——跳伤归零即击杀入流，剩余跳数不再补', () => {
    const hp = 15
    const chart = createChart([
      [1, 0, undefined, 'toxic'],
      [33, 1],
    ])
    const sim = new Simulator(chart, { monsters: [atLine(hp)] })
    sim.tick(0.9)
    sim.keyDown(0, 1.0) // 毒音命中：15 → 5，同时中毒
    sim.tick(6.0)

    const battle = sim.drainBattle()
    const slain = battle.filter((e) => e.type === 'slain')
    expect(slain.length, '至多一次击杀').toBeLessThanOrEqual(1)
    expect(sim.monstersView()[0]!.hp).toBe(0)
    const poison = battle.filter((e) => e.type === 'poison')
    const total = poison.reduce((sum, e) => sum + e.damage, 0)
    expect(total, '伤害不超过身板（溢出不吃）').toBeLessThanOrEqual(hp)
  })

  it('爆音：最前与次前各受一记按身板的重击，第三只不吃；深处也吃满（无视纵深）', () => {
    const hp = 1000
    const plan: readonly MonsterPlan[] = [
      atLine(hp, 1, 0), // 纵深 0
      { id: 1, kind: 'inkDemon', spawnAt: 1 - BATTLEFIELD.TRAVEL_SECONDS / 2, hp }, // 纵深 5
      { id: 2, kind: 'inkDemon', spawnAt: 1, hp }, // 纵深 10（战场最深处）
    ]
    const sim = new Simulator(tintedChart(1, 'blast'), { monsters: plan })
    sim.tick(0.9)
    sim.keyDown(0, 1.0)

    const views = sim.monstersView()
    const blast = blastDamage(hp)
    const strike = BASE_DAMAGE * comboMultiplierFor(1)
    expect(views[0]!.hp, '最前：剑气全额 + 重击').toBeCloseTo(hp - strike - blast, 9)
    expect(views[1]!.hp, '次前：剑气衰减 + 重击').toBeCloseTo(hp - strike * decayAt(plan[1]!.spawnAt, 1.0) - blast, 9)
    expect(views[2]!.hp, '第三只：只有衰减剑气').toBeCloseTo(hp - strike * decayAt(plan[2]!.spawnAt, 1.0), 9)

    const tintEvent = sim.drainBattle().find((e) => e.type === 'tint')
    expect(tintEvent).toMatchObject({ kind: 'blast', targetIds: [0, 1] })
  })

  it('空场扑空：三种词缀都照发事件、不崩溃，判定与连击不受影响', () => {
    for (const kind of ['cold', 'toxic', 'blast'] as const) {
      const sim = new Simulator(tintedChart(1, kind), { monsters: [] })
      sim.tick(0.9)
      const outcome = sim.keyDown(0, 1.0)
      expect(outcome.events[0]).toMatchObject({ judgment: 'Perfect', combo: 1 })
      const tintEvent = sim.drainBattle().find((e) => e.type === 'tint')
      expect(tintEvent, `${kind} 的事件照发`).toMatchObject({ kind, targetIds: [] })
    }
  })

  it('词缀不改变判定：同一时刻的同色/普通音符给出相同判定与连击', () => {
    const plain = new Simulator(createChart([[1, 0], [31, 1]]), { monsters: [] })
    const tinted = new Simulator(tintedChart(1, 'toxic'), { monsters: [] })
    plain.tick(0.9)
    tinted.tick(0.9)
    const a = plain.keyDown(0, 1.06)
    const b = tinted.keyDown(0, 1.06)
    expect(b.events[0]).toMatchObject({ judgment: 'Good', combo: 1 })
    expect(b.events[0]!.judgment).toBe(a.events[0]!.judgment)
  })

  it('和弦成员共享词缀：整组只结算一次效果', () => {
    const chart = createChart([
      [1, 0, 0, 'cold'],
      [1, 1, 0, 'cold'],
      [31, 2],
    ])
    const sim = new Simulator(chart, { monsters: [atLine(10_000)] })
    sim.tick(0.9)
    sim.keyDown(0, 1.0)
    sim.keyDown(1, 1.02)
    sim.keyUp(0)
    sim.keyUp(1)

    const tintEvents = sim.drainBattle().filter((e) => e.type === 'tint')
    expect(tintEvents, '两键和弦只触发一次寒音').toHaveLength(1)
    const view = sim.monstersView()[0]!
    expect(view.holdBack, '后延只加一层').toBeCloseTo(coldDelaySeconds(), 9)
  })
})
/* ── 琴心（工单 10，GLOSSARY：琴心；ADR-0007 增补）──────────────────── */

/**
 * 琴心测试的谱面：count 颗音符以 step 秒等距排布（默认 0.1 秒 → 30 击约 3 秒），
 * 整段是一句。等距密排是为了在**咬线开始前**攒满一炮——这些测试关心的是
 * 蓄能与爆发，不该被守线压力搅局。
 */
function burstChart(count: number, step = 0.1, startAt = 2): ReturnType<typeof createChart> {
  const times = Array.from({ length: count }, (_, i) => Math.round((startAt + i * step) * 1000) / 1000)
  const pairs = times.map((time, i) => [time, i % 5] as const)
  const end = times[times.length - 1]!
  return createChart(pairs, {
    phrases: [{ id: 0, start: times[0]!, end, sustainStart: end, sustainEnd: end + 0.6 }],
  })
}

/** 依次命中前 count 击（同键轮回须先松开，避免长按去重） */
function hitFirst(sim: Simulator, count: number, step = 0.1, startAt = 2): void {
  for (let i = 0; i < count; i += 1) {
    const time = Math.round((startAt + i * step) * 1000) / 1000
    sim.keyDown(i % 5, time)
    sim.keyUp(i % 5)
  }
}

describe('琴心蓄能与琴心通明（工单 10）', () => {
  it('充能速率：满 CHARGE_COMBOS 次命中恰好放一炮，少一击不放', () => {
    const short = new Simulator(burstChart(QINXIN.CHARGE_COMBOS), { monsters: [singleMonster(10_000)] })
    hitFirst(short, QINXIN.CHARGE_COMBOS - 1)
    expect(short.qinxinReleases, '差一击不放').toBe(0)
    expect(short.qinxinGauge).toBeCloseTo((QINXIN.CHARGE_COMBOS - 1) / QINXIN.CHARGE_COMBOS, 9)

    const full = new Simulator(burstChart(QINXIN.CHARGE_COMBOS), { monsters: [singleMonster(10_000)] })
    hitFirst(full, QINXIN.CHARGE_COMBOS)
    expect(full.qinxinReleases, '满槽即放').toBe(1)
    expect(full.qinxinGauge, '放完清零').toBe(0)
    expect(full.summary().qinxin, '结算统计带上次数').toBe(1)
  })

  it('满槽即放：爆发时刻 = 填满它的那一击（不等 tick）', () => {
    const sim = new Simulator(burstChart(QINXIN.CHARGE_COMBOS), { monsters: [singleMonster(10_000)] })
    hitFirst(sim, QINXIN.CHARGE_COMBOS)
    const burst = sim.drainBattle().find((e) => e.type === 'qinxin')
    expect(burst).toBeDefined()
    expect(burst!.time).toBeCloseTo(2 + 0.1 * (QINXIN.CHARGE_COMBOS - 1), 6)
  })

  it('断连不清空：二十击 → 漏一音 → 再十击，攒下的那层还在', () => {
    const sim = new Simulator(burstChart(QINXIN.CHARGE_COMBOS + 1), { monsters: [singleMonster(10_000)] })
    hitFirst(sim, 20)
    expect(sim.qinxinGauge).toBeCloseTo(20 / QINXIN.CHARGE_COMBOS, 9)

    // 第 21 颗留给 Miss：推进时钟越过它的 Good 窗
    const missAt = Math.round((2 + 0.1 * 20) * 1000) / 1000
    sim.tick(missAt + JUDGMENT_WINDOWS.good + 0.001)
    expect(sim.combo, '漏接断连').toBe(0)
    expect(sim.qinxinGauge, '断连不清空已蓄之能').toBeCloseTo(20 / QINXIN.CHARGE_COMBOS, 9)

    for (let i = 21; i <= QINXIN.CHARGE_COMBOS; i += 1) {
      const time = Math.round((2 + 0.1 * i) * 1000) / 1000
      sim.keyDown(i % 5, time)
      sim.keyUp(i % 5)
    }
    expect(sim.qinxinReleases, '断连只推迟放炮，不吞掉它').toBe(1)
  })

  it('Miss 不充能：漏音既不涨槽也不掉槽', () => {
    const sim = new Simulator(burstChart(5), { monsters: [singleMonster(10_000)] })
    sim.keyDown(0, 2)
    sim.keyUp(0)
    const before = sim.qinxinGauge
    sim.tick(10)
    expect(sim.summary().miss).toBeGreaterThan(0)
    expect(sim.qinxinGauge).toBeCloseTo(before, 9)
  })

  it('溢出不浪费：连击不断时长连击能连放两炮', () => {
    const sim = new Simulator(burstChart(QINXIN.CHARGE_COMBOS * 2), { monsters: [singleMonster(10_000)] })
    hitFirst(sim, QINXIN.CHARGE_COMBOS * 2)
    expect(sim.qinxinReleases).toBe(2)
    expect(sim.qinxinGauge).toBe(0)
  })

  it('琴心通明：全场无衰减——最前排与最深处的怪吃到同一发', () => {
    const baseline = focusedExpectedDamagePerNote() * QINXIN.DAMAGE_NOTE_EQUIVALENT
    const plan: readonly MonsterPlan[] = [
      { id: 0, kind: 'inkDemon', spawnAt: 1 - BATTLEFIELD.TRAVEL_SECONDS, hp: 10_000 }, // 已抵线
      { id: 1, kind: 'inkDemon', spawnAt: 2, hp: 10_000 }, // 随首音符入场（纵深一路封顶）
    ]
    const sim = new Simulator(burstChart(QINXIN.CHARGE_COMBOS), { monsters: plan })
    hitFirst(sim, QINXIN.CHARGE_COMBOS - 1)
    const before = sim.monstersView()
    const hitTime = Math.round((2 + 0.1 * (QINXIN.CHARGE_COMBOS - 1)) * 1000) / 1000
    sim.keyDown((QINXIN.CHARGE_COMBOS - 1) % 5, hitTime)
    sim.keyUp((QINXIN.CHARGE_COMBOS - 1) % 5)
    const after = sim.monstersView()

    // 第 30 击的剑气按纵深衰减；爆发份额 = 总掉血 − 剑气份额，两排应相等
    const strikeShare = (index: number): number =>
      BASE_DAMAGE * comboMultiplierFor(QINXIN.CHARGE_COMBOS) *
      decayAt(plan[index]!.spawnAt, hitTime, after[index]!.holdBack)
    const burstShare = (index: number): number => before[index]!.hp - after[index]!.hp - strikeShare(index)
    expect(burstShare(0), '前排吃满').toBeCloseTo(baseline, 6)
    expect(burstShare(1), '深处也吃满（无衰减）').toBeCloseTo(baseline, 6)
    expect(decayAt(plan[1]!.spawnAt, hitTime), '对照组：剑气在深处确实衰减').toBeLessThan(1)
  })

  it('与乐句余韵同刻：琴心先入流、两者独立结伤不合并', () => {
    const sim = new Simulator(burstChart(QINXIN.CHARGE_COMBOS), { monsters: [singleMonster(10_000)] })
    hitFirst(sim, QINXIN.CHARGE_COMBOS) // 命中当刻放炮
    const end = Math.round((2 + 0.1 * (QINXIN.CHARGE_COMBOS - 1)) * 1000) / 1000
    sim.tick(end + JUDGMENT_WINDOWS.good + 0.05) // 句末收势

    const battle = sim.drainBattle()
    const burstIndex = battle.findIndex((e) => e.type === 'qinxin')
    const sustainIndex = battle.findIndex((e) => e.type === 'sustain')
    expect(burstIndex, '琴心在流里').toBeGreaterThanOrEqual(0)
    expect(sustainIndex, '余韵在流里').toBeGreaterThanOrEqual(0)
    expect(burstIndex, '同帧相遇时琴心先结算').toBeLessThan(sustainIndex)
    const burst = battle[burstIndex]!
    const sustain = battle[sustainIndex]!
    if (burst.type === 'qinxin' && sustain.type === 'sustain') {
      expect(burst.time, '各自绑各自的事件时刻').toBeLessThan(sustain.time)
    }
  })

  it('空场放炮：事件照发、目标为空，不崩溃', () => {
    const sim = new Simulator(burstChart(QINXIN.CHARGE_COMBOS), { monsters: [] })
    hitFirst(sim, QINXIN.CHARGE_COMBOS)
    const burst = sim.drainBattle().find((e) => e.type === 'qinxin')
    expect(burst).toMatchObject({ type: 'qinxin', targetIds: [] })
  })
})