/**
 * 谱面（Chart）：一首歌在某难度下的全部音符及其时刻的编排。
 * 这是项目的核心数据契约（SPEC-0001），在工单 01 的最小谱面（音符 + 时长）上
 * 于工单 02 扩展：和弦分组、乐句边界、余韵窗口、难度元数据。
 * 时间单位为秒，位于音频主时钟域（ADR-0010）。
 */

/** 难度分级（GLOSSARY：难度）——同一首歌的三档谱面 */
export type DifficultyName = 'easy' | 'medium' | 'hard'

/**
 * 键位（Lane）：谱面音符在难度键位布局中的下标（自左至右的钢琴键序号）。
 * 工单 01 演示谱面为白键 0..6；黑键与扩域（中等 12 键、高级扩域）见 ADR-0006，
 * 各难度的完整布局由 ChartMeta.keys 声明。
 */
export type Lane = number

/** 音符（Note）：要求玩家在 `time` 时刻按下的目标。 */
export interface ChartNote {
  readonly id: number
  /** 命中时刻（秒，谱面时间轴） */
  readonly time: number
  /** 键位（难度键位布局的下标） */
  readonly lane: Lane
  /**
   * 和弦分组（GLOSSARY：和弦音符）：同组音符须同时刻、同时按下，命中造成重击。
   * 单一音符不带分组。同刻的多颗音符合为一组（和弦识别以时刻为准）。
   */
  readonly chordId?: number
}

/** 难度元数据：谱面自描述其键位范围与量化网格（SPEC-0001 谱面格式）。 */
export interface ChartMeta {
  /** 曲目 id（如 canon-in-d） */
  readonly song: string
  /** 曲名（中文显示名） */
  readonly title: string
  readonly difficulty: DifficultyName
  /** 键位布局：本难度全部键位自左至右的钢琴音名；音符 lane 为其下标 */
  readonly keys: readonly string[]
  /** 量化网格（秒）：转换器生成本谱面所用的时刻吸附网格 */
  readonly quantizeGrid: number
}

/**
 * 乐句（Phrase）：谱面按乐句划分，句末天然换气口自动触发余韵（ADR-0007）。
 * 乐句恰好划分谱面音符：句内无休止，句间必有休止（余韵窗口的承载结构）。
 */
export interface Phrase {
  readonly id: number
  /** 乐句首音符时刻（秒） */
  readonly start: number
  /** 乐句末音符时刻（秒） */
  readonly end: number
  /** 余韵窗口起点（秒）＝句末音符时刻：末音符判定收束后演出开始 */
  readonly sustainStart: number
  /** 余韵窗口终点（秒）：不变式——除句末音符外，(end, sustainEnd] 内无音符 */
  readonly sustainEnd: number
}

export interface Chart {
  readonly notes: readonly ChartNote[]
  /** 谱面终点（最后一个音符时刻 + 收尾余量，秒） */
  readonly duration: number
  /** 谱面元数据（工单 02 扩展；工单 01 手写演示谱面省略） */
  readonly meta?: ChartMeta
  /** 乐句边界（工单 02 扩展；省略时谱面无乐句结构） */
  readonly phrases?: readonly Phrase[]
}

/** 谱面收尾余量：最后一个音符之后仍视为"演奏中"的时长。 */
const TAIL_SECONDS = 2

/** 手写/转换谱面的音符输入：[时刻, 键位, 和弦分组?] */
export type ChartNoteInput = readonly [time: number, lane: Lane, chordId?: number]

/** 完整谱面选项：元数据与乐句（提供即校验）。 */
export interface ChartOptions {
  readonly meta?: ChartMeta
  readonly phrases?: readonly Phrase[]
}

/**
 * 以 [时刻, 键位, 和弦分组?] 元组序列构造谱面（契约的唯一装配点）。
 * 幂等分配音符 id（按时间升序，同刻保持输入顺序），并校验契约不变式：
 * 和弦分组同刻且成组、lane 在键位范围内、乐句恰好划分音符且余韵窗口内无音符。
 */
export function createChart(
  pairs: readonly ChartNoteInput[],
  options?: ChartOptions,
): Chart {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0])
  const notes: ChartNote[] = sorted.map(([time, lane, chordId], id) =>
    chordId === undefined ? { id, time, lane } : { id, time, lane, chordId },
  )
  validateChords(notes)
  const meta = options?.meta
  if (meta !== undefined) validateLanes(notes, meta)
  const phrases = options?.phrases
  if (phrases !== undefined) validatePhrases(notes, phrases)

  const last = sorted.length > 0 ? sorted[sorted.length - 1]![0] : 0
  const duration = last + TAIL_SECONDS
  return {
    notes,
    duration,
    ...(meta !== undefined ? { meta } : {}),
    ...(phrases !== undefined ? { phrases } : {}),
  }
}

/** 和弦分组校验：同刻多音 ⇒ 必为同一分组；同 chordId ⇒ 同刻且 ≥2 音。 */
function validateChords(notes: readonly ChartNote[]): void {
  const simultaneous = new Map<number, readonly ChartNote[]>()
  for (const note of notes) {
    const group = simultaneous.get(note.time)
    if (group === undefined) simultaneous.set(note.time, [note])
    else simultaneous.set(note.time, [...group, note])
  }
  for (const [time, group] of simultaneous) {
    if (group.length < 2) continue
    const ids = new Set(group.map((n) => n.chordId))
    if (ids.size !== 1 || ids.has(undefined)) {
      throw new Error(`时刻 ${time} 的同刻音符必须构成同一和弦分组`)
    }
  }
  const groups = new Map<number, readonly ChartNote[]>()
  for (const note of notes) {
    if (note.chordId === undefined) continue
    const group = groups.get(note.chordId)
    if (group === undefined) groups.set(note.chordId, [note])
    else groups.set(note.chordId, [...group, note])
  }
  for (const [chordId, group] of groups) {
    if (group.length < 2) {
      throw new Error(`和弦 ${chordId} 仅含 1 颗音符：和弦音符至少两键同按`)
    }
    if (group.some((n) => n.time !== group[0]!.time)) {
      throw new Error(`和弦 ${chordId} 的音符必须同刻`)
    }
  }
}

/** 键位范围校验：lane 是 meta.keys 的合法下标。 */
function validateLanes(notes: readonly ChartNote[], meta: ChartMeta): void {
  const keyCount = meta.keys.length
  for (const note of notes) {
    if (!Number.isInteger(note.lane) || note.lane < 0 || note.lane >= keyCount) {
      throw new Error(
        `音符 ${note.id} 的键位 ${note.lane} 越出键位范围（0..${keyCount - 1}）`,
      )
    }
  }
}

/**
 * 乐句校验：乐句依时排序、句间有休止、恰好划分全部音符（首尾对齐实际音符），
 * 余韵窗口从句末起算且窗口内无音符。
 */
function validatePhrases(notes: readonly ChartNote[], phrases: readonly Phrase[]): void {
  if (notes.length === 0) return
  let cursor = 0
  let previousEnd = Number.NEGATIVE_INFINITY
  for (const [index, phrase] of phrases.entries()) {
    if (phrase.id !== index) {
      throw new Error(`乐句 id 须为连续序号：第 ${index} 句的 id 是 ${phrase.id}`)
    }
    if (phrase.start > phrase.end) {
      throw new Error(`乐句 ${phrase.id} 起点晚于终点`)
    }
    if (phrase.start <= previousEnd) {
      throw new Error(`乐句 ${phrase.id} 与前句重叠或无休止：句间必有换气口`)
    }
    if (phrase.sustainStart !== phrase.end) {
      throw new Error(`乐句 ${phrase.id} 的余韵窗口必须从句末音符时刻起算`)
    }
    const first = notes[cursor]
    if (first === undefined || first.time !== phrase.start) {
      throw new Error(`乐句 ${phrase.id} 起点 ${phrase.start} 不是实际音符时刻`)
    }
    while (cursor < notes.length && notes[cursor]!.time <= phrase.end) {
      cursor += 1
    }
    if (notes[cursor - 1]!.time !== phrase.end) {
      throw new Error(`乐句 ${phrase.id} 终点 ${phrase.end} 不是实际末音符时刻`)
    }
    const next = notes[cursor]
    if (next !== undefined && next.time <= phrase.sustainEnd) {
      throw new Error(
        `乐句 ${phrase.id} 的余韵窗口 (${phrase.end}, ${phrase.sustainEnd}] 内出现音符 ${next.id}`,
      )
    }
    previousEnd = phrase.end
  }
  if (cursor !== notes.length) {
    throw new Error(`音符 ${notes[cursor]!.id} 不属于任何乐句（乐句须恰好划分音符）`)
  }
}
