/**
 * 装配层（薄壳）：把纯核心模拟器与音频/渲染两个壳接在一起。
 * 分阶段：待开始（等用户手势）→ 倒计时（lookahead 调度的合成木鱼声）
 * → 演奏（rAF 消费音频主时钟；命中结伤害、Miss 挨反击）
 * → 终局（胜/败画面 + 结算统计，一键整首重开）。
 *
 * 开发验证钩子（URL 查询参数，走与真人完全相同的按键管线）：
 *   ?auto=perfect —— 按谱面时刻精确自动弹奏（验胜利路径）
 *   ?auto=idle   —— 从不按键（验败局路径）
 *   ?chart=easy|medium|hard —— 谱面难度（默认 medium；难度选择 UI 是 05 号票）
 */

import { AudioEngine } from './audio/engine'
import { Piano } from './audio/piano'
import { CANON_CHARTS } from './charts/canon'
import type { Lane } from './core/chart'
import { comboMultiplierFor } from './core/combat'
import { layoutForKeys } from './core/keymap'
import { Simulator } from './core/simulator'
import type { BattleEvent, GameEvent } from './core/simulator'
import { Renderer } from './render/renderer'
import type { HitFeedback, JudgmentFlash } from './render/renderer'

/** 倒计时拍数与拍长（120 BPM，与合成木鱼声对应） */
const COUNT_BEATS = 4
const BEAT_SECONDS = 0.5
/** 演奏中琴声的调度延迟：把 start() 放进音频时间线的近未来，防呆防爆音 */
const PLAY_EPSILON = 0.003
/** 判定闪示与战斗反馈在列表中的最长保留（供淡出后清理） */
const FLASH_KEEP = 1.5

const params = new URLSearchParams(window.location.search)
const AUTO = params.get('auto')
const CHART_NAME = params.get('chart') === 'easy' || params.get('chart') === 'hard'
  ? params.get('chart')
  : 'medium'

const canvas = document.querySelector<HTMLCanvasElement>('#stage')!
const overlay = document.querySelector<HTMLElement>('#overlay')!
if (canvas === null || overlay === null) throw new Error('页面缺少 #stage 或 #overlay')

const engine = new AudioEngine()
const piano = new Piano(() => engine.context, () => engine.destination)
const renderer = new Renderer(canvas)

const chart = CANON_CHARTS[CHART_NAME as 'easy' | 'medium' | 'hard']
const layout = layoutForKeys(chart.meta?.keys ?? [])

type Phase = 'idle' | 'countdown' | 'playing' | 'ended'
let phase: Phase = 'idle'
let starting = false
/** 本轮谱面起点（音频时钟时刻） */
let roundStartAt = 0
let sim = new Simulator(chart)
/** 终局信息（胜/败 + 结算），终局画面用 */
let endedAt = 0
let outcomeResult: 'victory' | 'defeat' | null = null
const held = new Set<Lane>()
const flashes: JudgmentFlash[] = []
const hits: HitFeedback[] = []
const slains: { at: number; monsterId: number }[] = []
const counters: { at: number }[] = []

function setOverlay(title: string, lines: readonly string[]): void {
  const h1 = overlay.querySelector('h1')
  if (h1 !== null) h1.textContent = title
  const p = overlay.querySelector('#overlay-message')
  if (p !== null) p.innerHTML = lines.join('<br>')
}

async function start(): Promise<void> {
  if (phase !== 'idle' || starting) return
  starting = true
  try {
    await engine.start()
    await piano.load()
  } catch (err) {
    console.error('音频初始化失败', err)
    setOverlay('心琴', ['音频初始化失败，请刷新重试'])
    starting = false
    return
  }
  overlay.classList.add('hidden')
  beginRound()
}

function beginRound(): void {
  sim = new Simulator(chart)
  flashes.length = 0
  hits.length = 0
  slains.length = 0
  counters.length = 0
  held.clear()
  outcomeResult = null
  roundStartAt = engine.now() + COUNT_BEATS * BEAT_SECONDS + 0.15
  phase = 'countdown'
  for (let i = 0; i < COUNT_BEATS; i += 1) {
    const when = roundStartAt - (COUNT_BEATS - i) * BEAT_SECONDS
    engine.scheduleAhead(when, (w) => engine.countdownTick(w, i === COUNT_BEATS - 1))
  }
  if (AUTO === 'perfect') scheduleAutoplay()
}

/** 开发钩子：按谱面时刻精确自动弹奏（经 lookahead 调度走同一按键管线） */
function scheduleAutoplay(): void {
  for (const note of chart.notes) {
    engine.scheduleAhead(roundStartAt + note.time, (when) => {
      const chartTime = when - roundStartAt
      press(note.lane, chartTime)
      // 自动弹奏无物理 keyup：即时松开，长按去重才不会吞掉同键后续音符
      held.delete(note.lane)
      sim.keyUp(note.lane)
    })
  }
}

function collect(events: readonly GameEvent[]): void {
  for (const e of events) {
    flashes.push({ lane: e.lane, judgment: e.judgment, at: e.time })
  }
}

function collectBattle(events: readonly BattleEvent[]): void {
  for (const e of events) {
    if (e.type === 'strike') {
      hits.push({ at: e.time, monsterId: e.monsterId, chord: false })
    } else if (e.type === 'chord') {
      hits.push({ at: e.time, monsterId: e.monsterId, chord: true })
    } else if (e.type === 'slain') {
      slains.push({ at: e.time, monsterId: e.monsterId })
      engine.monsterSlain(engine.now() + PLAY_EPSILON)
    } else if (e.type === 'counter') {
      counters.push({ at: e.time })
      engine.counterHit(engine.now() + PLAY_EPSILON)
    } else if (e.type === 'outcome') {
      outcomeResult = e.result
      endedAt = engine.now()
      phase = 'ended'
      showOutcome()
    }
  }
}

/** 结算画面（最简：文字 + 统计；评级是 05 号票） */
function showOutcome(): void {
  const s = sim.summary()
  const won = outcomeResult === 'victory'
  setOverlay(won ? '斗琴告捷' : '斗琴落败', [
    won ? '卡农 · 墨主伏诛，全场清空' : '卡农 · 胜负未分，琴音再起',
    `最大连击 ${s.maxCombo} · 完美 ${s.perfect} · 良好 ${s.good} · 失误 ${s.miss}`,
    `总伤害 ${Math.round(s.damageDealt)}`,
    '点击此处或按任意键 · 整首重开',
  ])
  overlay.classList.remove('hidden')
}

/**
 * 按键按下（真人与自动弹奏共用管线）。
 * chartTime 为谱面时间轴时刻；audioWhen 为对应音频时钟发声时刻。
 */
function press(lane: Lane, chartTime: number): void {
  const binding = layout.keys[lane]
  if (binding === undefined) return
  held.add(lane)
  const outcome = sim.keyDown(lane, chartTime)
  // 按键即出琴声（无论判定结果——这是钢琴，不是音效机）
  if (!outcome.repeat) {
    piano.play(binding.note, roundStartAt + chartTime + PLAY_EPSILON)
  }
  collect(outcome.events)
}

function onKeyDown(ev: KeyboardEvent): void {
  if (ev.repeat) return // keydown 去重第一道；第二道在模拟器 held 状态
  if (phase === 'idle') {
    void start()
    return
  }
  if (phase === 'ended') {
    overlay.classList.add('hidden')
    beginRound() // 一键整首重开
    return
  }
  const lane = layout.byPhysical(ev.key)
  if (lane === null) return
  press(lane, engine.now() - roundStartAt)
}

function onKeyUp(ev: KeyboardEvent): void {
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

function prune(t: number): void {
  for (let i = flashes.length - 1; i >= 0; i -= 1) {
    if (t - flashes[i]!.at > FLASH_KEEP) flashes.splice(i, 1)
  }
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    if (t - hits[i]!.at > FLASH_KEEP) hits.splice(i, 1)
  }
  for (let i = slains.length - 1; i >= 0; i -= 1) {
    if (t - slains[i]!.at > FLASH_KEEP) slains.splice(i, 1)
  }
  for (let i = counters.length - 1; i >= 0; i -= 1) {
    if (t - counters[i]!.at > FLASH_KEEP) counters.splice(i, 1)
  }
}

function frame(): void {
  requestAnimationFrame(frame)

  if (phase === 'idle') {
    renderer.draw({
      chart,
      layout: layout.keys,
      t: 0,
      pending: chart.notes,
      combo: 0,
      comboMultiplier: 1,
      held,
      flashes,
      countdownBeats: null,
      monsters: sim.monstersView(),
      playerHp: sim.playerHp,
      playerMaxHp: sim.playerMaxHp,
      hits,
      slains,
      counters,
    })
    return
  }

  const now = engine.now()
  if (phase === 'countdown' && now >= roundStartAt) phase = 'playing'
  // 终局后画面定格在 outcome 时刻
  const t = phase === 'ended' ? endedAt - roundStartAt : now - roundStartAt

  if (phase !== 'ended') {
    collect(sim.tick(t))
    collectBattle(sim.drainBattle())
  }
  prune(t)

  renderer.draw({
    chart,
    layout: layout.keys,
    t,
    pending: sim.pendingNotes(),
    combo: sim.combo,
    comboMultiplier: comboMultiplierFor(sim.combo),
    held,
    flashes,
    countdownBeats: phase === 'countdown' ? (roundStartAt - now) / BEAT_SECONDS : null,
    monsters: sim.monstersView(),
    playerHp: sim.playerHp,
    playerMaxHp: sim.playerMaxHp,
    hits,
    slains,
    counters,
  })
}

overlay.addEventListener('click', () => {
  if (phase === 'idle') {
    void start()
  } else if (phase === 'ended') {
    overlay.classList.add('hidden')
    beginRound()
  }
})
window.addEventListener('keydown', onKeyDown)
window.addEventListener('keyup', onKeyUp)
window.addEventListener('blur', onBlur)
window.addEventListener('resize', () => renderer.resize())
requestAnimationFrame(frame)
