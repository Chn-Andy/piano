import { describe, expect, it } from 'vitest'
import { createChart } from './chart'
import type { ChartMeta, Phrase } from './chart'

/**
 * 谱面契约（工单 02 扩展）：和弦分组、乐句边界、余韵窗口、难度元数据。
 * 契约的唯一装配点是 createChart——所有结构不变式在此校验，
 * 转换器产出的完整谱面与 01 的手写演示谱面共用同一构造器。
 */

const META: ChartMeta = {
  song: 'test-song',
  title: '测试曲',
  difficulty: 'easy',
  keys: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'],
  quantizeGrid: 0.5,
}

/** 两句谱：句内三音（首句含和弦），句间休止 7 秒 */
const TWO_PHRASES: readonly Phrase[] = [
  { id: 0, start: 1, end: 3, sustainStart: 3, sustainEnd: 3.6 },
  { id: 1, start: 10, end: 11, sustainStart: 11, sustainEnd: 11.6 },
]

describe('和弦分组（和弦音符：同时按下的多键）', () => {
  it('同刻多音共享 chordId，构成一颗和弦音符；单一音符不带分组', () => {
    const chart = createChart([
      [1, 0, 0],
      [1, 4, 0],
      [2, 2],
    ])

    const [first, second, third] = chart.notes
    expect(first).toMatchObject({ time: 1, lane: 0, chordId: 0 })
    expect(second).toMatchObject({ time: 1, lane: 4, chordId: 0 })
    expect(third!.chordId, '单音符不携带 chordId').toBeUndefined()
  })

  it('同 chordId 的音符必须同刻', () => {
    expect(() =>
      createChart([
        [1, 0, 0],
        [1.5, 1, 0],
      ]),
    ).toThrow(/同刻/)
  })

  it('同刻音符必须构成同一和弦分组：异 chordId 或未分组均拒绝', () => {
    expect(() =>
      createChart([
        [1, 0, 0],
        [1, 1, 1],
      ]),
    ).toThrow(/和弦分组/)
    expect(() =>
      createChart([
        [1, 0, 0],
        [1, 1],
      ]),
    ).toThrow(/和弦分组/)
  })

  it('孤立的 chordId（组内仅一音）拒绝', () => {
    expect(() => createChart([[1, 0, 0]])).toThrow(/至少/)
  })
})

describe('难度元数据（键位范围）', () => {
  it('完整谱面携带 meta；音符 lane 是 meta.keys 的下标', () => {
    const chart = createChart([[1, 0], [2, 6]], { meta: META })

    expect(chart.meta).toEqual(META)
    expect(chart.meta!.keys).toHaveLength(7)
  })

  it('lane 越出键位范围（负数、非整数、超出 keys 长度）拒绝', () => {
    expect(() => createChart([[1, 7]], { meta: META })).toThrow(/键位/)
    expect(() => createChart([[1, -1]], { meta: META })).toThrow(/键位/)
    expect(() => createChart([[1, 0.5]], { meta: META })).toThrow(/键位/)
    expect(() => createChart([[1, 6]], { meta: META })).not.toThrow()
  })
})

describe('乐句边界与余韵窗口', () => {
  it('乐句恰好划分音符：句内首末音符即边界，句间休止内无音符', () => {
    const chart = createChart([[1, 0], [2, 1], [3, 0], [10, 2], [11, 3]], {
      phrases: TWO_PHRASES,
    })

    expect(chart.phrases).toEqual(TWO_PHRASES)
  })

  it('余韵窗口从乐句末音符起算：sustainStart 必须等于句末', () => {
    expect(() =>
      createChart([[1, 0], [2, 1], [3, 0]], {
        phrases: [{ id: 0, start: 1, end: 3, sustainStart: 3.2, sustainEnd: 3.6 }],
      }),
    ).toThrow(/余韵窗口/)
  })

  it('句间休止内出现音符（不属于任何乐句、落入余韵窗口）拒绝', () => {
    expect(() =>
      createChart([[1, 0], [2, 1], [3, 0], [3.5, 5], [10, 2], [11, 3]], {
        phrases: TWO_PHRASES,
      }),
    ).toThrow(/余韵窗口|乐句/)
  })

  it('乐句必须依时排序且句间有休止（重叠或零休止拒绝）', () => {
    // 第二句起点 4 不晚于首句终点 4：句间无换气口
    expect(() =>
      createChart([[1, 0], [4, 1]], {
        phrases: [
          { id: 0, start: 1, end: 4, sustainStart: 4, sustainEnd: 4.6 },
          { id: 1, start: 4, end: 4, sustainStart: 4, sustainEnd: 4.6 },
        ],
      }),
    ).toThrow(/休止/)
  })

  it('乐句首尾必须与实际音符对齐（漏音、虚设边界拒绝）', () => {
    // 首句起点非首音符时刻：音符 1 落在乐句之外
    expect(() =>
      createChart([[1, 0], [2, 1], [3, 0]], {
        phrases: [{ id: 0, start: 2, end: 3, sustainStart: 3, sustainEnd: 3.6 }],
      }),
    ).toThrow(/乐句/)
    // 末句终点越过末音符
    expect(() =>
      createChart([[1, 0], [2, 1], [3, 0]], {
        phrases: [{ id: 0, start: 1, end: 4, sustainStart: 4, sustainEnd: 4.6 }],
      }),
    ).toThrow(/乐句/)
  })
})

describe('完整谱面（契约全景）', () => {
  it('和弦 + 乐句 + 元数据共存且全部不变式成立', () => {
    const chart = createChart(
      [
        [1, 0, 0],
        [1, 4, 0],
        [2, 2],
        [3, 5],
        [10, 3],
        [11, 1],
      ],
      {
        meta: META,
        phrases: [
          { id: 0, start: 1, end: 3, sustainStart: 3, sustainEnd: 3.6 },
          { id: 1, start: 10, end: 11, sustainStart: 11, sustainEnd: 11.6 },
        ],
      },
    )

    expect(chart.notes).toHaveLength(6)
    expect(chart.duration).toBe(11 + 2)
    expect(chart.meta).toEqual(META)
    expect(chart.phrases).toHaveLength(2)
  })
})

describe('异色词缀（工单 09，GLOSSARY：异色音符）', () => {
  it('词缀随音符入契约；缺省即普通音符（不带键）', () => {
    const chart = createChart([
      [1, 0, undefined, 'cold'],
      [2, 1, undefined, 'toxic'],
      [3, 2, undefined, 'blast'],
      [4, 3],
    ])

    expect(chart.notes.map((n) => n.tint)).toEqual(['cold', 'toxic', 'blast', undefined])
    expect('tint' in chart.notes[3]!, '普通音符不带 tint 键（序列化产物保持干净）').toBe(false)
  })

  it('和弦成员必须共享同一词缀（同组只结算一次效果）', () => {
    expect(() =>
      createChart([
        [1, 0, 0, 'cold'],
        [1, 1, 0, 'blast'],
      ]),
    ).toThrow(/词缀不一致/)

    expect(() =>
      createChart([
        [1, 0, 0, 'cold'],
        [1, 1, 0],
      ]),
    ).toThrow(/词缀不一致/)

    const ok = createChart([
      [1, 0, 0, 'cold'],
      [1, 1, 0, 'cold'],
    ])
    expect(ok.notes.every((n) => n.tint === 'cold')).toBe(true)
  })
})
