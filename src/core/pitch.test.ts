import { describe, expect, it } from 'vitest'
import { midiToNoteName, noteNameToMidi, pitchClassOf, pitchClassOfMidi } from './pitch'

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

/**
 * 音高数 → 音高级（v1.4 审查 C3：伴奏与铺底此前各抄一份 `((m % 12) + 12) % 12`）。
 * 折回 0..11 是唯一定义；负音高（音域下界之外）也不许返回负数。
 */
describe('音高数 → 音高级（唯一定义处）', () => {
  it('C4=60 → 0、A4=69 → 9、B3=59 → 11', () => {
    expect(pitchClassOfMidi(60)).toBe(0)
    expect(pitchClassOfMidi(69)).toBe(9)
    expect(pitchClassOfMidi(59)).toBe(11)
  })

  it('负音高也折回 0..11（JS 的 % 会返回负数，这里统一修正）', () => {
    expect(pitchClassOfMidi(-1)).toBe(11)
    expect(pitchClassOfMidi(-12)).toBe(0)
    expect(pitchClassOfMidi(-13)).toBe(11)
  })

  it('与音名换算同源：noteNameToMidi / midiToNoteName 往返后音级不变', () => {
    for (const name of ['C4', 'F#4', 'Bb3', 'D5']) {
      const midi = noteNameToMidi(name)
      expect(pitchClassOfMidi(midi)).toBe(pitchClassOf(name))
      expect(midiToNoteName(midi)).toBe(name === 'Bb3' ? 'A#3' : name)
    }
  })
})
