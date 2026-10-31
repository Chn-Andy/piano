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

/** 掌握度三档（顺序即高低，供比较与徽记取色） */
export type MasteryLevel = 'first' | 'seasoned' | 'mastered'

/**
 * 徽记文案（GLOSSARY 的三个词 + 败局的「未入册」）。
 * 只用这三个词：掌握度是「这一局发生过什么」的读数，不是段位、等级或成就。
 */
export const MASTERY_LABELS: Readonly<Record<MasteryLevel | 'none', string>> = {
  first: '初演',
  seasoned: '弹熟',
  mastered: '精熟',
  none: '未入册',
}

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
 * 纪录只由胜局写入，所以这里恒按胜局判。旧版纪录没有精度与失误数：不猜值——
 * 缺 `missCount` 视作「够不上零失误」，缺 `accuracy` 视作 0，于是判档自然
 * 降级为**只能到弹熟**（评级 A/S 仍算弹熟，S 不会被猜成精熟）。
 */
export function masteryFromRecord(record: BestRecord | undefined): MasteryLevel | null {
  if (record === undefined) return null
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
