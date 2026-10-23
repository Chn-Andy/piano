import { describe, expect, it } from 'vitest'
import { SUSTAIN } from './config'
import { createChart } from './chart'
import type { Chart, Phrase } from './chart'
import { Simulator } from './simulator'
import type { SustainEvent } from './sustain'
import { phrasePerformanceScore, sustainTierFor } from './sustain'

/** 句内判定计数的速记 */
function scoreOf(
  perfect: number,
  good: number,
  miss: number,
  longestRun: number,
): number {
  return phrasePerformanceScore({ perfect, good, miss, longestRun })
}

describe('乐句表现分（连击 + 判定质量 → 0..1）', () => {
  it('全 Perfect 全连 → 满分 1', () => {
    expect(scoreOf(8, 0, 0, 8)).toBe(1)
  })

  it('全 Miss → 0 分', () => {
    expect(scoreOf(0, 0, 8, 0)).toBe(0)
  })

  it('判定质量维度：同连击下 Good 越多分越低', () => {
    const allPerfect = scoreOf(8, 0, 0, 8)
    const halfGood = scoreOf(4, 4, 0, 8)
    const allGood = scoreOf(0, 8, 0, 8)
    expect(allPerfect).toBeGreaterThan(halfGood)
    expect(halfGood).toBeGreaterThan(allGood)
  })

  it('连击维度：同判定计数下，连击越完整分越高（连击是独立于命中的第二维度）', () => {
    // 8 音、4 Perfect 4 Miss：连击不断（不可能——Miss 必断），
    // 用两种排列对比：集中失手（如句首连环失手后一气呵成）> 分散失手
    const clustered = scoreOf(4, 0, 4, 4) // 失手集中在句首，此后连击 4
    const spread = scoreOf(4, 0, 4, 1) // 失手均匀散布，最长连击仅 1
    expect(clustered).toBeGreaterThan(spread)
  })

  it('Good 按折算计入质量（推导自集中常量，同仓库既有定标测试范式）', () => {
    // 6 Perfect + 4 Good，全程连击：质量 = (6 + 0.6×4)/10，连击 = 1
    const expected =
      SUSTAIN.QUALITY_WEIGHT * (6 + SUSTAIN.GOOD_CREDIT * 4) / 10 + SUSTAIN.COMBO_WEIGHT * 1
    expect(scoreOf(6, 4, 0, 10)).toBeCloseTo(expected, 9)
  })
})

describe('余韵规模分档（表现分 → 档位，边界含）', () => {
  const [edge1, edge2] = SUSTAIN.TIER_EDGES

  it('分档边界：达到边界即升档（边界含）', () => {
    expect(sustainTierFor(edge1 - 1e-9), '边界之下').toBe('minor')
    expect(sustainTierFor(edge1), '恰达一档').toBe('major')
    expect(sustainTierFor(edge2 - 1e-9), '二档边界之下').toBe('major')
    expect(sustainTierFor(edge2), '恰达二档').toBe('grand')
    expect(sustainTierFor(1), '满分').toBe('grand')
    expect(sustainTierFor(0), '零分').toBe('minor')
  })

  it('分档随表现分单调不减', () => {
    const order = { minor: 0, major: 1, grand: 2 } as const
    let previous = -1
    for (let i = 0; i <= 20; i += 1) {
      const tier = order[sustainTierFor(i / 20)]
      expect(tier).toBeGreaterThanOrEqual(previous)
      previous = tier
    }
  })
})

/* ── 模拟器：乐句末自动触发（Seam 1 公共接口） ───────────────────── */

import { JUDGMENT_WINDOWS } from './config'

/** 从战斗流筛出余韵事件 */
function sustainsOf(events: ReturnType<Simulator['drainBattle']>): readonly SustainEvent[] {
  return events.filter((e): e is SustainEvent => e.type === 'sustain')
}

/**
 * 双乐句谱面：句一 4 音（t=1..4）、换气 1.6s、句二 4 音（t=5.6..8.6）。
 * 余韵窗口手工给出，宽 0.6s（与转换器产物同规格）。
 */
function twoPhraseChart(): { chart: Chart; phrases: readonly Phrase[] } {
  const notes = [
    [1.0, 0],
    [2.0, 1],
    [3.0, 0],
    [4.0, 2],
    [5.6, 1],
    [6.6, 0],
    [7.6, 2],
    [8.6, 1],
  ] as const
  const phrases: readonly Phrase[] = [
    { id: 0, start: 1, end: 4, sustainStart: 4, sustainEnd: 4.6 },
    { id: 1, start: 5.6, end: 8.6, sustainStart: 8.6, sustainEnd: 9.2 },
  ]
  return { chart: createChart(notes, { phrases }), phrases }
}

const { good } = JUDGMENT_WINDOWS

describe('余韵触发（乐句末自动，玩家零输入）', () => {
  it('句末音符判定收束后自动触发：触发点 = 句末 + Good 窗，无需任何按键', () => {
    const { chart, phrases } = twoPhraseChart()
    const sim = new Simulator(chart)

    // 完全不按键，只推进时间（漏接全部音符也照样触发余韵）
    sim.tick(4.0) // 句末音符时刻：窗口未收束（句内前几颗的 Miss 与余韵无关）
    expect(sustainsOf(sim.drainBattle())).toHaveLength(0)

    sim.tick(4.0 + good) // 边界含：最后一颗仍在窗内未 Miss
    expect(sustainsOf(sim.drainBattle())).toHaveLength(0)

    sim.tick(phrases[0]!.end + good + 0.001)
    const sustains = sustainsOf(sim.drainBattle())
    expect(sustains).toHaveLength(1)
    const s = sustains[0]!
    expect(s.phraseId).toBe(0)
    expect(s.time, '事件时刻是确定性的触发点').toBeCloseTo(phrases[0]!.end + good, 9)
    expect(s.windowStart).toBe(phrases[0]!.sustainStart)
    expect(s.windowEnd).toBe(phrases[0]!.sustainEnd)
    expect(s.finale).toBe(false)
    expect(s.lordId).toBeNull()
  })

  it('每个乐句恰触发一次；时间一次推远也不重复不遗漏', () => {
    const { chart } = twoPhraseChart()
    const sim = new Simulator(chart)

    sim.tick(4.5)
    expect(sustainsOf(sim.drainBattle())).toHaveLength(1)
    sim.tick(100) // 一步跨过第二乐句与谱面终点
    expect(sustainsOf(sim.drainBattle()).map((s) => s.phraseId)).toEqual([1])
    expect(sim.tick(101), '此后无新余韵').toHaveLength(0)
    expect(sustainsOf(sim.drainBattle())).toHaveLength(0)
  })

  it('谱面无乐句（01 式最小谱面）→ 永不触发余韵', () => {
    const sim = new Simulator(createChart([[1.0, 0], [2.0, 1]]))
    sim.keyDown(0, 1.0)
    sim.keyDown(1, 2.0)
    sim.tick(10)
    expect(sustainsOf(sim.drainBattle())).toHaveLength(0)
  })
})

/* ── 模拟器：表现分接线（句内判定 → 表现分 → 分档） ──────────────── */

/** 弹奏脚本：[noteId, 'hit' | 'good' | 'miss']，未列出的音符按 miss 处理 */
type PlayScript = readonly (readonly [number, 'hit' | 'good' | 'miss'])[]

/** 按脚本弹完句一（4 音）并推进到余韵触发，返回句一的余韵事件与终局台账 */
function playFirstPhrase(script: PlayScript): { event: SustainEvent; summary: ReturnType<Simulator['summary']> } {
  const { chart, phrases } = twoPhraseChart()
  const sim = new Simulator(chart)
  for (const [noteId, how] of script) {
    const note = chart.notes[noteId]!
    if (how === 'hit') sim.keyDown(note.lane, note.time)
    else if (how === 'good') sim.keyDown(note.lane, note.time + 0.06) // Perfect 窗外 Good 窗内
    sim.keyUp(note.lane)
    sim.tick(note.time + good + 0.001) // miss 的音符在此出判定
  }
  sim.tick(phrases[0]!.end + good + 0.001)
  const events = sustainsOf(sim.drainBattle())
  expect(events).toHaveLength(1)
  return { event: events[0]!, summary: sim.summary() }
}

describe('余韵规模随句内表现分档（弹好的乐句更壮观）', () => {
  it('全 Perfect 满连的乐句 → 满分 grand', () => {
    const { event: s } = playFirstPhrase([
      [0, 'hit'],
      [1, 'hit'],
      [2, 'hit'],
      [3, 'hit'],
    ])
    expect(s.score).toBeCloseTo(1, 9)
    expect(s.tier).toBe('grand')
    expect(s.notes).toBe(4)
  })

  it('全漏接的乐句 → 零分 minor（余韵仍触发：收势属于这一句本身）', () => {
    const { event: s } = playFirstPhrase([])
    expect(s.score).toBe(0)
    expect(s.tier).toBe('minor')
  })

  it('同命中数、不同连击排列 → 表现分不同（句内连击是独立维度）', () => {
    // 4 音中 2 Perfect 2 Miss：句首连环失手（此后连击 2） vs 均匀失手（最长连击 1）
    const clustered = playFirstPhrase([
      [2, 'hit'],
      [3, 'hit'],
    ]) // 失手集中在句首
    const spread = playFirstPhrase([
      [1, 'hit'],
      [3, 'hit'],
    ]) // 失手散布（命中相间，连击均为 1）
    expect(clustered.summary.perfect).toBe(2)
    expect(spread.summary.perfect).toBe(2)
    expect(clustered.event.score, '同样两中，连成一片的乐句更值').toBeGreaterThan(spread.event.score)
  })

  it('全 Good 满连 → 质量折扣如实反映（档位由表现分经纯函数决定）', () => {
    const { event: s } = playFirstPhrase([
      [0, 'good'],
      [1, 'good'],
      [2, 'good'],
      [3, 'good'],
    ])
    const expected = SUSTAIN.QUALITY_WEIGHT * SUSTAIN.GOOD_CREDIT + SUSTAIN.COMBO_WEIGHT
    expect(s.score).toBeCloseTo(expected, 9)
    expect(s.tier).toBe(sustainTierFor(expected))
  })
})

/* ── 终章（最后乐句的加强版余韵 + 墨主关联） ──────────────────────── */

import type { MonsterPlan } from './combat'

/** 含墨主的单怪计划（id=7）：终章关联用它 */
const LORD_PLAN: readonly MonsterPlan[] = [{ id: 7, kind: 'inkLord', spawnAt: 0, hp: 10 }]

describe('终章（歌曲高潮的加强版余韵）', () => {
  it('最后乐句的余韵标记 finale；非末乐句不标记', () => {
    const { chart, phrases } = twoPhraseChart()
    const sim = new Simulator(chart)

    sim.tick(phrases[0]!.end + good + 0.001)
    const first = sustainsOf(sim.drainBattle())[0]!
    expect(first.finale).toBe(false)

    sim.tick(phrases[1]!.end + good + 0.001)
    const last = sustainsOf(sim.drainBattle())[0]!
    expect(last.phraseId).toBe(1)
    expect(last.finale).toBe(true)
  })

  it('墨主关联只属于终章：非末乐句的余韵不携带 lordId', () => {
    const { chart, phrases } = twoPhraseChart()
    const sim = new Simulator(chart, { monsters: LORD_PLAN })

    sim.tick(phrases[0]!.end + good + 0.001)
    const first = sustainsOf(sim.drainBattle())[0]!
    expect(first.finale).toBe(false)
    expect(first.lordId).toBeNull()
  })

  it('终章事件关联墨主（lordId）；谱面无墨主时为 null', () => {
    const { chart, phrases } = twoPhraseChart()
    const withLord = new Simulator(chart, { monsters: LORD_PLAN })
    withLord.tick(phrases[0]!.end + good + 0.001)
    withLord.drainBattle() // 冲掉句一的余韵，只看终章
    withLord.tick(phrases[1]!.end + good + 0.001)
    const finale = sustainsOf(withLord.drainBattle())[0]!
    expect(finale.finale).toBe(true)
    expect(finale.lordId).toBe(7)

    const noLord = new Simulator(chart)
    noLord.tick(phrases[0]!.end + good + 0.001)
    noLord.drainBattle()
    noLord.tick(phrases[1]!.end + good + 0.001)
    const finaleNoLord = sustainsOf(noLord.drainBattle())[0]!
    expect(finaleNoLord.finale).toBe(true)
    expect(finaleNoLord.lordId).toBeNull()
  })
})

/* ── 真实卡农谱面：整首余韵编排（Seam 1 吃转换产物） ──────────────── */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ChartMeta } from './chart'

function canonChart(difficulty: 'easy' | 'medium' | 'hard'): Chart {
  const path = join(import.meta.dirname, '..', 'charts', 'canon', `${difficulty}.json`)
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as {
    notes: readonly { id: number; time: number; lane: number; chordId?: number }[]
    meta: ChartMeta
    phrases: readonly Phrase[]
  }
  return createChart(
    raw.notes.map((n) => (n.chordId === undefined ? [n.time, n.lane] : [n.time, n.lane, n.chordId])),
    { meta: raw.meta, phrases: raw.phrases },
  )
}

describe.each(['easy', 'medium', 'hard'] as const)('卡农 %s 余韵编排', (difficulty) => {
  it('完美弹奏：每个乐句各一次余韵、全部满档，末句为终章且先于终局', () => {
    const chart = canonChart(difficulty)
    const phrases = chart.phrases!
    const sim = new Simulator(chart)
    for (const note of chart.notes) {
      sim.keyDown(note.lane, note.time)
      sim.keyUp(note.lane)
      sim.tick(note.time + good + 0.001)
    }
    sim.tick(chart.duration + 0.01)
    const drained = sim.drainBattle()
    const sustains = sustainsOf(drained)

    expect(sustains.map((s) => s.phraseId)).toEqual(phrases.map((p) => p.id))
    expect(sustains.every((s) => s.tier === 'grand' && s.score === 1)).toBe(true)
    const finale = sustains[sustains.length - 1]!
    expect(finale.finale).toBe(true)
    expect(finale.lordId, '终章关联墨主（真实谱面出场计划必有压轴墨主）').not.toBeNull()
    // 终章先于终局出现在战斗流里：玩家先看演出再见胜负
    const finaleIndex = drained.findIndex((e) => e.type === 'sustain' && e.finale)
    const outcomeIndex = drained.findIndex((e) => e.type === 'outcome')
    expect(outcomeIndex).toBeGreaterThan(finaleIndex)
    expect(sim.status).toBe('victory')
  })
})

/* ── 余韵窗口空窗不变式与节奏连续（工单验收 2） ──────────────────── */

describe('余韵窗口：空窗与节奏连续（窗口内无音符落线，恢复无缝）', () => {
  it('窗口内 tick 无任何判定事件、按键扑空：窗口是纯粹的换气口', () => {
    const { chart, phrases } = twoPhraseChart()
    const sim = new Simulator(chart)
    const phrase0 = phrases[0]!
    const trigger = phrase0.end + good + 0.001

    // 弹完句一，进入余韵
    for (const [i, lane] of [0, 1, 0, 2].entries()) {
      const note = chart.notes[i]!
      sim.keyDown(lane, note.time)
      sim.keyUp(lane)
    }
    sim.tick(trigger)
    expect(sustainsOf(sim.drainBattle())).toHaveLength(1)

    // 窗口内（句末判定收束后、下一乐句首音符前）逐步推进
    for (let t = trigger; t <= phrase0.sustainEnd; t += 0.05) {
      expect(sim.tick(t), `窗口内 t=${t.toFixed(2)} 不产生判定`).toHaveLength(0)
    }
    const stray = sim.keyDown(1, (trigger + phrase0.sustainEnd) / 2)
    expect(stray.repeat).toBe(false)
    expect(stray.events, '窗口内按键扑空：无可判定音符').toHaveLength(0)
    expect(sim.combo, '扑空不断连击（无 Miss 发生）').toBe(4)

    // 窗口内待判定音符只剩下一乐句的
    expect(sim.pendingNotes().map((n) => n.id)).toEqual([4, 5, 6, 7])
  })

  it('窗口结束无缝恢复：下一乐句照常判定，连击从句末值继续，节奏不受演出影响', () => {
    const { chart, phrases } = twoPhraseChart()
    const sim = new Simulator(chart)
    const phrase0 = phrases[0]!

    for (const [i, lane] of [0, 1, 0, 2].entries()) {
      const note = chart.notes[i]!
      sim.keyDown(lane, note.time)
      sim.keyUp(lane)
    }
    sim.tick(phrase0.end + good + 0.001)
    sim.drainBattle()

    // 跨过整个窗口后精确接住下一乐句首音符（演出既不吞输入也不改时刻）
    const next = chart.notes[4]!
    expect(next.time).toBeGreaterThan(phrase0.sustainEnd)
    sim.tick(phrase0.sustainEnd + 0.01)
    const resumed = sim.keyDown(next.lane, next.time)
    expect(resumed.events).toHaveLength(1)
    expect(resumed.events[0]!.judgment).toBe('Perfect')
    expect(resumed.events[0]!.combo, '连击跨余韵延续：演出不吃连击').toBe(5)
    expect(sustainsOf(sim.drainBattle())).toHaveLength(0)
  })
})

/* ── 模拟器：表现分接线（句内判定 → 分档） ───────────────────────── */
