/**
 * 键位映射（ADR-0006）：模拟真实钢琴八度。
 * 一行字母键作白键（A S D F G H J = C4..B4），上一行键嵌于其间作黑键
 * （W E T Y U，对应 C#4 D#4 F#4 G#4 A#4）。v1 布局固定，不做重映射。
 *
 * 工单 01 只启用白键；黑键常量在此集中预留，中等难度（12 键）直接扩展，
 * 键位映射常量只此一处。
 */

import type { Lane } from './chart'

/** 白键物理键（自左至右），对应一个八度 C4..B4 */
export const WHITE_KEYS = ['A', 'S', 'D', 'F', 'G', 'H', 'J'] as const

/** 白键对应的钢琴音名（供音频层选择采样；与 converter/rules.ts 的
 *  EASY_KEYS 相同——简单难度键区恰为白键八度，两处独立声明、互为印证） */
export const WHITE_KEY_NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'] as const

/** 黑键物理键（嵌于白键之间，位置同真钢琴；后续工单启用） */
export const BLACK_KEYS = ['W', 'E', 'T', 'Y', 'U'] as const

/** 物理键 → 键位（白键序号）。未映射键返回 null。大小写不敏感。 */
export function laneForKey(key: string): Lane | null {
  const upper = key.toUpperCase()
  const lane = WHITE_KEYS.indexOf(upper as (typeof WHITE_KEYS)[number])
  return lane >= 0 ? lane : null
}

/* ── 工单 03：按谱面键区（ChartMeta.keys）生成完整物理布局 ─────────────
 * 核心八度 C4..B4 恒定钉在 A S D F G H J（白）+ W E T Y U（黑嵌行），
 * 三档难度的肌肉记忆由此共享（ADR-0006）。扩域原则：
 * - 上行（C5 D5…）沿本排右延 K L，其黑键（C#5）落在嵌行 O（K 与 L 之间）；
 * - 下行（G3 A3 B3）落到下排字行 Z X C（低音 = 低位），其黑键（G#3 A#3）
 *   就近安放在数字行 2 3（仍满足"黑键在白键上排"的空间直觉）。
 * v1 定标音域 G3..D5；超出即抛错（谱面契约违约）。
 */

/** 钢琴音名 → 物理键（大写）。v1 全量定标表。 */
const NOTE_TO_PHYSICAL: Readonly<Record<string, string>> = {
  G3: 'Z', 'G#3': '2', A3: 'X', 'A#3': '3', B3: 'C',
  C4: 'A', 'C#4': 'W', D4: 'S', 'D#4': 'E', E4: 'D',
  F4: 'F', 'F#4': 'T', G4: 'G', 'G#4': 'Y', A4: 'H', 'A#4': 'U', B4: 'J',
  C5: 'K', 'C#5': 'O', D5: 'L', 'D#5': 'P',
}

/** 一个键位的完整绑定：物理键、音名、是否黑键 */
export interface KeyBinding {
  readonly lane: Lane
  /** 物理键名（大写字母/数字） */
  readonly key: string
  /** 钢琴音名（供音频层选采样） */
  readonly note: string
  readonly isBlack: boolean
}

/** 一张谱面的键位布局 */
export interface KeyLayout {
  /** 按 lane 升序的全部绑定 */
  readonly keys: readonly KeyBinding[]
  /** 物理键（大小写不敏感）→ 键位；未映射返回 null */
  byPhysical(key: string): Lane | null
}

/** 谱面键区（ChartMeta.keys，钢琴序）→ 物理键布局 */
export function layoutForKeys(notes: readonly string[]): KeyLayout {
  const keys = notes.map((note, lane) => {
    const physical = NOTE_TO_PHYSICAL[note]
    if (physical === undefined) {
      throw new Error(`键位布局未定标音名 ${note}（v1 音域 G3..D5，见 keymap.ts）`)
    }
    return { lane, key: physical, note, isBlack: note.includes('#') } satisfies KeyBinding
  })
  const byKey = new Map(keys.map((b) => [b.key, b.lane]))
  return {
    keys,
    byPhysical(key: string): Lane | null {
      return byKey.get(key.toUpperCase()) ?? null
    },
  }
}
