/**
 * Canvas 2D 渲染壳：只消费模拟器的公开状态，不含任何游戏逻辑。
 * 水墨纸面风格（ADR-0005）：墨色音符沿轨道下落，压线即判定。
 */

import type { Chart, ChartNote, Lane } from '../core/chart'
import { WHITE_KEYS } from '../core/keymap'
import type { JudgmentTier } from '../core/simulator'

/** 判定闪示：一次判定的可见反馈 */
export interface JudgmentFlash {
  readonly lane: Lane
  readonly judgment: JudgmentTier
  /** 闪示对应的谱面时刻 */
  readonly at: number
}

export interface RenderModel {
  readonly chart: Chart
  /** 谱面时间轴当前时刻；倒计时期间为负 */
  readonly t: number
  /** 尚未判定的音符（sim.pendingNotes()） */
  readonly pending: readonly ChartNote[]
  readonly combo: number
  /** 当前按住的键位 */
  readonly held: ReadonlySet<Lane>
  readonly flashes: readonly JudgmentFlash[]
  /** 倒计时剩余拍数；演奏中为 null */
  readonly countdownBeats: number | null
}

const FALL_SPEED = 340 // 音符下落速度（px/s）
const VISIBLE_AHEAD = 2.4 // 更远时刻的音符不绘制（秒）
const FLASH_LIFE = 0.7 // 判定闪示存续（秒）

const PAPER = '#efe9dc'
const INK = '#37322a'
const FAINT_INK = 'rgba(55,50,42,0.10)'
const SERIF = '"Noto Serif SC", "Songti SC", "SimSun", serif'

const TIER_STYLE: Record<JudgmentTier, { label: string; color: string }> = {
  Perfect: { label: '完美', color: '#8a6d1f' },
  Good: { label: '良好', color: '#37322a' },
  Miss: { label: '失误', color: '#a03d2c' },
}

const COUNT_NUMERALS = ['四', '三', '二', '一']

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D
  private cssW = 0
  private cssH = 0

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('无法取得 Canvas 2D 上下文')
    this.ctx = ctx
    this.resize()
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr)
      this.canvas.height = Math.round(h * dpr)
    }
    this.cssW = w
    this.cssH = h
  }

  draw(m: RenderModel): void {
    this.resize()
    const { ctx } = this
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const W = this.cssW
    const H = this.cssH
    const laneW = Math.max(52, Math.min(104, W / 9))
    const fieldW = laneW * WHITE_KEYS.length
    const x0 = (W - fieldW) / 2
    const judgeY = H * 0.8

    // 纸面
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, W, H)

    // 按住键位的墨色淡染
    for (let lane = 0; lane < WHITE_KEYS.length; lane += 1) {
      if (!m.held.has(lane)) continue
      ctx.fillStyle = 'rgba(55,50,42,0.05)'
      ctx.fillRect(x0 + lane * laneW, 0, laneW, judgeY)
    }

    // 轨道分隔线
    ctx.strokeStyle = FAINT_INK
    ctx.lineWidth = 1
    for (let i = 0; i <= WHITE_KEYS.length; i += 1) {
      const x = Math.round(x0 + i * laneW) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, judgeY + 48)
      ctx.stroke()
    }

    // 判定线：主笔 + 淡晕
    ctx.strokeStyle = 'rgba(55,50,42,0.08)'
    ctx.lineWidth = 14
    ctx.beginPath()
    ctx.moveTo(x0 - 14, judgeY)
    ctx.lineTo(x0 + fieldW + 14, judgeY)
    ctx.stroke()
    ctx.strokeStyle = INK
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(x0 - 10, judgeY)
    ctx.lineTo(x0 + fieldW + 10, judgeY)
    ctx.stroke()

    // 下落音符
    const noteW = laneW * 0.56
    const noteH = 26
    for (const note of m.pending) {
      const dt = note.time - m.t
      if (dt > VISIBLE_AHEAD) continue
      const y = judgeY - dt * FALL_SPEED
      if (y < -noteH - 20) continue
      const cx = x0 + note.lane * laneW + laneW / 2
      ctx.fillStyle = INK
      this.roundRect(cx - noteW / 2, y - noteH / 2, noteW, noteH, 7)
      ctx.fill()
      // 高光内线，给墨块一点笔触感
      ctx.strokeStyle = 'rgba(239,233,220,0.35)'
      ctx.lineWidth = 1.5
      this.roundRect(cx - noteW / 2 + 3, y - noteH / 2 + 3, noteW - 6, noteH - 6, 5)
      ctx.stroke()
    }

    // 键位标签（底部，兼作新手键位图示）
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let lane = 0; lane < WHITE_KEYS.length; lane += 1) {
      const key = WHITE_KEYS[lane]!
      const x = x0 + lane * laneW + laneW / 2
      const isHeld = m.held.has(lane)
      ctx.font = `${isHeld ? 700 : 400} 17px ${SERIF}`
      ctx.fillStyle = isHeld ? INK : 'rgba(55,50,42,0.45)'
      ctx.fillText(key, x, judgeY + 34)
      if (isHeld) {
        ctx.fillStyle = 'rgba(55,50,42,0.5)'
        ctx.fillRect(x - 9, judgeY + 47, 18, 2.5)
      }
    }

    // 判定闪示
    for (const f of m.flashes) {
      const age = m.t - f.at
      if (age < 0 || age > FLASH_LIFE) continue
      const style = TIER_STYLE[f.judgment]
      const x = x0 + f.lane * laneW + laneW / 2
      const y = judgeY - 64 - age * 34
      ctx.globalAlpha = 1 - age / FLASH_LIFE
      ctx.font = `700 25px ${SERIF}`
      ctx.fillStyle = style.color
      ctx.fillText(style.label, x, y)
      ctx.globalAlpha = 1
    }

    // 连击
    if (m.combo >= 2) {
      ctx.font = `700 52px ${SERIF}`
      ctx.fillStyle = INK
      ctx.fillText(String(m.combo), W / 2, H * 0.16)
      ctx.font = `400 16px ${SERIF}`
      ctx.fillStyle = 'rgba(55,50,42,0.55)'
      ctx.fillText('连击', W / 2, H * 0.16 + 36)
    }

    // 倒计时
    if (m.countdownBeats !== null && m.countdownBeats > 0) {
      const index = Math.min(COUNT_NUMERALS.length - 1, Math.ceil(m.countdownBeats) - 1)
      const numeral = COUNT_NUMERALS[index]!
      const beatFraction = m.countdownBeats - Math.floor(m.countdownBeats)
      ctx.globalAlpha = 0.25 + 0.6 * (1 - beatFraction)
      ctx.font = `700 96px ${SERIF}`
      ctx.fillStyle = INK
      ctx.fillText(numeral, W / 2, H * 0.42)
      ctx.globalAlpha = 1
    }
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const { ctx } = this
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
}
