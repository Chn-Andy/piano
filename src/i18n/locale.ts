/**
 * 界面语言（ADR-0017）：中英双语，英文模式全英文。
 *
 * 语言只有两个取值，**没有「跟随系统」这个第三态**——那是存进设置里的
 * `null`，读的时候由 `resolveLocale` 就地解析成本类型。这样凡是拿到
 * `Locale` 的地方都不必再处理「未知」这件事。
 */

/** 界面语言（ADR-0017） */
export type Locale = 'zh' | 'en'

/** 全部语言（设置面板按这个顺序出选项；顺序固定，不随系统变） */
export const LOCALES: readonly Locale[] = ['zh', 'en']

/**
 * 语言的名字（**永远用该语言自己的写法**）。
 * 「中文」与 English 都不翻译：读不懂另一种语言的人才找得到自己那一个
 * （spec v1.5 用户故事 9）。这三个字不进文案表，因为它在两种语言下相同。
 */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  zh: '中文',
  en: 'English',
}

/**
 * 一个概念在两种语言下的写法（曲名、难度说明这类**数据**用的形状）。
 * 曲目条目、唱片说明都用它，取用时按当前语言下标即可：`title[locale]`。
 */
export interface LocalizedText {
  readonly zh: string
  readonly en: string
}

/**
 * 浏览器语言 + 已存偏好 → 实际语言（spec v1.5）。
 *
 * - 已存偏好为具体语言 → 听玩家的，浏览器说什么都不管；
 * - 已存偏好为 null（跟随系统）→ `zh` 开头（zh、zh-CN、zh-TW、zh-Hant…）判中文，
 *   其余一律英文。空串与未知值也走这条：英文是安全兜底——itch 上的英文玩家
 *   第一眼全是中文会直接关掉，而中文系统上默认仍是中文，现有体验不变。
 */
export function resolveLocale(browserLanguage: string | null | undefined, stored: Locale | null): Locale {
  if (stored !== null) return stored
  const tag = (browserLanguage ?? '').trim().toLowerCase()
  return tag === 'zh' || tag.startsWith('zh-') ? 'zh' : 'en'
}
