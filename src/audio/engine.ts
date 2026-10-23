/**
 * 音频引擎：游戏主时钟 + lookahead 调度器（ADR-0010）。
 *
 * 游戏时间轴唯一权威是 audioContext.currentTime——rAF 只负责把"当前时刻"
 * 画出来，不定义时刻本身；按键事件在读到的那一刻被盖上音频时钟的时间戳。
 * 已知未来时刻的声音（倒计时等）经 lookahead 调度器提前注册到 Web Audio
 * 的采样级时间线上；玩家触发的琴声则按事件到达时刻即时调度（now+ε）。
 * 方案参照 Chris Wilson《A Tale of Two Clocks》。
 */

/** lookahead 视野：轮询一次覆盖的未来时长 */
const LOOKAHEAD_SECONDS = 0.12
/** 轮询间隔：远小于视野，保证调度总在到期前发生 */
const PUMP_INTERVAL_MS = 25

interface ScheduledTask {
  readonly at: number
  readonly task: (when: number) => void
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private pumpTimer: ReturnType<typeof setInterval> | null = null
  private readonly queue: ScheduledTask[] = []

  /** 须在用户手势事件处理器内调用（浏览器自动播放策略）。 */
  async start(): Promise<void> {
    if (this.ctx !== null) {
      if (this.ctx.state === 'suspended') await this.ctx.resume()
      return
    }
    const ctx = new AudioContext()
    this.ctx = ctx
    const master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)
    this.master = master
    if (ctx.state === 'suspended') await ctx.resume()
    this.pumpTimer = setInterval(() => this.pumpOnce(), PUMP_INTERVAL_MS)
  }

  get context(): AudioContext {
    if (this.ctx === null) {
      throw new Error('AudioEngine 未启动：须在用户手势内先调用 start()')
    }
    return this.ctx
  }

  /** 所有声音的目的节点（后续工单在此分出音乐/音效音量） */
  get destination(): AudioNode {
    return this.master ?? this.context.destination
  }

  /** 游戏主时钟（秒）。 */
  now(): number {
    return this.context.currentTime
  }

  /**
   * lookahead 调度：at 为音频时钟时刻；task 将在该时刻到期前被调用，
   * 并拿到精确的 when 用于 Web Audio 调度（如 source.start(when)）。
   */
  scheduleAhead(at: number, task: (when: number) => void): void {
    this.queue.push({ at, task })
    this.queue.sort((a, b) => a.at - b.at)
  }

  /** 倒计时木鱼声（程序合成；末拍重音）。 */
  countdownTick(when: number, accent: boolean): void {
    const ctx = this.context
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = accent ? 1320 : 880
    gain.gain.setValueAtTime(accent ? 0.22 : 0.14, when)
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.09)
    osc.connect(gain).connect(this.destination)
    osc.start(when)
    osc.stop(when + 0.1)
  }

  private pumpOnce(): void {
    if (this.ctx === null) return
    const horizon = this.ctx.currentTime + LOOKAHEAD_SECONDS
    while (this.queue.length > 0 && this.queue[0]!.at <= horizon) {
      const { at, task } = this.queue.shift()!
      task(at)
    }
  }

  dispose(): void {
    if (this.pumpTimer !== null) clearInterval(this.pumpTimer)
    this.pumpTimer = null
    void this.ctx?.close()
    this.ctx = null
    this.master = null
  }
}
