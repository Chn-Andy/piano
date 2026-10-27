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
 * - 战斗流（drainBattle 取走）：剑气 AoE、扑空、咬线、击杀与胜负面
 *   （战斗数值不是分数换皮，全部收进本层，ADR-0004/0011/0012）。
 * 其余状态经 monstersView() / playerHp / summary() 查询。
 */

import type { Chart, ChartNote, Lane, NoteTint, Phrase } from './chart'
import { arrivalTimeAt, biteInterval, comboMultiplierFor, decayAt, depthAt, planMonsters } from './combat'
import type { MonsterKind, MonsterPlan } from './combat'
import { focusedExpectedDamagePerNote } from './combat'
import { phrasePerformanceScore, sustainTierFor } from './sustain'
import type { PhrasePerformance, SustainEvent } from './sustain'
import {
  applyColdDelay,
  blastDamage,
  poisonTickCount,
  poisonTickDamage,
  poisonTickTime,
} from './tints'
import {
  BASE_DAMAGE,
  BATTLEFIELD,
  CHORD_MULTIPLIER,
  CHORD_TOGETHER_WINDOW,
  JUDGMENT_WINDOWS,
  PLAYER_MAX_HP,
  QINXIN,
  SUSTAIN_STRIKE,
  TIER_DAMAGE_FACTOR,
  TINT_EFFECTS,
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

/** 剑气（GLOSSARY：剑气）：一次命中物化成的全屏纵深攻击（ADR-0012）。
 * monsterId = 最前怪物（承伤全额者）的 id，为空 = 劈空（场上无怪）；
 * damage = 一击的基数（全场各怪按纵深衰减分摊，见 sweep）。 */
export interface StrikeEvent {
  readonly type: 'strike'
  readonly time: number
  readonly noteId: number
  readonly monsterId: number | null
  readonly judgment: JudgmentTier
  /** 本次剑气伤害基数（最前怪物实际承伤即此值） */
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

/** 扑空（ADR-0011）：Miss 的剑气劈进空处——只有可见反馈，不掉血。
 * 玩家血量的唯一来源是怪物推进到琴阵后的咬线（bite 事件）。 */
export interface WhiffEvent {
  readonly type: 'whiff'
  readonly time: number
  /** 招致扑空的漏接音符 */
  readonly noteId: number
  readonly lane: Lane
}

/** 到线咬击（ADR-0011）：抵达琴阵的怪物每 ATTACK_BEATS 拍咬玩家一口 */
export interface BiteEvent {
  readonly type: 'bite'
  /** 咬击的确定时刻（抵达 + k × 咬击间隔，与 tick 粒度无关） */
  readonly time: number
  readonly monsterId: number
  readonly damage: number
  /** 咬后的玩家 HP（0 触发败局） */
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

/** 异色词缀触发（工单 09，GLOSSARY：异色音符）：一次命中附带的战场效果。
 * targetIds 是效果实际落到的怪物（寒音=全场、毒音=最前、爆音=前二）；
 * 空场时为空数组——效果扑空，但事件照发（判定与连击不受影响）。 */
export interface TintEvent {
  readonly type: 'tint'
  readonly time: number
  readonly noteId: number
  /** 触发它的音符所在键位（渲染层据此在判定线上画色笔，无需反查谱面） */
  readonly lane: Lane
  readonly kind: NoteTint
  readonly targetIds: readonly number[]
}

/** 毒音跳伤（工单 09）：状态伤害，每拍一跳、按目标最大生命比例，无视纵深衰减 */
export interface PoisonEvent {
  readonly type: 'poison'
  readonly time: number
  readonly monsterId: number
  readonly damage: number
  /** 跳伤后的怪物 HP */
  readonly hpAfter: number
}

/** 琴心通明（工单 10，GLOSSARY：琴心）：蓄能满一层的自动全场爆发。
 * 无衰减、无指向：全场所有已入场活怪同伤。targetIds 为实际承伤的怪
 * （空场为空数组——照样发事件，演出不因空场消失）。 */
export interface QinxinEvent {
  readonly type: 'qinxin'
  readonly time: number
  /** 本次爆发的伤害（全场每只怪承伤相同） */
  readonly damage: number
  readonly targetIds: readonly number[]
  /** 本次是第几炮（自 1 起） */
  readonly index: number
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
  | WhiffEvent
  | BiteEvent
  | ChordEvent
  | TintEvent
  | PoisonEvent
  | QinxinEvent
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
  /** 本场琴心通明释放次数（工单 10；结算画面展示） */
  readonly qinxin: number
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
  /**
   * 寒音累积的行程后延（秒，工单 09）：纵深与抵阵时刻都要按它反解
   * （combat.depthAt(spawnAt, t, holdBack) / arrivalTimeAt(spawnAt, holdBack)）。
   */
  readonly holdBack: number
  /** 减速状态的可见截止时刻（谱面时间轴）；null = 未减速。机制已折进 holdBack */
  readonly slowedUntil: number | null
  /** 中毒状态的可见截止时刻；null = 未中毒 */
  readonly poisonUntil: number | null
}

/** 构造选项：出场计划默认由谱面推导（combat.planMonsters），可注入定制 */
export interface SimulatorOptions {
  readonly monsters?: readonly MonsterPlan[]
}

interface MonsterState {
  readonly plan: MonsterPlan
  hp: number
  /**
   * 下一口咬击的确定时刻（抵阵 + 一个整间隔起算）。用**绝对时刻**而不是
   * 已发口数记账：寒音会重排抵阵时刻，用计数会在「新抵阵到当下」这段
   * 已经咬过的区间里重复补口（历史咬伤被重放）。
   */
  nextBiteAt: number
  /** 寒音累积的行程后延（秒）：抵阵/咬线/纵深全部按它推后 */
  holdBack: number
  /** 减速状态的可见截止时刻（只为渲染可读；机制已折进 holdBack） */
  slowedUntil: number
  /** 中毒状态（工单 09）：中毒时刻与已发出的跳数；null = 未中毒 */
  poison: { readonly at: number; ticksEmitted: number } | null
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
  /** 已结算过词缀的和弦（和弦成员共享词缀：一次命中只结算一次效果） */
  private readonly tintAppliedChords = new Set<number>()
  /** 战斗事件蓄积（drainBattle 取走，顺序即发生顺序） */
  private battle: BattleEvent[] = []
  private hp = PLAYER_MAX_HP
  private battleStatus: BattleStatus = 'fighting'
  private maxCombo = 0
  private perfectCount = 0
  private goodCount = 0
  private missCount = 0
  private damageDealt = 0
  /** 琴心已蓄的命中数（工单 10；蓄能进度 = 它 / CHARGE_COMBOS） */
  private qinxinHits = 0
  /** 已释放的琴心通明次数 */
  private qinxinCount = 0

  constructor(chart: Chart, options?: SimulatorOptions) {
    this.notes = chart.notes
    this.duration = chart.duration
    this.phrases = chart.phrases
    this.phraseRanges = chart.phrases === undefined ? undefined : phraseNoteRanges(chart)
    this.noteTiers = new Array<JudgmentTier | undefined>(chart.notes.length).fill(undefined)
    const plan = options?.monsters ?? planMonsters(chart)
    this.monsters = plan.map((p) => ({
      plan: p,
      hp: p.hp,
      nextBiteAt: arrivalTimeAt(p.spawnAt) + biteInterval(),
      holdBack: 0,
      slowedUntil: 0,
      poison: null,
    }))
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

  /** 琴心蓄能进度（0..1；HUD 蓄能槽与测试读数） */
  get qinxinGauge(): number {
    return this.qinxinHits / QINXIN.CHARGE_COMBOS
  }

  /** 已释放的琴心通明次数 */
  get qinxinReleases(): number {
    return this.qinxinCount
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
      qinxin: this.qinxinCount,
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
      holdBack: m.holdBack,
      slowedUntil: m.slowedUntil > 0 ? m.slowedUntil : null,
      poisonUntil: m.poison === null ? null : m.poison.at + TINT_EFFECTS.toxic.POISON_SECONDS,
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
    this.chargeQinxin(time)
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
      this.battle.push({ type: 'whiff', time, noteId: note.id, lane: note.lane })
      this.missScan += 1
    }
    this.processBites(time)
    if (this.battleStatus !== 'fighting') return events // 咬空即定格
    this.processPoison(time)
    if (this.battleStatus !== 'fighting') return events
    this.triggerSustains(time)
    if (time >= this.duration && this.battleStatus === 'fighting') {
      // 歌毕：场上怪清完 → 胜；仍有活怪 → 败（此后再无音符可清场）
      const cleared = this.monsters.every((m) => m.hp <= 0)
      this.finish(time, cleared ? 'victory' : 'defeat', cleared ? 'cleared' : 'monsters-remain')
    }
    return events
  }

  /**
   * 到线咬击结算（ADR-0011）：每只抵达琴阵的活怪按排定节奏咬人，
   * 首口在抵达后一个整间隔。咬击时刻存在 nextBiteAt 里——tick 一步跨多口
   * 则按序补齐（与 tick 粒度无关）；歌毕后不再有咬击（胜负已由歌毕裁定）。
   */
  private processBites(time: number): void {
    const horizon = Math.min(time, this.duration)
    for (const monster of this.monsters) {
      if (monster.hp <= 0) continue
      while (monster.nextBiteAt <= horizon && this.battleStatus === 'fighting') {
        const at = monster.nextBiteAt
        monster.nextBiteAt = at + biteInterval()
        this.hp = Math.max(0, this.hp - BATTLEFIELD.BITE_DAMAGE)
        this.battle.push({
          type: 'bite',
          time: at,
          monsterId: monster.plan.id,
          damage: BATTLEFIELD.BITE_DAMAGE,
          playerHp: this.hp,
        })
        if (this.hp === 0) {
          this.finish(at, 'defeat', 'player-hp-empty')
          return
        }
      }
    }
  }

  /** 已入场且存活的怪（伤害与事件的承伤集合；未入场的怪在场外够不着） */
  private spawnedAlive(time: number): MonsterState[] {
    return this.monsters.filter((m) => m.plan.spawnAt <= time && m.hp > 0)
  }

  /**
   * 最前的一批怪物：按纵深（离琴阵距离）升序，同纵深取先入场者。只作战斗
   * 事件的指向性读数（ADR-0012：剑气伤害本身无指向，全场按纵深衰减分摊）；
   * 异色音符的毒音/爆音按此序取目标（工单 09）。
   */
  private frontMonsters(time: number, count: number): MonsterState[] {
    const ranked = this.spawnedAlive(time).sort((a, b) => {
      const delta =
        depthAt(a.plan.spawnAt, time, a.holdBack) - depthAt(b.plan.spawnAt, time, b.holdBack)
      return delta !== 0 ? delta : a.plan.id - b.plan.id
    })
    return ranked.slice(0, count)
  }

  /** 最前怪物（无怪时 null） */
  private frontMonster(time: number): MonsterState | null {
    return this.frontMonsters(time, 1)[0] ?? null
  }

  /**
   * 异色词缀的战场效果（工单 09，GLOSSARY：异色音符）：命中照常结伤之后结算。
   * 效果一律无视剑气纵深衰减——它们不是剑气：寒音是控场、毒音是状态、
   * 爆音是按目标身板的重击。只作用于已入场的活怪；空场即扑空（事件照发，
   * 判定与连击不受影响）。
   */
  private applyTint(note: ChartNote, kind: NoteTint, time: number): void {
    const alive = this.spawnedAlive(time)
    if (kind === 'cold') {
      for (const monster of alive) {
        const before = monster.holdBack
        monster.holdBack = applyColdDelay(before, time - monster.plan.spawnAt)
        monster.slowedUntil = time + TINT_EFFECTS.cold.SLOW_SECONDS
        // 击退把咬击节奏一起推后：下一口不早于「新抵阵 + 一个整间隔」。
        // 取 max 而非直接赋值——若后延比它已在线的时间还短，怪其实仍在阵上，
        // 排定时刻不该被提前（更不能把已经咬过的口重放一遍）。
        if (monster.holdBack > before) {
          const arrival = arrivalTimeAt(monster.plan.spawnAt, monster.holdBack)
          monster.nextBiteAt = Math.max(monster.nextBiteAt, arrival + biteInterval())
        }
      }
      this.battle.push({
        type: 'tint',
        time,
        noteId: note.id,
        lane: note.lane,
        kind,
        targetIds: alive.map((m) => m.plan.id),
      })
      return
    }
    if (kind === 'toxic') {
      const front = this.frontMonster(time)
      if (front !== null) {
        // 覆盖式刷新：新的一口以本次命中为起点重新计跳（不叠层，避免无限毒）
        front.poison = { at: time, ticksEmitted: 0 }
      }
      this.battle.push({
        type: 'tint',
        time,
        noteId: note.id,
        lane: note.lane,
        kind,
        targetIds: front === null ? [] : [front.plan.id],
      })
      return
    }
    // 爆音：最前与次前各挨一记按身板的重击
    const targets = this.frontMonsters(time, 2)
    for (const monster of targets) {
      this.dealDamage(monster, blastDamage(monster.plan.hp), time)
    }
    this.battle.push({
      type: 'tint',
      time,
      noteId: note.id,
      lane: note.lane,
      kind,
      targetIds: targets.map((m) => m.plan.id),
    })
  }

  /**
   * 中毒跳伤（工单 09）：每拍一跳、按目标最大生命比例；跳数由持续时间常数
   * 决定。跳时刻是中毒起点 + k × 拍长——与 tick 粒度无关：一步跨多拍则
   * 按序补齐。目标已死则该口毒随之结束（剩余跳数不再补）。
   */
  private processPoison(time: number): void {
    const horizon = Math.min(time, this.duration)
    const total = poisonTickCount()
    for (const monster of this.monsters) {
      const poison = monster.poison
      if (poison === null || monster.hp <= 0) continue
      const due = Math.min(total, Math.floor((horizon - poison.at) / BATTLEFIELD.BEAT_SECONDS))
      while (poison.ticksEmitted < due && monster.hp > 0) {
        poison.ticksEmitted += 1
        const at = poisonTickTime(poison.at, poison.ticksEmitted)
        const damage = poisonTickDamage(monster.plan.hp)
        this.battle.push({
          type: 'poison',
          time: at,
          monsterId: monster.plan.id,
          damage,
          hpAfter: Math.max(0, monster.hp - damage),
        })
        this.dealDamage(monster, damage, at)
      }
      if (monster.hp <= 0) monster.poison = null
    }
  }

  /**
   * 全场扫伤（ADR-0012）：一击的基数对每只已入场的活怪按纵深衰减结伤，
   * 纵深 0 全额、逐级 ×0.6、封顶 4 级。击杀即 slain 入流。
   */
  private sweep(damage: number, time: number): void {
    for (const monster of this.spawnedAlive(time)) {
      this.dealDamage(monster, damage * decayAt(monster.plan.spawnAt, time, monster.holdBack), time)
    }
  }

  /**
   * 余韵/终章的全屏收势结伤：无视纵深全额——这是句末的「仰望时刻」，
   * 剑气把整句火力泼向整个战场（深处的新生妖也吃满），由此构造性保证
   * 终章 grand 可斩首满血墨主（无论其推进到何处）。
   */
  private sweepFlat(damage: number, time: number): void {
    for (const monster of this.spawnedAlive(time)) {
      this.dealDamage(monster, damage, time)
    }
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
      const tier = sustainTierFor(score)
      const finale = index === this.phrases.length - 1
      const lord = finale ? this.monsters.find((m) => m.plan.kind === 'inkLord') : undefined
      const noteCount = range.last - range.first + 1
      // 全屏收势结伤（工单 08）：句内音符预算 × 档位结伤比 × 终章倍率，全额无视纵深
      const damage =
        noteCount *
        focusedExpectedDamagePerNote() *
        SUSTAIN_STRIKE.TIER_DAMAGE_FRACTION[tier] *
        (finale ? SUSTAIN_STRIKE.FINALE_MULTIPLIER : 1)
      const at = phrase.end + JUDGMENT_WINDOWS.good
      this.battle.push({
        type: 'sustain',
        time: at,
        phraseId: phrase.id,
        tier,
        score,
        notes: noteCount,
        windowStart: phrase.sustainStart,
        windowEnd: phrase.sustainEnd,
        finale,
        lordId: lord === undefined ? null : lord.plan.id,
        damage,
      })
      this.sweepFlat(damage, at)
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

  /** 终局定格：只发一次事件，此后一切输入失效 */
  private finish(
    time: number,
    result: 'victory' | 'defeat',
    reason: OutcomeEvent['reason'],
  ): void {
    this.battleStatus = result
    this.battle.push({ type: 'outcome', time, result, reason })
  }

  /** 命中结算：伤害基数 = 基线 × 连击倍率（结算时连击）× 判定折扣，全场扫伤 */
  private strike(note: ChartNote, judgment: 'Perfect' | 'Good', time: number): void {
    const multiplier = comboMultiplierFor(this.comboCount)
    const damage = BASE_DAMAGE * multiplier * TIER_DAMAGE_FACTOR[judgment]
    const front = this.frontMonster(time)
    this.battle.push({
      type: 'strike',
      time,
      noteId: note.id,
      monsterId: front === null ? null : front.plan.id,
      judgment,
      damage,
      comboMultiplier: multiplier,
    })
    this.sweep(damage, time)
    if (note.tint !== undefined) {
      const chordId = note.chordId
      // 和弦成员共享词缀：整组只结算一次（首个按下的成员触发）
      if (chordId === undefined || !this.tintAppliedChords.has(chordId)) {
        if (chordId !== undefined) this.tintAppliedChords.add(chordId)
        this.applyTint(note, note.tint, time)
      }
    }
    if (note.chordId !== undefined) this.registerChordHit(note, damage, time)
  }

  /**
   * 琴心充能（工单 10，ADR-0007 增补）：每次命中充 1/CHARGE_COMBOS 层，
   * 满一层即自动释放「琴心通明」。Miss 不充能（根本走不到这条路径）；
   * 连击中断只停止充能，已蓄之能不清空。溢出的充能保留到下一层——
   * 长连击里连放两炮是应有的回报。
   */
  private chargeQinxin(time: number): void {
    this.qinxinHits += 1
    while (this.qinxinHits >= QINXIN.CHARGE_COMBOS) {
      this.qinxinHits -= QINXIN.CHARGE_COMBOS
      this.releaseQinxin(time)
    }
  }

  /**
   * 琴心通明：全场无衰减爆发（泼场同余韵，但不是剑气——不看纵深）。
   * 伤害 = 期望每音符伤害 × QINXIN.DAMAGE_NOTE_EQUIVALENT。
   *
   * 与乐句余韵相遇时的次序（票面要求明确的规则）：琴心在**命中当刻**结算，
   * 余韵在句末 + Good 窗后结算，两者独立结伤、不合并——同一 tick 内
   * 先入流的总是琴心（命中驱动的即时反馈），余韵随后（乐句驱动的收势演出）；
   * 演出层余韵占上半区全部注意力，琴心只在战场纵深内炸开一道墨环。
   */
  private releaseQinxin(time: number): void {
    const targets = this.spawnedAlive(time)
    const damage = focusedExpectedDamagePerNote() * QINXIN.DAMAGE_NOTE_EQUIVALENT
    this.qinxinCount += 1
    this.battle.push({
      type: 'qinxin',
      time,
      damage,
      targetIds: targets.map((m) => m.plan.id),
      index: this.qinxinCount,
    })
    this.sweepFlat(damage, time)
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
    const front = this.frontMonster(time)
    this.battle.push({
      type: 'chord',
      time,
      chordId: note.chordId!,
      monsterId: front === null ? null : front.plan.id,
      bonusDamage: bonus,
      size: tracking.memberIds.size,
    })
    this.sweep(bonus, time)
  }
}
