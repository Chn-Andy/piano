/**
 * 回放裁剪（票 19，spec v1.4「回放只在内存里」）。
 *
 * 一局结束后，把壳层在局内抄下的演奏记录裁成**最后 20 秒（不足则从头）**：
 * 只留下玩家真的弹中的音（Perfect / Good），漏掉的音不进计划——回放的是
 * 真实演奏，不是补全；同一窗口内的伴奏声部也一并裁出来，两者共享回放起点，
 * 于是「我弹中的音」叠在伴奏上重响。
 *
 * 纯层：产物只是「相对时刻 + 键位/音高」，发声由壳层经同一套钢琴采样与
 * 音乐轨增益调度（ADR-0010 / ADR-0016）。不写存储、不留可回访入口——
 * 这个计划只活到离开结算画面那一刻（ADR：回放只在内存里）。
 */

import type { AccompanimentHit } from './accompaniment'
import type { Lane } from './chart'
import type { JudgmentTier } from './simulator'

/** 回放窗口的时长（秒）：票面「本局最后 20 秒」 */
export const REPLAY_SECONDS = 20

/**
 * 一局演奏记录里的一颗音：壳层每收到一条判定事件就抄一条（内存数组）。
 * `at` 是判定事件自带的时刻（谱面时间轴）——命中的音因此带着玩家当时的
 * 早/晚，回放听得出这是这一遍，而不是节拍器。
 */
export interface PlayedNote {
  readonly lane: Lane
  readonly judgment: JudgmentTier
  readonly at: number
}

/** 回放里要发声的一颗旋律音（`at` 相对回放起点，秒） */
export interface ReplayNote {
  readonly lane: Lane
  readonly at: number
}

/** 回放里要发声的一颗伴奏音（`at` 相对回放起点，秒） */
export interface ReplayChord {
  readonly midi: number
  readonly at: number
}

/** 一次回放的全部读数（壳层照着排声音 + 写演奏卡的脚注） */
export interface ReplayPlan {
  /** 窗口在本局时间轴上的起点（秒） */
  readonly from: number
  /** 窗口终点（本局结束那一刻，秒） */
  readonly to: number
  /** 实际回放时长（秒）：不足 20 秒时等于 `to` */
  readonly duration: number
  /** 命中的音（升序）；漏掉的不在内 */
  readonly notes: readonly ReplayNote[]
  /** 窗口内的伴奏（升序） */
  readonly accompaniment: readonly ReplayChord[]
  /** 窗口内的终章时刻（相对起点）；窗口里没有终章 → null */
  readonly finaleAt: number | null
  /** 窗口内命中颗数 */
  readonly hits: number
  /** 窗口内漏掉颗数（不发声，只作演奏卡读数） */
  readonly misses: number
}

/**
 * 本局演奏记录 + 伴奏计划 + 结束时刻 → 回放计划。
 *
 * 窗口是闭区间 `[from, to]`：恰在起点上的音保留（相对偏移 0），早于起点
 * 一毫秒即丢弃——所以相对偏移永远非负，调度不会拿到「过去」的时刻。
 * `to` 与 `from` 都钳在 0 以上：终局时刻与窗口时长不可能是负数。
 */
export function replayPlanFor(
  played: readonly PlayedNote[],
  accompaniment: readonly AccompanimentHit[],
  endAt: number,
  finaleAt: number | null,
  span: number = REPLAY_SECONDS,
): ReplayPlan {
  const to = Math.max(0, endAt)
  const from = Math.max(0, to - Math.max(0, span))
  const within = (at: number): boolean => at >= from && at <= to

  const notes: ReplayNote[] = []
  let hits = 0
  let misses = 0
  for (const note of played) {
    if (!within(note.at)) continue
    if (note.judgment === 'Miss') {
      misses += 1
      continue
    }
    hits += 1
    notes.push({ lane: note.lane, at: note.at - from })
  }
  notes.sort((a, b) => a.at - b.at)

  const chords: ReplayChord[] = []
  for (const hit of accompaniment) {
    if (!within(hit.at)) continue
    chords.push({ midi: hit.midi, at: hit.at - from })
  }
  chords.sort((a, b) => a.at - b.at)

  return {
    from,
    to,
    duration: to - from,
    notes,
    accompaniment: chords,
    finaleAt: finaleAt !== null && within(finaleAt) ? finaleAt - from : null,
    hits,
    misses,
  }
}
