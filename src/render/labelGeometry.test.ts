import { describe, expect, it } from 'vitest'
import { finaleSealBox, fitLabelFontSize } from './labelGeometry'

/**
 * 印面与标号字号的几何（ADR-0017，票 24）。
 *
 * 画布像素在 node 里断言不了，但「印面多宽、字号收到多少」是纯算术——
 * 与 hudGeometry 同一个口径：常量与公式放纯层，渲染层只负责量一次字宽。
 */

describe('终章印面（围住词，而不是把词压进印面）', () => {
  it('中文两字：与双语之前那枚印面逐像素一致（2 字宽 + 两侧朱砂边）', () => {
    const size = 82
    const box = finaleSealBox(size * 2, size)
    expect(box.w).toBeCloseTo(size * 2 + size * 0.42 * 2, 6)
    expect(box.h).toBeCloseTo(size * 1.5, 6)
  })

  it('英文长词：印宽随字宽单调增长，印高不变', () => {
    const size = 82
    const zh = finaleSealBox(size * 2, size)
    const en = finaleSealBox(250, size)
    expect(en.w).toBeGreaterThan(zh.w)
    expect(en.h).toBe(zh.h)
  })

  it('短词不会被印面吃掉：印宽有个下限（两个字号宽）', () => {
    const size = 82
    expect(finaleSealBox(10, size).w).toBeCloseTo(size * 2 + size * 0.42 * 2, 6)
  })
})

describe('标号字号收敛（和弦重击：中文单字位换成英文词）', () => {
  const natural = 20
  const refSize = 100
  const radius = 48

  it('短词（一字宽 ≈ 1 个字号）：不收，保持自然字号', () => {
    const widthAtRef = 100 // 一个汉字在 100px 下约 100 宽
    expect(fitLabelFontSize(natural, widthAtRef, refSize, radius * 1.4)).toBeCloseTo(natural, 6)
  })

  it('长词（每像素字宽 4）：收到 1.4 个半径以内', () => {
    const widthAtRef = 400
    const size = fitLabelFontSize(natural, widthAtRef, refSize, radius * 1.4)
    expect(size).toBeLessThan(natural)
    // 收到之后同一词的实际宽度仍在预算内
    expect((size * widthAtRef) / refSize).toBeLessThanOrEqual(radius * 1.4 + 1e-9)
  })

  it('实测量级（HEAVY 在 100px 约 330 宽）本来就装得下：不缩字号', () => {
    // 预算 1.4 个半径 vs 自然字号 0.42 个半径 × 3.3 倍字宽 ≈ 1.39 个半径——刚好够
    expect(fitLabelFontSize(natural, 330, refSize, radius * 1.4)).toBeCloseTo(natural, 6)
  })

  it('量不到字宽（0 宽或 0 参考字号）时退回自然字号，不把字号算成 0', () => {
    expect(fitLabelFontSize(natural, 0, refSize, 60)).toBe(natural)
    expect(fitLabelFontSize(natural, 200, 0, 60)).toBe(natural)
  })
})
