import { describe, expect, it } from 'vitest'
import { BLACK_KEYS, laneForKey, WHITE_KEYS, WHITE_KEY_NOTES } from './keymap'

describe('键位映射（ADR-0006：白键一行 = 一个八度）', () => {
  it('白键 A S D F G H J 依次映射键位 0..6', () => {
    expect(WHITE_KEYS).toEqual(['A', 'S', 'D', 'F', 'G', 'H', 'J'])
    WHITE_KEYS.forEach((key, lane) => {
      expect(laneForKey(key)).toBe(lane)
    })
  })

  it('白键对应音高 C4..B4（真钢琴一个八度）', () => {
    expect(WHITE_KEY_NOTES).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'])
  })

  it('大小写不敏感；未映射键返回 null', () => {
    expect(laneForKey('a')).toBe(0)
    expect(laneForKey('j')).toBe(6)
    expect(laneForKey('W')).toBeNull() // 黑键 W E T Y U 由后续工单（中等难度）启用
    expect(laneForKey('Q')).toBeNull()
    expect(laneForKey(' ')).toBeNull()
  })

  it('黑键布局常量已按 ADR-0006 预留（W E T Y U，嵌于白键之间）', () => {
    expect(BLACK_KEYS).toEqual(['W', 'E', 'T', 'Y', 'U'])
  })
})

/* ── 工单 03：按谱面键区生成物理布局（中等 12 键 / 高级 20 键扩域） ── */

import { layoutForKeys } from './keymap'

describe('谱面键区 → 物理键布局（layoutForKeys）', () => {
  it('简单（7 白键）：与工单 01 的白键映射逐位一致', () => {
    const layout = layoutForKeys(WHITE_KEY_NOTES)
    expect(layout.keys.map((b) => b.key)).toEqual([...WHITE_KEYS])
    expect(layout.keys.map((b) => b.note)).toEqual([...WHITE_KEY_NOTES])
    expect(layout.keys.every((b) => !b.isBlack)).toBe(true)
    WHITE_KEYS.forEach((key, lane) => {
      expect(layout.byPhysical(key)).toBe(lane)
    })
  })

  it('中等（12 键含黑键）：钢琴序 A W S E D F T G Y H U J，黑键嵌行', () => {
    const layout = layoutForKeys([
      'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
    ])
    expect(layout.keys.map((b) => b.key)).toEqual([
      'A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J',
    ])
    expect(layout.byPhysical('W')).toBe(1) // C#4
    expect(layout.byPhysical('T')).toBe(6) // F#4
    expect(layout.keys.filter((b) => b.isBlack).map((b) => b.key)).toEqual(['W', 'E', 'T', 'Y', 'U'])
  })

  it('高级（20 键 G3..D5）：核心八度仍钉在 A..J + W E T Y U，向两侧扩域', () => {
    const hard = [
      'G3', 'G#3', 'A3', 'A#3', 'B3', 'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4',
      'G4', 'G#4', 'A4', 'A#4', 'B4', 'C5', 'C#5', 'D5',
    ]
    const layout = layoutForKeys(hard)
    expect(layout.keys).toHaveLength(20)
    // 跨难度肌肉记忆：C4..B4 恒为 A S D F G H J + W E T Y U
    const noteToKey = new Map(layout.keys.map((b) => [b.note, b.key]))
    expect([
      noteToKey.get('C4'), noteToKey.get('C#4'), noteToKey.get('D4'), noteToKey.get('D#4'),
      noteToKey.get('E4'), noteToKey.get('F4'), noteToKey.get('F#4'), noteToKey.get('G4'),
      noteToKey.get('G#4'), noteToKey.get('A4'), noteToKey.get('A#4'), noteToKey.get('B4'),
    ]).toEqual(['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J'])
    // 低音区下行到下排字行、高音区右延到 K L；黑键按嵌行原则就近安放
    expect(noteToKey.get('G3')).toBe('Z')
    expect(noteToKey.get('A3')).toBe('X')
    expect(noteToKey.get('B3')).toBe('C')
    expect(noteToKey.get('C5')).toBe('K')
    expect(noteToKey.get('D5')).toBe('L')
    expect(layout.byPhysical('z')).toBe(0) // 大小写不敏感
    expect(layout.byPhysical('Q')).toBeNull() // 未映射键
  })

  it('超出已定标音域的键名（如 E5）→ 明确报错（契约：v1 音域 G3..D5）', () => {
    expect(() => layoutForKeys(['E5'])).toThrow()
  })
})
