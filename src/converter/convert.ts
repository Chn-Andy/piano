/**
 * MIDI→谱面转换器（构建期工具，ADR-0003：项目核心资产）。
 * 纯数据变换：SourceSong（秒域音符 + 速度 + 调号）→ 各难度谱面（Chart）。
 * 全部难度规则（键位范围、量化网格、密度过滤、和弦识别、休止切分）集中为
 * rules.ts 的常量；产出的谱面经 createChart 校验契约不变式后才落盘。
 */

import { createChart } from '../core/chart'
import type { Chart, DifficultyName, Phrase } from '../core/chart'
import { pitchClassOf } from '../core/pitch'
import type { SourceKey, SourceSong } from './midiSource'
import {
  CHORD_SOURCE_WINDOW,
  DIFFICULTY_RULES,
  LEAD_IN_SECONDS,
  PHRASE_MAX_SPAN_BEATS,
  PHRASE_MIN_SPAN_BEATS,
  PHRASE_REST_BEATS,
  SUSTAIN_SECONDS,
  noteNameToMidi,
} from './rules'

/** 曲目身份（写入谱面元数据） */
export interface SongInfo {
  readonly id: string
  readonly title: string
}

/** 秒→毫秒圆整：谱面时刻统一毫秒精度，保证产物 JSON 确定性 */
function roundMs(t: number): number {
  return Math.round(t * 1000) / 1000
}

/** 浮点安全裕度：网格/间距的等值比较 */
const EPS = 1e-6

/** 白键音高级 → 简单难度键位（C D E F G A B → 0..6） */
const WHITE_PC_TO_LANE: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 }

/** 简单难度：白键折叠——音高级落白键即其键位；黑键并入上方白键（导音上行） */
function diatonicLane(pitch: number): number {
  const pc = ((pitch % 12) + 12) % 12
  const lane = WHITE_PC_TO_LANE[pc]
  if (lane !== undefined) return lane
  const folded = WHITE_PC_TO_LANE[pc + 1]
  if (folded === undefined) throw new Error(`音高级 ${pc} 无法折叠到白键`)
  return folded
}

/** 中等/高级：八度折叠——音高折入键域 [最低键, 最高键] 后取半音下标 */
function chromaticLane(pitch: number, keys: readonly string[]): number {
  const low = noteNameToMidi(keys[0]!)
  const high = noteNameToMidi(keys[keys.length - 1]!)
  let p = pitch
  while (p < low) p += 12
  while (p > high) p -= 12
  return p - low
}

/**
 * 移调到白键域（简单难度）：大调根音 → C、小调根音 → a，
 * 取绝对值最小的半音数（±6），使全曲音级落在白键上。
 */
function whiteKeyTranspose(key: SourceKey | null): number {
  if (key === null) return 0
  const target = key.scale === 'minor' ? 9 : 0
  return (((target - pitchClassOf(key.root) + 6) % 12) + 12) % 12 - 6
}

/** 量化后的音符（srcTime 供源同击聚类；音高用于取舍） */
interface MappedNote {
  readonly time: number
  readonly srcTime: number
  readonly pitch: number
  readonly lane: number
}

/** 事件 = 同时刻音符组（和弦候选；其语义范围是源同击簇） */
type Event = readonly MappedNote[]

/**
 * 转换一首源曲为某一难度的谱面。
 * 流水线：移调 → 量化 → 键位映射 → 同格分组（源同击聚簇：旋律优先取簇 +
 * 同键合并 + 和弦上限）→ 密度过滤 → 起奏平移 → 乐句切分（休止检测 + 超长
 * 强制换气与余韵窗口雕刻）→ 契约装配。
 */
export function convertChart(
  source: SourceSong,
  difficulty: DifficultyName,
  info: SongInfo,
): Chart {
  if (source.notes.length === 0) {
    throw new Error('源曲无音符，无法转换谱面')
  }
  const rule = DIFFICULTY_RULES[difficulty]
  const beat = 60 / source.bpm
  const grid = rule.gridBeats * beat
  const minGap = rule.minGapBeats * beat

  const transpose = rule.transposeToWhite ? whiteKeyTranspose(source.key) : 0

  // 量化 + 键位映射（同拍等分网格吸附；同格即同刻）。
  // 时刻保持未圆整的网格浮点（格长 = gridBeats × beat，格数是二的幂倍数时
  // 与 minGap 的比较精确成立）；毫秒圆整只在装配谱面前做一次——先圆整会让
  // 网格位置在相邻毫秒间交替（如 0.208/0.209），两格间距骑在密度阈值两侧，
  // 贪心过滤在"隔一保留"与"隔二保留"间抖动（致爱丽丝高级实测退化 0.417→0.625）。
  const mapped: MappedNote[] = source.notes
    .map((note) => {
      const pitch = note.midi + transpose
      return {
        time: Math.round(note.time / grid) * grid,
        srcTime: note.time,
        pitch,
        lane:
          rule.pitchMapping === 'diatonic'
            ? diatonicLane(pitch)
            : chromaticLane(pitch, rule.keys),
      }
    })
    .sort((a, b) => a.time - b.time || a.pitch - b.pitch)

  // 同格分组；组内按源时刻聚簇（≤CHORD_SOURCE_WINDOW 为真同击），
  // 只保留最高音所在的簇（同格内先后奏响的连音按旋律优先取舍），
  // 簇内同键位合并（保留最高音），再按和弦上限保留最高音
  const grouped: Event[] = []
  for (const note of mapped) {
    const current = grouped[grouped.length - 1]
    if (current !== undefined && current[0]!.time === note.time) {
      grouped[grouped.length - 1] = [...current, note]
    } else {
      grouped.push([note])
    }
  }
  const capped: Event[] = grouped.map((group) => {
    const anchor = [...group].sort((a, b) => b.pitch - a.pitch)[0]!
    const cluster = group.filter((n) => Math.abs(n.srcTime - anchor.srcTime) <= CHORD_SOURCE_WINDOW)
    const byLane = new Map<number, MappedNote>()
    for (const note of cluster) {
      const existing = byLane.get(note.lane)
      if (existing === undefined || note.pitch > existing.pitch) {
        byLane.set(note.lane, note)
      }
    }
    const distinct = [...byLane.values()]
    const kept =
      distinct.length > rule.maxChordNotes
        ? [...distinct].sort((a, b) => b.pitch - a.pitch).slice(0, rule.maxChordNotes)
        : distinct
    return kept.sort((a, b) => a.lane - b.lane)
  })

  // 密度过滤：贪心保留间距达标的事件（和弦整组作为一个事件）
  const keptEvents: Event[] = []
  for (const event of capped) {
    const last = keptEvents[keptEvents.length - 1]
    if (last === undefined || event[0]!.time - last[0]!.time >= minGap - EPS) {
      keptEvents.push(event)
    }
  }

  // 起奏预留：首音符早于预留时刻则整体平移（不改变相对时距）；
  // 此处一次性毫秒圆整（谱面时刻的输出精度，后续比较都在圆整值上）
  const firstTime = keptEvents[0]![0]!.time
  const shift = LEAD_IN_SECONDS - firstTime
  const events: Event[] =
    shift > 0
      ? keptEvents.map((event) => event.map((n) => ({ ...n, time: roundMs(n.time + shift) })))
      : keptEvents.map((event) => event.map((n) => ({ ...n, time: roundMs(n.time) })))

  // 乐句切分（休止检测 + 超长强制换气）+ 余韵窗口雕刻
  const { phrases, kept } = splitPhrases(events, beat)

  // 契约装配（createChart 校验全部不变式）
  let chordSeq = 0
  const pairs: [number, number, number | undefined][] = []
  for (const event of kept) {
    const chordId = event.length >= 2 ? chordSeq++ : undefined
    for (const note of event) pairs.push([note.time, note.lane, chordId])
  }
  return createChart(pairs, {
    meta: {
      song: info.id,
      title: info.title,
      difficulty,
      keys: rule.keys,
      quantizeGrid: roundMs(grid),
    },
    phrases,
  })
}

/** 一次转出三难度谱面 */
export function convertSong(
  source: SourceSong,
  info: SongInfo,
): Record<DifficultyName, Chart> {
  return {
    easy: convertChart(source, 'easy', info),
    medium: convertChart(source, 'medium', info),
    hard: convertChart(source, 'hard', info),
  }
}

/**
 * 乐句切分（休止检测为主 + 超长强制换气）与余韵窗口雕刻。
 * - 自然换气：休止 ≥ PHRASE_REST_BEATS 拍且跨度 ≥ PHRASE_MIN_SPAN_BEATS 拍 → 边界
 *   （跨度不足的换气并入后续乐句）。
 * - 强制换气：跨度达 PHRASE_MAX_SPAN_BEATS 拍仍无自然换气口（连续织体）→ 在当前
 *   位置切句，并雕刻窗口：丢弃 (句末, 句末+SUSTAIN_SECONDS] 内的音符，
 *   为余韵演出让出静默（自然换气口已够宽，雕刻通常零丢弃）。
 * 返回句序列与雕刻后保留的事件（调用方以保留事件装配契约）。
 */
function splitPhrases(
  events: readonly Event[],
  beat: number,
): { phrases: Phrase[]; kept: Event[] } {
  const restSeconds = PHRASE_REST_BEATS * beat
  const minSpanSeconds = PHRASE_MIN_SPAN_BEATS * beat
  const maxSpanSeconds = PHRASE_MAX_SPAN_BEATS * beat
  const phrases: Phrase[] = []
  const kept: Event[] = []
  let startIdx = 0
  for (let i = 1; i <= events.length; i += 1) {
    const atEnd = i === events.length
    const end = events[i - 1]![0]!.time
    const span = end - events[startIdx]![0]!.time
    const gap = atEnd ? Number.POSITIVE_INFINITY : events[i]![0]!.time - end
    const naturalBreath = gap >= restSeconds - EPS && span >= minSpanSeconds - EPS
    const forcedBreath = !atEnd && span >= maxSpanSeconds - EPS
    if (!atEnd && !naturalBreath && !forcedBreath) continue

    phrases.push(makePhrase(phrases.length, events[startIdx]![0]!.time, end))
    for (let k = startIdx; k < i; k += 1) kept.push(events[k]!)
    if (atEnd) break
    // 雕刻余韵窗口：丢弃窗口内事件（强制换气处的小 gap 需要它让出演出静默）
    let next = i
    while (
      next < events.length &&
      events[next]![0]!.time <= end + SUSTAIN_SECONDS + EPS
    ) {
      next += 1
    }
    startIdx = next
    i = next - 1 // for 自增后恰好从 next 继续
  }
  return { phrases, kept }
}

function makePhrase(id: number, start: number, end: number): Phrase {
  return {
    id,
    start,
    end,
    sustainStart: end,
    sustainEnd: roundMs(end + SUSTAIN_SECONDS),
  }
}
