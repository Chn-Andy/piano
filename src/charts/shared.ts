/**
 * 谱面 JSON 装载共享（审查修复：三份 charts/<曲目>.ts 的 ChartJson 契约与
 * load() 逐字同形，收敛于此；第 4 首曲目直接复用）。
 * 重新经 createChart 装配：契约不变式（lane 范围、和弦、乐句与余韵窗口）
 * 在运行时再验一遍，产物损坏即启动报错。
 */

import { createChart } from '../core/chart'
import type { Chart, ChartMeta, NoteTint, Phrase } from '../core/chart'

/** 转换器落盘的谱面 JSON 契约（scripts/generate-charts.ts 的产物） */
export interface ChartJson {
  notes: readonly {
    id: number
    time: number
    lane: number
    chordId?: number
    /** 异色词缀（工单 09）；缺省 = 普通音符 */
    tint?: NoteTint
  }[]
  meta: ChartMeta
  phrases: readonly Phrase[]
}

/** JSON → Chart：经 createChart 全量校验后装配（损坏即抛错，启动期暴露） */
export function loadChart(json: ChartJson): Chart {
  return createChart(
    json.notes.map((n) => [n.time, n.lane, n.chordId, n.tint]),
    // JSON 产物由转换器生成并经 createChart 全量校验；此处仅放宽类型面
    { meta: json.meta, phrases: json.phrases },
  )
}
