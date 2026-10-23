/**
 * 春江花月夜（chun-jiang-hua-yue-ye）三难度谱面装载（工单 05 转换产物）。
 * 重新经 createChart 装配：契约不变式在运行时再验一遍，产物损坏即启动报错。
 */

import easyJson from './chun-jiang/easy.json'
import hardJson from './chun-jiang/hard.json'
import mediumJson from './chun-jiang/medium.json'
import { createChart } from '../core/chart'
import type { Chart, ChartMeta, DifficultyName, Phrase } from '../core/chart'

interface ChartJson {
  notes: readonly { id: number; time: number; lane: number; chordId?: number }[]
  meta: ChartMeta
  phrases: readonly Phrase[]
}

function load(json: ChartJson): Chart {
  return createChart(
    json.notes.map((n) => (n.chordId === undefined ? [n.time, n.lane] : [n.time, n.lane, n.chordId])),
    // JSON 产物由转换器生成并经 createChart 全量校验；此处仅放宽类型面
    { meta: json.meta, phrases: json.phrases },
  )
}

/** 三难度谱面（键：难度名） */
export const CHUN_JIANG_CHARTS: Record<DifficultyName, Chart> = {
  easy: load(easyJson as unknown as ChartJson),
  medium: load(mediumJson as unknown as ChartJson),
  hard: load(hardJson as unknown as ChartJson),
}
