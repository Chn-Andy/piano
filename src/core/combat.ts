/**
 * 战斗数值的纯数据构件（GLOSSARY：斗琴 / 墨妖 / 墨主 / 连击）。
 *
 * 这里只有两件事：连击 → 伤害倍率的映射，与「怪物随歌曲段落出场」的
 * 出场计划。伤害结算、双方血量演变与胜负面都在模拟器（simulator.ts）
 * 里驱动——战斗数值不是分数换皮，全部收进纯层（SPEC-0001）。
 */

import type { Chart } from './chart'
import { BASE_DAMAGE, COMBO_MULTIPLIER_STOPS, MONSTER_PLAN } from './config'

/** 怪物种类（GLOSSARY）：墨妖为普通原型，墨主是歌末段登场的加强变体（数值上更厚） */
export type MonsterKind = 'inkDemon' | 'inkLord'

/** 一只怪物的出场计划：何时入场、带多少血 */
export interface MonsterPlan {
  readonly id: number
  readonly kind: MonsterKind
  /** 入场时刻（谱面时间轴，秒）＝所在段起点 */
  readonly spawnAt: number
  /** 初始 HP（正整数） */
  readonly hp: number
}

/**
 * 连击 → 伤害倍率（边界含）：取所有 minCombo ≤ combo 的档中最高一档；
 * 未达任何档（连击个位数）为基线 ×1.0。
 */
export function comboMultiplierFor(combo: number): number {
  let multiplier = 1
  for (const stop of COMBO_MULTIPLIER_STOPS) {
    if (combo >= stop.minCombo) multiplier = stop.multiplier
  }
  return multiplier
}

/**
 * 「认真玩家」每音符期望伤害（MONSTER_PLAN.FOCUSED_PLAYER 的推导），
 * 作为把段内音符数换算成 HP 预算的记账单位：基线伤害 × 命中率 ×
 * 连击均档 × 判定良莠均摊 = 10 × 0.9 × 1.05 × 0.85 ≈ 8。
 */
export function focusedExpectedDamagePerNote(): number {
  const { hitRate, comboMultiplier, tierFactor } = MONSTER_PLAN.FOCUSED_PLAYER
  return BASE_DAMAGE * hitRate * comboMultiplier * tierFactor
}

/**
 * 出场计划：把谱面音符时间轴按 SEGMENT_SECONDS 切段，每段安排一只墨妖
 * 在段首入场，HP 与段内音符数成正比；末段（若不止一段）由墨主压轴。
 * 纯函数：同一谱面产出同一计划。
 */
export function planMonsters(chart: Chart): readonly MonsterPlan[] {
  const notes = chart.notes
  if (notes.length === 0) return []

  const first = notes[0]!.time
  const last = notes[notes.length - 1]!.time
  const width = MONSTER_PLAN.SEGMENT_SECONDS

  const bounds: number[] = [first]
  while (bounds[bounds.length - 1]! + width < last) {
    bounds.push(bounds[bounds.length - 1]! + width)
  }
  bounds.push(last)

  const perNote = focusedExpectedDamagePerNote()
  return bounds.slice(0, -1).map((spawnAt, id) => {
    // 段内音符数：[spawnAt, nextBound]，末音符恰在边界上也算本段
    const next = bounds[id + 1]!
    const count = notes.filter((n) => n.time >= spawnAt && n.time <= next).length
    const isLord = id === bounds.length - 2 && bounds.length > 2
    const kind: MonsterKind = isLord ? 'inkLord' : 'inkDemon'
    const fraction = isLord ? MONSTER_PLAN.INK_LORD_HP_FRACTION : MONSTER_PLAN.INK_DEMON_HP_FRACTION
    return { id, kind, spawnAt, hp: Math.max(1, Math.round(count * perNote * fraction)) }
  })
}
