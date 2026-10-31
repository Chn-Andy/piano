/**
 * 伴奏的播放计划（工单 18）：壳层只问一句「这一局要自动响哪些音」。
 *
 * 三个来源按优先级：
 * 1. 谱面自带伴奏声部（转换器从非主旋律材料生成）→ 照数据放；
 * 2. 谱面没有伴奏声部、但曲目声明了合成铺底（卡农：源 MIDI 单轨、无可拆材料）
 *    → 由 core/pad.ts 在旋律键域之下合成一层低频铺底；
 * 3. 两者都没有（旧谱面）→ 空计划，静默跳过，不报错。
 *
 * 纯层：产物只是「时刻 + 音高」，发声由壳层经同一套钢琴采样调度
 * （ADR-0010 的 lookahead 调度器、musicBus 的「琴声音量」）——本层不碰
 * Web Audio，也不产生任何判定或战斗事件。
 */

import type { Chart } from './chart'
import { PAD_VOICES, planPad } from './pad'
import { noteNameToMidi } from './pitch'

/** 一个要自动演奏的伴奏音（at = 谱面时间轴秒，midi = 音高） */
export interface AccompanimentHit {
  readonly at: number
  readonly midi: number
}

/** 没有伴奏声部字段时的兜底：pad = 合成低频铺底 / none = 静默跳过 */
export type AccompanimentFallback = 'pad' | 'none'

/** 旋律的实际发声（钢琴按键名发声，见 main.ts）：铺底取和声根音用 */
function soundingMelody(chart: Chart): readonly { time: number; midi: number }[] {
  const keys = chart.meta?.keys
  if (keys === undefined) return []
  const notes: { time: number; midi: number }[] = []
  for (const note of chart.notes) {
    const key = keys[note.lane]
    if (key !== undefined) notes.push({ time: note.time, midi: noteNameToMidi(key) })
  }
  return notes
}

/**
 * 一局要自动演奏的伴奏音（时刻升序）。
 * 铺底落在「旋律最低键之下一个八度」——比玩家能按出的任何音都低，故不可能
 * 与旋律同刻同音高（不代弹）。
 */
export function accompanimentPlan(
  chart: Chart,
  fallback: AccompanimentFallback = 'none',
): readonly AccompanimentHit[] {
  if (chart.accompaniment !== undefined) {
    return chart.accompaniment.map((note) => ({ at: note.time, midi: note.midi }))
  }
  const meta = chart.meta
  if (fallback === 'none' || meta === undefined || meta.keys.length === 0) return []
  return planPad({
    from: 0,
    to: chart.duration,
    voices: PAD_VOICES[meta.difficulty],
    registerTop: noteNameToMidi(meta.keys[0]!),
    melody: soundingMelody(chart),
  })
}
