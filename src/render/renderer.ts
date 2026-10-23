/**
 * Canvas 2D 渲染壳：只消费模拟器的公开状态，不含任何游戏逻辑。
 * 水墨纸面风格（ADR-0005）：
 * - 上半区：斗琴战场——墨妖程序绘制剪影、HP 条、命中反馈（闪/缩放级；
 *   顿帧与爆裂演出是 04 号票）。ADR-0004：怪物凭余光可读（大血条、
 *   大状态变化），不依赖细碎动画。
 * - 下半区：音符沿钢琴几何的轨道下落（白键整列、黑键嵌列，ADR-0006），
 *   压线即判定（工单 01 行为沿用）。
 */

import type { Chart, ChartNote, Lane } from '../core/chart'
import type { KeyBinding } from '../core/keymap'
import type { MonsterView } from '../core/simulator'

/** 判定闪示：一次判定的可见反馈 */
export interface JudgmentFlash {
  readonly lane: Lane
  readonly judgment: 'Perfect' | 'Good' | 'Miss'
  /** 闪示对应的谱面时刻 */
  readonly at: number
}

/** 最近命中的反馈（怪物受击闪/缩放用） */
export interface HitFeedback {
  readonly at: number
  readonly monsterId: number | null
  /** 和弦重击（更大的反馈） */
  readonly chord: boolean
}

export interface RenderModel {
  readonly chart: Chart
  /** 谱面键位布局（钢琴序，含物理键与黑白键标记） */
  readonly layout: readonly KeyBinding[]
  /** 谱面时间轴当前时刻；倒计时期间为负 */
  readonly t: number
  /** 尚未判定的音符（sim.pendingNotes()） */
  readonly pending: readonly ChartNote[]
  readonly combo: number
  /** 当前连击对应的伤害倍率（如 1.5） */
  readonly comboMultiplier: number
  /** 当前按住的键位 */
  readonly held: ReadonlySet<Lane>
  readonly flashes: readonly JudgmentFlash[]
  /** 倒计时剩余拍数；演奏中为 null */
  readonly countdownBeats: number | null
  /* ── 战场（上半区）── */
  readonly monsters: readonly MonsterView[]
  readonly playerHp: number
  readonly playerMaxHp: number
  readonly hits: readonly HitFeedback[]
  /** 最近被击杀的怪物（淡出演出） */
  readonly slains: readonly { at: number; monsterId: number }[]
  /** 最近挨的反击（红晕反馈） */
  readonly counters: readonly { at: number }[]
}

const FALL_SPEED = 340 // 音符下落速度（px/s）
const VISIBLE_AHEAD = 2.4 // 更远时刻的音符不绘制（秒）
const FLASH_LIFE = 0.7 // 判定闪示存续（秒）
const HIT_PULSE = 0.25 // 命中反馈存续（秒）
const SLAIN_FADE = 0.45 // 击杀淡出（秒）
const COUNTER_FLASH = 0.35 // 挨打红晕（秒）

const PAPER = '#efe9dc'
const INK = '#37322a'
const DEEP_INK = '#1d1a15'
const FAINT_INK = 'rgba(55,50,42,0.10)'
const BLOOD = '#a03d2c'
const SERIF = '"Noto Serif SC", "Songti SC", "SimSun", serif'

const TIER_STYLE: Record<'Perfect' | 'Good' | 'Miss', { label: string; color: string }> = {
  Perfect: { label: '完美', color: '#8a6d1f' },
  Good: { label: '良好', color: '#37322a' },
  Miss: { label: '失误', color: '#a03d2c' },
}

const COUNT_NUMERALS = ['四', '三', '二', '一']

/** 一条键位轨道的几何：中心 x 与列宽（黑键窄、嵌于白键边界） */
interface LaneGeom {
  readonly cx: number
  readonly width: number
  readonly black: boolean
}

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
    const judgeY = H * 0.8
    const zoneY = H * 0.5 // 战场 / 下落区分界

    // 纸面
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, W, H)

    const geom = this.laneGeometry(m.layout, W)

    this.drawField(m, geom, judgeY)
    this.drawBattle(m, W, H, zoneY)
    this.drawHud(m, geom, W, H, judgeY, zoneY)
  }

  /** 键位几何：白键均分整列；黑键窄列嵌在相邻白键边界上（真钢琴） */
  private laneGeometry(layout: readonly KeyBinding[], W: number): {
    lanes: readonly LaneGeom[]
    fieldW: number
    x0: number
    whiteW: number
  } {
    const whites = layout.filter((b) => !b.isBlack).length
    const whiteW = Math.max(38, Math.min(104, W / (whites + 1)))
    const fieldW = whiteW * whites
    const x0 = (W - fieldW) / 2
    const lanes: LaneGeom[] = []
    let whiteIndex = 0
    for (const binding of layout) {
      if (binding.isBlack) {
        // 黑键列嵌于其左侧白键与右侧白键的边界
        lanes.push({ cx: x0 + whiteIndex * whiteW, width: whiteW * 0.6, black: true })
      } else {
        lanes.push({ cx: x0 + whiteIndex * whiteW + whiteW / 2, width: whiteW, black: false })
        whiteIndex += 1
      }
    }
    return { lanes, fieldW, x0, whiteW }
  }

  /** 下落区（沿用 01 行为，几何随谱面键区扩展） */
  private drawField(
    m: RenderModel,
    geom: { lanes: readonly LaneGeom[]; fieldW: number; x0: number },
    judgeY: number,
  ): void {
    const { ctx } = this

    // 按住键位的墨色淡染
    m.layout.forEach((binding) => {
      if (!m.held.has(binding.lane)) return
      const g = geom.lanes[binding.lane]!
      ctx.fillStyle = 'rgba(55,50,42,0.05)'
      ctx.fillRect(g.cx - g.width / 2, 0, g.width, judgeY)
    })

    // 白键列分隔线（黑键嵌列不再单独分格）
    ctx.strokeStyle = FAINT_INK
    ctx.lineWidth = 1
    const whites = geom.lanes.filter((l) => !l.black).length
    for (let i = 0; i <= whites; i += 1) {
      const x = Math.round(geom.x0 + i * (geom.fieldW / whites)) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, judgeY + 48)
      ctx.stroke()
    }

    // 判定线：主笔 + 淡晕
    ctx.strokeStyle = 'rgba(55,50,42,0.08)'
    ctx.lineWidth = 14
    ctx.beginPath()
    ctx.moveTo(geom.x0 - 14, judgeY)
    ctx.lineTo(geom.x0 + geom.fieldW + 14, judgeY)
    ctx.stroke()
    ctx.strokeStyle = INK
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(geom.x0 - 10, judgeY)
    ctx.lineTo(geom.x0 + geom.fieldW + 10, judgeY)
    ctx.stroke()

    // 下落音符（黑键音块更窄更深，读作黑键）
    for (const note of m.pending) {
      const dt = note.time - m.t
      if (dt > VISIBLE_AHEAD) continue
      const y = judgeY - dt * FALL_SPEED
      const g = geom.lanes[note.lane]
      if (g === undefined) continue
      const noteH = 26
      if (y < -noteH - 20) continue
      const noteW = g.width * (g.black ? 0.78 : 0.56)
      ctx.fillStyle = g.black ? DEEP_INK : INK
      this.roundRect(g.cx - noteW / 2, y - noteH / 2, noteW, noteH, 7)
      ctx.fill()
      ctx.strokeStyle = 'rgba(239,233,220,0.35)'
      ctx.lineWidth = 1.5
      this.roundRect(g.cx - noteW / 2 + 3, y - noteH / 2 + 3, noteW - 6, noteH - 6, 5)
      ctx.stroke()
    }

    // 键位标签（底部，兼作键位图示；黑键略小略高，读作嵌行）
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    m.layout.forEach((binding) => {
      const g = geom.lanes[binding.lane]!
      const isHeld = m.held.has(binding.lane)
      const y = judgeY + (binding.isBlack ? 24 : 34)
      ctx.font = `${isHeld ? 700 : 400} ${binding.isBlack ? 13 : 17}px ${SERIF}`
      ctx.fillStyle = isHeld ? INK : 'rgba(55,50,42,0.45)'
      ctx.fillText(binding.key, g.cx, y)
      if (isHeld) {
        ctx.fillStyle = 'rgba(55,50,42,0.5)'
        ctx.fillRect(g.cx - 9, y + 13, 18, 2.5)
      }
    })
  }

  /** 上半区战场：墨妖剪影 + HP 条 + 命中/击杀/反击反馈 */
  private drawBattle(
    m: RenderModel,
    W: number,
    H: number,
    zoneY: number,
  ): void {
    const { ctx } = this

    // 战场/下落区分界：一道淡墨横笔
    ctx.strokeStyle = 'rgba(55,50,42,0.06)'
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.moveTo(0, zoneY)
    ctx.lineTo(W, zoneY)
    ctx.stroke()

    const cy = H * 0.3
    const baseR = Math.min(H * 0.1, W * 0.09, 96)
    const spawned = m.monsters.filter((mo) => mo.spawnAt <= m.t)
    const active = spawned.find((mo) => mo.hp > 0)
    const waiting = spawned.filter((mo) => mo.hp > 0 && mo !== active).slice(0, 2)

    // 后排待战墨妖（小、淡）
    waiting.forEach((mo, i) => {
      const side = i === 0 ? -1 : 1
      this.drawMonster(m, mo, W / 2 + side * W * 0.21, cy + baseR * 0.3, baseR * 0.5, 0.45)
    })

    // 当前墨妖（主目标）
    if (active !== undefined) {
      const lord = active.kind === 'inkLord'
      this.drawMonster(m, active, W / 2, cy, baseR * (lord ? 1.3 : 1), 1)
    }

    // 近期击杀：放大淡出 + 下坠
    for (const s of m.slains) {
      const age = m.t - s.at
      if (age < 0 || age > SLAIN_FADE) continue
      const mo = m.monsters.find((x) => x.id === s.monsterId)
      if (mo === undefined) continue
      const lord = mo.kind === 'inkLord'
      this.drawMonster(
        m,
        mo,
        W / 2,
        cy + age * 70,
        baseR * (lord ? 1.3 : 1) * (1 + age * 1.6),
        1 - age / SLAIN_FADE,
      )
    }
  }

  /** 程序绘制墨色剪影（帧间确定性轮廓 + 极慢呼吸；演出升级在 04 号票） */
  private drawMonster(
    m: RenderModel,
    monster: MonsterView,
    cx: number,
    cy: number,
    radius: number,
    alpha: number,
  ): void {
    const { ctx } = this
    const lord = monster.kind === 'inkLord'

    // 受击脉冲：缩放 + 纸色闪
    let punch = 0
    let flash = 0
    let heavy = false
    for (const hit of m.hits) {
      if (hit.monsterId !== monster.id) continue
      const age = m.t - hit.at
      if (age < 0 || age > HIT_PULSE) continue
      const decay = 1 - age / HIT_PULSE
      punch = Math.max(punch, (hit.chord ? 0.22 : 0.1) * decay)
      flash = Math.max(flash, decay)
      if (hit.chord) heavy = true
    }

    const r = radius * (1 + punch)
    ctx.save()
    ctx.globalAlpha = alpha

    // 剪影主体：确定性墨团轮廓
    ctx.fillStyle = lord ? '#14110d' : INK
    ctx.beginPath()
    const points = 9
    for (let k = 0; k <= points; k += 1) {
      const angle = (k / points) * Math.PI * 2
      const noise = Math.sin(monster.id * 127.1 + (k % points) * 311.7) * 43758.5453
      const wob = 0.82 + 0.22 * (noise - Math.floor(noise))
      const breathe = 1 + 0.02 * Math.sin(m.t * 1.8 + k * 1.3)
      const rr = r * wob * breathe
      const x = cx + Math.cos(angle) * rr
      const y = cy + Math.sin(angle) * rr * 0.88 // 略扁，更有生物感
      if (k === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()

    // 墨主冠饰：三根尖峰
    if (lord) {
      ctx.beginPath()
      for (const dx of [-0.45, 0, 0.45]) {
        ctx.moveTo(cx + dx * r, cy - r * 0.78)
        ctx.lineTo(cx + dx * r + r * 0.1, cy - r * (1.25 + 0.15 * Math.abs(dx * 2)))
        ctx.lineTo(cx + dx * r + r * 0.22, cy - r * 0.72)
      }
      ctx.fillStyle = '#14110d'
      ctx.fill()
    }

    // 眼：两道纸色斜笔（怒意）
    ctx.strokeStyle = PAPER
    ctx.lineWidth = Math.max(2, r * 0.055)
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(cx + side * r * 0.14, cy - r * 0.22)
      ctx.lineTo(cx + side * r * 0.52, cy - r * 0.08)
      ctx.stroke()
    }

    // 受击纸色闪罩
    if (flash > 0) {
      ctx.globalAlpha = alpha * flash * 0.55
      ctx.fillStyle = PAPER
      ctx.beginPath()
      ctx.ellipse(cx, cy, r * 1.02, r * 0.9, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = alpha
    }

    // HP 条：怪物正下方，宽厚醒目（余光可读的主通道）
    const barW = Math.max(r * 2.4, 150)
    const barH = 13
    const barY = cy + radius * 1.06
    ctx.globalAlpha = alpha
    ctx.fillStyle = 'rgba(55,50,42,0.14)'
    this.roundRect(cx - barW / 2, barY, barW, barH, 6)
    ctx.fill()
    const frac = Math.max(0, monster.hp / monster.maxHp)
    ctx.fillStyle = lord ? BLOOD : INK
    if (frac > 0) {
      this.roundRect(cx - barW / 2, barY, barW * frac, barH, 6)
      ctx.fill()
    }

    // 墨主名牌
    if (lord) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `700 15px ${SERIF}`
      ctx.fillStyle = BLOOD
      ctx.fillText('墨主', cx, barY + barH + 12)
    }

    // 和弦重击字符反馈
    if (heavy) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `700 ${Math.round(radius * 0.42)}px ${SERIF}`
      ctx.fillStyle = BLOOD
      ctx.fillText('重', cx, cy - radius * 1.5)
    }
    ctx.restore()
  }

  /** HUD：玩家 HP 条（顶边）、连击与倍率、判定闪示、倒计时、挨打红晕 */
  private drawHud(
    m: RenderModel,
    geom: { lanes: readonly LaneGeom[] },
    W: number,
    H: number,
    judgeY: number,
    zoneY: number,
  ): void {
    const { ctx } = this

    // 玩家 HP：屏幕顶边通栏，永远在余光里
    const hpFrac = Math.max(0, m.playerHp / m.playerMaxHp)
    ctx.fillStyle = 'rgba(160,61,44,0.15)'
    ctx.fillRect(0, 0, W, 10)
    if (hpFrac > 0) {
      ctx.fillStyle = BLOOD
      ctx.fillRect(0, 0, W * hpFrac, 10)
    }

    // 挨打反馈：判定区上缘泛红渐隐（眼皮底下的警报）
    for (const c of m.counters) {
      const age = m.t - c.at
      if (age < 0 || age > COUNTER_FLASH) continue
      const decay = 1 - age / COUNTER_FLASH
      const grad = ctx.createLinearGradient(0, judgeY, 0, judgeY - 140)
      grad.addColorStop(0, `rgba(160,61,44,${0.4 * decay})`)
      grad.addColorStop(1, 'rgba(160,61,44,0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, judgeY - 140, W, 140)
    }

    // 判定闪示（沿用 01）
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const f of m.flashes) {
      const age = m.t - f.at
      if (age < 0 || age > FLASH_LIFE) continue
      const style = TIER_STYLE[f.judgment]
      const lx = geom.lanes[f.lane]!.cx
      const y = judgeY - 64 - age * 34
      ctx.globalAlpha = 1 - age / FLASH_LIFE
      ctx.font = `700 25px ${SERIF}`
      ctx.fillStyle = style.color
      ctx.fillText(style.label, lx, y)
      ctx.globalAlpha = 1
    }

    // 连击与伤害倍率（认真打 → 倍率抬升可感）
    if (m.combo >= 2) {
      ctx.font = `700 52px ${SERIF}`
      ctx.fillStyle = INK
      ctx.fillText(String(m.combo), W / 2, H * 0.16)
      ctx.font = `400 16px ${SERIF}`
      ctx.fillStyle = 'rgba(55,50,42,0.55)'
      ctx.fillText(`连击 · 伤害 ×${m.comboMultiplier}`, W / 2, H * 0.16 + 36)
    }

    // 倒计时（沿用 01）
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

    void zoneY
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
