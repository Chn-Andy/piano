/**
 * MIDI→谱面转换器（构建期工具，ADR-0003：项目核心资产）。
 * 纯数据变换：SourceSong（秒域音符 + 速度 + 调号）→ 各难度谱面（Chart）。
 * 全部难度规则（键位范围、量化网格、密度过滤、和弦识别、休止切分）集中为
 * rules.ts 的常量；产出的谱面经 createChart 校验契约不变式后才落盘。
 */

import { createChart } from '../core/chart'
import type { Chart, DifficultyName, Phrase } from '../core/chart'
import type { SourceKey, SourceSong } from './midiSource'
import {
  DIFFICULTY_RULES,
  LEAD_IN_SECONDS,
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

/** 调根音名 → 音高级（'D'→2、'F#'→6、'Bb'→10）；无法解析按 C 处理 */
function rootPc(root: string): number {
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[root[0]?.toUpperCase() ?? '']
  if (base === undefined) return 0
  let pc = base
  for (const char of root.slice(1)) {
    if (char === '#') pc += 1
    else if (char === 'b') pc -= 1
  }
  return ((pc % 12) + 12) % 12
}

/**
 * 移调到白键域（简单难度）：大调根音 → C、小调根音 → a，
 * 取绝对值最小的半音数（±6），使全曲音级落在白键上。
 */
function whiteKeyTranspose(key: SourceKey | null): number {
  if (key === null) return 0
  const target = key.scale === 'minor' ? 9 : 0
  return (((target - rootPc(key.root) + 6) % 12) + 12) % 12 - 6
}

/** 量化后的音符（音高仅用于和弦上限时的取舍与同键合并） */
interface MappedNote {
  readonly time: number
  readonly pitch: number
  readonly lane: number
}

/** 事件 = 同时刻音符组（和弦候选） */
type Event = readonly MappedNote[]

/**
 * 转换一首源曲为某一难度的谱面。
 * 流水线：移调 → 量化 → 键位映射 → 同刻分组（同键合并 + 和弦上限）→
 * 密度过滤 → 起奏平移 → 乐句切分（余韵窗口）→ 契约装配。
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

  // 量化 + 键位映射（同拍等分网格吸附；同格即同刻——和弦识别容差即网格）
  const mapped: MappedNote[] = source.notes
    .map((note) => {
      const pitch = note.midi + transpose
      return {
        time: roundMs(Math.round(note.time / grid) * grid),
        pitch,
        lane:
          rule.pitchMapping === 'diatonic'
            ? diatonicLane(pitch)
            : chromaticLane(pitch, rule.keys),
      }
    })
    .sort((a, b) => a.time - b.time || a.pitch - b.pitch)

  // 同刻分组；组内同键位合并（保留最高音），再按和弦上限保留最高音
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
    const byLane = new Map<number, MappedNote>()
    for (const note of group) {
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

  // 起奏预留：首音符早于预留时刻则整体平移（不改变相对时距）
  const firstTime = keptEvents[0]![0]!.time
  const shift = LEAD_IN_SECONDS - firstTime
  const events: Event[] =
    shift > 0
      ? keptEvents.map((event) => event.map((n) => ({ ...n, time: roundMs(n.time + shift) })))
      : keptEvents

  // 乐句切分（休止检测）+ 余韵窗口
  const phrases = splitPhrases(events, beat)

  // 契约装配（createChart 校验全部不变式）
  let chordSeq = 0
  const pairs: [number, number, number | undefined][] = []
  for (const event of events) {
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
 * 休止检测切分乐句：休止 ≥ PHRASE_REST_BEATS 拍 且当前跨度 ≥ PHRASE_MIN_SPAN_BEATS 拍
 * → 句边界；跨度不足的换气并入后续乐句。每句末附余韵窗口
 * （句间休止 > 窗口时长，窗口内无音符由构造保证、createChart 兜底）。
 */
function splitPhrases(events: readonly Event[], beat: number): Phrase[] {
  const restSeconds = PHRASE_REST_BEATS * beat
  const minSpanSeconds = PHRASE_MIN_SPAN_BEATS * beat
  const phrases: Phrase[] = []
  let start = events[0]![0]!.time
  for (let i = 1; i < events.length; i += 1) {
    const end = events[i - 1]![0]!.time
    const gap = events[i]![0]!.time - end
    if (gap >= restSeconds - EPS && end - start >= minSpanSeconds - EPS) {
      phrases.push(makePhrase(phrases.length, start, end))
      start = events[i]![0]!.time
    }
  }
  const lastEnd = events[events.length - 1]![0]!.time
  phrases.push(makePhrase(phrases.length, start, lastEnd))
  return phrases
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
