/**
 * 谱面 JSON 装载共享（审查修复：三份 charts/<曲目>.ts 的 ChartJson 契约与
 * load() 逐字同形，收敛于此；第 4 首曲目直接复用）。
 * JSON 契约本身在 core/chart.ts（读入是契约的一部分），此处只做
 * 「装配层要求 meta/phrases 必须存在」这一层收紧。
 */

import { chartFromJson } from '../core/chart'
import type { Chart, ChartJson, ChartMeta, Phrase } from '../core/chart'

/** 装配层读到的谱面 JSON：meta 与 phrases 必填（转换器产物总是带） */
export interface LoadedChartJson extends ChartJson {
  readonly meta: ChartMeta
  readonly phrases: readonly Phrase[]
}

/** JSON → Chart：经 createChart 全量校验后装配（损坏即抛错，启动期暴露） */
export function loadChart(json: LoadedChartJson): Chart {
  return chartFromJson(json)
}
