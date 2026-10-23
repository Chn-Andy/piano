import { describe, expect, it } from 'vitest'
import { createChart } from './chart'
import { JUDGMENT_WINDOWS } from './config'
import { Simulator } from './simulator'

describe('核心模拟器（Seam 1：注入固定时钟）', () => {
  it('音符窗口内按键 → Perfect 判定，连击 +1', () => {
    const chart = createChart([[1.0, 0]])
    const sim = new Simulator(chart)

    const out = sim.keyDown(0, 0.98)

    expect(out.repeat).toBe(false)
    expect(out.events).toHaveLength(1)
    const e = out.events[0]!
    expect(e.type).toBe('judgment')
    expect(e.noteId).toBe(0)
    expect(e.judgment).toBe('Perfect')
    expect(e.combo).toBe(1)
    expect(e.offset).toBeCloseTo(-0.02, 6)
    expect(sim.combo).toBe(1)
  })

  it('偏移在 Perfect 窗口外、Good 窗口内 → Good 判定', () => {
    const chart = createChart([[1.0, 0]])
    const sim = new Simulator(chart)

    const out = sim.keyDown(0, 0.9) // 偏移 -0.10s

    expect(out.events).toHaveLength(1)
    expect(out.events[0]!.judgment).toBe('Good')
    expect(sim.combo).toBe(1)
  })

  it('偏移超过 Good 窗口的按键不判定，音符留给后续正确按键', () => {
    const chart = createChart([[1.0, 0]])
    const sim = new Simulator(chart)

    const early = sim.keyDown(0, 0.8) // 偏移 -0.20s，超窗
    expect(early.repeat).toBe(false)
    expect(early.events).toHaveLength(0)
    expect(sim.combo).toBe(0)

    sim.keyUp(0)
    const hit = sim.keyDown(0, 1.0)
    expect(hit.events).toHaveLength(1)
    expect(hit.events[0]!.judgment).toBe('Perfect')
    expect(sim.combo).toBe(1)
  })
})

describe('判定窗口边界（常量定标变化不应破坏测试结构）', () => {
  const { perfect, good } = JUDGMENT_WINDOWS

  // 精确边界用 note.time=0 构造：减法无浮点误差，等号判定确定。
  it('恰好压线（|偏移| = 窗口宽）→ 边界含：Perfect/Good 线均内含', () => {
    const judge = (pressTime: number): string => {
      const sim = new Simulator(createChart([[0, 0]]))
      const out = sim.keyDown(0, pressTime)
      expect(out.events).toHaveLength(1)
      return out.events[0]!.judgment
    }
    expect(judge(perfect)).toBe('Perfect') // 迟侧压线
    expect(judge(-perfect)).toBe('Perfect') // 早侧压线
    expect(judge(good)).toBe('Good') // 迟侧压线
    expect(judge(-good)).toBe('Good') // 早侧压线
  })

  // 阈值钉子：以 note.time=1 为基准，窗口 ± 1e-9 两侧分级正确。
  it.each([
    ['早侧 Perfect 内缘', 1 - (perfect - 1e-9), 'Perfect'],
    ['早侧 Perfect 外缘', 1 - (perfect + 1e-9), 'Good'],
    ['迟侧 Perfect 内缘', 1 + (perfect - 1e-9), 'Perfect'],
    ['迟侧 Perfect 外缘', 1 + (perfect + 1e-9), 'Good'],
    ['迟侧 Good 内缘', 1 + (good - 1e-9), 'Good'],
    ['早侧 Good 内缘', 1 - (good - 1e-9), 'Good'],
  ] as const)('%s → %s', (_name, pressTime, tier) => {
    const sim = new Simulator(createChart([[1.0, 0]]))
    const out = sim.keyDown(0, pressTime)
    expect(out.events).toHaveLength(1)
    expect(out.events[0]!.judgment).toBe(tier)
  })

  it('窗口外 1ms（早/迟两侧）→ 不判定，音符存活', () => {
    for (const pressTime of [1 - (good + 0.001), 1 + (good + 0.001)]) {
      const sim = new Simulator(createChart([[1.0, 0]]))
      const outside = sim.keyDown(0, pressTime)
      expect(outside.events).toHaveLength(0)
      expect(sim.combo).toBe(0)
      sim.keyUp(0)
      const hit = sim.keyDown(0, 1.0)
      expect(hit.events[0]!.judgment).toBe('Perfect')
    }
  })
})

describe('Miss（tick 推进时间产生）', () => {
  const { good } = JUDGMENT_WINDOWS

  it('音符超窗未按 → tick 产生 Miss，连击归零，且不重复 Miss', () => {
    const sim = new Simulator(createChart([[1.0, 0]]))

    expect(sim.tick(1.0 + good - 0.001), '窗口未过尽 → 无事件').toHaveLength(0)

    const events = sim.tick(1.0 + good + 0.001)
    expect(events).toHaveLength(1)
    const e = events[0]!
    expect(e.type).toBe('judgment')
    expect(e.noteId).toBe(0)
    expect(e.judgment).toBe('Miss')
    expect(e.combo).toBe(0)
    expect(e.offset, 'Miss 无按键，不携带偏移').toBeUndefined()
    expect(sim.combo).toBe(0)
    expect(sim.pendingNotes(), 'Miss 后音符不再下落').toHaveLength(0)
    expect(sim.tick(2.0), '同一音符不重复 Miss').toHaveLength(0)
  })

  it('Miss 断连击，此后命中从 1 重新起算（连击恢复）', () => {
    const sim = new Simulator(createChart([[1.0, 0], [2.0, 1], [3.0, 0]]))

    expect(sim.keyDown(0, 1.0).events[0]!.combo).toBe(1)
    sim.keyUp(0)
    const miss = sim.tick(2.0 + good + 0.001)
    expect(miss[0]!.judgment).toBe('Miss')
    expect(miss[0]!.combo).toBe(0)
    expect(sim.combo).toBe(0)

    const recovered = sim.keyDown(0, 3.0)
    expect(recovered.events[0]!.judgment).toBe('Perfect')
    expect(recovered.events[0]!.combo).toBe(1)
  })
})

describe('长按去重（同键未松开，重复 keydown 不判定）', () => {
  it('长按重复不吞掉同键的下一颗音符', () => {
    // 两颗同键音符相距 0.1s：若长按重复被判定，会错误吃掉第二颗
    const sim = new Simulator(createChart([[1.0, 0], [1.1, 0]]))

    const first = sim.keyDown(0, 1.0)
    expect(first.repeat).toBe(false)
    expect(first.events[0]!.noteId).toBe(0)

    const repeat = sim.keyDown(0, 1.05) // 对第二颗偏移恰 -0.05s，极具诱惑力
    expect(repeat.repeat).toBe(true)
    expect(repeat.events).toHaveLength(0)

    sim.keyUp(0)
    const second = sim.keyDown(0, 1.1)
    expect(second.repeat).toBe(false)
    expect(second.events).toHaveLength(1)
    expect(second.events[0]!.noteId).toBe(1)
    expect(sim.combo).toBe(2)
  })

  it('按住期间任何重复按键都不改变连击', () => {
    const sim = new Simulator(createChart([[1.0, 0]]))
    sim.keyDown(0, 0.98)
    expect(sim.keyDown(0, 0.99).events).toHaveLength(0)
    expect(sim.keyDown(0, 1.0).repeat).toBe(true)
    expect(sim.combo).toBe(1)
  })

  it('松开后同键可再次判定；重复 keyUp 无害', () => {
    const sim = new Simulator(createChart([[1.0, 0], [2.0, 0]]))
    sim.keyDown(0, 1.0)
    sim.keyUp(0)
    sim.keyUp(0)
    const second = sim.keyDown(0, 2.0)
    expect(second.events[0]!.noteId).toBe(1)
  })
})

describe('按键与音符的键位匹配', () => {
  it('异键按键不判定同刻音符（repeat=false，仍属新按下），音符随后照常 Miss', () => {
    const { good } = JUDGMENT_WINDOWS
    const sim = new Simulator(createChart([[1.0, 0]]))

    const wrongLane = sim.keyDown(3, 1.0)
    expect(wrongLane.repeat).toBe(false)
    expect(wrongLane.events).toHaveLength(0)

    expect(sim.tick(1.0 + good + 0.001)[0]!.judgment).toBe('Miss')
  })
})
