/**
 * 评级（GLOSSARY）：结算画面按整场斗琴表现给出的评价，共四级 S / A / B / C。
 * v1 无独立分数系统（ADR-0008 非目标）——评级是唯一的整场表现总结：
 * - 胜负是第一维度：斗琴以清场论英雄，败局一律 C（血空的因果不被"虽败犹荣"
 *   掩盖，SPEC 故事 11）；胜局再按精度分 S / A / B。
 * - 精度是第二维度：accuracy = (Perfect×1 + Good×GOOD_CREDIT) / 总音符——
 *   Good 折算与余韵表现分（sustain.ts）共用同一常量，跨系统一致。
 * - S 的双门槛（无失误 且 accuracy ≥ 0.95）：与余韵 grand（表现分 ≥ 0.90）
 *   同级的"仰望时刻"，留给近乎无瑕的完胜；A（≥ 0.80）是认真玩家的稳定段；
 *   B 是其余胜局。
 * 门槛常量集中 config.RATING，改动不应破坏测试结构（测试断言分档行为）。
 */

import { RATING, SUSTAIN } from './config'
import type { BattleSummary } from './simulator'

/** 评级四级（GLOSSARY 顺序 S > A > B > C） */
export type Rating = 'S' | 'A' | 'B' | 'C'

/** 整场精度 0..1：Perfect 全额、Good 折算（与余韵表现分一致）；零音符记 0 */
export function accuracyFor(summary: BattleSummary): number {
  const total = summary.perfect + summary.good + summary.miss
  if (total === 0) return 0
  return (summary.perfect + SUSTAIN.GOOD_CREDIT * summary.good) / total
}

/** 结算评级映射：胜局按精度与失误分 S/A/B；败局一律 C。 */
export function ratingFor(summary: BattleSummary, outcome: 'victory' | 'defeat'): Rating {
  if (outcome === 'defeat') return 'C'
  const accuracy = accuracyFor(summary)
  if (summary.miss === 0 && accuracy >= RATING.S_ACCURACY) return 'S'
  if (accuracy >= RATING.A_ACCURACY) return 'A'
  return 'B'
}

/**
 * 平均偏差的措辞（ADR-0013，工单 15）：判定口径落在结算画面上的那句话。
 * 判定只比 |按键 − 音符|，玩家看不到毫秒数就学不会收敛——平均偏差是唯一
 * 可执行的指路（正值 = 偏晚 → 音画偏移调正，语义见 settings.judgedTime）。
 *
 * 返回纯文本（null = 不显示，由壳层决定包不包标签）：
 * - 命中不足 OFFSET_ADVICE_MIN_HITS 颗 → null（样本太小，平均值没意义）；
 * - |平均偏差| < OFFSET_ADVICE_MS → 只说「节奏稳」，不劝人调；
 * - 其余 → 报方向与毫秒，并给出偏移建议值（即平均偏差本身）。
 */
export function offsetAdvice(avgOffset: number, hits: number): string | null {
  if (hits < RATING.OFFSET_ADVICE_MIN_HITS) return null
  const ms = Math.round(avgOffset * 1000)
  const signed = `${ms > 0 ? '+' : ''}${ms}`
  if (Math.abs(ms) < RATING.OFFSET_ADVICE_MS) return `按键平均偏差 ${signed}ms —— 节奏稳`
  return `按键平均${ms > 0 ? '偏晚' : '偏早'} ${Math.abs(ms)}ms —— 可在设置里把音画偏移调到 ${signed}`
}
