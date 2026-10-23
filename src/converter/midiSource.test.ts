import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMidi } from './midiSource'

/**
 * 适配层 fixture 行为：@tonejs/midi 对 MIDI 调号事件的 `key` 字段报的是
 * **关系大调字母**（其源码 keySignatureKeys[key+7]，如 0 号小调 → "C"），
 * 而 SourceSong 契约要求的是**调根音**（小调的真正主音）。真实曲目核对：
 * - 致爱丽丝 a 小调（0 升号）：E5 D#5 E5 … A4 的著名开头即 a 小调。
 * - 卡农 D 大调、春江花月夜 G 大调：大调报告即本调，无需换算。
 */
const FIXTURES = join(import.meta.dirname, '..', '..', 'fixtures')

describe('MIDI 调号解析（调根音，非关系大调字母）', () => {
  it('小调：0 升号小调的根音是 A（a 小调），不是报告字母 C', () => {
    const source = parseMidi(readFileSync(join(FIXTURES, 'fur-elise.mid')))
    expect(source.key).toEqual({ root: 'A', scale: 'minor' })
  })

  it('大调：报告字母即本调根音（卡农 D 大调 / 春江花月夜 G 大调）', () => {
    const canon = parseMidi(readFileSync(join(FIXTURES, 'canon-in-d.mid')))
    expect(canon.key).toEqual({ root: 'D', scale: 'major' })
    const chun = parseMidi(readFileSync(join(FIXTURES, 'chun-jiang-hua-yue-ye.mid')))
    expect(chun.key).toEqual({ root: 'G', scale: 'major' })
  })
})
