/**
 * 进度（票 17，spec v1.4「进度是纯读数」）：一首多长、我走到哪。
 *
 * 只由「谱面 + 当前时刻」派生，不进模拟器状态、不参与判定与战斗，
 * 不改动任何对局数值（血量、咬线、充能、判定窗口、伤害、谱面）。
 * 时间来自音频主时钟域（ADR-0010）的谱面时间轴：倒计时期间为负。
 */

import type { Chart } from './chart'

/** 进度读数：进度轨与结算画面共用的全部派生量 */
export interface SongProgress {
  /** 已过秒数（夹取到 [0, 总长]：倒计时为 0，终局后停在总长） */
  readonly elapsed: number
  /** 谱面总长（秒，含收尾余量） */
  readonly duration: number
  /** 已过 / 总长 ∈ [0,1] */
  readonly ratio: number
  /** 当前所在乐句的序号（1 基）：已开始的最后一句；无乐句或首句未开始为 null */
  readonly phraseIndex: number | null
  /** 乐句总数（无乐句为 0；0 即「句序号回退为不显示」） */
  readonly phraseCount: number
  /** 终章时刻（秒）：末句句末即终章余韵窗口的起点；无乐句为 null */
  readonly finaleAt: number | null
  /** 末句起点（秒）：「最后一句」提示的触发时刻；无乐句为 null */
  readonly finalPhraseStart: number | null
}

/**
 * 终章时刻（秒）：末句句末即终章余韵窗口的起点；无乐句 → null。
 * 进度轨的朱砂点与结算回放共用这一处定义（票 17 / 票 19）。
 */
export function finaleAtOf(chart: Chart): number | null {
  const phrases = chart.phrases ?? []
  const last = phrases[phrases.length - 1]
  return last === undefined ? null : last.sustainStart
}

/**
 * 谱面 + 当前时刻 → 进度读数。
 *
 * 时刻钳在 [0, 总长]：倒计时（t<0）读作开演前，终局后时钟若继续走也不会
 * 越过 100%。句序号只在乐句**开始**时前进，句末到下一句之间的余韵窗口
 * 仍算这一句——「第 N 句唱完了」正是余韵响起的那一刻。
 */
export function songProgress(chart: Chart, t: number): SongProgress {
  const duration = Math.max(0, chart.duration)
  const elapsed = Math.min(duration, Math.max(0, t))
  const ratio = duration > 0 ? elapsed / duration : 0
  const phrases = chart.phrases ?? []
  const last = phrases[phrases.length - 1]
  let phraseIndex: number | null = null
  for (const [index, phrase] of phrases.entries()) {
    if (t < phrase.start) break
    phraseIndex = index + 1
  }
  return {
    elapsed,
    duration,
    ratio,
    phraseIndex,
    phraseCount: phrases.length,
    finaleAt: finaleAtOf(chart),
    finalPhraseStart: last === undefined ? null : last.start,
  }
}

/**
 * 秒 → `m:ss`（轨两端与曲库难度格共用一个口径）。
 *
 * 一律向下取整：左端（已过）与右端（总长）同口径，末尾时才不会出现
 * 「3:33 / 3:34」这种自相矛盾的读法。负数（倒计时）读作 0:00。
 */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const rest = whole - minutes * 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

/** 结算理由（与模拟器 OutcomeEvent.reason 同形；只取这三个字符串） */
export type OutcomeReason = 'cleared' | 'player-hp-empty' | 'monsters-remain'

/**
 * 结算画面上那句「走到 N%」。
 *
 * - 胜局（cleared）恒读 100%：斗琴的胜利定义就是撑到歌末（票面要求）；
 * - 血尽倒下时封顶 99%：99.6% 四舍五入是 100%，但「血尽」绝不能读成
 *   已经走完——差一口气也是差；
 * - 歌毕仍有墨妖存活是另一种败局，血未尽，措辞必须分开。
 */
export function progressLine(progress: SongProgress, reason: OutcomeReason): string {
  const percent = Math.round(progress.ratio * 100)
  if (reason === 'cleared') return '走到 100%'
  if (reason === 'monsters-remain') return `走到 ${percent}%，墨妖未绝`
  return `走到 ${Math.min(99, percent)}%，血尽`
}

/** 句提示的存续时长（秒）：票面「约 2 秒后淡出」 */
export const CUE_LIFE = 2
/** 句提示的淡出段（秒）：最后这段按比例收透明度（渲染层用，测试不测画法） */
export const CUE_FADE = 0.55

/** 屏幕上那一行句提示（同一时刻只有一条） */
export type ProgressCue =
  /** 第 index / count 句（余韵触发后浮出） */
  | { readonly kind: 'phrase'; readonly index: number; readonly count: number; readonly at: number }
  /** 最后一句（末句句首浮出） */
  | { readonly kind: 'final'; readonly at: number }

/**
 * 当前该浮出的句提示；没有则 null。
 *
 * - 由**余韵事件**驱动，不是按句边界掐点：票面要的是「每次余韵之后」报一句，
 *   事件时刻即模拟器产出的 sustain.time（句末 + Good 窗）。
 * - 末句起点浮出「最后一句」，存续期间压过句序号——两者绝不叠字。
 * - 无乐句谱面（phraseCount = 0）一律不显示：句序号回退为不显示。
 */
export function progressCueAt(
  chart: Chart,
  sustains: readonly { readonly time: number; readonly phraseId: number }[],
  t: number,
): ProgressCue | null {
  const phraseCount = chart.phrases?.length ?? 0
  if (phraseCount === 0) return null

  const last = chart.phrases![phraseCount - 1]!
  // 末句提示优先：它讲的是「收尾要来了」，比刚唱完那句的数字更重要
  if (t >= last.start && t < last.start + CUE_LIFE) {
    return { kind: 'final', at: last.start }
  }

  let cue: ProgressCue | null = null
  for (const sustain of sustains) {
    if (t < sustain.time || t >= sustain.time + CUE_LIFE) continue
    if (cue !== null && sustain.time <= cue.at) continue
    cue = { kind: 'phrase', index: sustain.phraseId + 1, count: phraseCount, at: sustain.time }
  }
  return cue
}
