import { describe, expect, it } from 'vitest'
import type { KeyValueStore } from './records'
import {
  DEFAULT_SETTINGS,
  OFFSET_LIMIT_MS,
  SETTINGS_KEY,
  judgedTime,
  loadSettings,
  saveSettings,
} from './settings'
import { createChart } from './chart'
import { Simulator } from './simulator'

/**
 * 设置（SPEC 持久化：localStorage——设置：音量、音画偏移；SPEC 故事 22/23）。
 * 纯层：存储以 KeyValueStore 注入（records 同例），偏移语义在此定标——
 * 正值 = 按键判定时刻整体前移（进模拟器前的时间平移，ADR-0010：
 * 全项目只有这一处可调偏移）。偏移生效路径经 Seam 1 模拟器实测：
 * 同一物理按键，偏移不同 → 判定结果分档不同。
 */

/** 内存存储（records.test 同款） */
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

describe('设置存取', () => {
  it('空存储读出默认设置：零偏移、两轨满音量（默认保持既有混音不变）', () => {
    expect(loadSettings(memoryStore())).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS).toEqual({ offsetMs: 0, musicVolume: 1, sfxVolume: 1 })
  })

  it('保存 → 读取 往返一致（键名版本化）', () => {
    const store = memoryStore()
    const settings = { offsetMs: 40, musicVolume: 0.7, sfxVolume: 0.3 }
    saveSettings(store, settings)

    expect(store.data.get(SETTINGS_KEY)).toBeDefined()
    expect(loadSettings(store)).toEqual(settings)
  })

  it('损坏的存储内容 → 默认设置，不抛异常', () => {
    const store = memoryStore({ [SETTINGS_KEY]: '{oops 不是 JSON' })
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS)
  })

  it('非对象内容（数组 / 数字 / null）→ 默认设置', () => {
    for (const raw of ['[]', '42', 'null']) {
      const store = memoryStore({ [SETTINGS_KEY]: raw })
      expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('越界值读取时钳制：偏移 ±150、音量 0..1（手改 localStorage 也不失控）', () => {
    const store = memoryStore({
      [SETTINGS_KEY]: JSON.stringify({ offsetMs: 999, musicVolume: 2, sfxVolume: -0.5 }),
    })
    expect(loadSettings(store)).toEqual({ offsetMs: OFFSET_LIMIT_MS, musicVolume: 1, sfxVolume: 0 })

    const flipped = memoryStore({
      [SETTINGS_KEY]: JSON.stringify({ offsetMs: -999, musicVolume: -1, sfxVolume: 9 }),
    })
    expect(loadSettings(flipped)).toEqual({ offsetMs: -OFFSET_LIMIT_MS, musicVolume: 0, sfxVolume: 1 })
  })

  it('字段类型不对（字符串/缺失）→ 该字段取默认，其余照常读取', () => {
    const store = memoryStore({
      [SETTINGS_KEY]: JSON.stringify({ offsetMs: 'late', musicVolume: 0.5 }),
    })
    expect(loadSettings(store)).toEqual({ offsetMs: 0, musicVolume: 0.5, sfxVolume: 1 })
  })

  it('写入失败（如配额满）静默：设置非关键数据，不拖垮对局', () => {
    const store: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(() => saveSettings(store, DEFAULT_SETTINGS)).not.toThrow()
  })
})

describe('音画偏移作用路径（进模拟器前的时间平移）', () => {
  /** 单音符谱面（note.time = 0，同 simulator.test 边界例）按下并返回判定名 */
  const judgeWith = (pressTime: number, offsetMs: number): string => {
    const sim = new Simulator(createChart([[0, 0]]))
    const out = sim.keyDown(0, judgedTime(pressTime, offsetMs))
    expect(out.events).toHaveLength(1)
    return out.events[0]!.judgment
  }

  it('语义钉子：正向偏移把判定时刻前移 1 秒 = 1000 毫秒', () => {
    expect(judgedTime(2.5, 1000)).toBeCloseTo(1.5, 9)
  })

  it('正向偏移救回偏晚的按键：Good 段按键升为 Perfect', () => {
    // 按键迟 60ms（Perfect 窗 50ms 外 10ms）→ Good；前移 15ms 后迟 45ms → Perfect
    expect(judgeWith(0.06, 0)).toBe('Good')
    expect(judgeWith(0.06, 15)).toBe('Perfect')
  })

  it('正向偏移救回窗外的按键：Good 窗外 10ms 的死按重新可判', () => {
    const sim = new Simulator(createChart([[0, 0]]))
    const dead = sim.keyDown(0, judgedTime(0.13, 0)) // 迟 130ms，Good 窗（120ms）外
    expect(dead.events).toHaveLength(0)

    const saved = new Simulator(createChart([[0, 0]]))
    const out = saved.keyDown(0, judgedTime(0.13, 30)) // 前移 30ms → 迟 100ms
    expect(out.events).toHaveLength(1)
    expect(out.events[0]!.judgment).toBe('Good')
  })

  it('负向偏移把判定时刻后移：原本 Perfect 的按键降为 Good', () => {
    expect(judgeWith(0.03, 0)).toBe('Perfect') // 迟 30ms
    expect(judgeWith(0.03, -60)).toBe('Good') // 后移 60ms → 迟 90ms
  })

  it('零偏移 = 现状回归保护：压线判定与既有口径一致（边界含）', () => {
    expect(judgeWith(0.05, 0)).toBe('Perfect') // Perfect 窗边界含
    expect(judgeWith(0.12, 0)).toBe('Good') // Good 窗边界含
  })
})
