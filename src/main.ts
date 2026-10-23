/**
 * 装配层（薄壳）：把纯核心模拟器与音频/渲染两个壳接在一起。
 * 分阶段：待开始（等用户手势）→ 倒计时（lookahead 调度的合成木鱼声）
 * → 演奏（rAF 消费音频主时钟）→ 谱面尽后自动再来一轮。
 */

import { AudioEngine } from './audio/engine'
import { Piano } from './audio/piano'
import { demoChart } from './charts/demo'
import type { Lane } from './core/chart'
import { laneForKey } from './core/keymap'
import { Simulator } from './core/simulator'
import type { GameEvent } from './core/simulator'
import { Renderer } from './render/renderer'
import type { JudgmentFlash } from './render/renderer'

/** 倒计时拍数与拍长（120 BPM，与合成木鱼声对应） */
const COUNT_BEATS = 4
const BEAT_SECONDS = 0.5
/** 演奏中琴声的调度延迟：把 start() 放进音频时间线的近未来，防呆防爆音 */
const PLAY_EPSILON = 0.003
/** 判定闪示在闪示列表中的最长保留（供淡出后清理） */
const FLASH_KEEP = 1.5

const canvas = document.querySelector<HTMLCanvasElement>('#stage')!
const overlay = document.querySelector<HTMLElement>('#overlay')!
if (canvas === null || overlay === null) throw new Error('页面缺少 #stage 或 #overlay')

const engine = new AudioEngine()
const piano = new Piano(() => engine.context, () => engine.destination)
const renderer = new Renderer(canvas)
const chart = demoChart()

type Phase = 'idle' | 'countdown' | 'playing'
let phase: Phase = 'idle'
let starting = false
/** 本轮谱面起点（音频时钟时刻） */
let roundStartAt = 0
let sim = new Simulator(chart)
const held = new Set<Lane>()
const flashes: JudgmentFlash[] = []

function setOverlayMessage(message: string): void {
  const p = overlay.querySelector('p')
  if (p !== null) p.textContent = message
}

async function start(): Promise<void> {
  if (phase !== 'idle' || starting) return
  starting = true
  try {
    await engine.start()
    await piano.load()
  } catch (err) {
    console.error('音频初始化失败', err)
    setOverlayMessage('音频初始化失败，请刷新重试')
    starting = false
    return
  }
  overlay.classList.add('hidden')
  beginRound()
}

function beginRound(): void {
  sim = new Simulator(chart)
  flashes.length = 0
  roundStartAt = engine.now() + COUNT_BEATS * BEAT_SECONDS + 0.15
  phase = 'countdown'
  for (let i = 0; i < COUNT_BEATS; i += 1) {
    const when = roundStartAt - (COUNT_BEATS - i) * BEAT_SECONDS
    engine.scheduleAhead(when, (w) => engine.countdownTick(w, i === COUNT_BEATS - 1))
  }
}

function collect(events: readonly GameEvent[]): void {
  for (const e of events) {
    flashes.push({ lane: e.lane, judgment: e.judgment, at: e.time })
  }
}

function onKeyDown(ev: KeyboardEvent): void {
  if (ev.repeat) return // keydown 去重第一道；第二道在模拟器 held 状态
  if (phase === 'idle') {
    void start()
    return
  }
  const lane = laneForKey(ev.key)
  if (lane === null) return
  held.add(lane)

  const t = engine.now() - roundStartAt
  const outcome = sim.keyDown(lane, t)
  // 按键即出琴声（无论判定结果——这是钢琴，不是音效机）
  if (!outcome.repeat) piano.play(lane, engine.now() + PLAY_EPSILON)
  collect(outcome.events)
}

function onKeyUp(ev: KeyboardEvent): void {
  const lane = laneForKey(ev.key)
  if (lane === null) return
  held.delete(lane)
  sim.keyUp(lane)
}

/** 失焦时键释放事件可能丢失：清空按住状态，避免回来后按键被误判为长按 */
function onBlur(): void {
  for (const lane of held) sim.keyUp(lane)
  held.clear()
}

function pruneFlashes(t: number): void {
  for (let i = flashes.length - 1; i >= 0; i -= 1) {
    if (t - flashes[i]!.at > FLASH_KEEP) flashes.splice(i, 1)
  }
}

function frame(): void {
  requestAnimationFrame(frame)

  if (phase === 'idle') {
    renderer.draw({
      chart,
      t: 0,
      pending: chart.notes,
      combo: 0,
      held,
      flashes,
      countdownBeats: null,
    })
    return
  }

  const now = engine.now()
  if (phase === 'countdown' && now >= roundStartAt) phase = 'playing'
  const t = now - roundStartAt

  collect(sim.tick(t))
  if (phase === 'playing' && t > chart.duration) {
    beginRound() // 演示谱循环：正式曲库（工单 05）替换此行为
    return
  }
  pruneFlashes(t)

  renderer.draw({
    chart,
    t,
    pending: sim.pendingNotes(),
    combo: sim.combo,
    held,
    flashes,
    countdownBeats: phase === 'countdown' ? (roundStartAt - now) / BEAT_SECONDS : null,
  })
}

overlay.addEventListener('click', () => void start())
window.addEventListener('keydown', onKeyDown)
window.addEventListener('keyup', onKeyUp)
window.addEventListener('blur', onBlur)
window.addEventListener('resize', () => renderer.resize())
requestAnimationFrame(frame)
