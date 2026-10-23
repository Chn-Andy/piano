/**
 * 玩家设置（SPEC-0001 持久化：浏览器本地存储——设置：音量、音画偏移；
 * SPEC 故事 22/23）。纯层：存储以 KeyValueStore 注入（records 同例），
 * 无 DOM 依赖。
 *
 * 音画偏移（ADR-0010）：实现为「按键时刻进模拟器前的时间平移」——
 * 全项目只有这一处可调，不引入第二套钟。语义：正值 = 判定时刻整体
 * 前移 |offset| 毫秒，给「系统性地被判定偏晚」的设备（画面渲染滞后
 * 音频主时钟）以补偿；负值反之。默认 0（不补偿）。
 */

import type { KeyValueStore } from './records'

/** 玩家设置：音画偏移（毫秒）与两轨音量（0..1，1 = 满增益直通） */
export interface Settings {
  readonly offsetMs: number
  readonly musicVolume: number
  readonly sfxVolume: number
}

/** 存储键（版本化：结构不兼容时升版本号，旧键任其沉没——records 同例） */
export const SETTINGS_KEY = 'xinqin.settings.v1'

/** 偏移滑条范围（毫秒）：±150 覆盖一至两个显示帧的常见滞后，再大即非校准问题 */
export const OFFSET_LIMIT_MS = 150

/**
 * 默认设置：零偏移 + 两轨满音量——音量默认直通（增益 1），出厂混音即
 * 各音效合成时定标的相对响度（见 docs/calibration.md），出厂手感与
 * 工单 05 既有手感完全一致。
 */
export const DEFAULT_SETTINGS: Settings = {
  offsetMs: 0,
  musicVolume: 1,
  sfxVolume: 1,
}

/** 数值钳制与类型校验：字段缺失或类型不对取默认，越界钳回范围 */
function coerceSettings(raw: unknown): Settings {
  const src = (raw === null || typeof raw !== 'object' || Array.isArray(raw)) ? {} : raw as Record<string, unknown>
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
  return {
    offsetMs: clamp(num(src.offsetMs, DEFAULT_SETTINGS.offsetMs), -OFFSET_LIMIT_MS, OFFSET_LIMIT_MS),
    musicVolume: clamp(num(src.musicVolume, DEFAULT_SETTINGS.musicVolume), 0, 1),
    sfxVolume: clamp(num(src.sfxVolume, DEFAULT_SETTINGS.sfxVolume), 0, 1),
  }
}

/** 读取设置；存储为空或损坏 → 默认设置（不抛错——设置不是启动前提） */
export function loadSettings(store: KeyValueStore): Settings {
  const raw = store.getItem(SETTINGS_KEY)
  if (raw === null) return DEFAULT_SETTINGS
  try {
    return coerceSettings(JSON.parse(raw))
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** 写入设置；写入失败（如配额满）静默——设置非关键数据，不拖垮对局 */
export function saveSettings(store: KeyValueStore, settings: Settings): void {
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // 静默：见上
  }
}

/**
 * 偏移生效的唯一点：按键时刻（谱面时间轴）→ 判定时刻。
 * 正向偏移把判定时刻前移（offset 毫秒），负向后移；0 = 恒等。
 * 壳层在喂给模拟器之前调用（真人按键与自动弹奏共用，见 main.ts）。
 */
export function judgedTime(pressTime: number, offsetMs: number): number {
  return pressTime - offsetMs / 1000
}
