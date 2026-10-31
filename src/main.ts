/**
 * 装配层（薄壳）：画面状态机——把纯核心模拟器与音频/渲染两个壳接在一起。
 * 画面流：标题（等用户手势）→〔首次进入〕30 秒白键试按引导 → 曲库（三首 ×
 * 三难度、本机最佳纪录、键位图示）→ 倒计时 → 演奏 ⇄ 暂停（Esc 菜单：继续 /
 * 放弃；标签页失焦自动暂停）→ 终局结算（演奏卡：曲名/难度/评级/精度/最长连击/
 * 掌握度；「听我的演奏」回放最后 20 秒；胜局写本机纪录）→ 整首重开或返回曲库。
 * 全中文 UI（工单 05）。
 *
 * 开发验证钩子（URL 查询参数，普通玩家不受影响；走与真人完全相同的按键管线）：
 *   ?auto=perfect —— 按谱面时刻精确自动弹奏（验胜利路径）
 *   ?auto=idle   —— 从不按键（验败局路径）
 *   ?chart=easy|medium|hard —— 谱面难度（默认 medium）
 *   ?song=<曲目 id> —— 直接开战的曲目（默认 canon-in-d；绕过引导与曲库）
 */

import { AudioEngine } from './audio/engine'
import { Piano } from './audio/piano'
import { DIFFICULTY_LABELS, SONGS, songById } from './charts'
import type { SongEntry } from './charts'
import type { Chart, DifficultyName, Lane } from './core/chart'
import { accompanimentPlan } from './core/accompaniment'
import { comboMultiplierFor } from './core/combat'
import { PLAYER_MAX_HP } from './core/config'
import { layoutForKeys, laneForKey, WHITE_KEY_NOTES } from './core/keymap'
import { masteryFor, masteryFromRecord, masteryLine, MASTERY_LABELS } from './core/mastery'
import type { MasteryLevel } from './core/mastery'
import { replayPlanFor } from './core/replay'
import type { PlayedNote } from './core/replay'
import { midiToNoteName } from './core/pitch'
import type { KeyBinding, KeyLayout } from './core/keymap'
import { loadRecords, recordResult, saveRecords, bestRecordFor } from './core/records'
import type { KeyValueStore, Records } from './core/records'
import { accuracyFor, offsetAdvice, ratingFor } from './core/rating'
import type { Rating } from './core/rating'
import { CUE_LIFE, finaleAtOf, formatClock, progressCueAt, progressLine, songProgress } from './core/progress'
import type { OutcomeReason } from './core/progress'
import { judgedTime, loadSettings, saveSettings } from './core/settings'
import type { Settings } from './core/settings'
import { Simulator } from './core/simulator'
import type { BattleEvent, BattleSummary, GameEvent } from './core/simulator'
import type { SustainEvent } from './core/sustain'
import { markTutorialDone, tutorialDone } from './core/tutorial'
import { Renderer } from './render/renderer'
import type {
  BiteFeedback,
  HitFeedback,
  JudgmentFlash,
  QinxinFeedback,
  TintFeedback,
  WhiffFeedback,
} from './render/renderer'
import { finaleSealAt } from './render/renderer'

/** 倒计时拍数与拍长（120 BPM，与合成木鱼声对应） */
const COUNT_BEATS = 4
const BEAT_SECONDS = 0.5
/** 演奏中琴声的调度延迟：把 start() 放进音频时间线的近未来，防呆防爆音 */
const PLAY_EPSILON = 0.003
/** 判定闪示与战斗反馈在列表中的最长保留（供淡出后清理） */
const FLASH_KEEP = 1.5
/** 余韵事件在渲染列表中的最长保留（窗口 + 残响尾巴 + 余量） */
const SUSTAIN_KEEP = 1.6
/** 终章演出后结算画面的最短宽限：先看完收势再见胜负 */
const FINALE_GRACE = 0.9
/** 键位引导时长上限（SPEC 故事 1：约 30 秒；完成或 Esc 提前退出） */
const TUTORIAL_SECONDS = 30

/** 画面（SPEC：单页无刷新，曲库 → 斗琴 → 结算；引导/暂停为工单 05、设置为工单 06 增设） */
type Screen =
  | 'title'
  | 'tutorial'
  | 'library'
  | 'settings'
  | 'countdown'
  | 'playing'
  | 'paused'
  | 'ended'

const params = new URLSearchParams(window.location.search)
const AUTO = params.get('auto')
const DEV_BATTLE =
  AUTO !== null || params.get('chart') !== null || params.get('song') !== null
const DEV_DIFFICULTY: DifficultyName =
  params.get('chart') === 'easy' || params.get('chart') === 'hard'
    ? (params.get('chart') as 'easy' | 'hard')
    : 'medium'
const DEV_SONG = songById(params.get('song') ?? 'canon-in-d')

/**
 * 开发验证钩子（与 ?auto 同例）：暴露只读对局时钟与局面，供浏览器自动化
 * 按游戏自身的音频主时钟对准演出时刻（墙钟会因音频挂起而漂移）。
 * 判定计数（工单 06）供偏移前后差异的程序化实测；余韵档位与终章时刻
 * （工单 07）供门面截图对准爆发/印章瞬间。
 */
const debugView: {
  phase: Screen
  t: number
  combo: number
  sustains: number
  tutorialLit: number
  perfect: number
  good: number
  miss: number
  /** 平均偏差（毫秒，正=偏晚；只算命中）——工单 15 判定口径的浏览器实测读数 */
  avgOffsetMs: number
  /** 玩家血量与场上活妖数、累计咬线口数（工单 08 浏览器实测读数） */
  playerHp: number
  monstersAlive: number
  bites: number
  /** 最近一次余韵的档位/是否终章/谱面时刻（无余韵时 null） */
  sustainTier: 'minor' | 'major' | 'grand' | null
  sustainFinale: boolean
  sustainAt: number
  /** 三色词缀触发次数与毒跳次数（工单 09 浏览器实测读数） */
  tintCold: number
  tintToxic: number
  tintBlast: number
  poisonTicks: number
  /** 琴心蓄能进度与释放次数（工单 10 浏览器实测读数） */
  qinxinGauge: number
  qinxinReleases: number
  /** 进度读数与当前句提示（票 17 浏览器实测读数：轨画不出来也读得出数） */
  progressRatio: number
  progressCue: string | null
  /** 本局掌握度与回放读数（票 19 浏览器实测读数：徽记与回放都读得出来） */
  mastery: string | null
  replayNotes: number
  replayMisses: number
  replayPlaying: boolean
} = {
  phase: 'title',
  t: 0,
  combo: 0,
  sustains: 0,
  tutorialLit: 0,
  perfect: 0,
  good: 0,
  miss: 0,
  avgOffsetMs: 0,
  playerHp: 100,
  monstersAlive: 0,
  bites: 0,
  sustainTier: null,
  sustainFinale: false,
  sustainAt: 0,
  tintCold: 0,
  tintToxic: 0,
  tintBlast: 0,
  poisonTicks: 0,
  qinxinGauge: 0,
  qinxinReleases: 0,
  progressRatio: 0,
  progressCue: null,
  mastery: null,
  replayNotes: 0,
  replayMisses: 0,
  replayPlaying: false,
}
;(window as unknown as { __xq: typeof debugView }).__xq = debugView

const canvas = document.querySelector<HTMLCanvasElement>('#stage')!
const overlay = document.querySelector<HTMLElement>('#overlay')!
if (canvas === null || overlay === null) throw new Error('页面缺少 #stage 或 #overlay')

const engine = new AudioEngine()
const piano = new Piano(() => engine.context, () => engine.musicBus)
const renderer = new Renderer(canvas)

/** 本机持久化（浏览器本地存储；纯层经 KeyValueStore 注入） */
const storage: KeyValueStore = window.localStorage
let records: Records = loadRecords(storage)
let settings: Settings = loadSettings(storage)
engine.setVolumes(settings.musicVolume, settings.sfxVolume) // start() 前记下，启动即生效

/* ── 对局上下文 ────────────────────────────────────────────────────── */
let song: SongEntry = DEV_SONG ?? SONGS[0]!
let difficulty: DifficultyName = DEV_DIFFICULTY
let chart: Chart = song.charts[difficulty]
let layout: KeyLayout = layoutForKeys(chart.meta?.keys ?? [])
let sim = new Simulator(chart)

let screen: Screen = 'title'
let starting = false
/** 本轮谱面起点（音频时钟时刻） */
let roundStartAt = 0
/** 终局信息（胜/败 + 结算），结算画面用 */
let outcomeResult: 'victory' | 'defeat' | null = null
/** 终局的理由与当时的谱面时刻（票 17：「走到 N%」按倒下那一刻算） */
let outcomeReason: OutcomeReason = 'cleared'
let outcomeAt = 0
let outcomeShown = false
/** 终局后画面时钟的冻结值（终章宽限期内画面仍随音频时钟走完演出） */
let endedFreezeT: number | null = null
/** 结算画面允许出现的最早音频时钟时刻（终章宽限） */
let overlayDueAt = 0
/**
 * 本局演奏记录（票 19）：判定流里每一颗音的抄本，只活在内存里。
 * 结算页据此回放最后 20 秒；离开结算即散——不写存储、不留可回访入口。
 */
const playedNotes: PlayedNote[] = []
/** 结算预计算：评级、本局掌握度与是否刷新纪录（胜负事件到达时写定） */
let settlement: { rating: Rating; improved: boolean; mastery: MasteryLevel | null } | null = null
/** 暂停前的画面（继续时回到倒计时或演奏） */
let pausedFrom: 'countdown' | 'playing' = 'playing'

const held = new Set<Lane>()
const flashes: JudgmentFlash[] = []
const hits: HitFeedback[] = []
const slains: { at: number; monsterId: number }[] = []
const bites: BiteFeedback[] = []
const whiffs: WhiffFeedback[] = []
const tints: TintFeedback[] = []
const qinxins: QinxinFeedback[] = []
const sustains: SustainEvent[] = []

/** 清空全部战斗反馈流（开新局用：上一局的残影不许串到这一局） */
function resetFeedback(): void {
  flashes.length = 0
  hits.length = 0
  slains.length = 0
  bites.length = 0
  whiffs.length = 0
  tints.length = 0
  qinxins.length = 0
  sustains.length = 0
}

/**
 * 开发读数归零（开新局用）：累计型读数必须每局重来，否则「再来一次」后
 * 的浏览器实测读数会把两局加在一起（11 号票复跑流程踩过这个坑）。
 * 每帧从模拟器刷新的那几个字段（perfect/good/miss/playerHp/...）不用在这里清。
 */
function resetDebugView(): void {
  debugView.bites = 0
  debugView.tintCold = 0
  debugView.tintToxic = 0
  debugView.tintBlast = 0
  debugView.poisonTicks = 0
  debugView.qinxinReleases = 0
  debugView.qinxinGauge = 0
  debugView.sustains = 0
  debugView.sustainTier = null
  debugView.sustainFinale = false
  debugView.sustainAt = 0
  debugView.mastery = null
  debugView.replayNotes = 0
  debugView.replayMisses = 0
  debugView.replayPlaying = false
}

/* ── 曲库选择与引导状态 ───────────────────────────────────────────── */
let libSongIndex = 0
let libDifficulty: DifficultyName = 'easy'
/** 引导中已点亮的物理键（A S D F J K L） */
const tutorialLit = new Set<string>()
let tutorialDeadline = Number.POSITIVE_INFINITY

/* ── 画面渲染（overlay 为 DOM 壳；战斗画面在 canvas） ──────────────── */

function showOverlay(html: string): void {
  overlay.innerHTML = html
  overlay.classList.remove('hidden')
}

function hideOverlay(): void {
  overlay.classList.add('hidden')
}

function showFatal(message: string): void {
  showOverlay(
    `<div class="screen"><h1>心琴</h1><p>${message}</p></div>`,
  )
}

/**
 * 键位图示：按谱面键区生成钢琴预览（白键整行、黑键嵌行，同真钢琴）。
 * 外层 `.piano-frame` 是定宽框（最宽键区那一排白键的宽度），琴键在框内居中：
 * 换曲目/难度时只有键数变化，图示不会推着整个菜单左右跳（工单 16——玩家把
 * 这种重排读成「按方向键画面跟着动」）。
 */
function pianoPreviewHtml(keys: readonly KeyBinding[], lit?: ReadonlySet<string>): string {
  const WHITE_W = 46
  const BLACK_W = 30
  const whites = keys.filter((k) => !k.isBlack).length
  let html = `<div class="piano-frame"><div class="piano-preview" style="width:${whites * WHITE_W}px">`
  let whiteIndex = 0
  for (const binding of keys) {
    const isLit = lit !== undefined && lit.has(binding.key)
    if (binding.isBlack) {
      html += `<span class="pk black${isLit ? ' lit' : ''}" style="left:${whiteIndex * WHITE_W - BLACK_W / 2}px">${binding.key}</span>`
    } else {
      html += `<span class="pk${isLit ? ' lit' : ''}" style="left:${whiteIndex * WHITE_W}px">${binding.key}</span>`
      whiteIndex += 1
    }
  }
  return `${html}</div></div>`
}

function masteryChip(level: MasteryLevel | null): string {
  const key = level ?? 'none'
  return `<span class="mastery mastery-${key}">${MASTERY_LABELS[key]}</span>`
}

function bestHtml(songId: string, diff: DifficultyName): string {
  const best = bestRecordFor(records, songId, diff)
  if (best === undefined) return '<span class="diff-best">未挑战</span>'
  // 徽记读本机纪录（旧纪录缺精度/失误数 → 降级为只能判到弹熟，见 mastery.ts）
  return `<span class="diff-best"><span class="best-rating rating-${best.rating}">${best.rating}</span>连击 ${best.maxCombo}${masteryChip(masteryFromRecord(best))}</span>`
}

function showLibrary(): void {
  screen = 'library'
  records = loadRecords(storage) // 每次进曲库重读（另一标签页可能已更新）
  const rows = SONGS.map((song, index) => {
    const cells = (['easy', 'medium', 'hard'] as const)
      .map((diff) => {
        const selected = index === libSongIndex && diff === libDifficulty ? ' selected' : ''
        return `<button class="diff-cell${selected}" data-song="${index}" data-diff="${diff}">
          <div class="diff-name">${DIFFICULTY_LABELS[diff]}</div>
          <div class="diff-length">${formatClock(song.charts[diff].duration)}</div>${bestHtml(song.id, diff)}
        </button>`
      })
      .join('')
    return `<div class="song-row">
      <div><div class="song-name">${song.title}</div><div class="song-blurb">${song.blurb}</div></div>
      <div class="diff-cells">${cells}</div>
    </div>`
  }).join('')
  const selectedChart = SONGS[libSongIndex]!.charts[libDifficulty]
  const selectedLayout = layoutForKeys(selectedChart.meta?.keys ?? [])
  showOverlay(`
    <div class="screen">
      <h1>心琴 · 曲库</h1>
      <div class="song-list">${rows}</div>
      <div>
        <p>键位图示 · ${SONGS[libSongIndex]!.title}（${DIFFICULTY_LABELS[libDifficulty]}）</p>
        ${pianoPreviewHtml(selectedLayout.keys)}
      </div>
      <div class="actions">
        <button id="btn-start">开战（回车）</button>
        <button id="btn-settings" class="secondary">设置（音量 / 偏移）</button>
      </div>
      <p class="hint">↑↓ 选曲 · ←→ 选难度 · 回车 开战 · 白键 A S D F J K L，黑键嵌于其间</p>
    </div>`,
  )
  overlay.querySelectorAll<HTMLElement>('.diff-cell').forEach((cell) => {
    cell.addEventListener('click', () => {
      libSongIndex = Number(cell.dataset.song)
      libDifficulty = cell.dataset.diff as DifficultyName
      showLibrary()
    })
  })
  overlay.querySelector('#btn-start')?.addEventListener('click', () => {
    void beginBattle(SONGS[libSongIndex]!, libDifficulty)
  })
  overlay.querySelector('#btn-settings')?.addEventListener('click', showSettings)
}

/**
 * 设置面板（工单 06，SPEC 故事 22/23）：音画偏移与两轨音量。
 * 改动即时生效并持久化（每次 input 都写入本地存储，无"保存"按钮——
 * 设置没有需要回滚的原子性）。偏移方向语义：正 = 判定时刻整体前移。
 */
function showSettings(): void {
  screen = 'settings'
  const pct = (v: number): string => `${Math.round(v * 100)}%`
  const offsetLabel = (ms: number): string => (ms === 0 ? '0 毫秒' : `${ms > 0 ? '+' : ''}${ms} 毫秒`)
  showOverlay(`
    <div class="screen">
      <h2>设置</h2>
      <div class="settings-box">
        <div class="setting-row">
          <label for="sl-offset">音画偏移 <b id="offset-value">${offsetLabel(settings.offsetMs)}</b></label>
          <input id="sl-offset" type="range" min="-150" max="150" step="5" value="${settings.offsetMs}">
          <p class="hint">判定公平性校准：正 = 你的按键被判定得整体更「早」，负 = 更「晚」。
          若明明按准了、结果总偏「迟」（画面比声音慢的设备常见），向正调；总偏「早」则向负调。范围 ±150 毫秒。</p>
        </div>
        <div class="setting-row">
          <label for="sl-music">琴声音量 <b id="music-value">${pct(settings.musicVolume)}</b></label>
          <input id="sl-music" type="range" min="0" max="100" step="1" value="${Math.round(settings.musicVolume * 100)}">
        </div>
        <div class="setting-row">
          <label for="sl-sfx">战斗音效音量 <b id="sfx-value">${pct(settings.sfxVolume)}</b></label>
          <input id="sl-sfx" type="range" min="0" max="100" step="1" value="${Math.round(settings.sfxVolume * 100)}">
          <p class="hint">琴声是你弹出的钢琴与自动伴奏（音乐轨）；剑气、受击、余韵等是战斗音效（音效轨），两轨独立调节。</p>
        </div>
      </div>
      <div class="actions">
        <button id="btn-settings-back">返回曲库（Esc）</button>
      </div>
    </div>`,
  )
  const persist = (next: Settings): void => {
    settings = next
    saveSettings(storage, settings)
  }
  overlay.querySelector<HTMLInputElement>('#sl-offset')?.addEventListener('input', (ev) => {
    const offsetMs = Number((ev.target as HTMLInputElement).value)
    persist({ ...settings, offsetMs })
    overlay.querySelector('#offset-value')!.textContent = offsetLabel(offsetMs)
  })
  overlay.querySelector<HTMLInputElement>('#sl-music')?.addEventListener('input', (ev) => {
    const musicVolume = Number((ev.target as HTMLInputElement).value) / 100
    persist({ ...settings, musicVolume })
    engine.setVolumes(musicVolume, settings.sfxVolume) // 即时生效
    overlay.querySelector('#music-value')!.textContent = pct(musicVolume)
  })
  overlay.querySelector<HTMLInputElement>('#sl-sfx')?.addEventListener('input', (ev) => {
    const sfxVolume = Number((ev.target as HTMLInputElement).value) / 100
    persist({ ...settings, sfxVolume })
    engine.setVolumes(settings.musicVolume, sfxVolume)
    overlay.querySelector('#sfx-value')!.textContent = pct(sfxVolume)
  })
  overlay.querySelector('#btn-settings-back')?.addEventListener('click', showLibrary)
  // 键盘玩家：焦点落在偏移滑条上，方向键即微调（原生 range 行为）
  overlay.querySelector<HTMLInputElement>('#sl-offset')?.focus()
}

function showTitle(): void {
  screen = 'title'
  const firstVisit = !tutorialDone(storage)
  showOverlay(`
    <div class="screen">
      <h1 class="title-mark">心琴</h1>
      <p>${DEV_BATTLE
        ? `开发验证 · ${DEV_SONG?.title ?? ''}（${DIFFICULTY_LABELS[DEV_DIFFICULTY]}）· ${AUTO === 'perfect' ? '自动完美弹奏' : AUTO === 'idle' ? '静置败局' : '手动'}`
        : firstVisit
          ? '水墨斗琴 · 音符落处，剑气斩妖'
          : ''}</p>
      <p class="start-prompt">点击此处或按任意键 · ${firstVisit && !DEV_BATTLE ? '开始键位引导' : '开始'}</p>
    </div>`,
  )
}

async function proceedFromTitle(): Promise<void> {
  if (starting || screen !== 'title') return
  starting = true
  if (DEV_BATTLE) {
    starting = false
    await beginBattle(DEV_SONG ?? SONGS[0]!, DEV_DIFFICULTY)
    return
  }
  try {
    await engine.start()
    await piano.load()
  } catch (err) {
    console.error('音频初始化失败', err)
    starting = false
    showFatal('音频初始化失败，请刷新重试')
    return
  }
  starting = false
  if (!tutorialDone(storage)) showTutorial()
  else showLibrary()
}

/** 键位引导（SPEC 故事 1/2）：白键试按出声、逐键点亮；完成 / Esc / 超时退出 */
function showTutorial(): void {
  screen = 'tutorial'
  tutorialLit.clear()
  tutorialDeadline = engine.now() + TUTORIAL_SECONDS
  const keys = layoutForKeys([...WHITE_KEY_NOTES]).keys
  showOverlay(`
    <div class="screen">
      <h2>键位引导</h2>
      <p>依次按下白键，听一声、亮一键——把手放上琴位</p>
      ${pianoPreviewHtml(keys, tutorialLit)}
      <p class="hint">全部点亮或按 Esc 进入曲库（约 ${TUTORIAL_SECONDS} 秒后自动继续）</p>
    </div>`,
  )
}

function tutorialKeyPressed(rawKey: string): void {
  const physical = rawKey.toUpperCase() // 物理键名统一大写（真实键盘 keydown 多为小写）
  const lane = laneForKey(physical)
  if (lane === null) return
  const note = WHITE_KEY_NOTES[lane]
  if (note === undefined) return
  piano.play(note, engine.now() + PLAY_EPSILON) // 试按即出声（故事 2）
  if (tutorialLit.has(physical)) return
  tutorialLit.add(physical)
  debugView.tutorialLit = tutorialLit.size
  const preview = overlay.querySelector('.piano-frame')
  if (preview !== null) {
    preview.outerHTML = pianoPreviewHtml(layoutForKeys([...WHITE_KEY_NOTES]).keys, tutorialLit)
  }
  if (tutorialLit.size === WHITE_KEY_NOTES.length) finishTutorial()
}

function finishTutorial(): void {
  markTutorialDone(storage) // 完成或跳过都算见过——不再打扰（故事 1）
  tutorialDeadline = Number.POSITIVE_INFINITY
  showLibrary()
}

function showPause(): void {
  showOverlay(`
    <div class="screen">
      <h2>暂停</h2>
      <p>琴音暂歇，墨妖亦止步</p>
      <div class="actions">
        <button id="btn-resume">继续（Esc）</button>
        <button id="btn-abandon" class="secondary">放弃 · 返回曲库（Q）</button>
      </div>
    </div>`,
  )
  overlay.querySelector('#btn-resume')?.addEventListener('click', resumeBattle)
  overlay.querySelector('#btn-abandon')?.addEventListener('click', abandonBattle)
}

/**
 * 结算的平均偏差指路（ADR-0013，工单 15）：措辞在纯层（`rating.offsetAdvice`，
 * 有测试钉着），壳层只负责包一层标签。null = 命中太少，不显示。
 */
function offsetAdviceLine(summary: BattleSummary): string {
  const advice = offsetAdvice(summary.avgOffset, summary.perfect + summary.good)
  return advice === null ? '' : `<p class="hint">${advice}</p>`
}

/* ── 回放（票 19）：只在结算这一刻，只在内存里 ──────────────────────── */

/** 回放专用的音乐支路：接在音乐轨上（同一「琴声音量」），离开结算即断开 */
let replayBus: GainNode | null = null
/** 回放起点前的余量：第一颗音也落在音频时间线的未来（防爆音） */
const REPLAY_LEAD = 0.12

/**
 * 停掉回放：未到期的调度丢掉，已排进音频时间线的采样随支路断开一起失声。
 * 离开结算画面（返回曲库 / 再来一次）时调用——回放只在结算这一刻有效。
 */
function stopReplay(): void {
  engine.cancelScheduled()
  if (replayBus !== null) {
    replayBus.disconnect()
    replayBus = null
  }
  debugView.replayPlaying = false
}

/**
 * 「听我的演奏」：本局最后 20 秒（不足则从头，含终章）重放一遍。
 * 玩家命中的音叠在同一窗口的伴奏上一起响；漏掉的音在计划里根本没有，
 * 所以不会响——回放的是真实演奏，不是补全。声音全走对局用过的同一套
 * 钢琴采样与音乐轨增益；不重跑模拟器、不重放怪物动画、不写任何存储。
 */
function startReplay(): void {
  stopReplay()
  const plan = replayPlanFor(
    playedNotes,
    accompanimentPlan(chart, song.accompanimentFallback ?? 'none'),
    outcomeAt,
    finaleAtOf(chart),
  )
  const bus = engine.context.createGain()
  bus.connect(engine.musicBus)
  replayBus = bus
  const startAt = engine.now() + REPLAY_LEAD
  for (const note of plan.notes) {
    const binding = layout.keys[note.lane]
    if (binding === undefined) continue
    engine.scheduleAhead(startAt + note.at, (when) => piano.play(binding.note, when, bus))
  }
  for (const chord of plan.accompaniment) {
    engine.scheduleAhead(startAt + chord.at, (when) => piano.play(midiToNoteName(chord.midi), when, bus))
  }
  debugView.replayNotes = plan.notes.length
  debugView.replayMisses = plan.misses
  debugView.replayPlaying = true
}

/**
 * 结算：一张一屏可读的演奏卡（曲名 / 难度 / 评级 / 精度 / 最长连击 /
 * 掌握度徽记 / 是否刷新纪录）+「听我的演奏」。掌握度只描述这一局。
 */
function showSettlement(): void {
  outcomeShown = true
  const summary = sim.summary()
  const won = outcomeResult === 'victory'
  const rating = settlement?.rating ?? 'C'
  const mastery = settlement?.mastery ?? null
  // 走到哪：按终局那一刻的谱面时刻与总长算（纯派生，不进模拟器状态）
  const reached = progressLine(songProgress(chart, outcomeAt), outcomeReason)
  // 演奏卡的回放读数：与点下「听我的演奏」时同一份计划（纯函数，重复算无副作用）
  const plan = replayPlanFor(
    playedNotes,
    accompanimentPlan(chart, song.accompanimentFallback ?? 'none'),
    outcomeAt,
    finaleAtOf(chart),
  )
  const best = bestRecordFor(records, song.id, difficulty)
  const recordChip =
    settlement?.improved === true
      ? '<span class="card-record">新纪录</span>'
      : best === undefined
        ? '' // 败局且无旧纪录：没有可比的对象（败局不入册）
        : `<span class="card-best">本机最佳 ${best.rating} · 连击 ${best.maxCombo}</span>`
  showOverlay(`
    <div class="screen settlement">
      <h2>${won ? '斗琴告捷' : '斗琴落败'}</h2>
      <p class="reached-line${won ? '' : ' defeat'}">${reached}</p>
      <section class="play-card">
        <div class="card-head">
          <b class="card-song">${song.title}</b>
          <span class="card-diff">${DIFFICULTY_LABELS[difficulty]}</span>
          ${recordChip}
        </div>
        <div class="card-body">
          <div class="card-rating rating-${rating}">${rating}</div>
          <dl class="card-stats">
            <div><dt>精度</dt><dd>${(accuracyFor(summary) * 100).toFixed(1)}%</dd></div>
            <div><dt>最长连击</dt><dd>${summary.maxCombo}</dd></div>
            <div><dt>掌握度</dt><dd>${masteryChip(mastery)}</dd></div>
          </dl>
        </div>
        <p class="card-foot">${masteryLine(mastery)}</p>
        <div class="card-replay">
          <button id="btn-replay">听我的演奏</button>
          <span class="replay-note">最后 ${Math.round(plan.duration)} 秒 · 命中 ${plan.hits} 颗 · 漏 ${plan.misses} 颗${plan.finaleAt === null ? '' : ' · 含终章'}</span>
        </div>
      </section>
      <p class="stats-line">总伤害 <b>${Math.round(summary.damageDealt)}</b> · 琴心通明 <b>${summary.qinxin}</b> 次 · 完美 <b>${summary.perfect}</b> · 良好 <b>${summary.good}</b> · 失误 <b>${summary.miss}</b></p>
      ${offsetAdviceLine(summary)}
      <div class="actions">
        <button id="btn-retry">再来一次（回车）</button>
        <button id="btn-library" class="secondary">返回曲库（Esc）</button>
      </div>
    </div>`,
  )
  debugView.mastery = mastery === null ? null : MASTERY_LABELS[mastery]
  overlay.querySelector('#btn-replay')?.addEventListener('click', (ev) => {
    startReplay()
    const button = ev.currentTarget
    if (button instanceof HTMLElement) button.textContent = '再听一遍'
  })
  overlay.querySelector('#btn-retry')?.addEventListener('click', () => {
    void beginBattle(song, difficulty)
  })
  overlay.querySelector('#btn-library')?.addEventListener('click', returnToLibrary)
}

/* ── 对局生命周期 ──────────────────────────────────────────────────── */

async function beginBattle(nextSong: SongEntry, nextDifficulty: DifficultyName): Promise<void> {
  if (starting) return
  if (screen === 'countdown' || screen === 'playing' || screen === 'paused') return
  starting = true
  try {
    await engine.start()
    await piano.load()
  } catch (err) {
    console.error('音频初始化失败', err)
    starting = false
    showFatal('音频初始化失败，请刷新重试')
    return
  }
  starting = false
  song = nextSong
  difficulty = nextDifficulty
  chart = song.charts[difficulty]
  layout = layoutForKeys(chart.meta?.keys ?? [])
  sim = new Simulator(chart)
  resetFeedback()
  resetDebugView()
  held.clear()
  outcomeResult = null
  outcomeReason = 'cleared'
  outcomeAt = 0
  outcomeShown = false
  endedFreezeT = null
  overlayDueAt = 0
  settlement = null
  playedNotes.length = 0 // 上一局的演奏记录不许串到这一局（回放只属于刚结束的那一局）
  stopReplay()
  hideOverlay()
  roundStartAt = engine.now() + COUNT_BEATS * BEAT_SECONDS + 0.15
  screen = 'countdown'
  for (let i = 0; i < COUNT_BEATS; i += 1) {
    const when = roundStartAt - (COUNT_BEATS - i) * BEAT_SECONDS
    engine.scheduleAhead(when, (w) => engine.countdownTick(w, i === COUNT_BEATS - 1))
  }
  // 墨主登场钟鼓：出场时刻已知（出场计划），lookahead 准点发声
  for (const monster of sim.monstersView()) {
    if (monster.kind !== 'inkLord') continue
    engine.scheduleAhead(roundStartAt + monster.spawnAt, (w) => engine.lordEntrance(w))
  }
  scheduleAccompaniment()
  if (AUTO === 'perfect') scheduleAutoplay()
}

/**
 * 伴奏声部（工单 18，ADR-0016）：整首的和声骨架经 lookahead 调度器提前排进
 * 音乐轨，与琴声共用「琴声音量」（同一 Piano → musicBus，故该滑条对两者一并
 * 生效，调到 0 时一起静音、战斗音效不受影响）。
 *
 * 它**不**经过按键管线：不模拟按键、不进模拟器、不产生判定与战斗事件，
 * 因此漏掉的音不会被补上——旋律永远只在你按键时响。卡农没有伴奏声部字段，
 * 由曲目声明走合成低频铺底（同一个调度器、同一套钢琴采样）。
 */
function scheduleAccompaniment(): void {
  const hits = accompanimentPlan(chart, song.accompanimentFallback ?? 'none')
  for (const hit of hits) {
    engine.scheduleAhead(roundStartAt + hit.at, (when) => piano.play(midiToNoteName(hit.midi), when))
  }
}

/** 开发钩子：按谱面时刻精确自动弹奏（经 lookahead 调度走同一按键管线） */
function scheduleAutoplay(): void {
  for (const note of chart.notes) {
    engine.scheduleAhead(roundStartAt + note.time, (when) => {
      press(note.lane, when - roundStartAt)
      // 自动弹奏无物理 keyup：即时松开，长按去重才不会吞掉同键后续音符
      held.delete(note.lane)
      sim.keyUp(note.lane)
    })
  }
}

/** 暂停：挂起音频主时钟（对局时间轴原地冻结）并掀暂停菜单 */
function pauseBattle(): void {
  if (screen !== 'countdown' && screen !== 'playing') return
  pausedFrom = screen === 'countdown' ? 'countdown' : 'playing'
  engine.pause()
  for (const lane of held) sim.keyUp(lane)
  held.clear()
  screen = 'paused'
  showPause()
}

function resumeBattle(): void {
  if (screen !== 'paused') return
  engine.resume()
  hideOverlay()
  screen = pausedFrom
}

/** 放弃对局：丢弃未到期调度，回曲库 */
function abandonBattle(): void {
  if (screen !== 'paused') return
  engine.cancelScheduled()
  engine.resume()
  held.clear()
  showLibrary()
}

/** 终局后返回曲库（结算画面的 Esc / 按钮） */
function returnToLibrary(): void {
  stopReplay() // 回放只在结算这一刻有效：离开即散（未到期的调度一并丢弃）
  engine.cancelScheduled()
  showLibrary()
}

function collect(events: readonly GameEvent[]): void {
  for (const e of events) {
    // offset 带进闪示：判定带只有 ±17px 宽，偏差只能靠数字告诉玩家（ADR-0013）
    flashes.push({ lane: e.lane, judgment: e.judgment, at: e.time, offset: e.offset })
    // 票 19：同一批事件抄进本局演奏记录（内存）。时刻取事件自带的按键时刻，
    // 回放因此带着玩家当时的早/晚——听起来是这一遍，而不是节拍器。
    playedNotes.push({ lane: e.lane, judgment: e.judgment, at: e.time })
  }
}

function collectBattle(events: readonly BattleEvent[]): void {
  for (const e of events) {
    if (e.type === 'strike') {
      hits.push({ at: e.time, monsterId: e.monsterId, chord: false })
      engine.hitStrike(engine.now() + PLAY_EPSILON, false) // 命中剑气（工单 06）
    } else if (e.type === 'chord') {
      hits.push({ at: e.time, monsterId: e.monsterId, chord: true })
      engine.hitStrike(engine.now() + PLAY_EPSILON, true) // 和弦重击分档
    } else if (e.type === 'slain') {
      slains.push({ at: e.time, monsterId: e.monsterId })
      engine.monsterSlain(engine.now() + PLAY_EPSILON)
    } else if (e.type === 'whiff') {
      // 扑空（ADR-0011）：可见可闻、不掉血——判定线上的空劈
      whiffs.push({ at: e.time, lane: e.lane })
      engine.whiff(engine.now() + PLAY_EPSILON)
    } else if (e.type === 'tint') {
      // 异色词缀（工单 09）：判定线色笔 + 怪物状态，音效按色分档
      tints.push({ at: e.time, kind: e.kind, lane: e.lane, targetIds: e.targetIds })
      if (e.kind === 'cold') debugView.tintCold += 1
      else if (e.kind === 'toxic') debugView.tintToxic += 1
      else debugView.tintBlast += 1
      engine.tintStrike(engine.now() + PLAY_EPSILON, e.kind)
    } else if (e.type === 'qinxin') {
      // 琴心通明（工单 10）：战场区墨爆 + 向上的拨弦声；不抢音符流
      qinxins.push({ at: e.time, index: e.index })
      engine.qinxinBurst(engine.now() + PLAY_EPSILON)
    } else if (e.type === 'poison') {
      // 中毒跳伤：极轻的滴声（状态层，不抢注意力）
      debugView.poisonTicks += 1
      engine.poisonTick(engine.now() + PLAY_EPSILON)
    } else if (e.type === 'bite') {
      // 咬线（ADR-0011）：玩家掉血的唯一来源——怪物突进 + 红晕 + 闷响
      bites.push({ at: e.time, monsterId: e.monsterId })
      debugView.bites += 1 // 累计口数（bites 列表本身按淡出期剪裁）
      engine.biteHit(engine.now() + PLAY_EPSILON)
    } else if (e.type === 'sustain') {
      sustains.push(e)
      debugView.sustainTier = e.tier
      debugView.sustainFinale = e.finale
      debugView.sustainAt = e.time
      engine.sustainBurst(
        engine.now() + PLAY_EPSILON,
        e.tier === 'grand' ? 2 : e.tier === 'major' ? 1 : 0,
        e.finale,
      )
      if (e.finale) {
        // 终章印章：按渲染侧落印时刻准点盖下（lookahead 提前注册）
        engine.scheduleAhead(roundStartAt + finaleSealAt(e), (w) => engine.finaleSeal(w))
      }
    } else if (e.type === 'outcome') {
      outcomeResult = e.result
      outcomeReason = e.reason
      outcomeAt = e.time
      endedAt = engine.now()
      screen = 'ended'
      // 结算预计算：评级 + 掌握度 + 纪录（胜局才入册，失败不更新最佳）
      const summary = sim.summary()
      const rating = ratingFor(summary, e.result)
      const accuracy = accuracyFor(summary)
      const mastery = masteryFor({ outcome: e.result, rating, accuracy, missCount: summary.miss })
      let improved = false
      if (e.result === 'victory') {
        const result = recordResult(records, song.id, difficulty, 'victory', {
          rating,
          maxCombo: summary.maxCombo,
          accuracy,
          missCount: summary.miss,
        })
        records = result.records
        improved = result.improved
        if (improved) saveRecords(storage, records)
      }
      settlement = { rating, improved, mastery }
      // 终章宽限：收势没演完不掀结算幕布（无终章则立即）
      const finale = sustains[sustains.length - 1]
      const finaleEnd = finale !== undefined && finale.finale ? roundStartAt + finale.windowEnd : 0
      overlayDueAt = Math.max(endedAt, finaleEnd + FINALE_GRACE)
    }
  }
}

let endedAt = 0

/**
 * 按键按下（真人与自动弹奏共用管线）。
 * chartTime 为谱面时间轴上的物理按键时刻；判定时刻由音画偏移平移得出
 * （工单 06：偏移只在进模拟器前这一处生效，琴声不受偏移影响——
 * 钢琴按哪刻响哪刻，校准的是"判定"而非"弹奏"）。
 */
function press(lane: Lane, chartTime: number): void {
  const binding = layout.keys[lane]
  if (binding === undefined) return
  held.add(lane)
  const outcome = sim.keyDown(lane, judgedTime(chartTime, settings.offsetMs))
  // 按键即出琴声（无论判定结果——这是钢琴，不是音效机）
  if (!outcome.repeat) {
    piano.play(binding.note, roundStartAt + chartTime + PLAY_EPSILON)
  }
  collect(outcome.events)
}

/* ── 输入分发（按画面） ────────────────────────────────────────────── */

/**
 * 浏览器的默认按键行为（方向键滚动、空格翻页）会作用在游戏画布所在的文档上：
 * 菜单里按 ↑↓←→ 选曲选难度时，整个画面跟着位移（工单 16 的来由）。这些键
 * 游戏自己消费，就必须吃掉默认行为；唯一例外是焦点落在原生表单控件上——
 * 设置里的滑条要靠方向键做原生微调，抢过来反而不能用。
 */
const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
  'Spacebar',
])

/** 焦点在原生表单控件上时，方向键/空格归控件 */
function isFormField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

function onKeyDown(ev: KeyboardEvent): void {
  if (ev.repeat) return // keydown 去重第一道；第二道在模拟器 held 状态
  if (SCROLL_KEYS.has(ev.key) && !isFormField(ev.target)) ev.preventDefault()
  switch (screen) {
    case 'title': {
      void proceedFromTitle()
      return
    }
    case 'tutorial': {
      if (ev.key === 'Escape') {
        finishTutorial()
        return
      }
      tutorialKeyPressed(ev.key)
      return
    }
    case 'library': {
      if (ev.key === 'ArrowUp') {
        libSongIndex = (libSongIndex + SONGS.length - 1) % SONGS.length
        showLibrary()
      } else if (ev.key === 'ArrowDown') {
        libSongIndex = (libSongIndex + 1) % SONGS.length
        showLibrary()
      } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        const order: DifficultyName[] = ['easy', 'medium', 'hard']
        const step = ev.key === 'ArrowRight' ? 1 : -1
        const next = (order.indexOf(libDifficulty) + step + order.length) % order.length
        libDifficulty = order[next]!
        showLibrary()
      } else if (ev.key === 'Enter') {
        void beginBattle(SONGS[libSongIndex]!, libDifficulty)
      }
      return
    }
    case 'settings': {
      // 滑条方向键微调交给原生 range；Esc/回车收起回曲库
      if (ev.key === 'Escape' || ev.key === 'Enter') showLibrary()
      return
    }
    case 'countdown':
    case 'playing': {
      if (ev.key === 'Escape') {
        pauseBattle()
        return
      }
      const lane = layout.byPhysical(ev.key)
      if (lane === null) return
      press(lane, engine.now() - roundStartAt)
      return
    }
    case 'paused': {
      if (ev.key === 'Escape' || ev.key === 'Enter') resumeBattle()
      else if (ev.key === 'q' || ev.key === 'Q') abandonBattle()
      return
    }
    case 'ended': {
      if (ev.key === 'Enter') void beginBattle(song, difficulty)
      else if (ev.key === 'Escape') returnToLibrary()
      return
    }
  }
}

function onKeyUp(ev: KeyboardEvent): void {
  if (screen !== 'countdown' && screen !== 'playing') return
  const lane = layout.byPhysical(ev.key)
  if (lane === null) return
  held.delete(lane)
  sim.keyUp(lane)
}

/** 失焦时键释放事件可能丢失：清空按住状态，避免回来后按键被误判为长按 */
function onBlur(): void {
  for (const lane of held) sim.keyUp(lane)
  held.clear()
}

/** 切出标签页自动暂停（SPEC 故事 25）：回来时血不会已流空 */
function onVisibilityChange(): void {
  if (document.hidden && (screen === 'countdown' || screen === 'playing')) {
    pauseBattle()
  }
}

/* ── 主循环 ────────────────────────────────────────────────────────── */

/** 就地裁剪：删去已超过保留期的条目（倒序遍历，splice 不漏删） */
function pruneExpired<T>(list: T[], t: number, keep: number, at: (item: T) => number): void {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (t - at(list[i]!) > keep) list.splice(i, 1)
  }
}

function prune(t: number): void {
  // 短命反馈（都带 at）与余韵（按窗口尾）分开裁剪——新增一类事件只要加进
  // 下面这张表，不必再改 prune/resetFeedback 之外的地方
  const shortLived: { at: number }[][] = [flashes, hits, slains, bites, whiffs, tints, qinxins]
  for (const list of shortLived) pruneExpired(list, t, FLASH_KEEP, (item) => item.at)
  // 余韵事件两用：演出按窗口尾 + 残响裁，句提示（票 17）要读到触发后 2 秒——
  // 取两者之晚。不能只按窗口尾裁：那会让「第 N / M 句」的存续期跟着谱面的
  // 余韵窗口长度浮动（短窗口会提前消失）。
  for (let i = sustains.length - 1; i >= 0; i -= 1) {
    const s = sustains[i]!
    if (t > Math.max(s.windowEnd + SUSTAIN_KEEP, s.time + CUE_LIFE)) sustains.splice(i, 1)
  }
}

/** 非战斗画面的背景板：所选谱面的空音场（键位轨道与判定线，无音符无怪物） */
function drawBackdrop(): void {
  const backdropChart =
    screen === 'library' ? SONGS[libSongIndex]!.charts[libDifficulty] : chart
  renderer.draw({
    chart: backdropChart,
    layout: layoutForKeys(backdropChart.meta?.keys ?? []).keys,
    t: performance.now() / 1000,
    pending: [],
    combo: 0,
    comboMultiplier: 1,
    held: new Set(),
    flashes: [],
    countdownBeats: null,
    monsters: [],
    playerHp: PLAYER_MAX_HP,
    playerMaxHp: PLAYER_MAX_HP,
    hits: [],
    slains: [],
    bites: [],
    whiffs: [],
    tints: [],
    qinxinGauge: 0,
    qinxinHits: 0,
    qinxins: [],
    sustains: [],
  }, true)
}

function frame(): void {
  requestAnimationFrame(frame)

  if (screen === 'title' || screen === 'library' || screen === 'tutorial') {
    if (screen === 'tutorial' && engine.now() >= tutorialDeadline) {
      finishTutorial() // 30 秒到点自动放行
      return
    }
    drawBackdrop()
    debugView.phase = screen
    return
  }

  const now = engine.now()
  if (screen === 'countdown' && now >= roundStartAt) screen = 'playing'

  // 终局宽限：终章收势没演完不掀结算幕布；画面时钟走完演出再冻结
  if (screen === 'ended' && !outcomeShown && now >= overlayDueAt) {
    if (endedFreezeT === null) endedFreezeT = now - roundStartAt
    showSettlement()
  }
  const t = screen === 'ended' ? (endedFreezeT ?? now - roundStartAt) : now - roundStartAt

  if (screen === 'countdown' || screen === 'playing') {
    collect(sim.tick(t))
    collectBattle(sim.drainBattle())
  }
  prune(t)

  debugView.phase = screen
  debugView.t = t
  debugView.combo = sim.combo
  debugView.sustains = sustains.length
  const summaryNow = sim.summary()
  debugView.perfect = summaryNow.perfect
  debugView.good = summaryNow.good
  debugView.miss = summaryNow.miss
  debugView.avgOffsetMs = Math.round(summaryNow.avgOffset * 1000)
  debugView.playerHp = sim.playerHp
  debugView.monstersAlive = sim.monstersView().filter((mo) => mo.hp > 0 && mo.spawnAt <= t).length
  debugView.qinxinGauge = Number(sim.qinxinGauge.toFixed(3))
  debugView.qinxinReleases = sim.qinxinReleases
  debugView.progressRatio = Number(songProgress(chart, t).ratio.toFixed(3))
  const cue = progressCueAt(chart, sustains, t)
  debugView.progressCue =
    cue === null ? null : cue.kind === 'final' ? '最后一句' : `第 ${cue.index} / ${cue.count} 句`

  renderer.draw({
    chart,
    layout: layout.keys,
    t,
    pending: sim.pendingNotes(),
    combo: sim.combo,
    comboMultiplier: comboMultiplierFor(sim.combo),
    held,
    flashes,
    countdownBeats: screen === 'countdown' ? (roundStartAt - now) / BEAT_SECONDS : null,
    monsters: sim.monstersView(),
    playerHp: sim.playerHp,
    playerMaxHp: sim.playerMaxHp,
    hits,
    slains,
    bites,
    whiffs,
    tints,
    qinxinGauge: sim.qinxinGauge,
    qinxinHits: sim.qinxinHits,
    qinxins,
    sustains,
  })
}

/* ── 装配启动 ──────────────────────────────────────────────────────── */

overlay.addEventListener('click', () => {
  if (screen === 'title') void proceedFromTitle()
})
window.addEventListener('keydown', onKeyDown)
window.addEventListener('keyup', onKeyUp)
window.addEventListener('blur', onBlur)
document.addEventListener('visibilitychange', onVisibilityChange)
window.addEventListener('resize', () => renderer.resize())
requestAnimationFrame(frame)

// 首次进入先引导（标题→引导→曲库）；老玩家直接进曲库；开发钩子经标题直开战
showTitle()
if (!DEV_BATTLE && tutorialDone(storage)) showLibrary()
