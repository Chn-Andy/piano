/**
 * 掌握度（GLOSSARY：掌握度 / spec v1.4「掌握度是纯判定」）。
 *
 * 三档：**初演**（活着弹完全曲）、**弹熟**（评级 ≥ A）、**精熟**（零失误且精度 ≥ 90%）。
 * 它只描述这一局发生过什么，不承诺任何专业水准，也不构成分数或排行榜；
 * 败局一律不入册（沿用 `records.recordResult` 的现状），故没有档位。
 *
 * 纯层：只吃结算读数（胜负、评级、精度、失误数），不碰 DOM / 存储 / 音频。
 */

import { MASTERY } from './config'
import type { BestRecord } from './records'
import type { Rating } from './rating'

/**
 * 掌握度三档（顺序即高低，供比较与徽记取色）
 */
export type MasteryLevel = 'first' | 'seasoned' | 'mastered'

/*
 * 徽记的三个词（初演 / 弹熟 / 精熟，外加败局的「未入册」）不在这里：
 * 它们是玩家可见文案，已收进文案表的 `mastery.*`（ADR-0017）。纯层只判档，
 * 不持有任何要显示给人看的字。
 */

/** 判档依据：一局的可观察结果 */
export interface MasteryFacts {
  readonly outcome: 'victory' | 'defeat'
  /** 结算评级（S / A / B / C） */
  readonly rating: Rating
  /** 整场精度 0..1（`rating.accuracyFor` 的口径） */
  readonly accuracy: number
  /** 本局失误数 */
  readonly missCount: number
}

/** 一局的掌握度档位；败局不入册 → null */
export function masteryFor(facts: MasteryFacts): MasteryLevel | null {
  if (facts.outcome === 'defeat') return null
  if (facts.missCount === 0 && facts.accuracy >= MASTERY.MASTERED_ACCURACY) return 'mastered'
  if (facts.rating === 'A' || facts.rating === 'S') return 'seasoned'
  return 'first'
}

/**
 * 从本机纪录读掌握度（曲库徽记用）。
 *
 * 纪录只由胜局写入，所以这里恒按胜局判。判据分两层：
 * - **精熟**读纪录的单调最佳事实 `flawlessAccuracy`（历次零失误局的最高精度，
 *   与评级/连击无关）。只用它、不拼 `accuracy` + `missCount`：后者描述的是
 *   「刷新评级/连击的那一局」，而一局零失误 97% 完全可能因为连击低而不入册
 *   （A1 的原始缺陷：精熟在曲库里不可达）。
 * - **弹熟/初演**沿用评级；旧版纪录没有 `flawlessAccuracy`，也不猜值——
 *   缺字段视作「没有零失误事实」，评级 A/S 仍算弹熟，S 不会被猜成精熟。
 */
export function masteryFromRecord(record: BestRecord | undefined): MasteryLevel | null {
  if (record === undefined) return null
  const flawless = record.flawlessAccuracy
  if (flawless !== undefined && flawless >= MASTERY.MASTERED_ACCURACY) return 'mastered'
  return masteryFor({
    outcome: 'victory',
    rating: record.rating,
    accuracy: record.accuracy ?? 0,
    missCount: record.missCount ?? Number.POSITIVE_INFINITY,
  })
}

/**
 * 结算/曲库那一行说明：只描述这一局发生过什么，不承诺任何专业水准
 * （不写「已掌握此曲」这类强承诺——掌握度不是教学质量）。
 */
export function masteryLine(level: MasteryLevel | null): string {
  if (level === 'mastered') return '这一局零失误，精度九成以上'
  if (level === 'seasoned') return '这一局评级 A 以上'
  if (level === 'first') return '这一局活着弹完了全曲'
  return '这一局未入册（败局不计掌握度）'
}
