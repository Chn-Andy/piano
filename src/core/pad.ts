/**
 * 伴奏铺底（ADR-0016 卡农例外）：当源曲没有可拆的和声材料时，用一层
 * **程序合成**的低音垫在旋律之下——不是录音、不是常驻音轨，也不是把主旋律
 * 换个音色冒充伴奏：音级取自该窗口内旋律的低音（和声根音），但音高一律
 * 折到旋律键域之下一个八度，玩家按的每一个音都在它上面。
 *
 * 纯层：只做「时刻 + 音高」的确定性计算，不碰 Web Audio / DOM；产物由同一套
 * 钢琴采样发声（壳层负责），故与琴声共用「琴声音量」，不新增任何素材。
 */

import type { DifficultyName } from './chart'
import { ACCOMPANIMENT_PLAN } from './config'
import { harmonicThird } from './harmony'
import { pitchClassOfMidi as pcOf } from './pitch'
import { roundMs } from './time'

/** 铺底音：时刻（谱面时间轴，秒）+ MIDI 音高 */
export interface PadNote {
  readonly at: number
  readonly midi: number
}

/** 铺底窗口时长（秒）：两秒一换和声，任意 4 秒窗口必然压着一层铺底 */
export const PAD_WINDOW_SECONDS = 2

/**
 * 铺底声部数按难度分档（唯一一处：`config.ACCOMPANIMENT_PLAN`，与谱面伴奏的
 * 声部数、播放力度同表）。简单根音 / 中等根音+五度 / 高级三和弦。
 */
export function padVoices(difficulty: DifficultyName): 1 | 2 | 3 {
  return ACCOMPANIMENT_PLAN[difficulty].padVoices
}

export interface PadOptions {
  /** 铺底区间（谱面时刻，秒；左闭右开） */
  readonly from: number
  readonly to: number
  /** 声部数：1 根音 / 2 根音+五度 / 3 根音+三度+五度（难度分档） */
  readonly voices: 1 | 2 | 3
  /** 铺底音一律严格低于此值（旋律最低键）：不代弹的音域保证 */
  readonly registerTop: number
  /** 该段落的旋律实际发声（用于取和声根音与三度性质） */
  readonly melody: readonly { readonly time: number; readonly midi: number }[]
  /**
   * 窗口里听不出三度性质时的调性兜底（默认大调）：小调曲目配小三度，
   * 否则把 a 小调的 C 弹成 C#，和声直接顶住旋律。
   */
  readonly third?: 'major' | 'minor'
}

/**
 * 铺底音域：[registerTop - 12, registerTop - 1]——永远在旋律键域之下一个八度。
 * 取该音域内**不低于下界**的第一个该音级的音（不是向下对齐，否则会掉出音域）。
 */
function padRoot(registerTop: number, pc: number): number {
  const low = registerTop - 12
  return low + (((pc - (low % 12)) % 12) + 12) % 12
}

/**
 * 生成铺底：每 PAD_WINDOW_SECONDS 一个窗口，取窗口内旋律最低音的音级为根音；
 * 窗口内没有旋律时沿用上一窗的根音（曲子开头就没有旋律则取全段最低音）。
 * 同一输入必得同一输出——产物要能逐字节对拍。
 */
export function planPad(options: PadOptions): readonly PadNote[] {
  const { from, to, voices, registerTop, melody } = options
  const minorKey = options.third === 'minor'
  const sorted = [...melody].sort((a, b) => a.time - b.time || a.midi - b.midi)
  const fallbackPc = sorted.length > 0 ? pcOf(Math.min(...sorted.map((n) => n.midi))) : 0

  const notes: PadNote[] = []
  let previousPc: number | null = null
  for (let index = 0; ; index += 1) {
    const start = from + index * PAD_WINDOW_SECONDS
    if (start >= to) break
    const end = start + PAD_WINDOW_SECONDS
    const inside = sorted.filter((n) => n.time >= start && n.time < end)
    const pc: number =
      inside.length > 0 ? pcOf(Math.min(...inside.map((n) => n.midi))) : (previousPc ?? fallbackPc)
    previousPc = pc

    const pcs = new Set(inside.map((n) => pcOf(n.midi)))
    const thirdPc = harmonicThird(pc, pcs, minorKey)
    const fifthPc = (pc + 7) % 12
    const root = padRoot(registerTop, pc)
    const chord = [
      root,
      padRoot(registerTop, thirdPc),
      padRoot(registerTop, fifthPc),
    ]
    const chosen = voices === 1 ? [chord[0]!] : voices === 2 ? [chord[0]!, chord[2]!] : chord
    const step = PAD_WINDOW_SECONDS / chosen.length
    for (const [slot, midi] of chosen.entries()) {
      const at = roundMs(start + slot * step)
      if (at > to) continue
      notes.push({ at, midi })
    }
  }
  return notes
}
