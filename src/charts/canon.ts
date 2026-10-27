/**
 * 卡农（canon-in-d）三难度谱面装载（工单 02 的转换产物）。
 * JSON 契约与 createChart 再校验见 ./shared（三曲共用）；难度切换 UI
 * 是 05 号票；此处供装配层按需取用（当前默认中等）。
 */

import easyJson from './canon/easy.json'
import hardJson from './canon/hard.json'
import mediumJson from './canon/medium.json'
import type { Chart, DifficultyName } from '../core/chart'
import { loadChart } from './shared'
import type { LoadedChartJson } from './shared'

/** 三难度谱面（键：难度名） */
export const CANON_CHARTS: Record<DifficultyName, Chart> = {
  easy: loadChart(easyJson as unknown as LoadedChartJson),
  medium: loadChart(mediumJson as unknown as LoadedChartJson),
  hard: loadChart(hardJson as unknown as LoadedChartJson),
}