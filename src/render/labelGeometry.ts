/**
 * 画布上「按字形定尺寸」的两处几何（ADR-0017）。
 *
 * 双语之前这两处都是按汉字字形直接算的：终章朱印按「两个汉字」定成 2×1.5 个
 * 字号，和弦重击标号按「一个汉字」定成一个字号。英文一进来这两条都不成立——
 * *Finale* 六字母宽出一截、*HEAVY* 五个字母约 2.75 倍宽。
 *
 * 处理办法都一样：**让容器围住词，而不是把词压进容器**。测量在渲染层做
 * （`ctx.measureText` 只有浏览器里有），算术放在这里——纯函数、node 里可断言，
 * 与 `hudGeometry` 同一个做法（画布像素断言不了，矩形与字号能）。
 */

/** 一枚印的印面：宽随字宽长，高只跟字号走（印的竖边是版式，不是内容） */
export function finaleSealBox(labelWidth: number, size: number): { w: number; h: number } {
  const pad = size * 0.42
  return {
    // 中文两字正好等于 size*2：与双语之前那枚印面逐像素一致
    w: Math.max(size * 2, labelWidth) + pad * 2,
    h: size * 1.5,
  }
}

/**
 * 把一个标号收进给定宽度：字号最多降到「参考宽度 / 每像素字宽」。
 *
 * `widthAtRef` 是同一个词在 `refSize` 字号下的实测宽度（渲染层量一次，纯层
 * 只做比例换算）。收不动就返回自然字号——中文单字本来就不会触发这条。
 */
export function fitLabelFontSize(
  natural: number,
  widthAtRef: number,
  refSize: number,
  maxWidth: number,
): number {
  if (widthAtRef <= 0 || refSize <= 0) return natural
  const perPx = widthAtRef / refSize
  return Math.min(natural, maxWidth / perPx)
}
