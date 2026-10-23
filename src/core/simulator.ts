/**
 * 核心模拟器：纯数据层（Seam 1）。
 *
 * 不引用任何 DOM / Web Audio API——时间完全由调用方注入（音频壳传入
 * audioContext.currentTime，测试注入固定值）。渲染与音频作为薄壳消费
 * 本模块输出的事件流（SPEC-0001 Implementation Decisions）。
 *
 * 输入：谱面 + 以音频时钟计时的按键事件序列。
 * 输出两条可观察事件流：
 * - 判定流（keyDown / tick 返回）：Perfect / Good / Miss 与连击状态；
 * - 战斗流（drainBattle 取走）：剑气伤害、墨妖反击与击杀、胜负面
 *   （战斗数值不是分数换皮，全部收进本层，ADR-0004）。
 * 其余状态经 monstersView() / playerHp / summary() 查询。
 */

import type { Chart, ChartNote, Lane, Phrase } from './chart'
import { comboMultiplierFor, planMonsters } from './combat'
import type { MonsterKind, MonsterPlan } from './combat'
import { phrasePerformanceScore, sustainTierFor } from './sustain'
import type { PhrasePerformance, SustainEvent } from './sustain'
import {
  BASE_DAMAGE,
  CHORD_MULTIPLIER,
  CHORD_TOGETHER_WINDOW,
  COUNTER_DAMAGE,
  JUDGMENT_WINDOWS,
  PLAYER_MAX_HP,
  TIER_DAMAGE_FACTOR,
} from './config'

/** 三级判定（GLOSSARY：判定） */
export type JudgmentTier = 'Perfect' | 'Good' | 'Miss'

/** 判定事件：判定流的唯一事件类型。 */
export interface JudgmentEvent {
  readonly type: 'judgment'
  readonly noteId: number
  readonly lane: Lane
  readonly judgment: JudgmentTier
  /** 事件发生时刻（谱面时间轴，秒） */
  readonly time: number
  /** 按键时刻相对音符命中时刻的偏移（秒，正=迟）；Miss 无按键，不携带 */
  readonly offset?: number
  /** 事件之后的连击 */
  readonly combo: number
}

export type GameEvent = JudgmentEvent

/** 剑气（GLOSSARY：剑气）：一次命中物化成的攻击。monsterId 为空 = 劈空（无入场目标） */
export interface StrikeEvent {
  readonly type: 'strike'
  readonly time: number
  readonly noteId: number
  readonly monsterId: number | null
  readonly judgment: JudgmentTier
  /** 本次剑气伤害（劈空也携带数值，只是未入账） */
  readonly damage: number
  readonly comboMultiplier: number
}

/** 墨妖被击杀（溢出伤害不结转） */
export interface SlainEvent {
  readonly type: 'slain'
  readonly time: number
  readonly monsterId: number
  readonly kind: MonsterKind
}

/** 墨妖反击：一次 Miss 换来的玩家掉血 */
export interface CounterEvent {
  readonly type: 'counter'
  readonly time: number
  /** 招致反击的漏接音符 */
  readonly noteId: number
  readonly damage: number
  /** 反击后的玩家 HP（0 触发败局） */
  readonly playerHp: number
}

/** 和弦重击：齐按窗口内同组和弦全部命中的加成一击 */
export interface ChordEvent {
  readonly type: 'chord'
  readonly time: number
  readonly chordId: number
  readonly monsterId: number | null
  /** 加成伤害 = 成员伤害和 × (CHORD_MULTIPLIER - 1) */
  readonly bonusDamage: number
  readonly size: number
}

/** 胜负面：胜 = 歌毕且场上怪清完；败 = 玩家血空，或歌毕仍有怪存活 */
export interface OutcomeEvent {
  readonly type: 'outcome'
  readonly time: number
  readonly result: 'victory' | 'defeat'
  readonly reason: 'cleared' | 'player-hp-empty' | 'monsters-remain'
}

export type BattleEvent =
  | StrikeEvent
  | SlainEvent
  | CounterEvent
  | ChordEvent
  | SustainEvent
  | OutcomeEvent

/** 斗琴局面：进行中 / 胜 / 败（终局后模拟器定格） */
export type BattleStatus = 'fighting' | 'victory' | 'defeat'

/** 乐句恰好划分音符（chart.ts 校验），故各句音符是连续下标区间 */
function phraseNoteRanges(chart: Chart): PhraseNoteRange[] {
  const ranges: PhraseNoteRange[] = []
  let cursor = 0
  for (const phrase of chart.phrases ?? []) {
    while (cursor < chart.notes.length && chart.notes[cursor]!.time < phrase.start) cursor += 1
    let last = cursor
    while (last + 1 < chart.notes.length && chart.notes[last + 1]!.time <= phrase.end) last += 1
    ranges.push({ first: cursor, last })
    cursor = last + 1
  }
  return ranges
}

/** 结算统计（胜负画面用；评级映射是后续工单） */
export interface BattleSummary {
  readonly maxCombo: number
  readonly perfect: number
  readonly good: number
  readonly miss: number
  /** 实际入账的总伤害（劈空不计） */
  readonly damageDealt: number
}

/** keyDown 的结果。repeat=true 表示长按产生的重复按下，已被忽略。 */
export interface KeyOutcome {
  readonly repeat: boolean
  readonly events: readonly GameEvent[]
}

/** 场上一只怪物的可观察状态 */
export interface MonsterView {
  readonly id: number
  readonly kind: MonsterKind
  readonly spawnAt: number
  readonly hp: number
  readonly maxHp: number
}

/** 构造选项：出场计划默认由谱面推导（combat.planMonsters），可注入定制 */
export interface SimulatorOptions {
  readonly monsters?: readonly MonsterPlan[]
}

interface MonsterState {
  readonly plan: MonsterPlan
  hp: number
}

/** 和弦结算跟踪：成员逐一命中，齐则重击、缺则作废 */
interface ChordTracking {
  readonly memberIds: ReadonlySet<number>
  /** noteId → 按键时刻 */
  readonly hitTimes: Map<number, number>
  /** 已命中成员的剑气伤害累计 */
  damage: number
  broken: boolean
}

/** 乐句的音符下标区间 [first, last]（闭区间；乐句恰好划分音符，见 chart.ts） */
interface PhraseNoteRange {
  readonly first: number
  readonly last: number
}

export class Simulator {
  private readonly notes: readonly ChartNote[]
  private readonly duration: number
  /** 乐句边界（谱面省略时无余韵结构）与各句音符下标区间 */
  private readonly phrases: readonly Phrase[] | undefined
  private readonly phraseRanges: readonly PhraseNoteRange[] | undefined
  /** 余韵触发游标：下一只待触发的乐句下标 */
  private sustainCursor = 0
  /** 每颗音符的最终判定（余韵表现分的原始台账；未判定为 undefined） */
  private readonly noteTiers: (JudgmentTier | undefined)[]
  /** 已判定/已 Miss 的音符 id 集合 */
  private readonly resolved = new Set<number>()
  /** Miss 扫描游标：此前的音符必已出结果（命中或 Miss） */
  private missScan = 0
  /** 当前按住未松开的键位（去重状态） */
  private readonly held = new Set<Lane>()
  private comboCount = 0
  private readonly monsters: readonly MonsterState[]
  /** 和弦跟踪：chordId → 状态（齐按窗口与加成见 config） */
  private readonly chords = new Map<number, ChordTracking>()
  /** 战斗事件蓄积（drainBattle 取走，顺序即发生顺序） */
  private battle: BattleEvent[] = []
  private hp = PLAYER_MAX_HP
  private battleStatus: BattleStatus = 'fighting'
  private maxCombo = 0
  private perfectCount = 0
  private goodCount = 0
  private missCount = 0
  private damageDealt = 0

  constructor(chart: Chart, options?: SimulatorOptions) {
    this.notes = chart.notes
    this.duration = chart.duration
    this.phrases = chart.phrases
    this.phraseRanges = chart.phrases === undefined ? undefined : phraseNoteRanges(chart)
    this.noteTiers = new Array<JudgmentTier | undefined>(chart.notes.length).fill(undefined)
    const plan = options?.monsters ?? planMonsters(chart)
    this.monsters = plan.map((p) => ({ plan: p, hp: p.hp }))
    for (const note of this.notes) {
      if (note.chordId === undefined) continue
      let tracking = this.chords.get(note.chordId)
      if (tracking === undefined) {
        tracking = { memberIds: new Set(), hitTimes: new Map(), damage: 0, broken: false }
        this.chords.set(note.chordId, tracking)
      }
      ;(tracking.memberIds as Set<number>).add(note.id)
    }
  }

  /** 当前连击（GLOSSARY：连击） */
  get combo(): number {
    return this.comboCount
  }

  /** 玩家当前 HP（终局后定格） */
  get playerHp(): number {
    return this.hp
  }

  /** 玩家 HP 上限（渲染血条用） */
  get playerMaxHp(): number {
    return PLAYER_MAX_HP
  }

  /** 斗琴局面：进行中 / 胜 / 败 */
  get status(): BattleStatus {
    return this.battleStatus
  }

  /** 结算统计 */
  summary(): BattleSummary {
    return {
      maxCombo: this.maxCombo,
      perfect: this.perfectCount,
      good: this.goodCount,
      miss: this.missCount,
      damageDealt: this.damageDealt,
    }
  }

  /** 场上全部怪物（含未入场），按出场顺序 */
  monstersView(): readonly MonsterView[] {
    return this.monsters.map((m) => ({
      id: m.plan.id,
      kind: m.plan.kind,
      spawnAt: m.plan.spawnAt,
      hp: m.hp,
      maxHp: m.plan.hp,
    }))
  }

  /** 取走并清空蓄积的战斗事件流 */
  drainBattle(): readonly BattleEvent[] {
    const out = this.battle
    this.battle = []
    return out
  }

  /** 尚未判定的音符（渲染层据此绘制下落中的音符） */
  pendingNotes(): readonly ChartNote[] {
    return this.notes.filter((n) => !this.resolved.has(n.id))
  }

  /**
   * 按键按下。time 为谱面时间轴上的按键时刻。
   * 长按重复（同键位未松开再次按下）被忽略：repeat=true 且不产生事件。
   */
  keyDown(lane: Lane, time: number): KeyOutcome {
    if (this.battleStatus !== 'fighting') {
      return { repeat: false, events: [] } // 终局定格
    }
    if (this.held.has(lane)) {
      return { repeat: true, events: [] }
    }
    this.held.add(lane)

    const note = this.earliestPendingNear(lane, time)
    if (note === undefined) {
      return { repeat: false, events: [] }
    }

    this.resolved.add(note.id)
    this.comboCount += 1
    if (this.comboCount > this.maxCombo) this.maxCombo = this.comboCount
    const offset = time - note.time
    const judgment: 'Perfect' | 'Good' =
      Math.abs(offset) <= JUDGMENT_WINDOWS.perfect ? 'Perfect' : 'Good'
    if (judgment === 'Perfect') this.perfectCount += 1
    else this.goodCount += 1
    this.noteTiers[note.id] = judgment
    this.strike(note, judgment, time)
    const event: JudgmentEvent = {
      type: 'judgment',
      noteId: note.id,
      lane,
      judgment,
      time,
      offset,
      combo: this.comboCount,
    }
    return { repeat: false, events: [event] }
  }

  /** 按键松开：解除该键位的去重状态。 */
  keyUp(lane: Lane): void {
    this.held.delete(lane)
  }

  /** 推进游戏时间，产生因超窗而 Miss 的事件。 */
  tick(time: number): readonly GameEvent[] {
    if (this.battleStatus !== 'fighting') return [] // 终局定格
    const events: GameEvent[] = []
    while (this.missScan < this.notes.length) {
      const note = this.notes[this.missScan]!
      if (time <= note.time + JUDGMENT_WINDOWS.good) {
        // 音符尚在可判定窗口内（含未到时刻的音符）
        break
      }
      if (this.resolved.has(note.id)) {
        // 已被命中，游标越过
        this.missScan += 1
        continue
      }
      this.resolved.add(note.id)
      this.comboCount = 0
      this.missCount += 1
      this.noteTiers[note.id] = 'Miss'
      if (note.chordId !== undefined) {
        // 和弦缺员：重击资格作废（半按语义——按下的成员已各自结伤害）
        const tracking = this.chords.get(note.chordId)
        if (tracking !== undefined) tracking.broken = true
      }
      events.push({
        type: 'judgment',
        noteId: note.id,
        lane: note.lane,
        judgment: 'Miss',
        time,
        combo: 0,
      })
      this.counter(note.id, time)
      this.missScan += 1
      if (this.battleStatus !== 'fighting') return events // 血空即定格
    }
    this.triggerSustains(time)
    if (time >= this.duration && this.battleStatus === 'fighting') {
      // 歌毕：场上怪清完 → 胜；仍有活怪 → 败（此后再无音符可清场）
      const cleared = this.monsters.every((m) => m.hp <= 0)
      this.finish(time, cleared ? 'victory' : 'defeat', cleared ? 'cleared' : 'monsters-remain')
    }
    return events
  }

  /** 该键位上、Good 窗口覆盖当前按键时刻的最早待判音符；无则 undefined。 */
  private earliestPendingNear(lane: Lane, time: number): ChartNote | undefined {
    for (const note of this.notes) {
      if (note.lane === lane && !this.resolved.has(note.id)) {
        if (Math.abs(time - note.time) <= JUDGMENT_WINDOWS.good) {
          return note
        }
        if (note.time > time + JUDGMENT_WINDOWS.good) {
          // 音符时刻已越过按键的可达窗口，后续音符更远
          return undefined
        }
      }
    }
    return undefined
  }

  /** 最早已入场的活怪（伤害的默认去向）；场上无怪 → null（剑气劈空） */
  private currentTarget(time: number): MonsterState | null {
    for (const monster of this.monsters) {
      if (monster.plan.spawnAt <= time && monster.hp > 0) return monster
    }
    return null
  }

  /**
   * 余韵触发（ADR-0007：自动、零输入）：句末音符的判定收束
   * （句末时刻 + Good 窗）之后，句内全部音符必已出判定，即可安全结算
   * 该句表现分并产出事件。事件时刻是确定性的触发点本身，与 tick 粒度无关。
   */
  private triggerSustains(time: number): void {
    if (this.phrases === undefined || this.phraseRanges === undefined) return
    while (this.sustainCursor < this.phrases.length) {
      const index = this.sustainCursor
      const phrase = this.phrases[index]!
      if (!(time > phrase.end + JUDGMENT_WINDOWS.good)) break
      this.sustainCursor += 1
      const range = this.phraseRanges[index]!
      const perf = this.phrasePerformance(range)
      const score = phrasePerformanceScore(perf)
      const finale = index === this.phrases.length - 1
      const lord = finale ? this.monsters.find((m) => m.plan.kind === 'inkLord') : undefined
      this.battle.push({
        type: 'sustain',
        time: phrase.end + JUDGMENT_WINDOWS.good,
        phraseId: phrase.id,
        tier: sustainTierFor(score),
        score,
        notes: range.last - range.first + 1,
        windowStart: phrase.sustainStart,
        windowEnd: phrase.sustainEnd,
        finale,
        lordId: lord === undefined ? null : lord.plan.id,
      })
    }
  }

  /** 句内判定台账 → 表现分原料（计数 + 最长连击；触发时句内必已全部判定） */
  private phrasePerformance(range: PhraseNoteRange): PhrasePerformance {
    let perfect = 0
    let good = 0
    let miss = 0
    let run = 0
    let longestRun = 0
    for (let i = range.first; i <= range.last; i += 1) {
      const tier = this.noteTiers[i]
      if (tier === 'Miss') {
        miss += 1
        run = 0
        continue
      }
      if (tier === 'Perfect') perfect += 1
      else if (tier === 'Good') good += 1
      run += 1
      if (run > longestRun) longestRun = run
    }
    return { perfect, good, miss, longestRun }
  }

  /** Miss 结算：墨妖反击，玩家掉血；血空即败局 */
  private counter(noteId: number, time: number): void {
    this.hp = Math.max(0, this.hp - COUNTER_DAMAGE)
    this.battle.push({ type: 'counter', time, noteId, damage: COUNTER_DAMAGE, playerHp: this.hp })
    if (this.hp === 0) this.finish(time, 'defeat', 'player-hp-empty')
  }

  /** 终局定格：只发一次事件，此后一切输入失效 */
  private finish(
    time: number,
    result: 'victory' | 'defeat',
    reason: OutcomeEvent['reason'],
  ): void {
    this.battleStatus = result
    this.battle.push({ type: 'outcome', time, result, reason })
  }

  /** 命中结算：伤害 = 基线 × 连击倍率（结算时连击）× 判定折扣 */
  private strike(note: ChartNote, judgment: 'Perfect' | 'Good', time: number): void {
    const multiplier = comboMultiplierFor(this.comboCount)
    const damage = BASE_DAMAGE * multiplier * TIER_DAMAGE_FACTOR[judgment]
    const target = this.currentTarget(time)
    this.battle.push({
      type: 'strike',
      time,
      noteId: note.id,
      monsterId: target === null ? null : target.plan.id,
      judgment,
      damage,
      comboMultiplier: multiplier,
    })
    if (target !== null) this.dealDamage(target, damage, time)
    if (note.chordId !== undefined) this.registerChordHit(note, damage, time)
  }

  /** 伤害入账：扣血、累计总伤害，血归零即击杀入流（剑气与和弦重击共用） */
  private dealDamage(target: MonsterState, damage: number, time: number): void {
    target.hp = Math.max(0, target.hp - damage)
    this.damageDealt += damage
    if (target.hp === 0) {
      this.battle.push({
        type: 'slain',
        time,
        monsterId: target.plan.id,
        kind: target.plan.kind,
      })
    }
  }

  /** 和弦成员命中记账；全员命中即判齐按：齐 → 重击加成，散 → 无赏 */
  private registerChordHit(note: ChartNote, damage: number, time: number): void {
    const tracking = this.chords.get(note.chordId!)
    if (tracking === undefined || tracking.broken) return
    tracking.hitTimes.set(note.id, time)
    tracking.damage += damage
    if (tracking.hitTimes.size < tracking.memberIds.size) return

    const spread = Math.max(...tracking.hitTimes.values()) - Math.min(...tracking.hitTimes.values())
    this.chords.delete(note.chordId!)
    if (spread > CHORD_TOGETHER_WINDOW) return // 都命中但按散了：各算各的，无加成

    const bonus = tracking.damage * (CHORD_MULTIPLIER - 1)
    const target = this.currentTarget(time)
    this.battle.push({
      type: 'chord',
      time,
      chordId: note.chordId!,
      monsterId: target === null ? null : target.plan.id,
      bonusDamage: bonus,
      size: tracking.memberIds.size,
    })
    if (target !== null) this.dealDamage(target, bonus, time)
  }
}
