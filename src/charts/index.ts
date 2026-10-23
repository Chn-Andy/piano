/**
 * 曲库索引（工单 05）：v1 三首曲目 × 三难度（ADR-0008）。
 * 曲库画面由此遍历；曲目 id 与 localStorage 纪录键、?song= 开发钩子共用。
 */

import type { Chart, DifficultyName } from '../core/chart'
import { CANON_CHARTS } from './canon'
import { CHUN_JIANG_CHARTS } from './chun-jiang'
import { FUR_ELISE_CHARTS } from './fur-elise'

/** 曲目条目：id（持久化键）+ 中文曲名 + 三难度谱面 + 一句介绍 */
export interface SongEntry {
  readonly id: string
  readonly title: string
  readonly blurb: string
  readonly charts: Record<DifficultyName, Chart>
}

/** 难度中文名（GLOSSARY：难度） */
export const DIFFICULTY_LABELS: Record<DifficultyName, string> = {
  easy: '简单',
  medium: '中等',
  hard: '高级',
}

/** v1 曲库（三首全开放，无解锁门控——SPEC Out of Scope） */
export const SONGS: readonly SongEntry[] = [
  {
    id: 'canon-in-d',
    title: '卡农',
    blurb: '入门 · 帕赫贝尔',
    charts: CANON_CHARTS,
  },
  {
    id: 'fur-elise',
    title: '致爱丽丝',
    blurb: '经典 · 贝多芬',
    charts: FUR_ELISE_CHARTS,
  },
  {
    id: 'chun-jiang-hua-yue-ye',
    title: '春江花月夜',
    blurb: '水墨点题 · 古曲',
    charts: CHUN_JIANG_CHARTS,
  },
]

/** 按曲目 id 取条目；未知 id 返回 undefined */
export function songById(id: string): SongEntry | undefined {
  return SONGS.find((song) => song.id === id)
}
