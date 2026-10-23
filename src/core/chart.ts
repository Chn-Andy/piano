/**
 * 谱面（Chart）：一首歌在某难度下的全部音符及其时刻的编排。
 * 这是项目的核心数据契约（SPEC-0001），工单 02 将以本契约为种子扩展
 * （乐句边界、余韵窗口、难度元数据）。时间单位为秒，位于音频主时钟域（ADR-0010）。
 */

/** 键位：一个八度内的白键序号（0..6）。黑键与扩域见 ADR-0006、工单 02+。 */
export type Lane = number

/** 音符（Note）：要求玩家在 `time` 时刻按下的目标。 */
export interface ChartNote {
  readonly id: number
  /** 命中时刻（秒，谱面时间轴） */
  readonly time: number
  /** 键位（白键序号） */
  readonly lane: Lane
}

export interface Chart {
  readonly notes: readonly ChartNote[]
  /** 谱面终点（最后一个音符时刻 + 收尾余量，秒） */
  readonly duration: number
}

/** 谱面收尾余量：最后一个音符之后仍视为"演奏中"的时长。 */
const TAIL_SECONDS = 2

/**
 * 以 [时刻, 键位] 元组序列手写谱面。
 * 幂等分配音符 id（按时间升序），并校验时刻单调不减。
 */
export function createChart(pairs: readonly (readonly [time: number, lane: Lane])[]): Chart {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0])
  const notes: ChartNote[] = sorted.map(([time, lane], id) => ({ id, time, lane }))
  const last = sorted.length > 0 ? sorted[sorted.length - 1]![0] : 0
  return { notes, duration: last + TAIL_SECONDS }
}
