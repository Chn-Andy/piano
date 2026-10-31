/**
 * HUD 几何（工单 16 / 票 17）：把各状态读数的锚位收敛成纯矩形，渲染层照此绘制。
 *
 * 为什么要独立成模块：票 17 的验收要求「1440×900 与 800×600 下进度轨、
 * 两侧蓄能槽、底部气血条、键位标签互不重叠」。画布像素在 node 里断言不了，
 * 但「谁占哪块矩形」是纯几何——常量放这里，渲染与测试用同一份，
 * 将来谁把轨往下挪、把槽拉高，都会先撞在 hudGeometry.test 上。
 *
 * 锚位规则见 ADR-0014：状态一律压在下半区；**进度轨是唯一例外**，回屏幕
 * 最顶边（理由见 renderer.drawProgressRail 的注释）。
 */

/** 轴对齐矩形（CSS 像素） */
export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** 判定线高度（屏高比例；ADR-0013 的判定带以它为基准） */
export const JUDGE_Y_FRAC = 0.8
/** 战场 / 下落区分界（屏高比例） */
export const ZONE_Y_FRAC = 0.5

/* ── 进度轨（票 17）───────────────────────────────────────────────────
 * 贴屏幕最顶边的一条细轨：上下留白、左右留边距，读数在轨下沿两侧。
 * 轨与读数合起来的整条带（railBand）是判定重叠的依据。
 */
const RAIL_INSET = 22 // 左右边距
const RAIL_TOP = 10 // 轨顶离屏幕上缘
const RAIL_HEIGHT = 3 // 轨厚（票面：≤ 4px）
const RAIL_READING_GAP = 13 // 读数基线离轨下沿
const RAIL_CUE_GAP = 22 // 句提示基线离轨下沿
const RAIL_BAND_TOP = 6 // 视觉带的保守上界（含字面）
const RAIL_BAND_HEIGHT = 36 // 视觉带高度：轨 + 两端读数 + 句提示

/* ── 下半区锚位（ADR-0014，工单 16 定案） ─────────────────────────── */
const SIDE_INSET = 16 // 蓄能槽离屏幕边缘
const SIDE_WIDTH = 20 // 蓄能槽宽（竖直条）
const SIDE_TOP_FRAC = 0.5 // 蓄能槽顶端（屏高比例）
const SIDE_BOTTOM_GAP = 26 // 蓄能槽底端离判定线
const SIDE_LABEL_ROOM = 24 // 槽顶读数占的高度（读数基线在槽顶上方 10px）
const HP_HEIGHT = 18 // 气血条厚度
const HP_BOTTOM = 24 // 气血条下沿离屏幕底边
const HP_LABEL_ROOM = 21 // 条上方标签占的高度（基线在条上方 8px）
const HP_JUDGE_CLEARANCE = 58 // 矮窗口里气血条最多压到判定线下方 58px
const KEY_LABEL_TOP = 15 // 键位标签带的上界（相对判定线；白键字身）
const KEY_LABEL_HEIGHT = 35 // 含按住时的下划线与字身

/** 键区宽度：白键均分整列（最宽 104、最窄 38），黑键嵌在白键之间 */
export function keyFieldWidth(W: number, whites: number): number {
  const whiteW = Math.max(38, Math.min(104, W / (whites + 1)))
  return whiteW * whites
}

/** 蓄能槽的一侧：slot 是画出来的槽，band 另含槽顶读数（数量重叠判定用 band） */
export interface QinxinSide {
  readonly slot: Rect
  readonly band: Rect
}

/** 一帧的全部 HUD 锚位 */
export interface HudLayout {
  readonly judgeY: number
  /** 进度轨本体（贴顶细条） */
  readonly rail: Rect
  /** 进度轨的视觉带：轨 + 两端 m:ss 读数 + 句提示 */
  readonly railBand: Rect
  /** 轨两端读数的基线（左端已过、右端总长） */
  readonly railReadingBaseline: number
  /** 句提示的基线 */
  readonly railCueBaseline: number
  readonly qinxin: { readonly left: QinxinSide; readonly right: QinxinSide }
  /** 气血条本体 */
  readonly hpBar: Rect
  /** 气血条 + 条上方标签 */
  readonly hpBand: Rect
  /** 键位标签（含按住时的下划线） */
  readonly keyLabels: Rect
  /** 下落区（分界线到判定线）：轨绝不能进来 */
  readonly fallingZone: Rect
}

/**
 * 布局记忆化（v1.4 审查 C1）：锚位只随 (W, H, 白键数) 变，而渲染每帧都在
 * 调它——逐帧重建一堆对象没有意义。只缓存最近一档（换分辨率/换曲目时重算
 * 一次就够，不必背一张表）。
 */
let hudCache: { readonly key: string; readonly layout: HudLayout } | null = null

/**
 * 一帧的全部 HUD 锚位（按尺寸记忆化：同一 (W,H,whites) 返回同一个对象）。
 * 调用方不得修改返回对象（只读接口）。
 */
export function hudLayout(W: number, H: number, whites: number): HudLayout {
  const key = `${W}×${H}:${whites}`
  if (hudCache !== null && hudCache.key === key) return hudCache.layout
  const layout = computeHudLayout(W, H, whites)
  hudCache = { key, layout }
  return layout
}

/** 真正算一遍锚位（纯函数；记忆化外壳见上） */
function computeHudLayout(W: number, H: number, whites: number): HudLayout {
  const judgeY = H * JUDGE_Y_FRAC
  const zoneY = H * ZONE_Y_FRAC
  const fieldW = keyFieldWidth(W, whites)
  const fieldX = (W - fieldW) / 2

  // 进度轨：左右留边距、与顶边留白，读数与句提示压在轨下沿
  const rail: Rect = {
    x: RAIL_INSET,
    y: RAIL_TOP,
    w: Math.max(0, W - RAIL_INSET * 2),
    h: RAIL_HEIGHT,
  }
  const railBand: Rect = {
    x: RAIL_INSET - 6,
    y: RAIL_BAND_TOP,
    w: Math.max(0, W - (RAIL_INSET - 6) * 2),
    h: RAIL_BAND_HEIGHT,
  }

  // 琴心蓄能：自下而上，槽顶读数印在槽上方
  const slotBottom = Math.round(judgeY - SIDE_BOTTOM_GAP)
  const slotH = Math.max(SIDE_WIDTH * 2, slotBottom - Math.round(H * SIDE_TOP_FRAC))
  const slotY = slotBottom - slotH
  const side = (x: number): QinxinSide => ({
    slot: { x, y: slotY, w: SIDE_WIDTH, h: slotH },
    band: { x, y: slotY - SIDE_LABEL_ROOM, w: SIDE_WIDTH, h: slotH + SIDE_LABEL_ROOM },
  })
  const qinxin = {
    left: side(SIDE_INSET),
    right: side(W - SIDE_INSET - SIDE_WIDTH),
  }

  // 气血条：贴底通栏（宽度取键区与半屏的较小者），矮窗口里不许压到键位标签
  const barW = Math.min(fieldW, W * 0.5)
  const hpBar: Rect = {
    x: (W - barW) / 2,
    y: Math.max(judgeY + HP_JUDGE_CLEARANCE, H - HP_BOTTOM - HP_HEIGHT),
    w: barW,
    h: HP_HEIGHT,
  }
  const hpBand: Rect = {
    x: hpBar.x,
    y: hpBar.y - HP_LABEL_ROOM,
    w: hpBar.w,
    h: hpBar.h + HP_LABEL_ROOM,
  }

  const keyLabels: Rect = {
    x: fieldX,
    y: judgeY + KEY_LABEL_TOP,
    w: fieldW,
    h: KEY_LABEL_HEIGHT,
  }

  return {
    judgeY,
    rail,
    railBand,
    railReadingBaseline: rail.y + rail.h + RAIL_READING_GAP,
    railCueBaseline: rail.y + rail.h + RAIL_CUE_GAP,
    qinxin,
    hpBar,
    hpBand,
    keyLabels,
    fallingZone: { x: 0, y: zoneY, w: W, h: judgeY - zoneY },
  }
}

/** 两矩形是否相交（边贴边不算） */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}
