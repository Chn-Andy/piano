import { describe, expect, it } from 'vitest'
import { createChart } from './chart'
import type { Chart, Phrase } from './chart'
import { keyEcho } from '../i18n/keyEcho'
import { zh } from '../i18n/zh'
import { formatClock, progressCueAt, progressLine, songProgress } from './progress'

/**
 * 进度读数（票 17，spec v1.4「进度是纯读数」）：
 * 谱面 + 当前时刻 → 已过 / 总长 / 比例 / 句序号 / 句总数 / 终章时刻。
 * 这里钉的是纯函数的外部可观察行为——轨迹的画法、字号、淡出不在此测
 * （视觉靠真实试玩验收）。
 */

/** 两句谱：首句 1–10（余韵到 12）、次句 20–30（余韵到 32）；总长 = 30 + 2 */
const PHRASES: readonly Phrase[] = [
  { id: 0, start: 1, end: 10, sustainStart: 10, sustainEnd: 12 },
  { id: 1, start: 20, end: 30, sustainStart: 30, sustainEnd: 32 },
]

function twoPhraseChart(): Chart {
  return createChart(
    [
      [1, 0],
      [10, 1],
      [20, 2],
      [30, 3],
    ],
    { phrases: PHRASES },
  )
}

describe('进度读数（谱面 + 时刻 → 已过/总长/比例）', () => {
  it('倒计时（t 为负）时已过与比例都为 0，句序号不显示', () => {
    const p = songProgress(twoPhraseChart(), -1.5)

    expect(p.elapsed).toBe(0)
    expect(p.duration).toBe(32)
    expect(p.ratio).toBe(0)
    expect(p.phraseIndex).toBeNull()
  })

  it('t = 0（开演当刻）仍是 0；首句未开始前句序号不显示', () => {
    const p = songProgress(twoPhraseChart(), 0)

    expect(p.elapsed).toBe(0)
    expect(p.ratio).toBe(0)
    expect(p.phraseIndex).toBeNull()
    expect(p.phraseCount).toBe(2)
  })

  it('中段按实际时刻读数，比例 = 已过 / 总长', () => {
    const p = songProgress(twoPhraseChart(), 25)

    expect(p.elapsed).toBe(25)
    expect(p.duration).toBe(32)
    expect(p.ratio).toBeCloseTo(25 / 32, 10)
    expect(p.phraseIndex, 't=25 落在第二句（20–30）内').toBe(2)
  })

  it('恰好末尾：比例到 1，读数停在总长', () => {
    const p = songProgress(twoPhraseChart(), 32)

    expect(p.elapsed).toBe(32)
    expect(p.ratio).toBe(1)
    expect(p.phraseIndex).toBe(2)
  })

  it('超出末尾（终局后的时钟走远）：夹取到总长，比例不超过 1', () => {
    const p = songProgress(twoPhraseChart(), 90)

    expect(p.elapsed).toBe(32)
    expect(p.ratio).toBe(1)
  })

  it('句间余韵窗口内仍算该句（句序号只在下一句开始时前进）', () => {
    // 首句 10 收束，20 才起下一句：11 落在余韵窗口里，仍报第 1 句
    const p = songProgress(twoPhraseChart(), 11)

    expect(p.phraseIndex).toBe(1)
  })
})

describe('终章位置（朱砂点预告的依据）', () => {
  it('终章时刻取末句句末（余韵窗口起点），末句起点另行给出', () => {
    const p = songProgress(twoPhraseChart(), 0)

    expect(p.finaleAt).toBe(30)
    expect(p.finalPhraseStart).toBe(20)
  })
})

describe('无乐句谱面（句序号回退为不显示）', () => {
  it('句序号与终章时刻均为空，句总数为 0，其余读数照常', () => {
    const chart = createChart([
      [1, 0],
      [2, 1],
    ])
    const p = songProgress(chart, 2)

    expect(p.phraseIndex).toBeNull()
    expect(p.phraseCount).toBe(0)
    expect(p.finaleAt).toBeNull()
    expect(p.finalPhraseStart).toBeNull()
    expect(p.elapsed).toBe(2)
    expect(p.duration).toBe(4)
    expect(p.ratio).toBe(0.5)
  })
})

describe('暂停/恢复的读数连续（读数只依赖时刻，没有第二个时钟）', () => {
  it('同一时刻重复读取得同一结果，且随时间单调不减', () => {
    const chart = twoPhraseChart()
    const a = songProgress(chart, 17.25)
    const b = songProgress(chart, 17.25)
    expect(b).toEqual(a)

    let previous = songProgress(chart, -2)
    for (let t = -1.5; t <= 40; t += 0.25) {
      const next = songProgress(chart, t)
      expect(next.elapsed).toBeGreaterThanOrEqual(previous.elapsed)
      expect(next.ratio).toBeGreaterThanOrEqual(previous.ratio)
      previous = next
    }
  })
})

describe('m:ss 读数（轨两端与曲库难度格同一口径）', () => {
  it('按秒向下取整，分钟不进位：0:00 / 0:05 / 1:00 / 2:55', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(5.9)).toBe('0:05')
    expect(formatClock(60)).toBe('1:00')
    expect(formatClock(175)).toBe('2:55')
  })

  it('负值与小数尾数：倒计时读作 0:00，秒数补零', () => {
    expect(formatClock(-2)).toBe('0:00')
    expect(formatClock(65.4)).toBe('1:05')
  })

  it('与谱面总长一致：曲库格子里印的就是这条读数', () => {
    expect(formatClock(songProgress(twoPhraseChart(), 0).duration)).toBe('0:32')
  })
})

describe('结算的「走到 N%」', () => {
  const chart = twoPhraseChart()
  /** 回显表：断言键名与参数，不锁措辞（Seam C / ADR-0017） */
  const copy = keyEcho(zh)

  it('胜局恒读 100%（终局时刻已越过末尾）', () => {
    const p = songProgress(chart, 32)

    expect(progressLine(p, 'cleared', copy)).toBe('progress.cleared')
  })

  it('败局按当时的谱面时刻四舍五入到整数，并说明血尽', () => {
    // 20 / 32 = 62.5% → 63%
    expect(progressLine(songProgress(chart, 20), 'player-hp-empty', copy)).toBe('progress.fell(63)')
  })

  it('血尽封顶 99%：差最后一口气倒下，不能读成走完了', () => {
    // 31.9 / 32 = 99.7% → 四舍五入 100%，但血尽不该读作 100%
    expect(progressLine(songProgress(chart, 31.9), 'player-hp-empty', copy)).toBe('progress.fell(99)')
  })

  it('歌毕仍有墨妖存活：血未尽是另一句，不套用「血尽」', () => {
    expect(progressLine(songProgress(chart, 40), 'monsters-remain', copy)).toBe('progress.monsters(100)')
  })

  it('开演前就倒下（倒计时/极点）读 0%', () => {
    expect(progressLine(songProgress(chart, -1), 'player-hp-empty', copy)).toBe('progress.fell(0)')
  })
})

describe('余韵后的句序号提示（第 N / M 句）', () => {
  const chart = twoPhraseChart()
  /** 首句余韵在 10 + Good 窗触发（模拟器产出的事件时刻） */
  const sustains = [{ time: 10.12, phraseId: 0 }]

  it('余韵触发后 0.3 秒内已可见，报的是刚收束的那一句', () => {
    for (const t of [10.12, 10.42]) {
      expect(progressCueAt(chart, sustains, t)).toEqual({
        kind: 'phrase',
        index: 1,
        count: 2,
        at: 10.12,
      })
    }
  })

  it('约两秒后不再显示（同一时刻只有一条）', () => {
    expect(progressCueAt(chart, sustains, 10.12 + 2)).toBeNull()
    expect(progressCueAt(chart, sustains, 10.5), '淡出期内仍在').not.toBeNull()
  })

  it('余韵之前不预告：提示由余韵触发，不是按句边界掐点', () => {
    expect(progressCueAt(chart, sustains, 10.1)).toBeNull()
  })

  it('连续两次余韵：只显示最近那一条', () => {
    const two = [
      { time: 10.12, phraseId: 0 },
      { time: 30.12, phraseId: 1 },
    ]
    expect(progressCueAt(chart, two, 30.5)).toEqual({
      kind: 'phrase',
      index: 2,
      count: 2,
      at: 30.12,
    })
  })

  it('无乐句谱面：余韵事件即使存在也不显示句序号', () => {
    const plain = createChart([
      [1, 0],
      [2, 1],
    ])
    expect(progressCueAt(plain, [{ time: 1.2, phraseId: 0 }], 1.3)).toBeNull()
  })
})

describe('末句提示（最后一句）', () => {
  it('末句一开始就浮出，且只认句首这一刻', () => {
    const chart = twoPhraseChart()
    expect(progressCueAt(chart, [], 19.9)).toBeNull()
    expect(progressCueAt(chart, [], 20)).toEqual({ kind: 'final', at: 20 })
    expect(progressCueAt(chart, [], 21.9), '约两秒内仍在').not.toBeNull()
    expect(progressCueAt(chart, [], 22.1), '两秒后淡出').toBeNull()
  })

  it('末句提示压过仍在淡出的句序号：不叠字', () => {
    // 句间只有 1 秒：首句余韵提示（10.12–12.12）与末句起点（11）重叠
    const tight = createChart(
      [
        [1, 0],
        [10, 1],
        [11, 2],
        [20, 3],
      ],
      {
        phrases: [
          { id: 0, start: 1, end: 10, sustainStart: 10, sustainEnd: 10.6 },
          { id: 1, start: 11, end: 20, sustainStart: 20, sustainEnd: 21 },
        ],
      },
    )
    const cue = progressCueAt(tight, [{ time: 10.12, phraseId: 0 }], 11.2)

    expect(cue).toEqual({ kind: 'final', at: 11 })
  })
})
