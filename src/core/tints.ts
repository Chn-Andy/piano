/**
 * 异色音符（GLOSSARY：异色音符，工单 09）的纯数据面。
 *
 * 三种词缀只加战场效果、不改判定：寒音（cold）全场击退并减速、毒音（toxic）
 * 最前怪中毒持续掉血、爆音（blast）最前与次前受重击。效果数值全部按目标
 * **最大生命比例**结算（见 config.TINT_EFFECTS 的理由），换算与抽签都在这里，
 * 模拟器只负责把结果落到怪物身上。
 */

import type { NoteTint } from './chart'
import { advanceSpeed } from './combat'
import { BATTLEFIELD, TINT_EFFECTS, TINT_PLAN } from './config'

/** 中文名（GLOSSARY：寒音 / 毒音 / 爆音） */
export const TINT_LABELS: Record<NoteTint, string> = {
  cold: '寒音',
  toxic: '毒音',
  blast: '爆音',
}

/**
 * 寒音一次的行程后延（秒）：击退半步折算 + 减速折算（推导见 config）。
 * 由「时间」而非「深度」记账，是因为抵阵时刻 = spawnAt + TRAVEL_SECONDS +
 * 后延——后延是纯加项，怪物位置仍可用 depthAt(spawnAt, t, 后延) 反解。
 */
export function coldDelaySeconds(): number {
  const { KNOCKBACK_DEPTH, SLOW_SECONDS, SLOW_FACTOR } = TINT_EFFECTS.cold
  const knockback = KNOCKBACK_DEPTH / advanceSpeed()
  const slow = SLOW_SECONDS * (1 - SLOW_FACTOR)
  return knockback + slow
}

/** 寒音后延的封顶：全程行程（再退就退出战场之外了） */
function coldDelayCapSeconds(): number {
  return BATTLEFIELD.TRAVEL_SECONDS
}

/**
 * 寒音命中后的新后延。两条要求取大者：
 * 1. **基础后延**：已有后延 + 本次的击退/减速折算（封顶于全程行程）——
 *    对还在路上推进的怪，这就是「行程整体推后 3.4 秒」。
 * 2. **击退保底**：无论它已经在琴阵上待了多久，命中后纵深至少退到
 *    KNOCKBACK_DEPTH 度（半步）——纯时间记账做不到这点：在阵上坐了很久的
 *    怪「进度超前」太多，加 3.4s 后延后纵深仍被钳在 0（等于没击退）。
 *    保底项由「已推进时长」反解出让纵深恰好退回半步所需的后延。
 *
 * 取大者的代价：对在阵上的怪，实际效果是「退回半步 + 约 1.9 秒走回来」，
 * 而不是「退半步并持续减速 3 秒」——减速已折进基础后延，两者不叠加。
 */
export function applyColdDelay(holdBack: number, elapsedSinceSpawn: number): number {
  const base = Math.min(coldDelayCapSeconds(), holdBack + coldDelaySeconds())
  const retreatFloor =
    elapsedSinceSpawn - (BATTLEFIELD.SPAWN_DEPTH - TINT_EFFECTS.cold.KNOCKBACK_DEPTH) / advanceSpeed()
  return Math.max(base, retreatFloor)
}

/** 毒音跳数：持续时间内按参考拍长每拍一跳 */
export function poisonTickCount(): number {
  return Math.floor(TINT_EFFECTS.toxic.POISON_SECONDS / BATTLEFIELD.BEAT_SECONDS)
}

/** 毒音每一跳的伤害（按目标最大生命比例；免疫纵深衰减——它是状态不是剑气） */
export function poisonTickDamage(maxHp: number): number {
  return maxHp * TINT_EFFECTS.toxic.POISON_FRACTION_PER_BEAT
}

/** 毒音跳时刻：中毒起点 + k × 拍长 */
export function poisonTickTime(poisonedAt: number, tick: number): number {
  return poisonedAt + tick * BATTLEFIELD.BEAT_SECONDS
}

/** 爆音对单只怪物的重击伤害（按目标最大生命比例；无视纵深衰减） */
export function blastDamage(maxHp: number): number {
  return maxHp * TINT_EFFECTS.blast.BLAST_FRACTION
}

/**
 * 加权抽签（纯函数）：roll ∈ [0,1) → 词缀。权重见 TINT_PLAN.WEIGHTS，
 * 累计和分三段，边界含在低色一侧（不出现"1.0 落到界外"）。
 */
export function pickTint(roll: number): NoteTint {
  const { cold, toxic } = TINT_PLAN.WEIGHTS
  const coldEdge = cold
  const toxicEdge = cold + toxic
  if (roll < coldEdge) return 'cold'
  if (roll < toxicEdge) return 'toxic'
  return 'blast'
}
