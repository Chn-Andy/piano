/**
 * 测试替身：把一整套文案换成「回显键名与参数」的假表。
 *
 * 纯层的句子测试用它断言**「用了哪一句、带什么参数」**，而不是断言具体措辞：
 * 以后改文案不必动这些测试，而键名接错、参数接反照样失败（spec v1.5 的
 * Seam C）。只被测试引用，不进产物。
 *
 * 产出形状：`advice.fix(+23,23,true)`、`progress.fell(63)`；对象参数按值的
 * 顺序摊平（`{signed, magnitude, late}` → `+23,23,true`）。
 */

import type { Messages } from './messages'

/** 把一个参数摊平成字符串：对象取值的顺序，数组逐个拼 */
function renderArg(value: unknown): string {
  if (value === null || typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return value.map(renderArg).join('+')
  return Object.values(value as Record<string, unknown>).map(renderArg).join(',')
}

/** 按真表的形状造一张回显表（字符串键回显键名，函数键回显调用表达式） */
export function keyEcho(base: Messages): Messages {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(base)) {
    if (typeof value === 'function') {
      out[key] = (...args: unknown[]) => `${key}(${args.map(renderArg).join(';')})`
    } else if (Array.isArray(value)) {
      out[key] = [...value]
    } else {
      out[key] = key
    }
  }
  return out as unknown as Messages
}
