/**
 * Canvas 2D 渲染壳：只消费模拟器的公开状态，不含任何游戏逻辑。
 * 水墨纸面风格（ADR-0005）：
 * - 上半区：斗琴战场——墨妖成群自深处向琴阵推进（工单 08，纵深排布
 *   近大远小、咬线突进、AoE 剑气扫场墨浪、扑空斜笔）；重击/击杀的
 *   受击顿帧（战场一瞬冻结，音符流绝不同冻）、墨主登场落位、墨主死亡
 *   大爆裂（工单 04）。ADR-0004：怪物凭余光可读（大血条、大状态变化）。
 * - 余韵/终章（工单 04，ADR-0007）：乐句换气口处，本句剑气自判定线升腾、
 *   于战场引爆成水墨收势——墨晕、剑气笔势、墨点粒子、档位题字，规模
 *   随表现分档肉眼可辨；终章另盖朱砂印、闪帧、垂墨与震屏。演出只发生
 *   在换气口：余韵窗口内下落音符溶解暂停，窗口尾按真实时刻重新凝出。
 * - 下半区：音符沿钢琴几何的轨道下落（白键整列、黑键嵌列，ADR-0006），
 *   压线即判定（工单 01 行为沿用）。
 */

import type { Chart, ChartNote, Lane, NoteTint } from '../core/chart'
import { depthAt } from '../core/combat'
import { BATTLEFIELD } from '../core/config'
import { TINT_LABELS } from '../core/tints'
import type { KeyBinding } from '../core/keymap'
import type { MonsterView } from '../core/simulator'
import type { SustainEvent } from '../core/sustain'

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

/** 最近一次咬线（ADR-0011）：怪物向琴阵突进的可见反馈 */
export interface BiteFeedback {
  readonly at: number
  readonly monsterId: number
}

/** 最近一次扑空（ADR-0011）：Miss 的剑气劈进空处的可见反馈 */
export interface WhiffFeedback {
  readonly at: number
  readonly lane: Lane
}

/** 最近一次异色词缀（工单 09）：判定线上的色笔与怪物身上效果的可见反馈 */
export interface TintFeedback {
  readonly at: number
  readonly kind: NoteTint
  /** 触发它的音符所在键位（判定线上的色笔位置） */
  readonly lane: Lane | null
  /** 效果落到的怪物（爆音的受击放大、毒音的病灶标记） */
  readonly targetIds: readonly number[]
}

/** 最近一次琴心通明（工单 10）：战场区的一圈墨爆，与余韵的收势演出分开 */
export interface QinxinFeedback {
  readonly at: number
  readonly index: number
  readonly damage: number
  readonly targetIds: readonly number[]
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
  /** 最近挨的咬线（红晕 + 怪物突进反馈） */
  readonly bites: readonly BiteFeedback[]
  /** 最近一次扑空（判定线上的空劈斜笔） */
  readonly whiffs: readonly WhiffFeedback[]
  /** 最近的异色词缀触发（判定线色笔 + 怪物状态） */
  readonly tints: readonly TintFeedback[]
  /** 琴心蓄能进度（0..1；HUD 蓄能槽） */
  readonly qinxinGauge: number
  /** 最近的琴心通明（战场区墨爆） */
  readonly qinxins: readonly QinxinFeedback[]
  /* ── 余韵（工单 04）：近期余韵事件（含终章），渲染纯函数式消费 ── */
  readonly sustains: readonly SustainEvent[]
}

const FALL_SPEED = 340 // 音符下落速度（px/s）
const VISIBLE_AHEAD = 2.4 // 更远时刻的音符不绘制（秒）
const FLASH_LIFE = 0.7 // 判定闪示存续（秒）
const HIT_PULSE = 0.25 // 命中反馈存续（秒）
const SLAIN_FADE = 0.45 // 击杀淡出（秒）
const BITE_LIFE = 0.34 // 咬线突进与红晕（秒）
const WHIFF_LIFE = 0.4 // 扑空斜笔（秒）
const SWEEP_LIFE = 0.34 // AoE 剑气扫场纵深（秒）
/** 琴心（工单 10）：青碧色与墨爆存续——刻意与余韵的墨黑、终章的朱砂分开 */
const QINXIN_COLOR = '#3f6b63'
const QINXIN_LIFE = 0.85
/** 纵深 → 战场纵向几何：琴阵线（怪物停驻处）与战场最深处（生成处） */
const LINE_INSET = 46 // 琴阵线在下落区分界线之上的距离（px）
const FAR_Y_FRAC = 0.16 // 战场最深处的高度（占屏比）
const FAR_SCALE = 0.45 // 最深处怪物的尺寸比例（近大远小）

/* ── 余韵与终章演出（工单 04；规模分档肉眼可辨由这些参数拉开差距） ── */

/** 余韵窗口结束后演出残响（淡出尾巴；窗口内是主体） */
const SUSTAIN_TAIL = 0.7
/** 演出全程进度中题字（终章为朱砂印）浮现的时刻（drawSustain 第五节） */
const SUSTAIN_LABEL_P = 0.12
/** 受击顿帧：重击/击杀后战场的一瞬冻结（下落音符绝不同冻——节奏优先） */
const HIT_STOP = 0.075
/** 墨主登场演出的时长 */
const LORD_ENTRANCE = 1.1
/** 墨点粒子：速度衰减（指数阻力，闭式积分；粒子是无状态的确定性轨迹） */
const INK_DRAG = 2.6
/** 墨点粒子：重力下坠系数 */
const INK_GRAVITY = 110

/** 各档余韵的视觉参数（minor→grand 逐档拉开：粒子数、墨晕半径、笔势数、标签字号） */
const TIER_SHOW = [
  { label: '余韵', particles: 16, wash: 0.13, arcs: 1, labelSize: 30 },
  { label: '墨浪', particles: 52, wash: 0.24, arcs: 3, labelSize: 44 },
  { label: '剑鸣', particles: 110, wash: 0.38, arcs: 5, labelSize: 58 },
] as const

/** 终章（加强版）：在 grand 之上再放大，另配朱砂印章 */
const FINALE_SHOW = { label: '终章', particles: 180, wash: 0.52, arcs: 7, labelSize: 82 }

const PAPER = '#efe9dc'
const INK = '#37322a'
const DEEP_INK = '#1d1a15'
const FAINT_INK = 'rgba(55,50,42,0.10)'
const BLOOD = '#a03d2c'
const SERIF = '"Noto Serif SC", "Songti SC", "SimSun", serif'

/** 三色的墨色（工单 09）：寒音青、毒音苍、爆音朱——都压在水墨色域内，不抢纸面色 */
const TINT_STYLE: Record<NoteTint, { label: string; color: string; glow: string }> = {
  cold: { label: TINT_LABELS.cold, color: '#3d5f7d', glow: 'rgba(61,95,125,0.22)' },
  toxic: { label: TINT_LABELS.toxic, color: '#4a6b3a', glow: 'rgba(74,107,58,0.22)' },
  blast: { label: TINT_LABELS.blast, color: '#a8402c', glow: 'rgba(168,64,44,0.24)' },
}

/** 异色反馈的存续（秒）：色笔与题字 */
const TINT_LIFE = 0.55

const TIER_STYLE: Record<'Perfect' | 'Good' | 'Miss', { label: string; color: string }> = {
  Perfect: { label: '完美', color: '#8a6d1f' },
  Good: { label: '良好', color: '#37322a' },
  Miss: { label: '失误', color: '#a03d2c' },
}

const COUNT_NUMERALS = ['四', '三', '二', '一']

/** 一次余韵演出的全程时长（谱面时间轴）：主体窗口 + 残响尾巴 */
export function sustainLife(s: SustainEvent): number {
  return Math.max(0.35, s.windowEnd - s.time) + SUSTAIN_TAIL
}

/** 终章朱砂印的落印时刻（谱面时间轴）：音频壳据此准点调度印章音效（工单 06） */
export function finaleSealAt(s: SustainEvent): number {
  return s.time + SUSTAIN_LABEL_P * sustainLife(s)
}

/** 确定性伪随机 [0,1)（墨妖剪影、粒子、墨晕共用；因此帧间稳定、可复现） */
function hash2(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return x - Math.floor(x)
}

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

    // 终章震屏只作用于上半区演出（下落音符与 HUD 稳如磐石——节奏优先）
    const shake = this.finaleShake(m)
    ctx.save()
    if (shake !== null) ctx.translate(shake[0], shake[1])
    this.drawBattle(m, geom, W, H, zoneY)
    this.drawSustain(m, W, H, judgeY)
    ctx.restore()

    this.drawHud(m, geom, W, H, judgeY)
  }

  /** 终章/墨主爆裂的震屏偏移（衰减正弦，确定性） */
  private finaleShake(m: RenderModel): [number, number] | null {
    let origin: { at: number; amp: number } | null = null
    for (const s of m.sustains) {
      if (!s.finale) continue
      const age = m.t - s.time
      if (age >= 0 && age < 0.4) origin = { at: s.time, amp: 7 }
    }
    for (const s of m.slains) {
      const mo = m.monsters.find((x) => x.id === s.monsterId)
      if (mo === undefined || mo.kind !== 'inkLord') continue
      const age = m.t - s.at
      if (age >= 0 && age < 0.45) origin = { at: s.at, amp: 9 }
    }
    if (origin === null) return null
    const age = m.t - origin.at
    const decay = Math.max(0, 1 - age / 0.42)
    return [
      Math.sin(age * 68) * origin.amp * decay,
      Math.cos(age * 81) * origin.amp * 0.7 * decay,
    ]
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

  /** 下落区（沿用 01 行为，几何随谱面键区扩展；余韵窗口内音符暂停下落） */
  private drawField(
    m: RenderModel,
    geom: { lanes: readonly LaneGeom[]; fieldW: number; x0: number },
    judgeY: number,
  ): void {
    const { ctx } = this

    // 余韵窗口内：音符悬浮溶解（余光是给上半区演出的），窗口尾重新凝出
    const gate = this.sustainGate(m)

    // 按住键位的墨色淡染
    m.layout.forEach((binding) => {
      if (!m.held.has(binding.lane)) return
      const g = geom.lanes[binding.lane]!
      ctx.fillStyle = 'rgba(55,50,42,0.05)'
      ctx.fillRect(g.cx - g.width / 2, 0, g.width, judgeY)
    })

    // 白键列分隔线（黑键嵌列不再单独分格）；余韵中随全场降调
    ctx.strokeStyle = gate === null ? FAINT_INK : 'rgba(55,50,42,0.05)'
    ctx.lineWidth = 1
    const whites = geom.lanes.filter((l) => !l.black).length
    for (let i = 0; i <= whites; i += 1) {
      const x = Math.round(geom.x0 + i * (geom.fieldW / whites)) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, judgeY + 48)
      ctx.stroke()
    }

    // 判定线：主笔 + 淡晕（余韵中略敛）
    const lineDim = gate === null ? 1 : 0.55
    ctx.strokeStyle = `rgba(55,50,42,${0.08 * lineDim})`
    ctx.lineWidth = 14
    ctx.beginPath()
    ctx.moveTo(geom.x0 - 14, judgeY)
    ctx.lineTo(geom.x0 + geom.fieldW + 14, judgeY)
    ctx.stroke()
    ctx.globalAlpha = lineDim
    ctx.strokeStyle = INK
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(geom.x0 - 10, judgeY)
    ctx.lineTo(geom.x0 + geom.fieldW + 10, judgeY)
    ctx.stroke()
    ctx.globalAlpha = 1

    // 下落音符（黑键音块更窄更深，读作黑键）；
    // 余韵窗口内位置冻结在窗口起点、透明度走「溶解→凝出」包络——
    // 窗口尾声音符按真实时刻位置重新凝出（节奏无缝，跳变被零透明度掩去）
    for (const note of m.pending) {
      const dt = note.time - m.t
      if (dt > VISIBLE_AHEAD) continue
      const freezeAt = gate?.freezeAt
      const shownDt = freezeAt != null ? note.time - freezeAt : dt
      const y = judgeY - shownDt * FALL_SPEED
      const g = geom.lanes[note.lane]
      if (g === undefined) continue
      const noteH = 26
      if (y < -noteH - 20) continue
      const alpha = gate === null ? 1 : gate.alpha
      if (alpha <= 0.01) continue
      const noteW = g.width * (g.black ? 0.78 : 0.56)
      ctx.globalAlpha = alpha
      // 异色音符（工单 09）：色墨填充 + 外圈同色晕——余光里靠颜色分辨词缀
      const tintStyle = note.tint === undefined ? null : TINT_STYLE[note.tint]
      if (tintStyle !== null) {
        ctx.fillStyle = tintStyle.glow
        this.roundRect(g.cx - noteW / 2 - 6, y - noteH / 2 - 6, noteW + 12, noteH + 12, 10)
        ctx.fill()
      }
      ctx.fillStyle = tintStyle?.color ?? (g.black ? DEEP_INK : INK)
      this.roundRect(g.cx - noteW / 2, y - noteH / 2, noteW, noteH, 7)
      ctx.fill()
      ctx.strokeStyle = 'rgba(239,233,220,0.35)'
      ctx.lineWidth = 1.5
      this.roundRect(g.cx - noteW / 2 + 3, y - noteH / 2 + 3, noteW - 6, noteH - 6, 5)
      ctx.stroke()
      ctx.globalAlpha = 1
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

  /**
   * 上半区战场（工单 08：墨潮纵深推进，ADR-0011/0012）：多怪按纵深排布
   * （近大远小），琴阵为一条横贯键区的墨线；剑气命中即自琴阵向深处
   * 扫出衰减墨浪（AoE 视觉），到线怪物咬线时向琴阵突进；击杀原地泼墨。
   * 横向散布由 id 的确定性 hash 生成（仅视觉，与模拟器无关，ADR-0012）。
   */
  private drawBattle(
    m: RenderModel,
    geom: { lanes: readonly LaneGeom[]; fieldW: number; x0: number },
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

    const lineY = zoneY - LINE_INSET
    const farY = H * FAR_Y_FRAC
    const baseR = Math.min(H * 0.085, W * 0.075, 84)

    // 琴阵（GLOSSARY）：怪物停驻并开始咬人的防线——主笔 + 淡晕
    ctx.strokeStyle = 'rgba(55,50,42,0.07)'
    ctx.lineWidth = 12
    ctx.beginPath()
    ctx.moveTo(geom.x0 - 12, lineY)
    ctx.lineTo(geom.x0 + geom.fieldW + 12, lineY)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(55,50,42,0.4)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(geom.x0 - 8, lineY)
    ctx.lineTo(geom.x0 + geom.fieldW + 8, lineY)
    ctx.stroke()

    // 纵深 → 屏上位置：近（琴阵）大、远（深处）小；横向散布仅视觉
    const place = (monster: MonsterView, at: number): { x: number; y: number; r: number } => {
      const f = depthAt(monster.spawnAt, at, monster.holdBack) / BATTLEFIELD.SPAWN_DEPTH
      const lateral = hash2(monster.id * 13 + 5, 91) * 2 - 1
      return {
        x: W / 2 + lateral * geom.fieldW * 0.36,
        y: lineY - (lineY - farY) * f,
        r: baseR * (1 - (1 - FAR_SCALE) * f),
      }
    }

    // 受击顿帧：重击/击杀后战场时间冻结一瞬（音符流绝不同冻，节奏优先）
    let tBattle = m.t
    for (const h of m.hits) {
      if (!h.chord) continue
      if (m.t - h.at >= 0 && m.t - h.at < HIT_STOP) tBattle = Math.min(tBattle, h.at)
    }
    for (const s of m.slains) {
      if (m.t - s.at >= 0 && m.t - s.at < HIT_STOP) tBattle = Math.min(tBattle, s.at)
    }

    // AoE 剑气扫场（ADR-0012 视觉）：自琴阵向深处推进的衰减墨浪，
    // 一击一道；和弦重击的浪更厚。纵深越大浪越淡——衰减的直读。
    for (const h of m.hits) {
      const age = m.t - h.at
      if (age < 0 || age > SWEEP_LIFE) continue
      const p = age / SWEEP_LIFE
      const y = lineY - (lineY - farY) * p
      const fade = (1 - p) ** 1.4
      ctx.globalAlpha = 0.15 * fade * (h.chord ? 1.6 : 1)
      ctx.fillStyle = DEEP_INK
      ctx.beginPath()
      ctx.ellipse(W / 2, y, geom.fieldW * 0.58, 10 + 20 * (1 - p) * (h.chord ? 1.5 : 1), 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }

    // 琴心通明（工单 10）：战场中央炸开一圈青碧墨环 + 六道辐射笔。
    // 与余韵（判定线升腾的墨浪 + 题字）、终章（朱砂印 + 闪帧）刻意分开；
    // 只发生在战场区——下落音符与判定线一律不动（不抢注意力）。
    for (const q of m.qinxins) {
      const age = m.t - q.at
      if (age < 0 || age > QINXIN_LIFE) continue
      const p = age / QINXIN_LIFE
      const cx = W / 2
      const cy = (lineY + farY) / 2
      const radius = geom.fieldW * (0.08 + 0.5 * p)
      ctx.globalAlpha = (1 - p) ** 1.5 * 0.5
      ctx.strokeStyle = QINXIN_COLOR
      ctx.lineWidth = 10 * (1 - p) + 1.5
      ctx.beginPath()
      ctx.ellipse(cx, cy, radius, radius * 0.62, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = (1 - p) ** 2 * 0.55
      ctx.lineWidth = 3 * (1 - p) + 1
      for (let k = 0; k < 6; k += 1) {
        const angle = (k / 6) * Math.PI * 2 + q.index * 0.4
        const inner = radius * 0.55
        const outer = radius * (1.05 + 0.2 * hash2(q.index, k))
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner * 0.62)
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer * 0.62)
        ctx.stroke()
      }
      // 题字压在墨环中央：不碰连击数字（屏幕上方）也不碰判定线（下方）
      ctx.globalAlpha = (1 - p) ** 1.6
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '700 22px ' + SERIF
      ctx.fillStyle = QINXIN_COLOR
      ctx.fillText('琴心通明', cx, cy + 2)
      ctx.globalAlpha = 1
    }

    // 活着的怪：自深处向琴阵绘制（远的先画，近的盖在上面）
    const alive = m.monsters
      .filter((mo) => mo.spawnAt <= m.t && mo.hp > 0)
      .map((mo) => ({ mo, pos: place(mo, tBattle) }))
      .sort((a, b) => b.pos.y - a.pos.y)
    for (const { mo, pos } of alive) {
      // 咬线突进：向琴阵方向的一记前扑（sin 半周往复）
      let lunge = 0
      for (const b of m.bites) {
        if (b.monsterId !== mo.id) continue
        const age = m.t - b.at
        if (age < 0 || age > BITE_LIFE) continue
        lunge = Math.max(lunge, Math.sin(Math.PI * (age / BITE_LIFE)) * 24)
      }
      this.drawMonster(m, mo, pos.x, pos.y + lunge, pos.r, 1, tBattle)
    }

    // 墨主登场：自上而下落位 + 墨晕收拢（在它自己的纵深位上）
    for (const { mo, pos } of alive) {
      if (mo.kind !== 'inkLord') continue
      const age = m.t - mo.spawnAt
      if (age < 0 || age >= LORD_ENTRANCE) continue
      const gather = 1 - age / LORD_ENTRANCE
      ctx.globalAlpha = 0.22 * gather
      ctx.fillStyle = '#14110d'
      this.inkBlob(pos.x, pos.y, pos.r * (1.6 + gather * 2), 99, 0.85)
      ctx.fill()
      ctx.globalAlpha = 1
    }

    // 咬线红晕：琴阵线上被咬位置的朱砂一闪（眼皮底下的警报）
    for (const b of m.bites) {
      const age = m.t - b.at
      if (age < 0 || age > BITE_LIFE) continue
      const mo = m.monsters.find((x) => x.id === b.monsterId)
      if (mo === undefined) continue
      const pos = place(mo, m.t)
      const decay = 1 - age / BITE_LIFE
      ctx.globalAlpha = 0.5 * decay
      ctx.strokeStyle = BLOOD
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(pos.x - 30 * decay, lineY)
      ctx.lineTo(pos.x + 30 * decay, lineY)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // 近期击杀：原地放大淡出 + 下坠 + 泼墨；墨主死亡大爆裂
    for (const s of m.slains) {
      const age = m.t - s.at
      if (age < 0 || age > SLAIN_FADE) continue
      const mo = m.monsters.find((x) => x.id === s.monsterId)
      if (mo === undefined) continue
      const lord = mo.kind === 'inkLord'
      const pos = place(mo, s.at)
      this.drawMonster(
        m,
        mo,
        pos.x,
        pos.y + age * 60,
        pos.r * (1 + age * 1.6),
        1 - age / SLAIN_FADE,
        tBattle,
      )
      const spray = lord ? 46 : 14
      const speed = lord ? 520 : 300
      this.inkSpray(m.t, s.at, pos.x, pos.y, spray, speed, s.monsterId * 31 + 7, 0.9)
      if (lord) {
        const p = Math.min(1, age / SLAIN_FADE)
        ctx.globalAlpha = (1 - p) ** 1.6 * 0.5
        ctx.fillStyle = '#14110d'
        this.inkBlob(pos.x, pos.y, pos.r * (1.8 + p * 3.6), s.monsterId * 17 + 3, 0.8)
        ctx.fill()
        ctx.globalAlpha = (1 - p) ** 1.4
        ctx.strokeStyle = '#14110d'
        ctx.lineWidth = 10 * (1 - p) + 1
        ctx.beginPath()
        ctx.ellipse(pos.x, pos.y, pos.r * (0.8 + p * 4), pos.r * (0.8 + p * 4) * 0.72, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = Math.max(0, 1 - age / 0.1) * 0.5
        ctx.fillStyle = PAPER
        ctx.fillRect(0, 0, W, H)
        ctx.globalAlpha = 1
      }
    }
  }

  /** 程序绘制墨色剪影（帧间确定性轮廓 + 极慢呼吸；tAnim 供顿帧冻结呼吸） */
  private drawMonster(
    m: RenderModel,
    monster: MonsterView,
    cx: number,
    cy: number,
    radius: number,
    alpha: number,
    tAnim?: number,
  ): void {
    const { ctx } = this
    const lord = monster.kind === 'inkLord'
    const t = tAnim ?? m.t

    // 受击脉冲（AoE：全场都挨，最前怪吃满、后排按衰减折扣）：缩放 + 纸色闪
    let punch = 0
    let flash = 0
    let heavy = false
    for (const hit of m.hits) {
      const age = m.t - hit.at
      if (age < 0 || age > HIT_PULSE) continue
      const decay = 1 - age / HIT_PULSE
      const isFront = hit.monsterId === monster.id
      const share = isFront ? 1 : 0.45
      punch = Math.max(punch, (hit.chord ? 0.22 : 0.1) * decay * share)
      flash = Math.max(flash, decay * share)
      if (isFront && hit.chord) heavy = true
    }

    // 爆音命中当作重击闪（工单 09）：朱色重击没有剑气事件，反馈走词缀流
    let blastMark = 0
    for (const tint of m.tints) {
      const age = m.t - tint.at
      if (age < 0 || age > HIT_PULSE) continue
      if (tint.kind !== 'blast' || !tint.targetIds.includes(monster.id)) continue
      const decay = 1 - age / HIT_PULSE
      punch = Math.max(punch, 0.24 * decay)
      flash = Math.max(flash, decay)
      blastMark = Math.max(blastMark, decay)
    }
    if (blastMark > 0) heavy = true

    const r = radius * (1 + punch)
    ctx.save()
    ctx.globalAlpha = alpha

    // 剪影主体：确定性墨团轮廓（与墨晕同族的 hash 噪声扰动，帧间稳定）
    ctx.fillStyle = lord ? '#14110d' : INK
    ctx.beginPath()
    const points = 9
    for (let k = 0; k <= points; k += 1) {
      const angle = (k / points) * Math.PI * 2
      const wob = 0.82 + 0.22 * hash2(monster.id, k % points)
      const breathe = 1 + 0.02 * Math.sin(t * 1.8 + k * 1.3)
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

    // 寒音减速：青霜环（减速持续期内可见，余光读作「冻住了」）
    if (monster.slowedUntil !== null && m.t < monster.slowedUntil) {
      const left = monster.slowedUntil - m.t
      ctx.globalAlpha = alpha * Math.min(0.6, 0.25 + left * 0.08)
      ctx.strokeStyle = TINT_STYLE.cold.color
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.ellipse(cx, cy + r * 0.08, r * 1.16, r * 0.96, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = alpha
    }

    // 毒音：苍绿病灶（心口一点 + 三道垂滴）
    if (monster.poisonUntil !== null && m.t < monster.poisonUntil) {
      ctx.globalAlpha = alpha * 0.85
      ctx.fillStyle = TINT_STYLE.toxic.color
      ctx.beginPath()
      ctx.ellipse(cx, cy + r * 0.05, r * 0.26, r * 0.2, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = TINT_STYLE.toxic.color
      ctx.lineWidth = Math.max(1.5, r * 0.05)
      for (const dx of [-0.4, 0, 0.4]) {
        const drip = ((m.t * 0.7 + dx * 2) % 1) * r * 0.5
        ctx.beginPath()
        ctx.moveTo(cx + dx * r, cy + r * 0.3)
        ctx.lineTo(cx + dx * r, cy + r * 0.3 + drip)
        ctx.stroke()
      }
      ctx.globalAlpha = alpha
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
    const barW = Math.max(r * 2.4, 64)
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

    // 琴心蓄能槽（工单 10）：HP 条底下一条青碧细槽——余光可读，满格即放
    const gaugeW = Math.min(240, W * 0.22)
    const gaugeH = 9
    const gaugeX = 18
    const gaugeY = 20
    const gaugeFrac = Math.max(0, Math.min(1, m.qinxinGauge))
    ctx.fillStyle = 'rgba(63,107,99,0.16)'
    this.roundRect(gaugeX, gaugeY, gaugeW, gaugeH, 5)
    ctx.fill()
    if (gaugeFrac > 0) {
      ctx.fillStyle = QINXIN_COLOR
      this.roundRect(gaugeX, gaugeY, gaugeW * gaugeFrac, gaugeH, 5)
      ctx.fill()
    }
    // 快满时的一记呼吸：槽要满了，肉眼能提前看到
    if (gaugeFrac > 0.82) {
      ctx.globalAlpha = 0.2 + 0.2 * (0.5 + 0.5 * Math.sin(m.t * 9))
      ctx.fillStyle = QINXIN_COLOR
      this.roundRect(gaugeX, gaugeY, gaugeW * gaugeFrac, gaugeH, 5)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.font = '400 12px ' + SERIF
    ctx.fillStyle = 'rgba(63,107,99,0.9)'
    ctx.fillText('琴心', gaugeX + gaugeW + 10, gaugeY + gaugeH / 2)

    // 被咬反馈：判定区上缘泛红渐隐（眼皮底下的警报——血量只在被咬时下降）
    for (const b of m.bites) {
      const age = m.t - b.at
      if (age < 0 || age > BITE_LIFE) continue
      const decay = 1 - age / BITE_LIFE
      const grad = ctx.createLinearGradient(0, judgeY, 0, judgeY - 140)
      grad.addColorStop(0, `rgba(160,61,44,${0.4 * decay})`)
      grad.addColorStop(1, 'rgba(160,61,44,0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, judgeY - 140, W, 140)
    }

    // 扑空斜笔（ADR-0011）：Miss 的剑气劈进空处——一道斜墨急扫即逝
    for (const wf of m.whiffs) {
      const age = m.t - wf.at
      if (age < 0 || age > WHIFF_LIFE) continue
      const p = age / WHIFF_LIFE
      const lx = geom.lanes[wf.lane]!.cx
      ctx.globalAlpha = (1 - p) ** 1.6
      ctx.strokeStyle = 'rgba(55,50,42,0.5)'
      ctx.lineWidth = 7 * (1 - p) + 1
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(lx - 26, judgeY - 18 - p * 26)
      ctx.lineTo(lx + 20, judgeY - 52 - p * 26)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // 异色词缀的色笔与题字（工单 09）：判定线上方一撇同色墨 + 三色名
    for (const tint of m.tints) {
      const age = m.t - tint.at
      if (age < 0 || age > TINT_LIFE) continue
      const style = TINT_STYLE[tint.kind]
      const p = age / TINT_LIFE
      const lx = tint.lane === null ? W / 2 : (geom.lanes[tint.lane]?.cx ?? W / 2)
      ctx.globalAlpha = (1 - p) ** 1.4
      ctx.strokeStyle = style.color
      ctx.lineWidth = 8 * (1 - p) + 1.5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(lx - 30, judgeY - 8 - p * 18)
      ctx.lineTo(lx + 26, judgeY - 46 - p * 30)
      ctx.stroke()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '700 22px ' + SERIF
      ctx.fillStyle = style.color
      // 题字抬到判定闪示之上（避免与「完美/良好」叠字），并随笔画上浮
      ctx.fillText(style.label, lx, judgeY - 122 - p * 30)
      ctx.globalAlpha = 1
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

  /* ── 余韵与终章演出（工单 04 的情绪核心；全部程序绘制，无外部素材） ── */

  /**
   * 余韵窗口的下落区闸门：窗口内音符「溶解→凝出」的透明度包络与冻结时刻。
   * 窗口头 22% 音符悬浮原地渐隐（余光让给上半区演出），
   * 窗口尾 22% 在真实时刻位置重新凝出（节奏无缝——恢复时零跳变可见）。
   */
  private sustainGate(m: RenderModel): { alpha: number; freezeAt: number | null } | null {
    for (const s of m.sustains) {
      if (m.t < s.time || m.t > s.windowEnd) continue
      const w = (m.t - s.time) / Math.max(1e-6, s.windowEnd - s.time)
      if (w < 0.22) {
        return { alpha: 1 - w / 0.22, freezeAt: s.time }
      }
      if (w > 0.78) {
        return { alpha: (w - 0.78) / 0.22, freezeAt: null }
      }
      return { alpha: 0, freezeAt: s.time }
    }
    return null
  }

  /** 余韵演出：本句剑气自判定线升腾、于战场一次性引爆的水墨收势 */
  private drawSustain(m: RenderModel, W: number, H: number, judgeY: number): void {
    const { ctx } = this
    const cy = H * 0.3
    const baseR = Math.min(H * 0.1, W * 0.09, 96)

    for (const s of m.sustains) {
      const age = m.t - s.time
      const life = sustainLife(s)
      if (age < 0 || age > life) continue

      const tierIndex = s.tier === 'grand' ? 2 : s.tier === 'major' ? 1 : 0
      const show = s.finale ? FINALE_SHOW : TIER_SHOW[tierIndex]
      const p = age / life // 全程进度 0..1
      const burstAge = Math.min(age, life - SUSTAIN_TAIL * 0.2) // 爆发段进度基准
      const burstP = burstAge / (life - SUSTAIN_TAIL * 0.2)

      // 一、剑气升腾：自判定线中心冲上战场的墨色急笔（爆发的引信）
      if (age < life * 0.34) {
        const rise = Math.min(1, age / (life * 0.26))
        const env = rise < 1 ? rise * rise : Math.max(0, 1 - (age - life * 0.26) / (life * 0.08))
        const topY = judgeY - (judgeY - cy) * rise
        ctx.globalAlpha = 0.75 * env
        ctx.fillStyle = DEEP_INK
        const wHalf = 10 + show.arcs * 5
        ctx.beginPath()
        ctx.moveTo(W / 2 - wHalf, judgeY)
        ctx.quadraticCurveTo(W / 2 - wHalf * 0.4, (judgeY + topY) / 2, W / 2 - wHalf * 0.25, topY)
        ctx.lineTo(W / 2 + wHalf * 0.25, topY)
        ctx.quadraticCurveTo(W / 2 + wHalf * 0.4, (judgeY + topY) / 2, W / 2 + wHalf, judgeY)
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // 二、墨晕炸开：多层不规则墨团自爆点涌出（规模的主体读数）
      const washR = baseR * show.wash * Math.min(W, H) / 260
      const washGrow = 1 - Math.exp(-2.6 * burstP)
      const washFade = (1 - burstP) ** 1.5
      if (washFade > 0.01) {
        for (const [mul, alphaMul, seed] of [
          [1.0, 0.34, s.phraseId * 13 + 1],
          [0.66, 0.5, s.phraseId * 13 + 2],
          [0.38, 0.66, s.phraseId * 13 + 3],
        ] as const) {
          ctx.globalAlpha = washFade * alphaMul * (s.finale ? 1.25 : 1)
          ctx.fillStyle = s.finale ? '#14110d' : INK
          this.inkBlob(W / 2, cy, washR * mul * washGrow, seed, 0.82)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }

      // 三、剑气笔势：数道弧形墨笔绕爆点扫出（档位越高笔势越多越阔）
      if (burstP > 0.05 && burstP < 1) {
        for (let i = 0; i < show.arcs; i += 1) {
          const seed = s.phraseId * 61 + i
          const base = hash2(seed, 1) * Math.PI * 2
          const sweep = 0.9 + hash2(seed, 2) * 1.2
          const r0 = washR * (0.5 + 0.6 * hash2(seed, 3))
          const grow = r0 + washR * 1.35 * burstP
          const env = Math.sin(Math.PI * Math.min(1, burstP / 0.85))
          ctx.globalAlpha = 0.5 * env
          ctx.strokeStyle = DEEP_INK
          ctx.lineWidth = 3 + 7 * (1 - burstP) * (s.finale ? 1.4 : 1)
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.ellipse(W / 2, cy, grow, grow * 0.78, 0, base, base + sweep * env + 0.25)
          ctx.stroke()
          ctx.globalAlpha = 1
        }
      }

      // 四、墨点粒子：自爆点泼洒、带阻力与坠感的墨滴（闭式轨迹，无状态）
      this.inkSpray(
        m.t,
        s.time,
        W / 2,
        cy,
        show.particles,
        s.finale ? 640 : 180 + tierIndex * 170,
        s.phraseId * 97 + 11,
        life,
      )

      // 五、档位题字：小韵淡题、剑鸣大书；终章另盖朱砂印
      const labelEnv = Math.sin(Math.PI * Math.min(1, Math.max(0, (p - SUSTAIN_LABEL_P) / (1 - SUSTAIN_LABEL_P))))
      if (labelEnv > 0.01) {
        const size = show.labelSize
        const y = cy + baseR * 0.2 - p * 30
        ctx.globalAlpha = labelEnv
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        if (s.finale) {
          // 朱砂印章：终章两字入印，落印时略缩（盖章感）
          const stamp = 1 + 0.35 * Math.max(0, 1 - age / 0.14)
          const pad = size * 0.42
          ctx.save()
          ctx.translate(W / 2, y)
          ctx.scale(stamp, stamp)
          ctx.fillStyle = 'rgba(160,61,44,0.92)'
          const w = size * 2 + pad * 2
          const h = size * 1.5
          this.roundRect(-w / 2, -h / 2, w, h, 7)
          ctx.fill()
          ctx.fillStyle = PAPER
          ctx.font = `700 ${size}px ${SERIF}`
          ctx.fillText(show.label, 0, size * 0.04)
          ctx.restore()
        } else {
          ctx.font = `700 ${size}px ${SERIF}`
          ctx.fillStyle = s.tier === 'grand' ? DEEP_INK : 'rgba(55,50,42,0.8)'
          ctx.fillText(show.label, W / 2, y)
        }
        ctx.globalAlpha = 1
      }

      // 六、终章独有：纸色闪帧 + 四角垂墨（银幕级的收幕）
      if (s.finale) {
        const flash = Math.max(0, 1 - age / 0.1)
        if (flash > 0) {
          ctx.globalAlpha = flash * 0.4
          ctx.fillStyle = PAPER
          ctx.fillRect(0, 0, W, H)
          ctx.globalAlpha = 1
        }
        const bleed = Math.min(1, p * 1.4)
        ctx.globalAlpha = 0.16 * (1 - p * 0.5)
        ctx.fillStyle = '#14110d'
        for (const [cx0, cy0, seed] of [
          [0, 0, 5],
          [W, 0, 6],
          [0, H, 7],
          [W, H, 8],
        ] as const) {
          this.inkBlob(cx0, cy0, Math.min(W, H) * 0.3 * bleed + 20, seed + s.phraseId, 1)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }
    }
  }

  /**
   * 墨点粒子泼溅：自 (ox, oy) 于 t0 引爆的 count 滴墨点。
   * 每滴的方向/速度由确定性 hash 决定，轨迹为带指数阻力的闭式解
   * （渲染无状态：任意时刻从 t 反解位置），生命 life 秒内渐坠渐隐。
   */
  private inkSpray(
    t: number,
    t0: number,
    ox: number,
    oy: number,
    count: number,
    speed: number,
    seed: number,
    life: number,
  ): void {
    const { ctx } = this
    const age = t - t0
    if (age < 0 || age > life) return
    ctx.fillStyle = DEEP_INK
    for (let i = 0; i < count; i += 1) {
      const angle = hash2(seed, i) * Math.PI * 2
      const v0 = speed * (0.3 + 0.7 * hash2(seed + 1, i))
      const dt = age
      const travel = (v0 * (1 - Math.exp(-INK_DRAG * dt))) / INK_DRAG
      const fall = INK_GRAVITY * dt * dt * 0.5 * (0.4 + 0.6 * hash2(seed + 2, i))
      const x = ox + Math.cos(angle) * travel
      const y = oy + Math.sin(angle) * travel * 0.8 + fall
      const fade = Math.max(0, 1 - age / life) ** 1.4
      if (fade <= 0.02) continue
      // 尾迹：短划读作墨滴飞溅的方向感
      const tailDt = Math.max(0, dt - 0.045)
      const tailTravel = (v0 * (1 - Math.exp(-INK_DRAG * tailDt))) / INK_DRAG
      const tailFall = INK_GRAVITY * tailDt * tailDt * 0.5 * (0.4 + 0.6 * hash2(seed + 2, i))
      const tx = ox + Math.cos(angle) * tailTravel
      const ty = oy + Math.sin(angle) * tailTravel * 0.8 + tailFall
      ctx.globalAlpha = fade * 0.85
      ctx.strokeStyle = DEEP_INK
      ctx.lineWidth = 1 + 2.6 * hash2(seed + 3, i) * fade
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(tx, ty)
      ctx.lineTo(x, y)
      ctx.stroke()
      ctx.globalAlpha = fade
      ctx.beginPath()
      ctx.arc(x, y, 0.8 + 2.8 * hash2(seed + 3, i) * fade, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  /** 不规则墨团轮廓：hash 噪声扰动的水墨边缘（与墨妖剪影同族的确定性形状） */
  private inkBlob(cx: number, cy: number, r: number, seed: number, squish: number): void {
    const { ctx } = this
    ctx.beginPath()
    const points = 11
    for (let k = 0; k <= points; k += 1) {
      const angle = (k / points) * Math.PI * 2
      const wob = 0.78 + 0.34 * hash2(seed, k % points)
      const rr = r * wob
      const x = cx + Math.cos(angle) * rr
      const y = cy + Math.sin(angle) * rr * squish
      if (k === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }
}
