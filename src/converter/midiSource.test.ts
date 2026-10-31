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

/**
 * 分轨信息（工单 18）：伴奏声部要从「非主旋律材料」生成，适配层必须把
 * 轨的边界与打击轨标记带出来——转换器据此判定哪一轨是主旋律、哪一轨是
 * 左手/第二旋律声部，鼓轨永远不进和声骨架。
 */
describe('分轨信息（伴奏材料的来源判定）', () => {
  it('致爱丽丝：两轨——右手（up）在前、左手（down）在后，音符带所属轨号', () => {
    const source = parseMidi(readFileSync(join(FIXTURES, 'fur-elise.mid')))

    expect(source.tracks?.map((t) => t.index)).toEqual([0, 1])
    expect(source.tracks?.map((t) => t.percussion)).toEqual([false, false])
    expect(source.notes.filter((n) => n.track === 0)).toHaveLength(517)
    expect(source.notes.filter((n) => n.track === 1)).toHaveLength(388)
  })

  it('春江花月夜：三轨，鼓轨按通道 9 标记为打击乐（伴奏不吃鼓点）', () => {
    const source = parseMidi(readFileSync(join(FIXTURES, 'chun-jiang-hua-yue-ye.mid')))

    expect(source.tracks).toHaveLength(3)
    expect(source.tracks?.map((t) => t.percussion)).toEqual([false, false, true])
    expect(source.tracks?.[2]?.noteCount).toBe(3)
  })

  it('卡农：单轨——没有可拆的伴奏材料（这是合成铺底兜底的由来）', () => {
    const source = parseMidi(readFileSync(join(FIXTURES, 'canon-in-d.mid')))

    expect(source.tracks).toHaveLength(1)
    expect(source.tracks?.[0]?.noteCount).toBe(138)
    expect(source.notes.every((n) => n.track === 0)).toBe(true)
  })
})
