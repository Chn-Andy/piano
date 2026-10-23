/**
 * 本机最佳纪录（SPEC-0001 持久化：浏览器本地持久化——各歌各难度最佳评级与最大
 * 连击）。纯层：存储以 KeyValueStore 接口注入（浏览器壳传本地存储），
 * 无 DOM 依赖。比较语义：评级优先（S > A > B > C），同级比最大连击；
 * 失败不更新最佳（工单 05）——斗琴以胜负论，败局成绩不入册。
 */

import type { DifficultyName } from './chart'
import type { Rating } from './rating'

/** 一条最佳纪录：评级 + 最大连击 */
export interface BestRecord {
  readonly rating: Rating
  readonly maxCombo: number
}

/** 一首歌的三难度最佳（未挑战的难度无条目） */
export type SongRecords = Partial<Record<DifficultyName, BestRecord>>

/** 全部纪录：曲目 id → 难度 → 最佳 */
export type Records = Readonly<Record<string, SongRecords>>

/** 键值存储抽象（浏览器壳传本地存储；读取不可用返回 null） */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * 存储键（版本化：结构不兼容时升版本号，旧键任其沉没）。
 * v2：纪录字段 rank → rating（GLOSSARY 评级词条命名对齐，2026-10-24）。
 */
export const RECORDS_KEY = 'xinqin.records.v2'

/** 评级序：S > A > B > C */
const RATING_ORDER: Record<Rating, number> = { S: 3, A: 2, B: 1, C: 0 }

/** 读取纪录；存储为空或内容损坏 → 空纪录（不抛错——纪录不是启动前提） */
export function loadRecords(store: KeyValueStore): Records {
  const raw = store.getItem(RECORDS_KEY)
  if (raw === null) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Records
  } catch {
    return {}
  }
}

/** 写入纪录；写入失败（如配额满）静默——纪录非关键数据，不拖垮对局 */
export function saveRecords(store: KeyValueStore, records: Records): void {
  try {
    store.setItem(RECORDS_KEY, JSON.stringify(records))
  } catch {
    // 静默：见上
  }
}

/** 某歌某难度的本机最佳；未挑战过 → undefined */
export function bestRecordFor(
  records: Records,
  songId: string,
  difficulty: DifficultyName,
): BestRecord | undefined {
  return records[songId]?.[difficulty]
}

/** 新成绩是否优于旧纪录（评级优先，同级比最大连击） */
function beats(record: BestRecord, rating: Rating, maxCombo: number): boolean {
  if (RATING_ORDER[rating] !== RATING_ORDER[record.rating]) {
    return RATING_ORDER[rating] > RATING_ORDER[record.rating]
  }
  return maxCombo > record.maxCombo
}

/** 记录一局结果：失败原样返回；胜利在优于旧纪录时更新。不可变（返回新对象）。 */
export function recordResult(
  records: Records,
  songId: string,
  difficulty: DifficultyName,
  outcome: 'victory' | 'defeat',
  rating: Rating,
  maxCombo: number,
): { records: Records; improved: boolean } {
  if (outcome === 'defeat') return { records, improved: false }
  const previous = bestRecordFor(records, songId, difficulty)
  if (previous !== undefined && !beats(previous, rating, maxCombo)) {
    return { records, improved: false }
  }
  const song: SongRecords = { ...records[songId], [difficulty]: { rating, maxCombo } }
  return { records: { ...records, [songId]: song }, improved: true }
}
