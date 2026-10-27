/**
 * 致爱丽丝（fur-elise）三难度谱面装载（工单 05 转换产物）。
 * JSON 契约与 createChart 再校验见 ./shared（三曲共用）。
 */

import easyJson from './fur-elise/easy.json'
import hardJson from './fur-elise/hard.json'
import mediumJson from './fur-elise/medium.json'
import type { Chart, DifficultyName } from '../core/chart'
import { loadChart } from './shared'
import type { LoadedChartJson } from './shared'

/** 三难度谱面（键：难度名） */
export const FUR_ELISE_CHARTS: Record<DifficultyName, Chart> = {
  easy: loadChart(easyJson as unknown as LoadedChartJson),
  medium: loadChart(mediumJson as unknown as LoadedChartJson),
  hard: loadChart(hardJson as unknown as LoadedChartJson),
}