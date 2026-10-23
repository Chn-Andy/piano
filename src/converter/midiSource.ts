/**
 * @tonejs/midi 适配层：全仓库唯一引入 @tonejs/midi 之处。
 * 将解析出的 MIDI 归约为转换器所需的秒域源曲（SourceSong）——转换器核心
 * 不依赖任何第三方库，合成 fixture 可用纯字面量构造。
 */

// 该包为 UMD/CJS 构建，node ESM 下命名导入不可用，默认导入取其 exports 对象。
import ToneMidi from '@tonejs/midi'
import { pitchClassOf } from '../core/pitch'

/** 源曲音符：时刻（秒）+ MIDI 音高 */
export interface SourceNote {
  readonly time: number
  readonly midi: number
}

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
  const notes: SourceNote[] = midi.tracks
    .flatMap((track) => track.notes.map((note) => ({ time: note.time, midi: note.midi })))
    .sort((a, b) => a.time - b.time)
  const bpm = midi.header.tempos[0]?.bpm ?? 120
  const keySignature = midi.header.keySignatures[0]
  const scale = keySignature === undefined || keySignature.scale === 'major' ? 'major' : 'minor'
  return {
    notes,
    bpm,
    key:
      keySignature === undefined
        ? null
        : {
            root: tonicRoot(keySignature.key, scale),
            scale,
          },
  }
}
