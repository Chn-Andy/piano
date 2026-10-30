import { describe, expect, it } from 'vitest'
import { offsetAdvice, ratingFor } from './rating'
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
    avgOffset: 0,
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

/**
 * 平均偏差的措辞（ADR-0013，工单 15）：判定只比 |按键 − 音符|，玩家看不到
 * 毫秒数就学不会收敛——「平均偏早/偏晚 N ms + 该把音画偏移调到几」是唯一
 * 可执行的一句话。正向偏移 = 判得更早，所以偏晚就给正数（方向同 judgedTime）。
 */
describe('平均偏差的结算措辞', () => {
  it('命中太少（< 8 颗）不报：平均值没有意义', () => {
    expect(offsetAdvice(0.05, 7)).toBeNull()
    expect(offsetAdvice(0.05, 0)).toBeNull()
  })

  it('平均偏差在门槛内（|ms| < 8）只说节奏稳，不劝人调', () => {
    expect(offsetAdvice(0.007, 20)).toBe('按键平均偏差 +7ms —— 节奏稳')
    expect(offsetAdvice(0, 20)).toBe('按键平均偏差 0ms —— 节奏稳')
  })

  it('偏晚 → 报「偏晚 N ms」并把偏移调正（正值 = 判得更早）', () => {
    expect(offsetAdvice(0.023, 30)).toBe('按键平均偏晚 23ms —— 可在设置里把音画偏移调到 +23')
  })

  it('偏早 → 报「偏早 N ms」并把偏移调负', () => {
    expect(offsetAdvice(-0.06, 30)).toBe('按键平均偏早 60ms —— 可在设置里把音画偏移调到 -60')
  })

  it('恰好 8ms 就算偏（边界含），不落回「节奏稳」', () => {
    expect(offsetAdvice(0.008, 20)).toBe('按键平均偏晚 8ms —— 可在设置里把音画偏移调到 +8')
  })
})
