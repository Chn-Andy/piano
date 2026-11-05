/**
 * @tonejs/midi 适配层：全仓库唯一引入 @tonejs/midi 之处。
 * 将解析出的 MIDI 归约为转换器所需的秒域源曲（SourceSong）——转换器核心
 * 不依赖任何第三方库，合成 fixture 可用纯字面量构造。
 */

// 该包为 UMD/CJS 构建，node ESM 下命名导入不可用，默认导入取其 exports 对象。
import ToneMidi from '@tonejs/midi'
import { pitchClassOf } from '../core/pitch'

/** 源曲音符：时刻（秒）+ MIDI 音高 + 所属轨号（工单 18：分轨判定伴奏材料） */
export interface SourceNote {
  readonly time: number
  readonly midi: number
  /** 所属轨下标（与 SourceTrack.index 对应；合成源曲省略即视作单轨） */
  readonly track?: number
}

/** 源曲的一轨（乐曲声部）：轨道顺序即 MIDI 文件的书写顺序 */
export interface SourceTrack {
  readonly index: number
  /** 轨名（如 'up:' / 'down:' / 'Solo'；无名轨为空串） */
  readonly name: string
  /** MIDI 通道（0 起；9 = 打击乐通道） */
  readonly channel: number
  /** 打击轨（通道 9）：只有节奏没有和声材料，绝不进伴奏声部 */
  readonly percussion: boolean
  readonly noteCount: number
}

/** 打击乐通道（GM 约定，0 起） */
const PERCUSSION_CHANNEL = 9

/**
 * 「只作伴奏材料」的轨名约定（v1.6 试作，ADR-0018）。
 * 名字等于此值的轨不参与玩家谱面（转换器跳过），但仍会被
 * `buildAccompaniment` 当作第二条旋律轨取和声材料——用于「人声旋律 + 自动和弦」
 * 这类源：玩家只弹旋律，和声由伴奏声部奏出（ADR-0016 的边界不变）。
 * 现有三首 fixture 没有同名轨，行为不变。
 */
export const ACCOMPANIMENT_TRACK_NAME = 'accompaniment'

/** 源曲调号 */
export interface SourceKey {
  /** 调根音名（如 'D'、'F#'、'Bb'） */
  readonly root: string
  readonly scale: 'major' | 'minor'
}

/** 源曲：多轨合并后的秒域音符序列 + 速度 + 调号 */
export interface SourceSong {
  readonly notes: readonly SourceNote[]
  /** 首个速度标记的 BPM（v1 假设全曲恒速，卡农等古典 fixture 均满足） */
  readonly bpm: number
  readonly key: SourceKey | null
  /**
   * 分轨清单（工单 18 扩展；省略 = 单轨合成源曲）。轨道顺序决定
   * 「主语律 / 伴奏材料」的判定：第一条有音的旋律轨是主旋律，第二条是
   * 左手或第二旋律声部——伴奏只从后者取材料（ADR-0016）。
   */
  readonly tracks?: readonly SourceTrack[]
}

/** 音高级 → 升号拼写的音名（小调根音换算用） */
const PC_TO_SHARP_NAME = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const

/**
 * @tonejs/midi 的调号 `key` 字段报的是**关系大调字母**（源码
 * keySignatureKeys[key+7]：0 号小调 → "C"）。SourceSong 契约要求调根音
 * （小调的真正主音）：小调根音 = 报告字母 + 9 个半音（关系小调）。
 */
function tonicRoot(reported: string, scale: 'major' | 'minor'): string {
  if (scale === 'major') return reported
  return PC_TO_SHARP_NAME[(pitchClassOf(reported) + 9) % 12]!
}

/** 解析 MIDI 二进制为源曲（@tonejs/midi：60 = C4，time 单位秒）。 */
export function parseMidi(data: ArrayBuffer | Uint8Array): SourceSong {
  const midi = new ToneMidi.Midi(data)
  const tracks: SourceTrack[] = midi.tracks.map((track, index) => ({
    index,
    name: track.name,
    channel: track.channel,
    percussion: track.channel === PERCUSSION_CHANNEL,
    noteCount: track.notes.length,
  }))
  const notes: SourceNote[] = midi.tracks
    .flatMap((track, index) =>
      track.notes.map((note) => ({ time: note.time, midi: note.midi, track: index })),
    )
    .sort((a, b) => a.time - b.time)
  const bpm = midi.header.tempos[0]?.bpm ?? 120
  const keySignature = midi.header.keySignatures[0]
  const scale = keySignature === undefined || keySignature.scale === 'major' ? 'major' : 'minor'
  return {
    notes,
    bpm,
    tracks,
    key:
      keySignature === undefined
        ? null
        : {
            root: tonicRoot(keySignature.key, scale),
            scale,
          },
  }
}
