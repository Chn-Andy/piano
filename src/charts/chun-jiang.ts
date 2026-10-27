/**
 * 春江花月夜（chun-jiang-hua-yue-ye）三难度谱面装载（工单 05 转换产物）。
 * JSON 契约与 createChart 再校验见 ./shared（三曲共用）。
 */

import easyJson from './chun-jiang/easy.json'
import hardJson from './chun-jiang/hard.json'
import mediumJson from './chun-jiang/medium.json'
import type { Chart, DifficultyName } from '../core/chart'
import { loadChart } from './shared'
import type { LoadedChartJson } from './shared'

/** 三难度谱面（键：难度名） */
export const CHUN_JIANG_CHARTS: Record<DifficultyName, Chart> = {
  easy: loadChart(easyJson as unknown as LoadedChartJson),
  medium: loadChart(mediumJson as unknown as LoadedChartJson),
  hard: loadChart(hardJson as unknown as LoadedChartJson),
}