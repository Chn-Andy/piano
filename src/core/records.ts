/**
 * 本机最佳纪录（SPEC-0001 持久化：浏览器本地持久化——各歌各难度最佳评级与最大
 * 连击）。纯层：存储以 KeyValueStore 接口注入（浏览器壳传本地存储），
 * 无 DOM 依赖。比较语义：评级优先（S > A > B > C），同级比最大连击；
 * 失败不更新最佳（工单 05）——斗琴以胜负论，败局成绩不入册。
 *
 * 票 19 增补：纪录结构扩展为「评级 + 最大连击 + 精度 + 失误数」，掌握度
 * （mastery.ts）才有判档依据。两项新字段是**可选**的，因为旧版纪录里没有——
 * 读到旧纪录不报错、不猜值，由掌握度侧按缺字段降级为「只能判到弹熟」。
 * 键名不必升版本：新增字段向后兼容（旧代码读新纪录只是忽略多余字段）。
 *
 * 审查修复（v1.4 两轴审查 A1）：评级/连击是**字典序**最优值，但它们不是
 * 掌握度的充分事实——「零失误 + 精度 97% 但连击低」的一局在字典序上输给
 * 一局 A 级高连击，于是根本不入册，曲库徽记永远停在弹熟（精熟不可达）。
 * 所以纪录另存一条**单调最佳事实** `flawlessAccuracy`：历次胜局里零失误局
 * 的最高精度，只升不降、与评级/连击无关。精熟由它判（见 mastery.ts）。
 *
 * 为什么不拆成 bestAccuracy + hasFlawless 两个独立最大值：那样会把「一局
 * 零失误但精度 85%」与「一局精度 97% 但有失误」拼成一个从未发生过的精熟。
 * 一条「零失误局的最高精度」既单调、又只描述真实发生过的同一局。
 */

import type { DifficultyName } from './chart'
import type { Rating } from './rating'

/** 一条最佳纪录：评级 + 最大连击（+ 票 19 起的精度与失误数） */
export interface BestRecord {
  readonly rating: Rating
  readonly maxCombo: number
  /** 刷新纪录那一局的整场精度 0..1（`rating.accuracyFor` 的口径）；旧版纪录无此字段 */
  readonly accuracy?: number
  /** 刷新纪录那一局的失误数；旧版纪录无此字段 */
  readonly missCount?: number
  /**
   * 历次胜局里**零失误局**的最高精度（单调最佳事实，与评级/连击无关）。
   * 这是「精熟」的唯一判据：曾经有一局零失误且精度 ≥ MASTERY.MASTERED_ACCURACY。
   * 旧版纪录（以及从未零失误的纪录）没有这个字段——不猜值，降级为弹熟。
   */
  readonly flawlessAccuracy?: number
}

/** 一次入册的读数（结算画面算出的四个量，与纪录字段一一对应） */
export interface RunStats {
  readonly rating: Rating
  readonly maxCombo: number
  readonly accuracy: number
  readonly missCount: number
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
 * 票 19 只做**向后兼容的字段新增**（accuracy / missCount），不升版本——
 * v2 的旧条目照常读入，缺的字段留空（见 mastery.masteryFromRecord）。
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

/**
 * 这一局之后的「零失误最高精度」：只升不降。
 * 有失误的一局不贡献新事实（上一局的零失误读数原样保留）；没打过也没有 → undefined。
 */
function flawlessAfter(previous: BestRecord | undefined, stats: RunStats): number | undefined {
  const prior = previous?.flawlessAccuracy
  if (stats.missCount !== 0 || Number.isNaN(stats.accuracy)) return prior
  return Math.max(prior ?? 0, stats.accuracy)
}

/** 只在值变化时才加/改字段：undefined 不该在 JSON 里留下空键，同值不该造新对象 */
function withFlawless(record: BestRecord, flawlessAccuracy: number | undefined): BestRecord {
  if (flawlessAccuracy === undefined || flawlessAccuracy === record.flawlessAccuracy) return record
  return { ...record, flawlessAccuracy }
}

/**
 * 记录一局结果。不可变（返回新对象）。两件事分开报：
 * - `improved`：评级/连击刷新了**本机最佳**（结算页的「新纪录」只认这个）；
 * - `updated`：纪录内容有任何变化——包含只推进了单调最佳事实（`flawlessAccuracy`）
 *   的情况。变了就必须写回存储，否则「零失误 97% 但连击低」那一局留下的
 *   精熟事实会随着页面刷新丢掉（A1 的原始缺陷）。
 *
 * 精度与失误数描述「刷新纪录那一局」，不参与「谁更好」的比较（比较语义沿用
 * 评级 + 连击），只随纪录一起存下来供掌握度判档。失败原样返回。
 */
export function recordResult(
  records: Records,
  songId: string,
  difficulty: DifficultyName,
  outcome: 'victory' | 'defeat',
  stats: RunStats,
): { records: Records; improved: boolean; updated: boolean } {
  if (outcome === 'defeat') return { records, improved: false, updated: false }
  const previous = bestRecordFor(records, songId, difficulty)
  const improved = previous === undefined || beats(previous, stats.rating, stats.maxCombo)
  const flawlessAccuracy = flawlessAfter(previous, stats)

  if (previous !== undefined && !improved) {
    const next = withFlawless(previous, flawlessAccuracy)
    if (next === previous) return { records, improved, updated: false }
    const song: SongRecords = { ...records[songId], [difficulty]: next }
    return { records: { ...records, [songId]: song }, improved, updated: true }
  }

  const next = withFlawless(
    {
      rating: stats.rating,
      maxCombo: stats.maxCombo,
      accuracy: stats.accuracy,
      missCount: stats.missCount,
    },
    flawlessAccuracy,
  )
  const song: SongRecords = { ...records[songId], [difficulty]: next }
  return { records: { ...records, [songId]: song }, improved, updated: true }
}
