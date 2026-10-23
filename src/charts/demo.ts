import { createChart } from '../core/chart'
import type { Chart } from '../core/chart'

/**
 * 手写迷你谱面（工单 01）：《小星星》两句，仅白键七键位。
 * 键位：C4 D4 E4 F4 G4 A4 B4 → 0..6。
 * 工单 02 的 MIDI→谱面转换器产出正式谱面后，本谱作为冒烟/演示谱保留。
 */

/** 一句《小星星》：[时刻(秒), 键位] */
const PHRASE: readonly (readonly [time: number, lane: number])[] = [
  // 一闪一闪亮晶晶：C C G G A A G—
  [0.0, 0], [0.45, 0], [0.9, 4], [1.35, 4], [1.8, 5], [2.25, 5], [2.7, 4],
  // 满天都是小眼睛：F F E E D D C—
  [3.6, 3], [4.05, 3], [4.5, 2], [4.95, 2], [5.4, 1], [5.85, 1], [6.3, 0],
]

const PHRASE_SPAN = 6.3
/** 句间休止 */
const PHRASE_GAP = 1.7
/** 首句起点：给玩家留出目送第一颗音符落下的时间 */
const FIRST_PHRASE_AT = 0.8

function phraseAt(base: number): (readonly [number, number])[] {
  return PHRASE.map(([time, lane]) => [time + base, lane] as const)
}

export function demoChart(): Chart {
  const secondAt = FIRST_PHRASE_AT + PHRASE_SPAN + PHRASE_GAP
  return createChart([...phraseAt(FIRST_PHRASE_AT), ...phraseAt(secondAt)])
}
