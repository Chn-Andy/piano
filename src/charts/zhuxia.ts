/**
 * 猪侠漫游记（zhuxia-manyouji）三难度谱面装载（v1.6 试作，ADR-0018）。
 * 源 MIDI 由视频音轨自动转谱（人声旋律 + 和弦估计），不是官方谱面；
 * JSON 契约与 createChart 再校验见 ./shared（四曲共用）。
 */

import easyJson from './zhuxia/easy.json'
import hardJson from './zhuxia/hard.json'
import mediumJson from './zhuxia/medium.json'
import type { Chart, DifficultyName } from '../core/chart'
import { loadChart } from './shared'
import type { LoadedChartJson } from './shared'

/** 三难度谱面（键：难度名） */
export const ZHUXIA_CHARTS: Record<DifficultyName, Chart> = {
  easy: loadChart(easyJson as unknown as LoadedChartJson),
  medium: loadChart(mediumJson as unknown as LoadedChartJson),
  hard: loadChart(hardJson as unknown as LoadedChartJson),
}
