import { describe, expect, it } from 'vitest'
import { hudLayout, keyFieldWidth, rectsOverlap } from './hudGeometry'
import type { Rect } from './hudGeometry'

/**
 * HUD 几何的互不重叠（票 17 验收：1440×900 与 800×600 下实测）。
 *
 * 画布像素无法在 node 里断言，但「谁占哪块矩形」是纯几何：把渲染层的
 * 锚位常量收敛到 hudGeometry，再用矩形相交测试钉住两个分辨率的布局。
 * 这样将来谁把进度轨往下挪、把蓄能槽拉高，都会先撞在这组测试上。
 */

/** 两个验收分辨率；白键数取曲库最宽的高级谱（12 白键，最挤的一档） */
const SIZES = [
  { label: '1440×900', W: 1440, H: 900, whites: 12 },
  { label: '800×600', W: 800, H: 600, whites: 12 },
  { label: '1440×900（7 白键）', W: 1440, H: 900, whites: 7 },
  { label: '800×600（7 白键）', W: 800, H: 600, whites: 7 },
]

function overlapNote(a: Rect, b: Rect): string {
  return `矩形相交：(${a.x},${a.y},${a.w}×${a.h}) ∩ (${b.x},${b.y},${b.w}×${b.h})`
}

describe.each(SIZES)('HUD 锚位不重叠 · $label', ({ W, H, whites }) => {
  const hud = hudLayout(W, H, whites)

  it('进度轨贴最顶边：厚 ≤ 4px、左右留边距、不贴边', () => {
    expect(hud.rail.h).toBeLessThanOrEqual(4)
    expect(hud.rail.y).toBeGreaterThanOrEqual(6)
    expect(hud.rail.x).toBeGreaterThanOrEqual(12)
    expect(W - (hud.rail.x + hud.rail.w)).toBeGreaterThanOrEqual(12)
  })

  it('进度轨（含两端读数与句提示）不进下落区，不碰判定线', () => {
    expect(rectsOverlap(hud.railBand, hud.fallingZone)).toBe(false)
    expect(hud.railBand.y + hud.railBand.h).toBeLessThan(hud.judgeY)
  })

  it('与两侧蓄能槽（含槽顶读数）不相交', () => {
    expect(rectsOverlap(hud.railBand, hud.qinxin.left.band), overlapNote(hud.railBand, hud.qinxin.left.band)).toBe(false)
    expect(rectsOverlap(hud.railBand, hud.qinxin.right.band), overlapNote(hud.railBand, hud.qinxin.right.band)).toBe(false)
  })

  it('与底部气血条（含其标签）不相交', () => {
    expect(rectsOverlap(hud.railBand, hud.hpBand), overlapNote(hud.railBand, hud.hpBand)).toBe(false)
    expect(rectsOverlap(hud.railBand, hud.keyLabels)).toBe(false)
  })

  it('蓄能槽、气血条、键位标签三者互不相交', () => {
    expect(rectsOverlap(hud.qinxin.left.band, hud.hpBand)).toBe(false)
    expect(rectsOverlap(hud.qinxin.right.band, hud.hpBand)).toBe(false)
    expect(rectsOverlap(hud.qinxin.left.band, hud.keyLabels)).toBe(false)
    expect(rectsOverlap(hud.qinxin.right.band, hud.keyLabels)).toBe(false)
    expect(rectsOverlap(hud.hpBand, hud.keyLabels)).toBe(false)
  })

  it('气血条不与判定线打架：条身落在判定线下方', () => {
    expect(hud.hpBar.y).toBeGreaterThan(hud.judgeY)
    expect(hud.hpBar.y + hud.hpBar.h).toBeLessThanOrEqual(H)
  })
})

describe('几何函数的共同来源', () => {
  it('键区宽度与渲染层同一条公式（白键均分、最宽 104、最窄 38）', () => {
    expect(keyFieldWidth(800, 12)).toBeCloseTo((800 / 13) * 12, 6)
    expect(keyFieldWidth(1440, 7)).toBe(104 * 7)
    expect(keyFieldWidth(320, 12), '极窄窗口退到最窄白键').toBe(38 * 12)
  })

  it('矩形相交判定（边贴边不算相交）', () => {
    const a: Rect = { x: 0, y: 0, w: 10, h: 4 }
    expect(rectsOverlap(a, { x: 5, y: 2, w: 3, h: 3 })).toBe(true)
    expect(rectsOverlap(a, { x: 10, y: 0, w: 5, h: 4 }), '右边贴边').toBe(false)
    expect(rectsOverlap(a, { x: 0, y: 4, w: 10, h: 4 }), '下边贴边').toBe(false)
  })
})
