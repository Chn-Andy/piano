import { describe, expect, it } from 'vitest'
import { TUTORIAL_KEY, markTutorialDone, tutorialDone } from './tutorial'
import type { KeyValueStore } from './records'

/** 引导状态（SPEC 故事 1：首次进入约 30 秒键位引导，不阻塞已玩过的用户） */

function memoryStore(initial?: Record<string, string>): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial ?? {}))
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) }
}

describe('引导完成状态（localStorage 标记）', () => {
  it('首次进入（无标记）→ 未完成', () => {
    expect(tutorialDone(memoryStore())).toBe(false)
  })

  it('标记后 → 已完成；再次标记幂等', () => {
    const store = memoryStore()
    markTutorialDone(store)
    expect(tutorialDone(store)).toBe(true)
    expect(store.data.get(TUTORIAL_KEY)).toBe('1')

    markTutorialDone(store)
    expect(tutorialDone(store)).toBe(true)
  })

  it('标记值损坏（非 1）→ 按未完成处理（宁可重放引导，不可错失教学）', () => {
    expect(tutorialDone(memoryStore({ [TUTORIAL_KEY]: 'yes' }))).toBe(false)
    expect(tutorialDone(memoryStore({ [TUTORIAL_KEY]: '' }))).toBe(false)
  })

  it('写失败静默（引导标记非关键数据）', () => {
    const store: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(() => markTutorialDone(store)).not.toThrow()
  })
})
