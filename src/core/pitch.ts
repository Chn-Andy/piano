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

/**
 * 音高数 → 音高级（0..11）。负数的取模在 JS 里会返回负值，这里统一折回
 * 0..11——伴奏与铺底的音级判断（根音 / 三度 / 五度）都用这一处。
 */
export function pitchClassOfMidi(midi: number): number {
  return ((midi % 12) + 12) % 12
}

/** 音高数 → 升号拼写的音高级名（61 → 'C#'） */
const PC_TO_SHARP_NAME = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const

/**
 * 音名 → MIDI 音高数（'C4' = 60、'F#4' = 66、'Bb3' = 58；八度可带负号）。
 * 键位布局、移调计算与伴奏声部的音域校验共用此一处换算。
 */
export function noteNameToMidi(name: string): number {
  const match = /^([A-G])(#|b)?(-?\d+)$/.exec(name)
  if (match === null) throw new Error(`无法解析音名：${name}`)
  const pc = pitchClassOf(`${match[1]}${match[2] ?? ''}`)
  return (Number(match[3]) + 1) * 12 + pc
}

/**
 * 把音高折进 [low, high] 的同一音级（保持音级，必要时上下八度）——
 * 伴奏声部的音域归位用：无论源曲在哪个八度，伴奏都落在旋律键域之下。
 */
export function foldInto(midi: number, low: number, high: number): number {
  let folded = midi
  while (folded > high) folded -= 12
  while (folded < low) folded += 12
  return folded
}

/** MIDI 音高数 → 升号拼写的音名（60 → 'C4'）：伴奏声部交给钢琴采样的发声形式 */
export function midiToNoteName(midi: number): string {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new Error(`音高 ${midi} 不是合法 MIDI 值（0..127 的整数）`)
  }
  return `${PC_TO_SHARP_NAME[midi % 12]}${Math.floor(midi / 12) - 1}`
}
