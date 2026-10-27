/**
 * 战斗数值的纯数据构件（GLOSSARY：斗琴 / 墨妖 / 墨主 / 连击）。
 *
 * 这里只有两件事：连击 → 伤害倍率的映射，与「怪物随歌曲段落出场」的
 * 出场计划。伤害结算、双方血量演变与胜负面都在模拟器（simulator.ts）
 * 里驱动——战斗数值不是分数换皮，全部收进纯层（SPEC-0001）。
 */

import type { Chart } from './chart'
import { BASE_DAMAGE, BATTLEFIELD, COMBO_MULTIPLIER_STOPS, HORDE_PLAN } from './config'

/** 怪物种类（GLOSSARY）：墨妖为普通原型，墨主是歌末段登场的加强变体（数值上更厚） */
export type MonsterKind = 'inkDemon' | 'inkLord'

/**
 * 一只怪物的出场计划：何时入场、带多少血。横向散布不在计划里——它只是
 * 视觉量，由渲染层用确定性种子函数自 id 生成（ADR-0012：横向位置不构成
 * 目标语义，不进模拟器）。
 */
export interface MonsterPlan {
  readonly id: number
  readonly kind: MonsterKind
  /** 入场时刻（谱面时间轴，秒）：自战场最深处（SPAWN_DEPTH）开始推进 */
  readonly spawnAt: number
  /** 初始 HP（正整数） */
  readonly hp: number
}

/* ── 推进模型（工单 08）：纵深是谱面时刻的纯函数 ─────────────────────── */

/** 推进速度（度/秒）：由总行程与全程耗时导出（定标入口是 TRAVEL_SECONDS） */
export function advanceSpeed(): number {
  return BATTLEFIELD.SPAWN_DEPTH / BATTLEFIELD.TRAVEL_SECONDS
}

/**
 * 抵达琴阵（纵深 0）的时刻：spawnAt + 全程耗时 + 后延。
 * 后延（holdBack）来自寒音的击退/减速（工单 09，core/tints.ts 记账）：
 * 它把整段行程整体推后，抵阵与咬线时刻随之后移。
 */
export function arrivalTimeAt(spawnAt: number, holdBack = 0): number {
  return spawnAt + BATTLEFIELD.TRAVEL_SECONDS + holdBack
}

/**
 * t 时刻的纵深（离琴阵距离）：生成前在深处待命，恒速推进，抵阵停住。
 * 纯函数——推进不依赖 tick 粒度，任意时刻反解位置一致；后延把推进时钟
 * 整体推后，因此击退在画面上表现为「一步退、再慢慢走到线」。
 */
export function depthAt(spawnAt: number, t: number, holdBack = 0): number {
  if (t <= spawnAt) return BATTLEFIELD.SPAWN_DEPTH
  // 后延可能大于「已推进的时长」（刚生成的怪挨了一记寒音）：此时不得被推出
  // 战场之外——纵深封顶在生成深度，怪在尽头「卡住」等推进时钟追上。
  return Math.min(
    BATTLEFIELD.SPAWN_DEPTH,
    Math.max(0, BATTLEFIELD.SPAWN_DEPTH - advanceSpeed() * (t - spawnAt - holdBack)),
  )
}

/** 纵深 → 衰减级数（封顶）：离琴阵每 LEVEL_DEPTH 度深一级 */
export function decayLevelAt(spawnAt: number, t: number, holdBack = 0): number {
  const level = Math.floor(depthAt(spawnAt, t, holdBack) / BATTLEFIELD.AOE_LEVEL_DEPTH)
  return Math.min(BATTLEFIELD.AOE_LEVEL_CAP, level)
}

/** 剑气对纵深处怪物的伤害折扣：每级 ×AOE_DECAY_RATIO，封顶于 CAP 级 */
export function decayAt(spawnAt: number, t: number, holdBack = 0): number {
  return BATTLEFIELD.AOE_DECAY_RATIO ** decayLevelAt(spawnAt, t, holdBack)
}

/**
 * 到线攻击的攻击时刻序列起点：抵达琴阵后先歇一个整间隔再咬第一口
 * （给玩家半拍反应窗），此后每 ATTACK_BEATS × BEAT_SECONDS 一口。
 */
export function biteInterval(): number {
  return BATTLEFIELD.ATTACK_BEATS * BATTLEFIELD.BEAT_SECONDS
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
 * 「认真玩家」每音符期望伤害（HORDE_PLAN.FOCUSED_PLAYER 的推导），
 * 作为把波内音符数换算成 HP 预算的记账单位：基线伤害 × 命中率 ×
 * 连击均档 × 判定良莠均摊 = 10 × 0.9 × 1.05 × 0.85 ≈ 8。
 */
export function focusedExpectedDamagePerNote(): number {
  const { hitRate, comboMultiplier, tierFactor } = HORDE_PLAN.FOCUSED_PLAYER
  return BASE_DAMAGE * hitRate * comboMultiplier * tierFactor
}

/**
 * 墨潮生成：把谱面音符时间轴按难度波宽（HORDE_PLAN.WAVE_SECONDS）分波，
 * 每波在波首错峰放出一群墨妖，末波（若不止一波）由墨主独行压轴。
 * HP 预算随波内音符数缩放，墨主挂终章乐句预算（斩首不变式，见 config）。
 * 纯函数：同一谱面产出同一计划（同曲重开一致）。
 */
export function planMonsters(chart: Chart): readonly MonsterPlan[] {
  const notes = chart.notes
  if (notes.length === 0) return []

  const difficulty = chart.meta?.difficulty ?? 'medium'
  const waveWidth = HORDE_PLAN.WAVE_SECONDS[difficulty]
  const groupSize = HORDE_PLAN.GROUP_SIZE[difficulty]

  // 波界：自首音符起按波宽推进，末波收在末音符（与 v1 分段同构）
  const first = notes[0]!.time
  const last = notes[notes.length - 1]!.time
  const bounds: number[] = [first]
  while (bounds[bounds.length - 1]! + waveWidth < last) {
    bounds.push(bounds[bounds.length - 1]! + waveWidth)
  }
  bounds.push(last)

  // 终章乐句（斩首预算的基准）：谱面有乐句时取末乐句音符数
  const finale = chart.phrases?.[chart.phrases.length - 1]
  const finaleNotes =
    finale === undefined
      ? 0
      : notes.filter((n) => n.time >= finale.start && n.time <= finale.end).length

  const perNote = focusedExpectedDamagePerNote()
  const plans: MonsterPlan[] = []
  let id = 0
  bounds.slice(0, -1).forEach((waveStart, waveIndex) => {
    const waveEnd = bounds[waveIndex + 1]!
    const isLordWave = waveIndex === bounds.length - 2 && bounds.length > 2
    if (isLordWave) {
      // 墨主独行压轴：HP 挂终章乐句预算；无乐句谱面退用波预算
      const budgetNotes = finaleNotes > 0 ? finaleNotes : waveNotes(notes, waveStart, waveEnd)
      const fraction =
        finaleNotes > 0 ? HORDE_PLAN.LORD_HP_FRACTION : HORDE_PLAN.LORD_WAVE_FALLBACK_FRACTION
      plans.push({
        id: id,
        kind: 'inkLord',
        spawnAt: waveStart,
        hp: Math.max(1, Math.round(budgetNotes * perNote * fraction)),
      })
      id += 1
      return
    }
    for (let member = 0; member < groupSize; member += 1) {
      plans.push({
        id: id,
        kind: 'inkDemon',
        spawnAt: waveStart + member * HORDE_PLAN.GROUP_STAGGER_SECONDS,
        hp: Math.max(1, Math.round(waveNotes(notes, waveStart, waveEnd) * perNote * HORDE_PLAN.DEMON_HP_FRACTION)),
      })
      id += 1
    }
  })
  return plans
}

/** 波内音符数：[waveStart, waveEnd] 闭区间（末音符恰在界上也算本波） */
function waveNotes(
  notes: readonly { time: number }[],
  waveStart: number,
  waveEnd: number,
): number {
  return notes.filter((n) => n.time >= waveStart && n.time <= waveEnd).length
}
