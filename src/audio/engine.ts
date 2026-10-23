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

  /** 墨妖反击（Miss）：低频闷响，短促下沉——"挨了一下"。 */
  counterHit(when: number): void {
    const ctx = this.context
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, when)
    osc.frequency.exponentialRampToValueAtTime(52, when + 0.16)
    gain.gain.setValueAtTime(0.3, when)
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.18)
    osc.connect(gain).connect(this.destination)
    osc.start(when)
    osc.stop(when + 0.2)
  }

  /** 墨妖被击杀：墨点泼溅（带通白噪脉冲，Program synthesis，无素材）。 */
  monsterSlain(when: number): void {
    const ctx = this.context
    const seconds = 0.22
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(900, when)
    filter.frequency.exponentialRampToValueAtTime(220, when + seconds)
    filter.Q.value = 0.8
    const gain = ctx.createGain()
    gain.gain.value = 0.5
    source.connect(filter).connect(gain).connect(this.destination)
    source.start(when)
  }

  /**
   * 余韵收势（工单 04）：本句剑气一次性引爆的水墨泼洒声。
   * 与击杀泼溅同族（带通白噪扫频），规模随分档放大——minor 轻扫、
   * major 加低频墨浪、grand 再加深沉的底劲；终章另叠一记钟鸣
   * （微失谐双正弦慢衰减，武侠水墨的收势钟声）。精细打磨是 06 号票。
   */
  sustainBurst(when: number, tier: 0 | 1 | 2, finale: boolean): void {
    const ctx = this.context

    // 泼洒主体：白噪带通自上而下扫频，越大的档越宽越沉
    const seconds = 0.4 + tier * 0.22
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 1.6
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(1100 + tier * 500, when)
    filter.frequency.exponentialRampToValueAtTime(150, when + seconds)
    filter.Q.value = 0.7
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.16 + tier * 0.1 + (finale ? 0.06 : 0), when)
    gain.gain.exponentialRampToValueAtTime(0.001, when + seconds)
    source.connect(filter).connect(gain).connect(this.destination)
    source.start(when)

    // major 起：低频墨浪（正弦下潜，浪头压过来）
    if (tier >= 1 || finale) {
      const wave = ctx.createOscillator()
      const waveGain = ctx.createGain()
      wave.type = 'sine'
      wave.frequency.setValueAtTime(120, when)
      wave.frequency.exponentialRampToValueAtTime(46, when + 0.5)
      waveGain.gain.setValueAtTime(0.22, when)
      waveGain.gain.exponentialRampToValueAtTime(0.001, when + 0.55)
      wave.connect(waveGain).connect(this.destination)
      wave.start(when)
      wave.stop(when + 0.6)
    }

    // 终章：钟鸣收势（双正弦微失谐，慢衰减）
    if (finale) {
      for (const [freq, level] of [
        [164.8, 0.1],
        [165.9, 0.07],
        [82.4, 0.09],
      ] as const) {
        const bell = ctx.createOscillator()
        const bellGain = ctx.createGain()
        bell.type = 'sine'
        bell.frequency.value = freq
        bellGain.gain.setValueAtTime(level, when + 0.05)
        bellGain.gain.exponentialRampToValueAtTime(0.001, when + 1.9)
        bell.connect(bellGain).connect(this.destination)
        bell.start(when + 0.05)
        bell.stop(when + 2)
      }
    }
  }

  /**
   * 墨主登场（工单 04）：低沉钟鼓——比反击闷响更沉更缓的两声，
   * 宣告压轴怪物入场。经 lookahead 在墨主 spawnAt 时刻准点发声。
   */
  lordEntrance(when: number): void {
    const ctx = this.context
    for (const [at, freq, level] of [
      [0, 72, 0.26],
      [0.34, 58, 0.34],
    ] as const) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, when + at)
      osc.frequency.exponentialRampToValueAtTime(freq * 0.55, when + at + 0.5)
      gain.gain.setValueAtTime(level, when + at)
      gain.gain.exponentialRampToValueAtTime(0.001, when + at + 0.8)
      osc.connect(gain).connect(this.destination)
      osc.start(when + at)
      osc.stop(when + at + 0.85)
    }
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
