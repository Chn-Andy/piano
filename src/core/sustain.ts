/**
 * 余韵（GLOSSARY）：乐句结束时自动引爆的收势演出，规模随该乐句的演奏
 * 表现缩放（ADR-0007）。本模块是余韵的纯数据构件——表现分公式与规模
 * 分档；触发时机与事件产出在模拟器（simulator.ts），数值全部来自
 * config.SUSTAIN（集中定标处）。
 */

import { SUSTAIN } from './config'

/** 余韵规模分档：minor 小韵 / major 墨浪 / grand 剑鸣（终章另行标记） */
export type SustainTier = 'minor' | 'major' | 'grand'

/** 句内判定计数与最长连击（触发时刻句内音符已全部出判定） */
export interface PhrasePerformance {
  readonly perfect: number
  readonly good: number
  readonly miss: number
  /** 句内最长连续命中数（Miss 断开；连击是独立于判定质量的第二维度） */
  readonly longestRun: number
}

/**
 * 乐句表现分 ∈ [0,1]：判定质量与句内连击的加权和。
 * quality = (Perfect + GOOD_CREDIT×Good) / 音符数，
 * fullness = 最长连击 / 音符数，score = QUALITY_WEIGHT×q + COMBO_WEIGHT×f。
 */
export function phrasePerformanceScore(perf: PhrasePerformance): number {
  const notes = perf.perfect + perf.good + perf.miss
  if (notes === 0) return 0
  const quality = (perf.perfect + SUSTAIN.GOOD_CREDIT * perf.good) / notes
  const fullness = Math.min(1, perf.longestRun / notes)
  return SUSTAIN.QUALITY_WEIGHT * quality + SUSTAIN.COMBO_WEIGHT * fullness
}

/** 表现分 → 规模分档（TIER_EDGES 边界含：达到边界即升档） */
export function sustainTierFor(score: number): SustainTier {
  const [major, grand] = SUSTAIN.TIER_EDGES
  if (score >= grand!) return 'grand'
  if (score >= major!) return 'major'
  return 'minor'
}

/** 余韵事件：模拟器在乐句末自动产出（玩家无任何输入参与触发）。 */
export interface SustainEvent {
  readonly type: 'sustain'
  /** 触发时刻 = 句末音符判定收束（句末 + Good 窗），谱面时间轴 */
  readonly time: number
  readonly phraseId: number
  /** 规模分档（肉眼可辨的演出规模由此决定） */
  readonly tier: SustainTier
  /** 乐句表现分 0..1（调试与测试可观察通道） */
  readonly score: number
  /** 句内音符数 */
  readonly notes: number
  /** 余韵窗口（谱面不变式保证窗口内无音符） */
  readonly windowStart: number
  readonly windowEnd: number
  /** 终章（GLOSSARY）：最后乐句的加强版余韵 */
  readonly finale: boolean
  /** 终章关联的墨主（谱面无墨主时为 null） */
  readonly lordId: number | null
}
