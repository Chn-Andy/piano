/**
 * 文案表的取用口（ADR-0017）。
 *
 * 两层壳（DOM 装配层与画布渲染层）都从这里拿「一整套文案」：拿到的是
 * `Messages`，而不是一个 `t(key)` 函数——这样键名打错是编译错误，插值参数
 * 也由类型管着，不必在调用点拼字符串。
 */

import { en } from './en'
import { zh } from './zh'
import type { CopyTable, Messages } from './messages'
import type { Locale } from './locale'

/** 语言 → 文案表（两种语言一起进 bundle：几 KB，不值得按需加载） */
export const COPY: CopyTable = { zh, en }

/** 取某一语言的整套文案 */
export function copyFor(locale: Locale): Messages {
  return COPY[locale]
}

export { LOCALES, LOCALE_NAMES, resolveLocale } from './locale'
export type { Locale } from './locale'
export type { Messages, ReplayNoteArgs, StatsArgs, AdviceArgs } from './messages'
