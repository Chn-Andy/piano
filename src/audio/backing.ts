/**
 * 全轨伴奏（v1.6，ADR-0019）：主题曲在 medium / hard 播放原曲的一条常驻音轨。
 *
 * 与钢琴采样共用音乐总线（受「琴声音量」控制）；按谱面 t=0（`roundStartAt`）
 * 启动，暂停随 AudioContext.suspend() 冻结，结算/放弃时淡出并停源。加载失败
 * 返回 false——调用方降级纯钢琴版，不阻塞开局。
 */
export class Backing {
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  private gain: GainNode | null = null
  private loadedUrl: string | null = null

  constructor(
    private readonly ctx: () => AudioContext,
    private readonly destination: () => AudioNode,
  ) {}

  /** 当前是否有已排程/在播的音源（调试读数与回放前检查用） */
  get playing(): boolean {
    return this.source !== null
  }

  /**
   * 取回并解码一条音轨（同一 URL 只解码一次）。失败返回 false，不抛——
   * 主题曲的全轨是增强，不是开局前提。
   */
  async load(url: string): Promise<boolean> {
    if (this.loadedUrl === url && this.buffer !== null) return true
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.arrayBuffer()
      this.buffer = await this.ctx().decodeAudioData(data)
      this.loadedUrl = url
      return true
    } catch (err) {
      console.warn('全轨伴奏加载失败，降级纯钢琴版', err)
      this.buffer = null
      this.loadedUrl = null
      return false
    }
  }

  /**
   * 在音频时钟 `when` 启动，`offset` 秒起播（加载晚到时从当前谱面时刻切入，
   * 不把整首歌从头再放一遍）。未加载则静默无操作。
   */
  start(when: number, gainValue: number, offset = 0): void {
    this.stop(0)
    if (this.buffer === null) return
    const ctx = this.ctx()
    const gain = ctx.createGain()
    gain.gain.value = gainValue
    gain.connect(this.destination())
    const source = ctx.createBufferSource()
    source.buffer = this.buffer
    source.connect(gain)
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
      if (this.source === source) {
        this.source = null
        this.gain = null
      }
    }
    source.start(Math.max(ctx.currentTime, when), Math.max(0, offset))
    this.source = source
    this.gain = gain
  }

  /** 淡出并停掉；fade=0 时立刻停（换局/离开战斗） */
  stop(fade = 0.3): void {
    const source = this.source
    const gain = this.gain
    if (source === null || gain === null) return
    this.source = null
    this.gain = null
    const ctx = this.ctx()
    const now = ctx.currentTime
    const seconds = Math.max(0.01, fade)
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(0, now + seconds)
    try {
      source.stop(now + seconds)
    } catch {
      // 已经停过/尚未启动的源：忽略
    }
  }
}
