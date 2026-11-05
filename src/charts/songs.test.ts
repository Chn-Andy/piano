/**
 * 主题曲配置契约（v1.6，ADR-0019）。
 * 纯数据断言：全轨只给非移调难度；主题默认值不改变旧曲；纸/墨对比可读。
 */

import { describe, expect, it } from 'vitest'
import { SONGS, songById } from './index'
import { DEFAULT_THEME, ZHUXIA_THEME, mixHex } from '../core/theme'

/** sRGB 相对亮度（WCAG） */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const channels = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

describe('主题曲配置（ADR-0019）', () => {
  it('全轨只在 medium / hard；easy 走纯钢琴', () => {
    const zhuxia = songById('zhuxia-manyouji')!
    expect(zhuxia.backing?.difficulties).toEqual(['medium', 'hard'])
    expect(zhuxia.backing?.file).toBe('songs/zhuxia-manyouji.mp3')
    expect(zhuxia.backing?.gain).toBeGreaterThan(0)
    expect(zhuxia.backing?.gain).toBeLessThanOrEqual(1)
    expect(zhuxia.theme).toBe(ZHUXIA_THEME)
  })

  it('其余三首没有全轨与主题，默认水墨不受影响', () => {
    for (const song of SONGS.filter((s) => s.id !== 'zhuxia-manyouji')) {
      expect(song.backing).toBeUndefined()
      expect(song.theme).toBeUndefined()
    }
  })

  it('默认主题与主题曲的纸/墨对比都达到 4.5:1', () => {
    expect(contrast(DEFAULT_THEME.paper, DEFAULT_THEME.ink)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(ZHUXIA_THEME.paper, ZHUXIA_THEME.ink)).toBeGreaterThanOrEqual(4.5)
  })

  it('mixHex 在两端返回原色，中点线性插值', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})
