/**
 * 曲库索引（工单 05）：v1 三首曲目 × 三难度（ADR-0008）。
 * 曲库画面由此遍历；曲目 id 与 localStorage 纪录键、?song= 开发钩子共用。
 *
 * 双语（ADR-0017）：曲名与介绍是**数据**，按语言给出两套写法（`LocalizedText`）。
 * 曲目 id 不随语言改变——纪录、`?song=` 钩子、存档键都钉在 id 上，切语言不能
 * 让玩家的旧纪录对不上号。
 *
 * 曲名为什么有两个：曲库曲名栏宽 180px、22px 衬线，只容得下约 12–14 个拉丁
 * 字符；*Moonlight on the Spring River* 放不下。《春江花月夜》在曲库里用短名
 * *Spring River*，结算卡与键位引导用全名（spec v1.5「一句两长」）。
 */

import type { Chart, DifficultyName } from '../core/chart'
import type { LocalizedText } from '../i18n/locale'
import { CANON_CHARTS } from './canon'
import { CHUN_JIANG_CHARTS } from './chun-jiang'
import { FUR_ELISE_CHARTS } from './fur-elise'

/** 曲目条目：id（持久化键）+ 双语曲名 + 三难度谱面 + 一句双语介绍 */
export interface SongEntry {
  readonly id: string
  /** 完整曲名（结算卡、键位引导、开发钩子用） */
  readonly title: LocalizedText
  /** 曲库行专用短名（栏宽只容 12–14 个拉丁字符；中文与 title 相同） */
  readonly libraryTitle: LocalizedText
  readonly blurb: LocalizedText
  readonly charts: Record<DifficultyName, Chart>
  /**
   * 谱面没有伴奏声部字段时的兜底（ADR-0016）：'pad' = 合成低频铺底。
   * 只有卡农需要——它的源 MIDI 单轨、没有可拆的和声材料，而替换 fixture
   * 会改变谱面密度、连带重新定标（票面明确不做）。
   */
  readonly accompanimentFallback?: 'pad'
}

/** v1 曲库（三首全开放，无解锁门控——SPEC Out of Scope） */
export const SONGS: readonly SongEntry[] = [
  {
    id: 'canon-in-d',
    title: { zh: '卡农', en: 'Canon in D' },
    libraryTitle: { zh: '卡农', en: 'Canon in D' },
    blurb: { zh: '入门 · 帕赫贝尔', en: 'Beginner · Pachelbel' },
    charts: CANON_CHARTS,
    accompanimentFallback: 'pad',
  },
  {
    id: 'fur-elise',
    title: { zh: '致爱丽丝', en: 'Für Elise' },
    libraryTitle: { zh: '致爱丽丝', en: 'Für Elise' },
    blurb: { zh: '经典 · 贝多芬', en: 'Classic · Beethoven' },
    charts: FUR_ELISE_CHARTS,
  },
  {
    id: 'chun-jiang-hua-yue-ye',
    title: { zh: '春江花月夜', en: 'Moonlight on the Spring River' },
    libraryTitle: { zh: '春江花月夜', en: 'Spring River' },
    blurb: { zh: '水墨点题 · 古曲', en: 'Ink signature · Traditional' },
    charts: CHUN_JIANG_CHARTS,
  },
]

/** 按曲目 id 取条目；未知 id 返回 undefined */
export function songById(id: string): SongEntry | undefined {
  return SONGS.find((song) => song.id === id)
}
