/**
 * 中文文案（默认语言，ADR-0017）。
 *
 * 这里的每一句都是**玩家现在看到的那一句**：本票（22）从壳层搬过来时逐字保留，
 * 文案迁移不该顺手改词。英文表（`en.ts`）必须与它键集完全相同。
 */

import type { Messages } from './messages'

export const zh: Messages = {
  'app.title': '心琴',
  'app.seal': '琴',
  'app.docTitle': '心琴 · 斗琴',
  'title.tagline': '水墨斗琴 · 音符落处，剑气斩妖',
  'title.start': '点击此处或按任意键 · 开始',
  'title.startFirst': '点击此处或按任意键 · 开始键位引导',
  'dev.battle': (song, difficulty, mode) => `开发验证 · ${song}（${difficulty}）· ${mode}`,
  'dev.autoplay': '自动完美弹奏',
  'dev.idle': '静置败局',
  'dev.manual': '手动',
  'fatal.audio': '音频初始化失败，请刷新重试',

  'library.heading': '心琴 · 曲库',
  'library.keysHeading': (song, difficulty) => `键位图示 · ${song}（${difficulty}）`,
  'library.bestNone': '未挑战',
  'library.combo': (combo) => `连击 ${combo}`,
  'library.hint': '↑↓ 选曲 · ←→ 选难度 · 回车 开战 · 白键 A S D F J K L，黑键嵌于其间',

  'diff.easy': '简单',
  'diff.medium': '中等',
  'diff.hard': '高级',
  'mastery.first': '初演',
  'mastery.seasoned': '弹熟',
  'mastery.mastered': '精熟',
  'mastery.none': '未入册',

  'settings.heading': '设置',
  'settings.offset': '音画偏移',
  'settings.offsetValue': (ms) => (ms === 0 ? '0 毫秒' : `${ms > 0 ? '+' : ''}${ms} 毫秒`),
  'settings.offsetHint':
    '判定公平性校准：正 = 你的按键被判定得整体更「早」，负 = 更「晚」。' +
    '若明明按准了、结果总偏「迟」（画面比声音慢的设备常见），向正调；总偏「早」则向负调。范围 ±150 毫秒。',
  'settings.music': '琴声音量',
  'settings.sfx': '战斗音效音量',
  'settings.sfxHint':
    '琴声是你弹出的钢琴与自动伴奏（音乐轨）；剑气、受击、余韵等是战斗音效（音效轨），两轨独立调节。',
  'settings.language': '界面语言',

  'tutorial.heading': '键位引导',
  'tutorial.prompt': '依次按下白键，听一声、亮一键——把手放上琴位',
  'tutorial.hint': (seconds) => `全部点亮或按 Esc 进入曲库（约 ${seconds} 秒后自动继续）`,

  'pause.heading': '暂停',
  'pause.line': '琴音暂歇，墨妖亦止步',

  'result.win': '斗琴告捷',
  'result.lose': '斗琴落败',
  'settlement.accuracy': '精度',
  'settlement.maxCombo': '最长连击',
  'settlement.mastery': '掌握度',
  'settlement.newRecord': '新纪录',
  'settlement.best': (rating, combo) => `本机最佳 ${rating} · 连击 ${combo}`,
  'mastery.line.mastered': '这一局零失误，精度九成以上',
  'mastery.line.seasoned': '这一局评级 A 以上',
  'mastery.line.first': '这一局活着弹完了全曲',
  'mastery.line.none': '这一局未入册（败局不计掌握度）',
  'replay.idle': '听我的演奏',
  'replay.playing': '再听一遍',
  'settlement.replayNote': ({ seconds, hits, misses, finale }) =>
    `最后 ${seconds} 秒 · 命中 ${hits} 颗 · 漏 ${misses} 颗${finale ? ' · 含终章' : ''}`,
  'settlement.stats': ({ damage, clarity, perfect, good, miss }) =>
    `总伤害 <b>${damage}</b> · 琴心通明 <b>${clarity}</b> 次 · 完美 <b>${perfect}</b> · 良好 <b>${good}</b> · 失误 <b>${miss}</b>`,

  'progress.cleared': '走到 100%',
  'progress.monsters': (percent) => `走到 ${percent}%，墨妖未绝`,
  'progress.fell': (percent) => `走到 ${percent}%，血尽`,
  'advice.steady': ({ signed }) => `按键平均偏差 ${signed}ms —— 节奏稳`,
  'advice.fix': ({ signed, magnitude, late }) =>
    `按键平均${late ? '偏晚' : '偏早'} ${magnitude}ms —— 可在设置里把音画偏移调到 ${signed}`,

  'judge.perfect': '完美',
  'judge.good': '良好',
  'judge.miss': '失误',
  'offset.onTime': '正点',
  'offset.early': (ms) => `早 ${ms}`,
  'offset.late': (ms) => `晚 ${ms}`,
  'countdown.numerals': ['四', '三', '二', '一'],

  'sustain.minor': '余韵',
  'sustain.major': '墨浪',
  'sustain.grand': '剑鸣',
  'sustain.finale': '终章',

  'hud.vitality': '气血',
  'hud.qinxin': (hits, need) => `琴心 ${hits}/${need}`,
  'hud.combo': (multiplier) => `连击 · 伤害 ×${multiplier}`,
  'hud.lastPhrase': '最后一句',
  'hud.phrase': (index, count) => `第 ${index} / ${count} 句`,
  'hud.lord': '墨主',
  'hud.chordHeavy': '重',
  'hud.clarity': '琴心通明',

  'tint.cold': '寒音',
  'tint.toxic': '毒音',
  'tint.blast': '爆音',

  'btn.fight': '开战（回车）',
  'btn.settings': '设置（音量 / 偏移）',
  'btn.backLibrary': '返回曲库（Esc）',
  'btn.resume': '继续（Esc）',
  'btn.abandon': '放弃 · 返回曲库（Q）',
  'btn.retry': '再来一次（回车）',
}
