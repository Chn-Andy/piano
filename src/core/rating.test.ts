import { describe, expect, it } from 'vitest'
import { ratingFor } from './rating'
import type { BattleSummary } from './simulator'

/**
 * 评级映射（GLOSSARY：评级——结算画面按整场斗琴表现给出的评价，S/A/B/C）。
 * 规则（常量集中 config.RATING）：胜负是第一维度（斗琴以清场论英雄），
 * 精度是第二维度；精度 = (Perfect×1 + Good×0.6) / 总音符，Good 折算与
 * 余韵表现分共用（跨系统一致）。期望值全部用独立于实现的字面量算例。
 */
function summary(partial: Partial<BattleSummary>): BattleSummary {
  return {
    maxCombo: 0,
    perfect: 0,
    good: 0,
    miss: 0,
    damageDealt: 0,
    qinxin: 0,
    ...partial,
  }
}

describe('评级映射（S/A/B/C）', () => {
  it('全 Perfect 完胜 → S（仰望级，与余韵 grand 同级的严格门槛）', () => {
    expect(ratingFor(summary({ perfect: 100 }), 'victory')).toBe('S')
  })

  it('无失误、精度恰达 S 门槛（0.95）→ S（边界含）；略低 → A', () => {
    // (35×1 + 5×0.6)/40 = 38/40 = 0.95 恰达门槛
    expect(ratingFor(summary({ perfect: 35, good: 5 }), 'victory')).toBe('S')
    // (34 + 3)/39 = 0.949 略低于门槛
    expect(ratingFor(summary({ perfect: 34, good: 5 }), 'victory')).toBe('A')
  })

  it('无失误但精度不足 A（全 Good = 0.6）→ B：零失误只在 S 门槛起作用', () => {
    expect(ratingFor(summary({ perfect: 0, good: 100 }), 'victory')).toBe('B')
  })

  it('精度高但有失误 → 失误封死 S，得 A', () => {
    // (95 + 0.6×5)/101 ≈ 0.971 —— 精度远超 0.95，但 1 次 Miss 挡住 S
    expect(ratingFor(summary({ perfect: 95, good: 5, miss: 1 }), 'victory')).toBe('A')
  })

  it('胜局精度恰达 A 门槛（0.8）→ A（边界含）；低于门槛 → B', () => {
    // (50 + 0.6×50)/100 = 0.8
    expect(ratingFor(summary({ perfect: 50, good: 50 }), 'victory')).toBe('A')
    // (10 + 0.6×20)/100 = 0.22
    expect(ratingFor(summary({ perfect: 10, good: 20, miss: 70 }), 'victory')).toBe('B')
  })

  it('败局一律 C（即使精度完美——血空即败，评级与胜负一致地讲故事）', () => {
    expect(ratingFor(summary({ perfect: 100 }), 'defeat')).toBe('C')
    expect(ratingFor(summary({ perfect: 0, miss: 100 }), 'defeat')).toBe('C')
  })

  it('零音符的空摘要不崩溃（精度记 0，胜局保底 B）', () => {
    expect(ratingFor(summary({}), 'victory')).toBe('B')
    expect(ratingFor(summary({}), 'defeat')).toBe('C')
  })
})
