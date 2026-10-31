/**
 * 伴奏声部的生成（工单 18，ADR-0016：伴奏只承担和声，旋律永远归玩家）。
 *
 * 材料来源是「非主旋律」那一条轨：MIDI 书写惯例里第一条有音的旋律轨是
 * 主旋律（右手 / Solo），第二条是左手或第二旋律声部——伴奏只从后者取和声，
 * 打击轨（通道 9）不参与。只有一条旋律轨的曲子（卡农）没有可拆材料，返回
 * undefined：谱面不带伴奏声部，壳层改用 core/pad.ts 的合成低频铺底。
 *
 * 三档织体（不随表现动态加厚——那会把伴奏变成隐藏评分）：
 * - 简单：每窗一声低音（左手根音）；
 * - 中等：每窗三声——低音 + 三度 + 五度的分解；
 * - 高级：每窗四声——再补一条内声部（材料里最高的其余音级）。
 *
 * 两条硬保证：
 * - **不代弹**：所有伴奏音折进「旋律最低键以下两个八度」的左手音域，任何时刻
 *   都低于玩家能按出的每一个音，因此不可能与旋律同刻同音高；
 * - **不断**：材料沉默的段落（春江花月夜前段只有 Solo 在唱）由合成铺底顶上，
 *   整首没有超过一个窗口的空缺。
 */

import type { AccompanimentNote, DifficultyName } from '../core/chart'
import { ACCOMPANIMENT_PLAN } from '../core/config'
import { harmonicThird } from '../core/harmony'
import { padVoices, planPad } from '../core/pad'
import { foldInto, pitchClassOfMidi } from '../core/pitch'
import { roundMs } from '../core/time'
import type { SourceSong } from './midiSource'

/**
 * 和声窗口（拍）：两拍一换和声——任意 4 秒里必有一声伴奏。
 * 声部数与播放力度不在这里：一张表在 `core/config.ts` 的 ACCOMPANIMENT_PLAN
 * （谱面伴奏与合成铺底同表，转换器与运行时共用）。
 */
export const ACCOMPANIMENT_WINDOW_BEATS = 2

/** 源曲里参与和声的轨（排除打击轨与空轨），按文件书写顺序 */
export function melodicTracks(source: SourceSong): readonly number[] {
  if (source.tracks !== undefined) {
    return source.tracks
      .filter((track) => !track.percussion && track.noteCount > 0)
      .map((track) => track.index)
      .sort((a, b) => a - b)
  }
  // 无分轨清单的合成源曲：音符自带的轨号（缺省 0）即分轨
  return [...new Set(source.notes.map((note) => note.track ?? 0))].sort((a, b) => a - b)
}

/**
 * 伴奏材料所在的轨：第二条旋律轨。undefined = 该曲没有可拆的和声材料
 * （卡农：单轨；ADR-0016 的例外由此而来）。
 */
export function accompanimentTrackOf(source: SourceSong): number | undefined {
  return melodicTracks(source)[1]
}

export interface AccompanimentInput {
  readonly source: SourceSong
  readonly difficulty: DifficultyName
  /** 一拍时长（秒） */
  readonly beat: number
  /** 量化网格（秒）：伴奏与旋律吸附同一张网格 */
  readonly grid: number
  /** 起奏平移（秒）：源时刻 → 谱面时刻 */
  readonly shift: number
  /** 谱面时长（秒）：伴奏不越出曲末 */
  readonly duration: number
  /** 旋律最低键的 MIDI 音高：伴奏一律低于它 */
  readonly registerTop: number
  /** 旋律的实际发声（键名音高），铺底取和声根音用 */
  readonly melody: readonly { readonly time: number; readonly midi: number }[]
}

/**
 * 一个和声窗口的候选音：低音 + 和弦音（音级由该窗材料决定）。
 * 低音取**材料里最低那个音**归位后的音高——不能取「折进音域后的最低音」，
 * 否则低音被折上去以后反而高过五度音，整条低音线就丢了根音（a 小调会听成
 * 一直踩着属音 E）。
 */
function windowVoices(
  pitches: readonly number[],
  voices: number,
  low: number,
  high: number,
  minorKey: boolean,
): number[] {
  const bass = foldInto(Math.min(...pitches), low, high)
  const pcs = new Set(pitches.map((midi) => pitchClassOfMidi(midi)))
  const rootPc = pitchClassOfMidi(bass)
  const thirdPc = harmonicThird(rootPc, pcs, minorKey)
  const fifthPc = (rootPc + 7) % 12

  const chord = [bass]
  if (voices >= 2) chord.push(chordTone(thirdPc, bass, low, high))
  if (voices >= 3) chord.push(chordTone(fifthPc, bass, low, high))
  if (voices >= 4) {
    // 内声部：材料里除根/三/五之外最靠近低音的音级；材料只有三和弦时补八度
    const inner = [...pcs]
      .filter((pc) => pc !== rootPc && pc !== thirdPc && pc !== fifthPc)
      .map((pc) => chordTone(pc, bass, low, high))
      .sort((a, b) => a - b)[0]
    chord.push(inner ?? foldInto(bass + 12, low, high))
  }
  return chord
}

/** 低音之上的某个音级（就近取上；放不下则就近取下） */
function chordTone(pc: number, bass: number, low: number, high: number): number {
  let above = bass + 1
  while (pitchClassOfMidi(above) !== pc) above += 1
  if (above <= high) return above
  let below = bass - 1
  while (pitchClassOfMidi(below) !== pc) below -= 1
  return below >= low ? below : above
}

/**
 * 生成一条谱面的伴奏声部。返回 undefined 表示该曲没有可拆材料
 * （卡农）——调用方据此不写入伴奏字段，卡农谱面因此逐字节不变。
 */
export function buildAccompaniment(input: AccompanimentInput): readonly AccompanimentNote[] | undefined {
  const materialTrack = accompanimentTrackOf(input.source)
  if (materialTrack === undefined) return undefined

  const { difficulty, beat, grid, shift, duration, registerTop } = input
  const windowSeconds = ACCOMPANIMENT_WINDOW_BEATS * beat
  const voices = ACCOMPANIMENT_PLAN[difficulty].chartVoices
  // 左手音域：旋律最低键之下两个八度（真实钢琴左手的活动范围）
  const low = registerTop - 24
  const high = registerTop - 1
  const minorKey = input.source.key?.scale === 'minor'

  // 材料音：与旋律同一张量化网格 + 同一起奏平移
  const material = input.source.notes
    .filter((note) => (note.track ?? 0) === materialTrack)
    .map((note) => ({
      time: roundMs(Math.round(note.time / grid) * grid + shift),
      midi: note.midi,
    }))
    .filter((note) => note.time >= 0 && note.time <= duration)

  const byWindow = new Map<number, number[]>()
  for (const note of material) {
    const index = Math.floor(note.time / windowSeconds)
    byWindow.set(index, [...(byWindow.get(index) ?? []), note.midi])
  }

  const notes: AccompanimentNote[] = []
  const gaps: { from: number; to: number }[] = []
  let gapStart: number | null = null
  for (let index = 0; ; index += 1) {
    const start = index * windowSeconds
    if (start > duration) break
    const pitches = byWindow.get(index)
    if (pitches === undefined) {
      if (gapStart === null) gapStart = start
      continue
    }
    if (gapStart !== null) {
      gaps.push({ from: gapStart, to: start })
      gapStart = null
    }
    const chord = windowVoices(pitches, voices, low, high, minorKey)
    const step = windowSeconds / chord.length
    for (const [slot, midi] of chord.entries()) {
      const at = roundMs(start + slot * step)
      if (at > duration) continue
      notes.push({ time: at, midi })
    }
  }
  if (gapStart !== null) gaps.push({ from: gapStart, to: duration })

  // 材料沉默的段落：合成低频铺底顶上（落在旋律键域之下一个八度；与材料段
  // 在时间上互不相交，故不与左手织体叠在同一窗里）
  for (const gap of gaps) {
    for (const pad of planPad({
      from: gap.from,
      to: gap.to,
      voices: padVoices(difficulty),
      registerTop: input.registerTop, // 铺底音域 = 旋律键域之下一个八度
      melody: input.melody,
      third: minorKey ? 'minor' : 'major',
    })) {
      if (pad.at > duration) continue
      notes.push({ time: pad.at, midi: pad.midi })
    }
  }

  return notes.sort((a, b) => a.time - b.time || a.midi - b.midi)
}
