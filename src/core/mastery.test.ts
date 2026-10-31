import { describe, expect, it } from 'vitest'
import { MASTERY_LABELS, masteryFor, masteryFromRecord } from './mastery'
import { bestRecordFor, recordResult } from './records'
import type { Records } from './records'

/**
 * 掌握度（GLOSSARY：掌握度 / spec v1.4「掌握度是纯判定」）：
 * 由本局结算数据判三档——初演（活着弹完全曲）、弹熟（评级 ≥ A）、
 * 精熟（零失误且精度 ≥ 90%）。败局不入册，故没有档位。
 * 只描述这一局发生过什么，不承诺任何专业水准。
 */
describe('掌握度判定', () => {
  it('胜局但评级只有 C：初演——活着弹完了全曲，仅此而已', () => {
    expect(masteryFor({ outcome: 'victory', rating: 'C', accuracy: 0.42, missCount: 31 })).toBe('first')
  })

  it('败局不入册：没有档位（血尽或墨妖未绝都不算「弹完」）', () => {
    expect(masteryFor({ outcome: 'defeat', rating: 'S', accuracy: 0.99, missCount: 0 })).toBe(null)
  })

  it('评级 B：仍是初演（胜局只保证「弹完了」）', () => {
    expect(masteryFor({ outcome: 'victory', rating: 'B', accuracy: 0.71, missCount: 9 })).toBe('first')
  })

  it('评级 A：弹熟（A 的门槛是认真玩家的稳定段）', () => {
    expect(masteryFor({ outcome: 'victory', rating: 'A', accuracy: 0.86, missCount: 3 })).toBe('seasoned')
  })

  it('S 且零失误：精熟', () => {
    expect(masteryFor({ outcome: 'victory', rating: 'S', accuracy: 0.97, missCount: 0 })).toBe('mastered')
  })

  it('精熟的双条件：零失误 + 精度恰为 90%（边界含等号）→ 精熟；89.9% → 只到弹熟', () => {
    expect(masteryFor({ outcome: 'victory', rating: 'A', accuracy: 0.9, missCount: 0 })).toBe('mastered')
    expect(masteryFor({ outcome: 'victory', rating: 'A', accuracy: 0.899, missCount: 0 })).toBe('seasoned')
  })

  it('有失误但精度 ≥ 95%：不是精熟（零失误是硬条件）', () => {
    expect(masteryFor({ outcome: 'victory', rating: 'A', accuracy: 0.96, missCount: 2 })).toBe('seasoned')
  })

  it('零失误但零命中（精度 0）：不是精熟——没弹过不算弹对', () => {
    expect(masteryFor({ outcome: 'victory', rating: 'C', accuracy: 0, missCount: 0 })).toBe('first')
  })
})

/**
 * 曲库的徽记读的是**本机纪录**，不是刚结束的这一局：同一把尺，但判档依据
 * 可能缺字段——旧版纪录只存评级与连击（票 19 之前）。
 */
describe('掌握度：从本机纪录读', () => {
  it('没有纪录：没有徽记', () => {
    expect(masteryFromRecord(undefined)).toBe(null)
  })

  it('旧版纪录缺精度与失误数：降级为只能判到弹熟（不把 S 猜成精熟）', () => {
    expect(masteryFromRecord({ rating: 'S', maxCombo: 82 })).toBe('seasoned')
    expect(masteryFromRecord({ rating: 'A', maxCombo: 61 })).toBe('seasoned')
    expect(masteryFromRecord({ rating: 'B', maxCombo: 40 })).toBe('first')
    expect(masteryFromRecord({ rating: 'C', maxCombo: 3 })).toBe('first')
  })

  it('新纪录带齐字段：与结算同一把尺', () => {
    expect(masteryFromRecord({ rating: 'S', maxCombo: 82, accuracy: 0.97, missCount: 0 })).toBe('mastered')
    expect(masteryFromRecord({ rating: 'A', maxCombo: 61, accuracy: 0.88, missCount: 1 })).toBe('seasoned')
  })

  it('徽记文案用 GLOSSARY 的三个词；没有档位时读「未入册」', () => {
    expect(MASTERY_LABELS.first).toBe('初演')
    expect(MASTERY_LABELS.seasoned).toBe('弹熟')
    expect(MASTERY_LABELS.mastered).toBe('精熟')
    expect(MASTERY_LABELS.none).toBe('未入册')
  })
})

/**
 * 精熟在曲库里可达（v1.4 两轴审查 A1）。
 *
 * 缺陷原状：`recordResult` 只在评级/连击更优时写纪录，于是「零失误 + 精度
 * 97% 但连击较低」的一局根本不入册，徽记永远停在弹熟。修法：纪录存一条
 * 单调最佳事实 `flawlessAccuracy`，判档读它——但绝不把两个不同局拼起来。
 */
describe('掌握度：精熟可达且不回退（A1）', () => {
  it('一局零失误 97% 的 A 级成绩就够精熟（评级不是 S 也行）', () => {
    expect(masteryFromRecord({ rating: 'A', maxCombo: 90, accuracy: 0.97, missCount: 0, flawlessAccuracy: 0.97 })).toBe(
      'mastered',
    )
  })

  it('随后一局评级更高但精度低、有失误：徽记仍是精熟（单调事实不随纪录主体回退）', () => {
    const record = {
      rating: 'S' as const,
      maxCombo: 40,
      accuracy: 0.5,
      missCount: 5,
      flawlessAccuracy: 0.97,
    }
    expect(masteryFromRecord(record)).toBe('mastered')
  })

  it('零失误但精度不足 90%：只到弹熟（事实本身不达标）', () => {
    expect(masteryFromRecord({ rating: 'A', maxCombo: 90, accuracy: 0.85, missCount: 0, flawlessAccuracy: 0.85 })).toBe(
      'seasoned',
    )
  })

  it('旧格式纪录不猜值：只有评级与连击 → 弹熟（S 不冒充精熟）', () => {
    expect(masteryFromRecord({ rating: 'S', maxCombo: 82 })).toBe('seasoned')
  })

  it('纪录里的精度与失误数描述同一局：零失误 99% 可判精熟，有失误再准也只到弹熟', () => {
    expect(masteryFromRecord({ rating: 'S', maxCombo: 82, accuracy: 0.99, missCount: 0 })).toBe('mastered')
    expect(masteryFromRecord({ rating: 'S', maxCombo: 82, accuracy: 0.99, missCount: 3 })).toBe('seasoned')
  })

  it('端到端（A1 的验收场景）：先 A 零失误 97%，再打一局 S 但精度 50%、连击 40 → 徽记仍是精熟', () => {
    let records: Records = {}
    records = recordResult(records, 'canon', 'easy', 'victory', {
      rating: 'A',
      maxCombo: 90,
      accuracy: 0.97,
      missCount: 0,
    }).records
    expect(masteryFromRecord(bestRecordFor(records, 'canon', 'easy'))).toBe('mastered')

    records = recordResult(records, 'canon', 'easy', 'victory', {
      rating: 'S',
      maxCombo: 40,
      accuracy: 0.5,
      missCount: 5,
    }).records
    expect(masteryFromRecord(bestRecordFor(records, 'canon', 'easy')), '精熟不回退').toBe('mastered')
  })
})
