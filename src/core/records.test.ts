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

describe('本机最佳纪录存取', () => {
  it('空存储读出空纪录；胜局首成绩写入并报告提升', () => {
    const store = memoryStore()
    expect(loadRecords(store)).toEqual({})

    const { records, improved } = recordResult({}, 'fur-elise', 'easy', 'victory', 'A', 87)
    expect(improved).toBe(true)
    expect(bestRecordFor(records, 'fur-elise', 'easy')).toEqual({ rating: 'A', maxCombo: 87 })
  })

  it('失败不更新最佳：即使评级连击都更好，纪录保持原样', () => {
    const before: Records = { canon: { medium: { rating: 'B', maxCombo: 40 } } }
    const { records, improved } = recordResult(before, 'canon', 'medium', 'defeat', 'S', 300)
    expect(improved).toBe(false)
    expect(records).toEqual(before)
    expect(bestRecordFor(records, 'canon', 'medium')).toEqual({ rating: 'B', maxCombo: 40 })
  })

  it('评级优先：更高评级更新（即使连击更低），更低评级不更新（即使连击更高）', () => {
    const base: Records = { canon: { hard: { rating: 'A', maxCombo: 150 } } }

    const up = recordResult(base, 'canon', 'hard', 'victory', 'S', 90)
    expect(up.improved).toBe(true)
    expect(bestRecordFor(up.records, 'canon', 'hard')).toEqual({ rating: 'S', maxCombo: 90 })

    const down = recordResult(base, 'canon', 'hard', 'victory', 'B', 999)
    expect(down.improved).toBe(false)
    expect(bestRecordFor(down.records, 'canon', 'hard')).toEqual({ rating: 'A', maxCombo: 150 })
  })

  it('同级比连击：更高更新，更低或持平不更新', () => {
    const base: Records = { 'chun-jiang-hua-yue-ye': { easy: { rating: 'A', maxCombo: 60 } } } as Records

    const up = recordResult(base, 'chun-jiang-hua-yue-ye', 'easy', 'victory', 'A', 61)
    expect(up.improved).toBe(true)
    expect(bestRecordFor(up.records, 'chun-jiang-hua-yue-ye', 'easy')!.maxCombo).toBe(61)

    const flat = recordResult(base, 'chun-jiang-hua-yue-ye', 'easy', 'victory', 'A', 60)
    expect(flat.improved).toBe(false)
  })

  it('各歌各难度独立：互不覆盖', () => {
    let records: Records = { canon: { easy: { rating: 'S', maxCombo: 82 } } }
    records = recordResult(records, 'canon', 'hard', 'victory', 'B', 10).records
    records = recordResult(records, 'fur-elise', 'easy', 'victory', 'C', 1).records

    expect(bestRecordFor(records, 'canon', 'easy')).toEqual({ rating: 'S', maxCombo: 82 })
    expect(bestRecordFor(records, 'canon', 'hard')).toEqual({ rating: 'B', maxCombo: 10 })
    expect(bestRecordFor(records, 'fur-elise', 'easy')).toEqual({ rating: 'C', maxCombo: 1 })
    expect(bestRecordFor(records, 'fur-elise', 'hard')).toBeUndefined()
  })

  it('保存 → 读取 往返一致（键名版本化）', () => {
    const store = memoryStore()
    const { records } = recordResult({}, 'canon', 'medium', 'victory', 'S', 115)
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

describe('难度键完整性', () => {
  it('三难度键均可寻址（类型面：Partial<Record<DifficultyName, BestRecord>>）', () => {
    const difficulties: DifficultyName[] = ['easy', 'medium', 'hard']
    let records: Records = {}
    for (const [i, d] of difficulties.entries()) {
      records = recordResult(records, 'canon', d, 'victory', 'B', i + 1).records
    }
    for (const [i, d] of difficulties.entries()) {
      expect(bestRecordFor(records, 'canon', d)!.maxCombo).toBe(i + 1)
    }
  })
})
