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
