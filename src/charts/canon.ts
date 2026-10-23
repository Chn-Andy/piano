/**
 * 卡农（canon-in-d）三难度谱面装载（工单 02 的转换产物）。
 * 重新经 createChart 装配：契约不变式（lane 范围、和弦、乐句与余韵窗口）
 * 在运行时再验一遍，产物损坏即启动报错。
 * 难度切换 UI 是 05 号票；此处供装配层按需取用（当前默认中等）。
 */

import easyJson from './canon/easy.json'
import hardJson from './canon/hard.json'
import mediumJson from './canon/medium.json'
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
export const CANON_CHARTS: Record<DifficultyName, Chart> = {
  easy: load(easyJson as unknown as ChartJson),
  medium: load(mediumJson as unknown as ChartJson),
  hard: load(hardJson as unknown as ChartJson),
}
