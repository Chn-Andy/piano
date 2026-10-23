/**
 * 音名 → 音高级（pitch class，0..11）的唯一定义处（审查修复：此前
 * converter/midiSource 的调根换算、converter/convert 的移调、audio/piano
 * 的采样选择三处同形映射收敛于此）。纯层：无 DOM / Web Audio 依赖，
 * 转换器（构建期工具）与音频壳引用 core 均合法。
 */

/** 音名字母 → 基础音高级 */
const LETTER_PC: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/**
 * 音名 → 音高级（'D'→2、'F#'→6、'Bb'→10，大小写不敏感；升降号按半音累计，
 * 结果折回 0..11）。首字母无法解析按 C（0）兜底——调用方传入的字母均由
 * 正则或 @tonejs/midi 保证合法，兜底仅防御。
 */
export function pitchClassOf(name: string): number {
  const base = LETTER_PC[name[0]?.toUpperCase() ?? '']
  if (base === undefined) return 0
  let pc = base
  for (const char of name.slice(1)) {
    if (char === '#') pc += 1
    else if (char === 'b') pc -= 1
  }
  return ((pc % 12) + 12) % 12
}
