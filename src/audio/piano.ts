/**
 * 采样钢琴：按键即出真钢琴声。
 *
 * ── 采样来源与授权（SPEC-0001 要求在仓库内记录，勿删）──────────────────
 * Salamander Grand Piano V3 —— Alexander Holm 录制（Yamaha C5 三角钢琴，
 * 48kHz/24bit）。授权 CC-BY 3.0（可商用，须署名）：
 *   https://creativecommons.org/licenses/by/3.0/
 * 原始发布：https://archive.org/details/SalamanderGrandPianoV3
 * 本仓库内文件为 v8 力度层的 mp3 转制，取自 @tonejs/piano 作者（Yotam Mann）
 * 托管：https://tambien.github.io/Piano/audio/（仓库 github.com/tambien/Piano）
 * ──────────────────────────────────────────────────────────────────────
 * 原生采样只在小三度音高上（C4/Ds4/Fs4/A4/C5…）；本作所需的其余白键
 * （D4/E4/F4/G4/B4）取最近原生采样、以 playbackRate 重采样发声——这与
 * @tonejs/piano 官方库的做法一致（它同样只携带小三度文件）。
 */

import type { Lane } from '../core/chart'
import { WHITE_KEY_NOTES } from '../core/keymap'

interface NativeSample {
  readonly file: string
  /** 相对 C4 的半音数 */
  readonly semitones: number
}

const NATIVE_SAMPLES: readonly NativeSample[] = [
  { file: 'C4v8.mp3', semitones: 0 },
  { file: 'Ds4v8.mp3', semitones: 3 },
  { file: 'Fs4v8.mp3', semitones: 6 },
  { file: 'A4v8.mp3', semitones: 9 },
  { file: 'C5v8.mp3', semitones: 12 },
]

const PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** 音名（'C4'、'F#4' 或文件名风格 'Fs4'）→ 相对 C4 的半音数。 */
export function semitonesFromC4(note: string): number {
  const m = /^([A-G])([#s]?)(\d)$/.exec(note)
  if (m === null) throw new Error(`无法解析音名: ${note}`)
  const letter = m[1] as string
  const accidental = m[2] ?? ''
  const octave = m[3] as string
  return (Number(octave) - 4) * 12 + PITCH_CLASS[letter]! + (accidental === '' ? 0 : 1)
}

export class Piano {
  private readonly buffers = new Map<string, AudioBuffer>()

  constructor(
    private readonly ctx: () => AudioContext,
    private readonly destination: () => AudioNode,
  ) {}

  /** 预取并解码全部原生采样（5 个文件，约 0.9MB）。 */
  async load(): Promise<void> {
    const ctx = this.ctx()
    await Promise.all(
      NATIVE_SAMPLES.map(async ({ file }) => {
        const res = await fetch(`${import.meta.env.BASE_URL}samples/${file}`)
        if (!res.ok) throw new Error(`采样加载失败 ${file}：HTTP ${res.status}`)
        const bytes = await res.arrayBuffer()
        this.buffers.set(file, await ctx.decodeAudioData(bytes))
      }),
    )
  }

  /**
   * 弹奏一个键位。when 为音频时钟上的发声时刻（ADR-0010）；
   * 调用方通常传 now + 微小 ε，把声音放到音频时间线的未来，避免爆音。
   */
  play(lane: Lane, when: number): void {
    const note = WHITE_KEY_NOTES[lane]
    if (note === undefined) return
    const semitones = semitonesFromC4(note)

    let native = NATIVE_SAMPLES[0]!
    for (const candidate of NATIVE_SAMPLES) {
      if (Math.abs(candidate.semitones - semitones) < Math.abs(native.semitones - semitones)) {
        native = candidate
      }
    }
    const buffer = this.buffers.get(native.file)
    if (buffer === undefined) return

    const ctx = this.ctx()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = 2 ** ((semitones - native.semitones) / 12)
    source.connect(this.destination())
    source.start(when)
  }
}
