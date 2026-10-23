import { describe, expect, it } from 'vitest'
import { pitchClassOf } from './pitch'

/**
 * 音名 → 音高级（审查修复收敛出的共享纯函数）：converter 的调根换算与
 * 移调、audio 的采样选择三处共用，行为以字面量算例钉死。
 */
describe('音名 → 音高级', () => {
  it('自然音级：C=0 … B=11（大小写不敏感）', () => {
    expect(pitchClassOf('C')).toBe(0)
    expect(pitchClassOf('D')).toBe(2)
    expect(pitchClassOf('E')).toBe(4)
    expect(pitchClassOf('F')).toBe(5)
    expect(pitchClassOf('G')).toBe(7)
    expect(pitchClassOf('A')).toBe(9)
    expect(pitchClassOf('B')).toBe(11)
    expect(pitchClassOf('b')).toBe(11)
  })

  it('升降号按半音累计：F#=6、Bb=10、Cb=B=11（折回 0..11）', () => {
    expect(pitchClassOf('F#')).toBe(6)
    expect(pitchClassOf('Bb')).toBe(10)
    expect(pitchClassOf('Cb')).toBe(11)
    expect(pitchClassOf('B#')).toBe(0)
  })

  it('首字母无法解析按 C（0）兜底（调用方均保证字母合法，纯防御）', () => {
    expect(pitchClassOf('')).toBe(0)
    expect(pitchClassOf('X#')).toBe(0)
  })
})
