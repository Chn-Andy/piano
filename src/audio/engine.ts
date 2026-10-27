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
  /** 音乐轨（琴声）与战斗音效轨的总线：独立音量（工单 06，SPEC 故事 23） */
  private music: GainNode | null = null
  private sfx: GainNode | null = null
  /** 启动前记住的音量（start() 时生效；setVolumes 可在任意时刻调用） */
  private volumes = { music: 1, sfx: 1 }
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
    master.connect(ctx.destination) // 总线终点（音乐/音效两轨皆汇于此）
    this.music = ctx.createGain()
    this.music.connect(master)
    this.sfx = ctx.createGain()
    this.sfx.connect(master)
    this.applyVolumes()
    if (ctx.state === 'suspended') await ctx.resume()
    this.pumpTimer = setInterval(() => this.pumpOnce(), PUMP_INTERVAL_MS)
  }

  get context(): AudioContext {
    if (this.ctx === null) {
      throw new Error('AudioEngine 未启动：须在用户手势内先调用 start()')
    }
    return this.ctx
  }

  /** 音乐轨（琴声）目的节点：钢琴接这里；与战斗音效轨互不牵连 */
  get musicBus(): AudioNode {
    return this.music ?? this.context.destination
  }

  /** 战斗音效轨目的节点（引擎内部合成音效统一走这里） */
  private get sfxOut(): AudioNode {
    return this.sfx ?? this.context.destination
  }

  /**
   * 两轨音量（0..1，SPEC 故事 23）。增益分层：master(0.9) → music/sfx 各自
   * 增益 → 各自声音的合成响度。默认 1/1 = 直通，出厂混音即各音效的
   * 相对响度定标（docs/calibration.md）。
   */
  setVolumes(music: number, sfx: number): void {
    this.volumes = { music, sfx }
    this.applyVolumes()
  }

  private applyVolumes(): void {
    if (this.music !== null) this.music.gain.value = this.volumes.music
    if (this.sfx !== null) this.sfx.gain.value = this.volumes.sfx
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

  /**
   * 暂停（工单 05）：挂起音频上下文——主时钟（currentTime）随之冻结，
   * 对局时间轴原地停住；同时停掉 lookahead 泵（挂起期间到期的任务
   * 不应被派发）。恢复后一切调度按原时刻继续，无漂移。
   */
  pause(): void {
    if (this.ctx === null) return
    if (this.pumpTimer !== null) {
      clearInterval(this.pumpTimer)
      this.pumpTimer = null
    }
    if (this.ctx.state === 'running') void this.ctx.suspend()
  }

  /** 继续对局：恢复上下文与时钟，重启 lookahead 泵。 */
  resume(): void {
    if (this.ctx === null) return
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    if (this.pumpTimer === null) {
      this.pumpTimer = setInterval(() => this.pumpOnce(), PUMP_INTERVAL_MS)
    }
  }

  /** 引擎是否处于挂起态（主时钟冻结中） */
  get suspended(): boolean {
    return this.ctx?.state === 'suspended'
  }

  /** 丢弃全部未到期的已注册任务（放弃对局时清场，防僵尸回调） */
  cancelScheduled(): void {
    this.queue.length = 0
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
    osc.connect(gain).connect(this.sfxOut)
    osc.start(when)
    osc.stop(when + 0.1)
  }

  /**
   * 咬线受击（工单 08，ADR-0011：玩家掉血的唯一来源是怪物到位咬线；
 * 语义承自 v1 的"反击闷响"）：低频闷响，短促下沉——"挨了一口"。
   */
  biteHit(when: number): void {
    const ctx = this.context
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, when)
    osc.frequency.exponentialRampToValueAtTime(52, when + 0.16)
    gain.gain.setValueAtTime(0.3, when)
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.18)
    osc.connect(gain).connect(this.sfxOut)
    osc.start(when)
    osc.stop(when + 0.2)
  }

  /**
   * 剑气劈空（工单 08，ADR-0011）：Miss 的剑气扫进空处——宽带白噪
   * 向下的风声，比命中刀锋更低更钝，一瞬即逝（扑空的"呼"）。
   */
  whiff(when: number): void {
    const ctx = this.context
    const seconds = 0.14
    const buffer = this.noiseBuffer(seconds, 2)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(700, when)
    filter.frequency.exponentialRampToValueAtTime(180, when + seconds)
    filter.Q.value = 0.9
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.12, when)
    gain.gain.exponentialRampToValueAtTime(0.001, when + seconds)
    source.connect(filter).connect(gain).connect(this.sfxOut)
    source.start(when)
  }

  /** 墨妖被击杀：墨点泼溅（带通白噪脉冲，Program synthesis，无素材）。 */
  monsterSlain(when: number): void {
    const ctx = this.context
    const seconds = 0.22
    const buffer = this.noiseBuffer(seconds, 2)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(900, when)
    filter.frequency.exponentialRampToValueAtTime(220, when + seconds)
    filter.Q.value = 0.8
    const gain = ctx.createGain()
    gain.gain.value = 0.5
    source.connect(filter).connect(gain).connect(this.sfxOut)
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
    const buffer = this.noiseBuffer(seconds, 1.6)
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
    source.connect(filter).connect(gain).connect(this.sfxOut)
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
      wave.connect(waveGain).connect(this.sfxOut)
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
        bell.connect(bellGain).connect(this.sfxOut)
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
      osc.connect(gain).connect(this.sfxOut)
      osc.start(when + at)
      osc.stop(when + at + 0.85)
    }
  }

  /**
   * 命中剑气（工单 06）：每次命中必响、也必须最克制——琴声是主角，
   * 剑气是刀光掠过的"手感层"。普通命中 = 高频白噪刀锋（90ms 急收）
   * + 一丝金属边（三角波短促下滑）；和弦重击另叠低频顿点与高频亮片，
   * 「双手齐落」的分量感。响度定标见 docs/calibration.md。
   */
  hitStrike(when: number, chord: boolean): void {
    const ctx = this.context

    // 刀锋：高通白噪急收（剑气掠过）
    const seconds = 0.09
    const buffer = this.noiseBuffer(seconds, 3)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const edge = ctx.createBiquadFilter()
    edge.type = 'highpass'
    edge.frequency.value = 1800
    const edgeGain = ctx.createGain()
    edgeGain.gain.value = chord ? 0.11 : 0.07
    source.connect(edge).connect(edgeGain).connect(this.sfxOut)
    source.start(when)

    // 金属边：三角波短促下滑（剑刃的"铮"）
    const osc = ctx.createOscillator()
    const oscGain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1900, when)
    osc.frequency.exponentialRampToValueAtTime(1400, when + 0.08)
    oscGain.gain.setValueAtTime(0.045, when)
    oscGain.gain.exponentialRampToValueAtTime(0.001, when + 0.08)
    osc.connect(oscGain).connect(this.sfxOut)
    osc.start(when)
    osc.stop(when + 0.09)

    if (!chord) return

    // 重击顿点：低频下潜（与墨主登场钟鼓同族，更短促）
    const thump = ctx.createOscillator()
    const thumpGain = ctx.createGain()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(165, when)
    thump.frequency.exponentialRampToValueAtTime(55, when + 0.16)
    thumpGain.gain.setValueAtTime(0.2, when)
    thumpGain.gain.exponentialRampToValueAtTime(0.001, when + 0.2)
    thump.connect(thumpGain).connect(this.sfxOut)
    thump.start(when)
    thump.stop(when + 0.21)

    // 高频亮片：齐落的清脆收笔
    const ping = ctx.createOscillator()
    const pingGain = ctx.createGain()
    ping.type = 'sine'
    ping.frequency.value = 2637
    pingGain.gain.setValueAtTime(0.06, when)
    pingGain.gain.exponentialRampToValueAtTime(0.001, when + 0.12)
    ping.connect(pingGain).connect(this.sfxOut)
    ping.start(when)
    ping.stop(when + 0.13)
  }

  /**
   * 终章印章（工单 06）：朱砂印落印一瞬——深鼓下沉 + 木质"扣"声。
   * 与终章钟鸣（sustainBurst 的 finale 分支）分层互补：钟鸣铺底、
   * 印章定音。发声时刻由渲染侧 finaleSealAt() 对准落印画面。
   */
  finaleSeal(when: number): void {
    const ctx = this.context

    // 深鼓：落印的分量
    const drum = ctx.createOscillator()
    const drumGain = ctx.createGain()
    drum.type = 'sine'
    drum.frequency.setValueAtTime(96, when)
    drum.frequency.exponentialRampToValueAtTime(34, when + 0.14)
    drumGain.gain.setValueAtTime(0.4, when)
    drumGain.gain.exponentialRampToValueAtTime(0.001, when + 0.4)
    drum.connect(drumGain).connect(this.sfxOut)
    drum.start(when)
    drum.stop(when + 0.45)

    // 木质"扣"：印面压纸的一击
    const buffer = this.noiseBuffer(0.05, 2)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 380
    filter.Q.value = 1.6
    const gain = ctx.createGain()
    gain.gain.value = 0.18
    source.connect(filter).connect(gain).connect(this.sfxOut)
    source.start(when)
  }

  private pumpOnce(): void {
    if (this.ctx === null) return
    const horizon = this.ctx.currentTime + LOOKAHEAD_SECONDS
    while (this.queue.length > 0 && this.queue[0]!.at <= horizon) {
      const { at, task } = this.queue.shift()!
      task(at)
    }
  }

  /**
   * 衰减白噪 buffer（程序合成，无素材）：击杀泼溅、余韵收势、剑气刀锋、
   * 落印扣声共用——seconds 为时长，decay 为线性包络的衰减指数
   * （越大收得越急）。
   */
  private noiseBuffer(seconds: number, decay: number): AudioBuffer {
    const ctx = this.context
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** decay
    }
    return buffer
  }

  dispose(): void {
    if (this.pumpTimer !== null) clearInterval(this.pumpTimer)
    this.pumpTimer = null
    void this.ctx?.close()
    this.ctx = null
    this.music = null
    this.sfx = null
  }
}
