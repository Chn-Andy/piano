import { describe, expect, it } from 'vitest'
import { REPLAY_LEAD, REPLAY_LABELS, REPLAY_SECONDS, replayActiveAt, replayLabel, replayPlaybackAt, replayPlanFor } from './replay'
import type { PlayedNote } from './replay'

/**
 * 回放裁剪（票 19，spec v1.4「回放只在内存里」）：
 * 把本局演奏记录裁成「最后 20 秒（不足则从头）」，只留下玩家**真的弹中**的音，
 * 与同一窗口内的伴奏一起重放。漏掉的音不进计划——回放的是真实演奏，不是补全；
 * 本层纯数据，发声由壳层经同一套钢琴采样调度。
 */

const hit = (at: number, lane = 0): PlayedNote => ({ lane, judgment: 'Perfect', at })
const good = (at: number, lane = 1): PlayedNote => ({ lane, judgment: 'Good', at })
const miss = (at: number, lane = 2): PlayedNote => ({ lane, judgment: 'Miss', at })

/** 常量的口径（票面：最后 20 秒） */
describe('回放窗口', () => {
  it(`窗口时长就是票面的 ${REPLAY_SECONDS} 秒`, () => {
    expect(REPLAY_SECONDS).toBe(20)
  })

  it('空演奏：窗口照样给出，一颗音都不发声（静置对局的安静要原样保留）', () => {
    const plan = replayPlanFor([], [], 175, 170)
    expect(plan).toMatchObject({ from: 155, to: 175, duration: 20, notes: [], hits: 0, misses: 0 })
    expect(plan.finaleAt).toBe(15) // 终章在窗口内（175-170）
  })

  it('不足 20 秒：从头起，起点不为负', () => {
    const plan = replayPlanFor([], [], 12.5, null)
    expect(plan.from).toBe(0)
    expect(plan.to).toBe(12.5)
    expect(plan.duration).toBe(12.5)
    expect(plan.finaleAt).toBe(null)
  })
})

describe('回放裁剪', () => {
  it('起点之前的音不算：差 1 毫秒就是窗口外（相对偏移不会出现负数）', () => {
    const plan = replayPlanFor([hit(154.999), hit(155), hit(156.5)], [], 175, null)
    expect(plan.notes).toEqual([
      { lane: 0, at: 0 },
      { lane: 0, at: 1.5 },
    ])
  })

  it('漏掉的音不发声：Miss 不进回放，只记一笔漏数', () => {
    const plan = replayPlanFor([hit(160), miss(161), good(162)], [], 175, null)
    expect(plan.notes).toEqual([
      { lane: 0, at: 5 },
      { lane: 1, at: 7 },
    ])
    expect(plan.hits).toBe(2)
    expect(plan.misses).toBe(1)
  })

  it('音符按时刻升序排好（同一帧内到达的判定可能乱序）', () => {
    const plan = replayPlanFor([hit(170), hit(160), good(165)], [], 175, null)
    expect(plan.notes.map((n) => n.at)).toEqual([5, 10, 15])
  })

  it('伴奏按同一窗口裁剪，与旋律共享起点：命中的音才和伴奏一起响', () => {
    const accompaniment = [
      { at: 150, midi: 48 }, // 窗口外（早）
      { at: 156, midi: 55 },
      { at: 175, midi: 60 }, // 窗口末端（含等号）
      { at: 176, midi: 62 }, // 窗口外（晚）
    ]
    const plan = replayPlanFor([], accompaniment, 175, null)
    expect(plan.accompaniment).toEqual([
      { midi: 55, at: 1 },
      { midi: 60, at: 20 },
    ])
  })

  it('跨终章：终章在窗口内 → 给出相对时刻；不在窗口内 → null', () => {
    expect(replayPlanFor([], [], 175, 170).finaleAt).toBe(15)
    expect(replayPlanFor([], [], 175, 175).finaleAt).toBe(20)
    expect(replayPlanFor([], [], 175, 151).finaleAt).toBe(null)
  })
})

/**
 * 回放播放状态（v1.4 两轴审查 A2）。
 *
 * 缺陷原状：`__xq.replayPlaying` 是一个只置 true 的布尔量，20 秒放完也没人
 * 复位，按钮永远停在「再听一遍」。修法：壳层存一份「起点 + 时长」，逐帧按
 * 音频时钟问 `replayActiveAt`——判据在这里钉住，壳层只负责照写。
 */
describe('回放播放状态与复位（A2）', () => {
  /** 常规范例：20 秒窗口 */
  const plan = replayPlanFor([], [], 175, null)

  it(`起点比点击晚 ${REPLAY_LEAD} 秒：第一颗音落在音频时间线的未来`, () => {
    const playback = replayPlaybackAt(100, plan)
    expect(playback.startAt).toBeCloseTo(100 + REPLAY_LEAD, 9)
    expect(playback.duration).toBe(REPLAY_SECONDS)
  })

  it('窗口内为 true，到点即为 false（终点不含）——播完必须复位', () => {
    const playback = replayPlaybackAt(100, plan)
    const end = playback.startAt + REPLAY_SECONDS
    expect(replayActiveAt(playback, 100)).toBe(true)
    expect(replayActiveAt(playback, end - 0.001)).toBe(true)
    expect(replayActiveAt(playback, end)).toBe(false)
    expect(replayActiveAt(playback, end + 60)).toBe(false)
    expect(replayActiveAt(null, 100), '没在播 → 不亮').toBe(false)
  })

  it('按钮文案随状态走：未播 / 播完读「听我的演奏」，在播读「再听一遍」', () => {
    expect(replayLabel(false)).toBe('听我的演奏')
    expect(replayLabel(true)).toBe('再听一遍')
    expect(REPLAY_LABELS.idle).toBe(replayLabel(false))
    expect(REPLAY_LABELS.playing).toBe(replayLabel(true))
  })

  it('不足 20 秒的短局按实际窗口结束（不会永远「在播」）', () => {
    const short = replayPlanFor([], [], 8, null)
    const playback = replayPlaybackAt(50, short)
    expect(playback.duration).toBe(8)
    expect(replayActiveAt(playback, playback.startAt + 8.05)).toBe(false)
  })

  it('重复点击换一份新状态（先停再放）：两份互不牵连，旧窗口到点不影响新的', () => {
    const first = replayPlaybackAt(100, plan)
    const second = replayPlaybackAt(112, plan)
    expect(second.startAt).toBeGreaterThan(first.startAt)
    expect(replayActiveAt(first, first.startAt + REPLAY_SECONDS)).toBe(false)
    expect(replayActiveAt(second, first.startAt + REPLAY_SECONDS), '第二遍还在播').toBe(true)
  })
})
