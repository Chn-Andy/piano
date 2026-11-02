/**
 * 文案表（ADR-0017）：玩家可见文字的唯一定义处。
 *
 * 形状：一个 `Messages` 接口把**每一句话**声明成一个键（插值的句子声明成
 * 函数），中英两份表各自实现它。少一句 → `tsc` 直接报错，不需要等到试玩。
 * 纯 UI 拼装串（按钮、标签、读数）只活在这里；专名的中英对照在 `GLOSSARY.md`，
 * 两边必须一致（同一概念两个长度也在这里登记：HUD 短名 / 完整名）。
 *
 * 分层：文案表是纯数据，不碰 DOM、不碰画布。壳层（`main.ts`）与渲染层
 * （`render/renderer.ts`）各自取一整套文案去用，谁也不再自己拼字符串。
 */

import type { Locale } from './locale'

/** 结算统计行用到的五个读数（避免五连位置参数） */
export interface StatsArgs {
  readonly damage: number
  readonly clarity: number
  readonly perfect: number
  readonly good: number
  readonly miss: number
}

/** 结算回放读数行（票 19：最后 N 秒 · 命中 N 颗 · 漏 N 颗 · 含终章） */
export interface ReplayNoteArgs {
  readonly seconds: number
  readonly hits: number
  readonly misses: number
  readonly finale: boolean
}

/** 平均偏差指路的两个分支（ADR-0013） */
export interface AdviceArgs {
  /** 平均偏差的带符号读数（如 `+23` / `-11`） */
  readonly signed: string
  /** 偏差方向的绝对值（毫秒） */
  readonly magnitude: number
  /** 正 = 偏晚、负 = 偏早 */
  readonly late: boolean
}

/**
 * 一整套界面文案。键名用「面 + 语义」的扁平点号，前缀即画面：
 * `title.` `library.` `settings.` `tutorial.` `pause.` `result.` `settlement.`
 * `progress.` `advice.` `judge.` `offset.` `sustain.` `hud.` `tint.` `btn.`
 */
export interface Messages {
  /* ── 标题屏 ─────────────────────────────────────────────── */
  /** 标题大字（中文是书法字「心琴」，英文是衬线大字距的 XinQin） */
  'app.title': string
  /** 标题角印里的一个字（中文「琴」、英文 X——印是图形，只放一个字） */
  'app.seal': string
  /** 浏览器标签页标题（随语言热更新） */
  'app.docTitle': string
  /** 标题屏副题 / 商店页 tagline（两种语言共用同一句） */
  'title.tagline': string
  /** 开始提示（老玩家） */
  'title.start': string
  /** 开始提示（首次进入，先走键位引导） */
  'title.startFirst': string
  /** 开发验证行（只在 URL 带开发钩子时出现） */
  'dev.battle': (song: string, difficulty: string, mode: string) => string
  'dev.autoplay': string
  'dev.idle': string
  'dev.manual': string
  /** 音频起不来时的兜底提示 */
  'fatal.audio': string

  /* ── 曲库 ───────────────────────────────────────────────── */
  'library.heading': string
  /** 「键位图示 · 曲名（难度）」那一行 */
  'library.keysHeading': (song: string, difficulty: string) => string
  /** 该难度还没有纪录 */
  'library.bestNone': string
  /** 纪录里的连击读数（曲库难度格与结算卡共用） */
  'library.combo': (combo: number) => string
  'library.hint': string

  /* ── 难度与掌握度（曲库、结算共用） ─────────────────────── */
  'diff.easy': string
  'diff.medium': string
  'diff.hard': string
  'mastery.first': string
  'mastery.seasoned': string
  'mastery.mastered': string
  'mastery.none': string

  /* ── 设置 ───────────────────────────────────────────────── */
  'settings.heading': string
  'settings.offset': string
  /** 偏移读数（0 与正负两种写法由各语言自己决定） */
  'settings.offsetValue': (ms: number) => string
  'settings.offsetHint': string
  'settings.music': string
  'settings.sfx': string
  'settings.sfxHint': string
  'settings.language': string

  /* ── 键位引导 ───────────────────────────────────────────── */
  'tutorial.heading': string
  'tutorial.prompt': string
  'tutorial.hint': (seconds: number) => string

  /* ── 暂停 ───────────────────────────────────────────────── */
  'pause.heading': string
  'pause.line': string

  /* ── 结算 ───────────────────────────────────────────────── */
  'result.win': string
  'result.lose': string
  'settlement.accuracy': string
  'settlement.maxCombo': string
  'settlement.mastery': string
  'settlement.newRecord': string
  /** 旧纪录一行（本机最佳 S · 连击 40） */
  'settlement.best': (rating: string, combo: number) => string
  /** 掌握度那一句释义（只说这一局发生过什么） */
  'mastery.line.mastered': string
  'mastery.line.seasoned': string
  'mastery.line.first': string
  'mastery.line.none': string
  /** 回放按钮两态（票 19） */
  'replay.idle': string
  'replay.playing': string
  /** 回放读数行 */
  'settlement.replayNote': (args: ReplayNoteArgs) => string
  /** 结算统计行 */
  'settlement.stats': (args: StatsArgs) => string

  /* ── 进度与偏差指路（纯派生句子） ───────────────────────── */
  'progress.cleared': string
  'progress.monsters': (percent: number) => string
  'progress.fell': (percent: number) => string
  /** 偏差小到不必调 */
  'advice.steady': (args: AdviceArgs) => string
  /** 劝人调音画偏移：报方向、毫秒，并给出建议值 */
  'advice.fix': (args: AdviceArgs) => string

  /* ── 画布：判定与偏差 ───────────────────────────────────── */
  'judge.perfect': string
  'judge.good': string
  'judge.miss': string
  'offset.onTime': string
  'offset.early': (ms: number) => string
  'offset.late': (ms: number) => string
  /** 开演倒计时数词（四拍，索引 0 = 倒数第四拍） */
  'countdown.numerals': readonly string[]

  /* ── 画布：余韵与终章 ───────────────────────────────────── */
  'sustain.minor': string
  'sustain.major': string
  'sustain.grand': string
  /** 终章朱印里的词（印面按它测量宽度） */
  'sustain.finale': string

  /* ── 画布：状态读数（HUD 短名在这里登记） ────────────────── */
  'hud.vitality': string
  /** 琴心蓄能槽顶的整数读数（HUD 用短名 Heart / 心） */
  'hud.qinxin': (hits: number, need: number) => string
  'hud.combo': (multiplier: string) => string
  'hud.lastPhrase': string
  'hud.phrase': (index: number, count: number) => string
  /** 墨主名牌（HUD 用短名而非完整名） */
  'hud.lord': string
  /** 和弦重击标号（单字符位，英文按测量收字号） */
  'hud.chordHeavy': string
  /** 琴心通明爆发题字（HUD 短名 CLARITY / 完整名 Heartstring Clarity） */
  'hud.clarity': string

  /* ── 画布：异色音符题字 ─────────────────────────────────── */
  'tint.cold': string
  'tint.toxic': string
  'tint.blast': string

  /* ── 按钮 ───────────────────────────────────────────────── */
  'btn.fight': string
  'btn.settings': string
  'btn.backLibrary': string
  'btn.resume': string
  'btn.abandon': string
  'btn.retry': string
}

/** 一份文案表就是一套 `Messages`；语言 → 表 */
export type CopyTable = Readonly<Record<Locale, Messages>>
