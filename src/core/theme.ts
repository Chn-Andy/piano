/**
 * 战斗主题调色板（v1.6，ADR-0019）。
 *
 * 渲染器原来的纸/墨/深墨是模块常量；主题曲要换一套底色与强调色，但**默认主题
 * 必须逐字段等于旧常量**——现有三首的像素输出因此不变。主题只在战斗 canvas
 * 生效（菜单/结算/曲库是 DOM，不读这份数据）。
 *
 * 只放「底色与装饰」的颜色：判定三档与异色三色的色相是玩法语义，不随主题换。
 */

/** 怪物皮肤：默认是墨色刺客；主题曲是水墨可爱的山贼动物 */
export type MonsterSkin = 'ink' | 'animal'

export interface BattleTheme {
  /** 主题标识（调试/测试用） */
  readonly id: string
  /** 纸面底色 */
  readonly paper: string
  /** 墨色（音符、线条、怪物、HUD 主色） */
  readonly ink: string
  /** 深墨（黑键、重音、暗部） */
  readonly deepInk: string
  /** 强调色（墨主朱砂位、动物腮红/头巾；不用于判定与异色） */
  readonly accent: string
  /** 金色点缀（动物头巾、印章高光） */
  readonly gold: string
  /** 怪物皮肤 */
  readonly monsterSkin: MonsterSkin
}

/** 默认水墨主题：色值与 v1.5 的模块常量逐一相同 */
export const DEFAULT_THEME: BattleTheme = {
  id: 'ink',
  paper: '#efe9dc',
  ink: '#37322a',
  deepInk: '#1d1a15',
  accent: '#a03d2c',
  gold: '#8a6d1f',
  monsterSkin: 'ink',
}

/**
 * 《猪侠漫游记》主题（ADR-0019）：A 的浅绿纸 + C 的亮粉。
 * 纸/墨来自配色稿 A（纸色实机加深到 #dce8cd，抵消纸纹高光），粉色强调来自 C，
 * 金色仍用 A；怪物换成可爱动物。
 */
export const ZHUXIA_THEME: BattleTheme = {
  id: 'zhuxia',
  paper: '#dce8cd',
  ink: '#25332b',
  deepInk: '#16211b',
  accent: '#e08fa5',
  gold: '#d9ad55',
  monsterSkin: 'animal',
}

function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (m === null) throw new Error(`主题色必须是 6 位十六进制: ${hex}`)
  const n = Number.parseInt(m[1]!, 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function toHex(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

/** 两色线性插值（t=0 默认、t=1 主题；边界夹紧） */
export function mixHex(from: string, to: string, t: number): string {
  if (t <= 0) return from
  if (t >= 1) return to
  const a = parseHex(from)
  const b = parseHex(to)
  return toHex([
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ])
}

/** 主题的 RGB 字符串（渲染层给 rgba() 用） */
export function themeRgb(theme: BattleTheme, key: 'ink' | 'deepInk' | 'accent', t: number): string {
  const [r, g, b] = parseHex(mixHex(DEFAULT_THEME[key], theme[key], t))
  return `${r},${g},${b}`
}
