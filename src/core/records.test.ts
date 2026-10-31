import { describe, expect, it } from 'vitest'
import type { DifficultyName } from './chart'
import {
  RECORDS_KEY,
  bestRecordFor,
  loadRecords,
  recordResult,
  saveRecords,
} from './records'
import type { KeyValueStore, Records } from './records'

/**
 * 本机最佳纪录（SPEC 持久化：各歌各难度最佳评级与最大连击；失败不更新最佳）。
 * 存储注入（KeyValueStore）：浏览器传 localStorage，测试传内存实现——
 * 纯层无 DOM 依赖。比较语义：评级优先（S>A>B>C），同级比最大连击。
 */

/** 内存存储（可预置/可捕获写入/可设为抛错） */
function memoryStore(initial?: Record<string, string>): KeyValueStore & {
  data: Map<string, string>
} {
  const data = new Map<string, string>(Object.entries(initial ?? {}))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

/** 一次入册的读数（精度/失误数是票 19 起的新字段） */
function stats(
  rating: 'S' | 'A' | 'B' | 'C',
  maxCombo: number,
  accuracy = 0.9,
  missCount = 0,
): { rating: 'S' | 'A' | 'B' | 'C'; maxCombo: number; accuracy: number; missCount: number } {
  return { rating, maxCombo, accuracy, missCount }
}

describe('本机最佳纪录存取', () => {
  it('空存储读出空纪录；胜局首成绩写入并报告提升', () => {
    const store = memoryStore()
    expect(loadRecords(store)).toEqual({})

    const { records, improved } = recordResult({}, 'fur-elise', 'easy', 'victory', stats('A', 87))
    expect(improved).toBe(true)
    expect(bestRecordFor(records, 'fur-elise', 'easy')).toEqual({
      rating: 'A',
      maxCombo: 87,
      accuracy: 0.9,
      missCount: 0,
      flawlessAccuracy: 0.9, // 零失误的首局也留下单调事实（A1）
    })
  })

  it('失败不更新最佳：即使评级连击都更好，纪录保持原样', () => {
    const before: Records = { canon: { medium: { rating: 'B', maxCombo: 40 } } }
    const { records, improved } = recordResult(before, 'canon', 'medium', 'defeat', stats('S', 300))
    expect(improved).toBe(false)
    expect(records).toEqual(before)
    expect(bestRecordFor(records, 'canon', 'medium')).toEqual({ rating: 'B', maxCombo: 40 })
  })

  it('评级优先：更高评级更新（即使连击更低），更低评级不更新（即使连击更高）', () => {
    const base: Records = { canon: { hard: { rating: 'A', maxCombo: 150 } } }

    const up = recordResult(base, 'canon', 'hard', 'victory', stats('S', 90))
    expect(up.improved).toBe(true)
    expect(bestRecordFor(up.records, 'canon', 'hard')).toEqual({
      rating: 'S',
      maxCombo: 90,
      accuracy: 0.9,
      missCount: 0,
      flawlessAccuracy: 0.9, // 零失误的首局也留下单调事实（A1）
    })

    const down = recordResult(base, 'canon', 'hard', 'victory', stats('B', 999))
    expect(down.improved).toBe(false)
    // 评级没升，但这一局零失误：单调事实照样入册（A1），纪录主体仍是旧的 A
    expect(down.updated).toBe(true)
    expect(bestRecordFor(down.records, 'canon', 'hard')).toEqual({
      rating: 'A',
      maxCombo: 150,
      flawlessAccuracy: 0.9,
    })
  })

  it('同级比连击：更高更新，更低或持平不更新', () => {
    const base: Records = { 'chun-jiang-hua-yue-ye': { easy: { rating: 'A', maxCombo: 60 } } } as Records

    const up = recordResult(base, 'chun-jiang-hua-yue-ye', 'easy', 'victory', stats('A', 61))
    expect(up.improved).toBe(true)
    expect(bestRecordFor(up.records, 'chun-jiang-hua-yue-ye', 'easy')!.maxCombo).toBe(61)

    const flat = recordResult(base, 'chun-jiang-hua-yue-ye', 'easy', 'victory', stats('A', 60))
    expect(flat.improved).toBe(false)
  })

  it('各歌各难度独立：互不覆盖', () => {
    let records: Records = { canon: { easy: { rating: 'S', maxCombo: 82 } } }
    records = recordResult(records, 'canon', 'hard', 'victory', stats('B', 10)).records
    records = recordResult(records, 'fur-elise', 'easy', 'victory', stats('C', 1)).records

    expect(bestRecordFor(records, 'canon', 'easy')).toEqual({ rating: 'S', maxCombo: 82 })
    expect(bestRecordFor(records, 'canon', 'hard')).toEqual({
      rating: 'B',
      maxCombo: 10,
      accuracy: 0.9,
      missCount: 0,
      flawlessAccuracy: 0.9, // 零失误的首局也留下单调事实（A1）
    })
    expect(bestRecordFor(records, 'fur-elise', 'easy')).toEqual({
      rating: 'C',
      maxCombo: 1,
      accuracy: 0.9,
      missCount: 0,
      flawlessAccuracy: 0.9, // 零失误的首局也留下单调事实（A1）
    })
    expect(bestRecordFor(records, 'fur-elise', 'hard')).toBeUndefined()
  })

  it('新成绩连同精度与失误数一起入册：掌握度的判档依据要留在纪录里', () => {
    const { records } = recordResult({}, 'canon', 'easy', 'victory', stats('A', 87, 0.873, 4))
    expect(bestRecordFor(records, 'canon', 'easy')).toEqual({
      rating: 'A',
      maxCombo: 87,
      accuracy: 0.873,
      missCount: 4,
    })
  })

  it('旧版纪录（只有评级与连击）读入不报错：缺的字段不编造，原样保留', () => {
    const store = memoryStore({
      [RECORDS_KEY]: JSON.stringify({ canon: { easy: { rating: 'S', maxCombo: 82 } } }),
    })
    const records = loadRecords(store)
    expect(bestRecordFor(records, 'canon', 'easy')).toEqual({ rating: 'S', maxCombo: 82 })
    expect(bestRecordFor(records, 'canon', 'easy')?.accuracy).toBeUndefined()
    expect(bestRecordFor(records, 'canon', 'easy')?.missCount).toBeUndefined()
    expect(bestRecordFor(records, 'canon', 'easy')?.flawlessAccuracy).toBeUndefined()
  })

  it('保存 → 读取 往返一致（键名版本化）', () => {
    const store = memoryStore()
    const { records } = recordResult({}, 'canon', 'medium', 'victory', stats('S', 115))
    saveRecords(store, records)

    expect(store.data.get(RECORDS_KEY)).toBeDefined()
    expect(loadRecords(store)).toEqual(records)
  })

  it('损坏的存储内容 → 读出空纪录，不抛异常', () => {
    const store = memoryStore({ [RECORDS_KEY]: '{oops 不是 JSON' })
    expect(loadRecords(store)).toEqual({})
  })

  it('写入失败（如配额满）静默：纪录非关键数据，不拖垮对局', () => {
    const store: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(() => saveRecords(store, { canon: { easy: { rating: 'S', maxCombo: 1 } } })).not.toThrow()
  })
})

/**
 * 单调最佳事实（v1.4 两轴审查 A1）：评级/连击是**字典序**最优值，但不是
 * 掌握度的充分事实——「零失误 + 高精度 + 低连击」的一局在字典序上输给旧纪录，
 * 于是根本不入册，曲库徽记永远停在弹熟（精熟不可达）。
 *
 * 修法：纪录另存 `flawlessAccuracy`（零失误局的最高精度），只升不降、
 * 与评级/连击无关；`updated` 与 `improved` 分开报，变了就得写回存储。
 */
describe('单调最佳事实：零失误局的最高精度（A1）', () => {
  it('A 零失误 97% 先入册；再打一局评级更高但精度 50%、连击 40：精熟事实不回退', () => {
    const first = recordResult({}, 'canon', 'easy', 'victory', stats('A', 90, 0.97, 0))
    expect(bestRecordFor(first.records, 'canon', 'easy')!.flawlessAccuracy).toBeCloseTo(0.97, 6)

    // 构造的极端值：S 级但精度 50%、5 次失误、连击更低——为了让「不回退」可断言
    const second = recordResult(first.records, 'canon', 'easy', 'victory', stats('S', 40, 0.5, 5))
    expect(second.improved, '评级更高就算新纪录').toBe(true)
    expect(bestRecordFor(second.records, 'canon', 'easy')!.rating).toBe('S')
    expect(bestRecordFor(second.records, 'canon', 'easy')!.maxCombo).toBe(40)
    expect(
      bestRecordFor(second.records, 'canon', 'easy')!.flawlessAccuracy,
      '零失误事实只升不降',
    ).toBeCloseTo(0.97, 6)
  })

  it('字典序不占优的零失误局：不算新纪录，但事实要写回（updated = true）', () => {
    const base = recordResult({}, 'canon', 'easy', 'victory', stats('A', 90, 0.88, 0))
    const next = recordResult(base.records, 'canon', 'easy', 'victory', stats('B', 40, 0.94, 0))

    expect(next.improved, '评级更低 → 不是新纪录').toBe(false)
    expect(next.updated, '零失误 94% 是新的最佳事实，必须落盘').toBe(true)
    expect(bestRecordFor(next.records, 'canon', 'easy')!.rating, '评级仍是 A').toBe('A')
    expect(bestRecordFor(next.records, 'canon', 'easy')!.flawlessAccuracy).toBeCloseTo(0.94, 6)
  })

  it('事实只升不降：0.91 → 0.93 升；带失误的一局不抬这条事实', () => {
    let records: Records = {}
    records = recordResult(records, 'canon', 'easy', 'victory', stats('A', 90, 0.91, 0)).records
    records = recordResult(records, 'canon', 'easy', 'victory', stats('A', 95, 0.93, 0)).records
    expect(bestRecordFor(records, 'canon', 'easy')!.flawlessAccuracy).toBeCloseTo(0.93, 6)

    records = recordResult(records, 'canon', 'easy', 'victory', stats('S', 100, 0.99, 2)).records
    expect(
      bestRecordFor(records, 'canon', 'easy')!.flawlessAccuracy,
      '有失误的一局不贡献精熟事实',
    ).toBeCloseTo(0.93, 6)
  })

  it('从未零失误：纪录不带这个字段（不给掌握度留猜的空间）', () => {
    const { records, updated } = recordResult({}, 'canon', 'easy', 'victory', stats('A', 90, 0.96, 3))
    expect(updated).toBe(true)
    expect(bestRecordFor(records, 'canon', 'easy')!.flawlessAccuracy).toBeUndefined()
    expect(JSON.stringify(records), 'undefined 不该在存储里留下空键').not.toContain('flawlessAccuracy')
  })

  it('什么都没变的一局：不写存储，返回原对象（updated = false）', () => {
    const base = recordResult({}, 'canon', 'easy', 'victory', stats('A', 90, 0.9, 0)).records
    const again = recordResult(base, 'canon', 'easy', 'victory', stats('B', 20, 0.7, 6))
    expect(again.improved).toBe(false)
    expect(again.updated).toBe(false)
    expect(again.records).toBe(base)
  })
})

describe('难度键完整性', () => {
  it('三难度键均可寻址（类型面：Partial<Record<DifficultyName, BestRecord>>）', () => {
    const difficulties: DifficultyName[] = ['easy', 'medium', 'hard']
    let records: Records = {}
    for (const [i, d] of difficulties.entries()) {
      records = recordResult(records, 'canon', d, 'victory', stats('B', i + 1)).records
    }
    for (const [i, d] of difficulties.entries()) {
      expect(bestRecordFor(records, 'canon', d)!.maxCombo).toBe(i + 1)
    }
  })
})
