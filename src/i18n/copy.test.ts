/**
 * 文案表的机器守卫（ADR-0017，spec v1.5 用户故事 35/36）。
 *
 * 这一层要挡住的不是「翻得好不好」，而是**漏翻与串语言**：少一句、某句英文里
 * 混进汉字、某句中文里混进整段英文——三种错误都不该靠试玩发现。
 *
 * 只测外部可观察的东西：两份表的键集、值的种类、值的字符范围、插值函数在
 * 给定参数下的产出。措辞本身不进断言（那会让改一次文案就要改一次测试）。
 */

import { describe, expect, it } from 'vitest'
import { COPY, copyFor, LOCALES, LOCALE_NAMES, resolveLocale } from './index'
import type { Messages } from './messages'

/** 汉字与全角标点（英文表里一个都不许有） */
const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/
/** 一整段拉丁文（中文表里出现即视为漏翻；短标记如 `A S D F J K L` 不算） */
const LONG_LATIN = /[A-Za-z][A-Za-z ,.'’/+-]{24,}/

/** 把一张表压成「键 → 值的种类」，供两语言对拍 */
function shapeOf(table: Messages): Record<string, string> {
  const shape: Record<string, string> = {}
  for (const [key, value] of Object.entries(table)) {
    shape[key] = Array.isArray(value) ? 'array' : typeof value
  }
  return shape
}

describe('文案表：键集与种类', () => {
  it('中英两套表的键完全相同（少一句即失败）', () => {
    expect(Object.keys(COPY.en).sort()).toEqual(Object.keys(COPY.zh).sort())
  })

  it('同一个键在两套表里是同一种东西（都是字符串 / 都是函数 / 都是数组）', () => {
    expect(shapeOf(COPY.en)).toEqual(shapeOf(COPY.zh))
  })

  it('没有空串、没有空数组、没有空读数', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(COPY[locale])) {
        if (typeof value === 'string') expect(value.trim(), `${locale}.${key}`).not.toBe('')
        if (Array.isArray(value)) expect(value.length, `${locale}.${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('倒计时数词四拍（索引 0 = 倒数第四拍，渲染层按它取字）', () => {
    for (const locale of LOCALES) {
      expect(COPY[locale]['countdown.numerals']).toHaveLength(4)
    }
  })
})

describe('文案表：机器守卫（英文模式不留汉字）', () => {
  it('英文表的值里没有任何汉字或全角标点', () => {
    for (const [key, value] of Object.entries(COPY.en)) {
      if (typeof value !== 'string') continue
      expect(CJK.test(value), `en.${key}: ${value}`).toBe(false)
    }
    for (const numeral of COPY.en['countdown.numerals']) {
      expect(CJK.test(numeral), `en.countdown: ${numeral}`).toBe(false)
    }
  })

  it('中文表的值里没有整段英文（漏翻的反向守卫）', () => {
    for (const [key, value] of Object.entries(COPY.zh)) {
      if (typeof value !== 'string') continue
      expect(LONG_LATIN.test(value), `zh.${key}: ${value}`).toBe(false)
    }
  })

  it('插值句子的产出里也不许出现汉字（函数值单独扫一遍）', () => {
    const en = COPY.en
    const produced = [
      en['dev.battle']('Canon', 'Easy', 'manual'),
      en['library.keysHeading']('Canon', 'Easy'),
      en['library.combo'](12),
      en['settings.offsetValue'](-20),
      en['tutorial.hint'](30),
      en['settlement.best']('S', 40),
      en['settlement.replayNote']({ seconds: 20, hits: 88, misses: 3, finale: true }),
      en['settlement.stats']({ damage: 1234, clarity: 3, perfect: 100, good: 20, miss: 5 }),
      en['progress.monsters'](72),
      en['progress.fell'](99),
      en['advice.steady']({ signed: '+3', magnitude: 3, late: true }),
      en['advice.fix']({ signed: '+23', magnitude: 23, late: true }),
      en['offset.early'](12),
      en['offset.late'](43),
      en['hud.qinxin'](12, 30),
      en['hud.combo']('1.5'),
      en['hud.phrase'](3, 7),
    ]
    for (const text of produced) expect(CJK.test(text), text).toBe(false)
  })
})

describe('文案表：两种语言的写法都对得上语义', () => {
  it('终章的印章词在两套表里都是短词（印面按它测量宽度）', () => {
    expect(COPY.zh['sustain.finale']).toBe('终章')
    expect(COPY.en['sustain.finale']).toBe('Finale')
  })

  it('回放的读数行按「有没有终章」给出两种写法', () => {
    const withFinale = COPY.en['settlement.replayNote']({ seconds: 20, hits: 88, misses: 3, finale: true })
    const without = COPY.en['settlement.replayNote']({ seconds: 20, hits: 88, misses: 3, finale: false })
    expect(withFinale).toContain('incl. Finale')
    expect(without).not.toContain('incl. Finale')
  })

  it('偏移建议区分偏晚与偏早（工单 15 的指路方向）', () => {
    const late = COPY.en['advice.fix']({ signed: '+23', magnitude: 23, late: true })
    const early = COPY.en['advice.fix']({ signed: '-23', magnitude: 23, late: false })
    expect(late).toContain('late')
    expect(early).toContain('early')
    expect(late).toContain('+23')
    expect(early).toContain('-23')
  })
})

describe('语言解析（浏览器语言 + 已存偏好）', () => {
  it('已存偏好优先于浏览器语言', () => {
    expect(resolveLocale('zh-CN', 'en')).toBe('en')
    expect(resolveLocale('en-US', 'zh')).toBe('zh')
  })

  it('偏好在空（跟随系统）时看浏览器语言：zh 开头判中文', () => {
    expect(resolveLocale('zh', null)).toBe('zh')
    expect(resolveLocale('zh-CN', null)).toBe('zh')
    expect(resolveLocale('zh-TW', null)).toBe('zh')
    expect(resolveLocale('ZH-Hant', null)).toBe('zh')
    expect(resolveLocale('  zh-cn  ', null)).toBe('zh')
  })

  it('其余语言、空值与未知值一律英文（itch 上的英文玩家第一眼不能是中文）', () => {
    expect(resolveLocale('en-US', null)).toBe('en')
    expect(resolveLocale('ja-JP', null)).toBe('en')
    expect(resolveLocale('', null)).toBe('en')
    expect(resolveLocale(null, null)).toBe('en')
    expect(resolveLocale(undefined, null)).toBe('en')
  })

  it('两种语言各有自己的名字，且用该语言自己的写法（读不懂另一种也找得到）', () => {
    expect(LOCALE_NAMES.zh).toBe('中文')
    expect(LOCALE_NAMES.en).toBe('English')
  })

  it('copyFor 取到的就是那一套表', () => {
    expect(copyFor('zh')).toBe(COPY.zh)
    expect(copyFor('en')).toBe(COPY.en)
  })
})
