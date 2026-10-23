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

/** 白键对应的钢琴音名（供音频层选择采样） */
export const WHITE_KEY_NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'] as const

/** 黑键物理键（嵌于白键之间，位置同真钢琴；后续工单启用） */
export const BLACK_KEYS = ['W', 'E', 'T', 'Y', 'U'] as const

/** 物理键 → 键位（白键序号）。未映射键返回 null。大小写不敏感。 */
export function laneForKey(key: string): Lane | null {
  const upper = key.toUpperCase()
  const lane = WHITE_KEYS.indexOf(upper as (typeof WHITE_KEYS)[number])
  return lane >= 0 ? lane : null
}
