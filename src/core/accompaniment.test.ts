import { describe, expect, it } from 'vitest'
import { createChart } from './chart'
import type { ChartMeta, DifficultyName } from './chart'
import { accompanimentPlan } from './accompaniment'

/**
 * 伴奏播放计划（工单 18）：壳层只问「这一局要自动响哪些音」。
 * 有伴奏声部字段的谱面照数据放；卡农这类没有可拆材料的谱面由曲目声明走
 * 合成铺底；两者都没有（旧谱面）就静默跳过——不报错、不崩。
 */

const META = (difficulty: DifficultyName): ChartMeta => ({
  song: 'test-song',
  title: '测试曲',
  difficulty,
  keys: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'],
  quantizeGrid: 0.5,
})

/** 20 秒的旋律：每秒一颗，C4..B4 轮转（卡农式的单声部织体） */
function melodyOnly(difficulty: DifficultyName) {
  const lanes = Array.from({ length: 20 }, (_, i) => i % 7)
  return createChart(
    lanes.map((lane, i) => [1 + i, lane] as const),
    { meta: META(difficulty) },
  )
}

describe('伴奏播放计划（工单 18）', () => {
  it('旧谱面没有伴奏声部：计划为空——静默跳过，不报错', () => {
    const legacy = melodyOnly('easy')

    expect(legacy.accompaniment).toBeUndefined()
    expect(accompanimentPlan(legacy)).toEqual([])
    expect(() => accompanimentPlan(legacy, 'none')).not.toThrow()
  })

  it('卡农式无材料曲子：合成铺底铺满全曲，任意 4 秒里至少一声', () => {
    const chart = melodyOnly('easy')
    const hits = accompanimentPlan(chart, 'pad')

    expect(hits.length).toBeGreaterThan(0)
    for (let t = 0; t + 4 <= chart.duration; t += 0.5) {
      expect(
        hits.some((hit) => hit.at >= t && hit.at <= t + 4),
        `${t.toFixed(1)}s 起的 4 秒里没有铺底`,
      ).toBe(true)
    }
  })

  it('铺底整个落在旋律键域之下一个八度：任何时刻都不与玩家按出的音同高', () => {
    const chart = melodyOnly('easy')
    const floor = 60 // META 的最低键 C4

    for (const hit of accompanimentPlan(chart, 'pad')) {
      expect(hit.midi, `铺底 ${hit.midi} 侵入旋律键域`).toBeGreaterThanOrEqual(floor - 12)
      expect(hit.midi, `铺底 ${hit.midi} 掉出铺底音域`).toBeLessThan(floor)
      expect(Number.isInteger(hit.midi)).toBe(true)
    }
  })

  it('铺底声部数按难度分档：简单根音 / 中等加五度 / 高级补三度', () => {
    const counts = (['easy', 'medium', 'hard'] as const).map(
      (difficulty) => accompanimentPlan(melodyOnly(difficulty), 'pad').length,
    )

    expect(counts[0]).toBeGreaterThan(0)
    expect(counts[1]).toBe(counts[0]! * 2)
    expect(counts[2]).toBe(counts[0]! * 3)
  })

  it('已有伴奏声部的谱面直接照数据放，不再叠一层铺底', () => {
    const chart = createChart([[1, 0], [2, 1]], {
      meta: META('easy'),
      accompaniment: [{ time: 0.5, midi: 48 }],
    })

    expect(accompanimentPlan(chart, 'pad')).toEqual([{ at: 0.5, midi: 48 }])
  })
})
