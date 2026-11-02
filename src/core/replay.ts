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
import type { Messages } from '../i18n/messages'
import type { JudgmentTier } from './simulator'

/** 回放窗口的时长（秒）：票面「本局最后 20 秒」 */
export const REPLAY_SECONDS = 20

/**
 * 回放起点前的余量（秒）：第一颗音也落在音频时间线的未来，防爆音。
 * 与演奏时的 PLAY_EPSILON 同一个道理；放在纯层是为了让「回放在哪一刻结束」
 * 可被测试钉住（A2：播完要复位）。
 */
export const REPLAY_LEAD = 0.12

/*
 * 回放按钮的两个文案不在这里：它们是玩家可见文案，已收进文案表的
 * `replay.idle` / `replay.playing`（ADR-0017）。纯层只判「在播 / 没在播」。
 */

/**
 * 一次回放的播放状态（音频时钟）：壳层只存这一份，逐帧问一句「还在播吗」。
 * A2 的缺陷就出在这里——此前「在播」是一个只写 true 的布尔量，播完无人复位。
 */
export interface ReplayPlayback {
  /** 排进音频时间线的第一颗音的时刻（音频时钟，秒） */
  readonly startAt: number
  /** 实际回放时长（秒，= 计划窗口时长） */
  readonly duration: number
}

/** 点下「听我的演奏」那一刻的播放状态：起点 = now + 余量 */
export function replayPlaybackAt(now: number, plan: ReplayPlan): ReplayPlayback {
  return { startAt: now + REPLAY_LEAD, duration: Math.max(0, plan.duration) }
}

/** 播放窗口是否还没走完（终点不含：到点即停）；没在播 → false */
export function replayActiveAt(playback: ReplayPlayback | null, now: number): boolean {
  if (playback === null) return false
  return now < playback.startAt + playback.duration
}

/** 按钮此刻该写的字：在播「再听一遍」，否则「听我的演奏」（文案由调用方给语言） */
export function replayLabel(active: boolean, copy: Messages): string {
  return active ? copy['replay.playing'] : copy['replay.idle']
}

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

/**
 * 回放里要发声的一颗伴奏音（`at` 相对回放起点，秒）。
 * 名字是「音」不是「和弦」：伴奏在每个时间点上是一**单音**（和弦被分解成
 * 一串时刻，见 core/pad.ts / converter/accompaniment.ts），与 GLOSSARY 的
 * 「和弦音符」（同刻多键）不是一回事——旧名 ReplayChord 会让人按和弦去读它。
 */
export interface ReplayTone {
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
  /** 窗口内的伴奏（升序，单音） */
  readonly accompaniment: readonly ReplayTone[]
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

  const tones: ReplayTone[] = []
  for (const hit of accompaniment) {
    if (!within(hit.at)) continue
    tones.push({ midi: hit.midi, at: hit.at - from })
  }
  tones.sort((a, b) => a.at - b.at)

  return {
    from,
    to,
    duration: to - from,
    notes,
    accompaniment: tones,
    finaleAt: finaleAt !== null && within(finaleAt) ? finaleAt - from : null,
    hits,
    misses,
  }
}
