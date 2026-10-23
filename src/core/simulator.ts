/**
 * 核心模拟器：纯数据层（Seam 1）。
 *
 * 不引用任何 DOM / Web Audio API——时间完全由调用方注入（音频壳传入
 * audioContext.currentTime，测试注入固定值）。渲染与音频作为薄壳消费
 * 本模块输出的事件流（SPEC-0001 Implementation Decisions）。
 *
 * 输入：谱面 + 以音频时钟计时的按键事件序列。
 * 输出：判定流（Perfect / Good / Miss，含连击状态）。
 */

import type { Chart, ChartNote, Lane } from './chart'
import { JUDGMENT_WINDOWS } from './config'

/** 三级判定（GLOSSARY：判定） */
export type JudgmentTier = 'Perfect' | 'Good' | 'Miss'

/** 判定事件：模拟器对外输出事件流的唯一事件类型（工单 01）。 */
export interface JudgmentEvent {
  readonly type: 'judgment'
  readonly noteId: number
  readonly lane: Lane
  readonly judgment: JudgmentTier
  /** 事件发生时刻（谱面时间轴，秒） */
  readonly time: number
  /** 按键时刻相对音符命中时刻的偏移（秒，正=迟）；Miss 无按键，不携带 */
  readonly offset?: number
  /** 事件之后的连击数 */
  readonly combo: number
}

export type GameEvent = JudgmentEvent

/** keyDown 的结果。repeat=true 表示长按产生的重复按下，已被忽略。 */
export interface KeyOutcome {
  readonly repeat: boolean
  readonly events: readonly GameEvent[]
}

export class Simulator {
  private readonly notes: readonly ChartNote[]
  /** 已判定/已 Miss 的音符 id 集合 */
  private readonly resolved = new Set<number>()
  /** Miss 扫描游标：此前的音符必已出结果（命中或 Miss） */
  private missScan = 0
  /** 当前按住未松开的键位（去重状态） */
  private readonly held = new Set<Lane>()
  private comboCount = 0

  constructor(chart: Chart) {
    this.notes = chart.notes
  }

  /** 当前连击数（GLOSSARY：连击） */
  get combo(): number {
    return this.comboCount
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
    const offset = time - note.time
    const event: JudgmentEvent = {
      type: 'judgment',
      noteId: note.id,
      lane,
      judgment: Math.abs(offset) <= JUDGMENT_WINDOWS.perfect ? 'Perfect' : 'Good',
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
      events.push({
        type: 'judgment',
        noteId: note.id,
        lane: note.lane,
        judgment: 'Miss',
        time,
        combo: 0,
      })
      this.missScan += 1
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
}
