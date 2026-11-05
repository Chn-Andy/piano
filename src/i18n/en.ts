/**
 * 英文文案（ADR-0017）。
 *
 * 不是逐字直译：专名按 `GLOSSARY.md` 里钉死的英文名（琴心 Heartstring、墨妖
 * Ink Fiend、墨主 Ink Sovereign、余韵 Resonance…），句子按英文语感重写。
 * 同一概念两个长度登记在这里——HUD 与榜位用短名（Heart、Sovereign、Phrase），
 * 有空间的屏幕用完整名（Heartstring、Moonlight on the Spring River）。
 * 调用点不许临时缩写：要短就在这张表里短。
 */

import type { Messages } from './messages'

export const en: Messages = {
  'app.title': 'XinQin',
  'app.seal': 'X',
  'app.docTitle': 'XinQin · Duel',
  'title.tagline': 'A duel in ink. Every note a blade.',
  'title.start': 'Click or press any key · Start',
  'title.startFirst': 'Click or press any key · Key guide first',
  'dev.battle': (song, difficulty, mode) => `Dev build · ${song} (${difficulty}) · ${mode}`,
  'dev.autoplay': 'autoplay',
  'dev.idle': 'idle',
  'dev.manual': 'manual',
  'fatal.audio': 'Audio failed to start. Reload to try again.',

  'library.heading': 'XinQin · Library',
  'library.keysHeading': (song, difficulty) => `Keys · ${song} (${difficulty})`,
  'library.bestNone': 'Not played',
  'library.originalTag': 'Full',
  'library.combo': (combo) => `Combo ${combo}`,
  'library.hint': '↑↓ song · ←→ difficulty · Enter to fight · white keys A S D F J K L, black keys between them',

  'diff.easy': 'Easy',
  'diff.medium': 'Medium',
  'diff.hard': 'Hard',
  'mastery.first': 'First Play',
  'mastery.seasoned': 'Seasoned',
  'mastery.mastered': 'Mastered',
  'mastery.none': 'Unrecorded',

  'settings.heading': 'Settings',
  'settings.offset': 'Audio offset',
  'settings.offsetValue': (ms) => (ms === 0 ? '0 ms' : `${ms > 0 ? '+' : ''}${ms} ms`),
  'settings.offsetHint':
    'Judgement fairness calibration: positive = your presses are judged a little earlier, negative = later. ' +
    'If you are hitting in time but always scored late (common when the picture lags the sound), nudge it positive; ' +
    'if always early, nudge it negative. Range ±150 ms.',
  'settings.music': 'Piano volume',
  'settings.sfx': 'Battle SFX volume',
  'settings.sfxHint':
    'Piano is your own playing plus the automatic accompaniment (music track). Sword-qi, hits and resonance are battle SFX (effects track). The two tracks are independent.',
  'settings.language': 'Language',

  'tutorial.heading': 'Key guide',
  'tutorial.prompt': 'Press each white key in turn — one note, one light. Put your hands on the keys.',
  'tutorial.hint': (seconds) => `Light them all, or press Esc for the library (continues by itself in ${seconds}s)`,

  'pause.heading': 'Paused',
  'pause.line': 'The music rests; the ink halts.',

  'result.win': 'Duel Won',
  'result.lose': 'Duel Lost',
  'settlement.accuracy': 'Accuracy',
  'settlement.maxCombo': 'Best combo',
  'settlement.mastery': 'Mastery',
  'settlement.newRecord': 'New record',
  'settlement.best': (rating, combo) => `Best ${rating} · Combo ${combo}`,
  'mastery.line.mastered': 'No misses, accuracy above 90% this run',
  'mastery.line.seasoned': 'Rated A or above this run',
  'mastery.line.first': 'You lived through the whole piece this run',
  'mastery.line.none': 'Not recorded — a lost duel earns no mastery',
  'replay.idle': 'Hear my playing',
  'replay.playing': 'Play again',
  'settlement.replayNote': ({ seconds, hits, misses, finale }) =>
    `Last ${seconds} s · ${hits} hits · ${misses} misses${finale ? ' · incl. Finale' : ''}`,
  'settlement.stats': ({ damage, clarity, perfect, good, miss }) =>
    `Total damage <b>${damage}</b> · Clarity <b>${clarity}</b> · Perfect <b>${perfect}</b> · Good <b>${good}</b> · Miss <b>${miss}</b>`,

  'progress.cleared': 'Reached 100%',
  'progress.monsters': (percent) => `Reached ${percent}% — fiends still standing`,
  'progress.fell': (percent) => `Reached ${percent}% — you fell`,
  'advice.steady': ({ signed }) => `Average offset ${signed} ms — steady`,
  'advice.fix': ({ signed, magnitude, late }) =>
    `Average offset ${magnitude} ms ${late ? 'late' : 'early'} — set Audio offset to ${signed}`,

  'judge.perfect': 'Perfect',
  'judge.good': 'Good',
  'judge.miss': 'Miss',
  'offset.onTime': 'on time',
  'offset.early': (ms) => `early ${ms}`,
  'offset.late': (ms) => `late ${ms}`,
  'countdown.numerals': ['4', '3', '2', '1'],

  'sustain.minor': 'Resonance',
  'sustain.major': 'Ink Surge',
  'sustain.grand': 'Sword Song',
  'sustain.finale': 'Finale',

  'hud.vitality': 'Vitality',
  'hud.frontLine': 'FRONT',
  'hud.qinxin': (hits, need) => `Heart ${hits}/${need}`,
  'hud.combo': (multiplier) => `Combo · Damage ×${multiplier}`,
  'hud.lastPhrase': 'Last phrase',
  'hud.phrase': (index, count) => `Phrase ${index} / ${count}`,
  'hud.lord': 'Sovereign',
  'hud.chordHeavy': 'HEAVY',
  'hud.clarity': 'CLARITY',

  'tint.cold': 'Frost',
  'tint.toxic': 'Venom',
  'tint.blast': 'Blast',

  'btn.fight': 'Fight (Enter)',
  'btn.settings': 'Settings (volume / offset)',
  'btn.backLibrary': 'Back to Library (Esc)',
  'btn.resume': 'Resume (Esc)',
  'btn.abandon': 'Quit · Library (Q)',
  'btn.retry': 'Again (Enter)',
}
