import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Chart } from '../core/chart'
import { WHITE_KEY_NOTES } from '../core/keymap'
import type { SourceSong } from './midiSource'
import { parseMidi } from './midiSource'
import { convertChart, convertSong } from './convert'
import {
  DIFFICULTY_RULES,
  LEAD_IN_SECONDS,
  PHRASE_MIN_SPAN_BEATS,
  PHRASE_REST_BEATS,
  SUSTAIN_SECONDS,
} from './rules'

/**
 * Seam 2——MIDI→谱面转换器（SPEC-0001 Testing Decisions）：
 * 输入合成源曲（秒域音符 + 速度 + 调号），从公共接口断言谱面结构性质。
 * 真实 fixture（卡农）的结构性质见下方「卡农真实 fixture」组。
 */

const INFO = { id: 'test-song', title: '测试曲' } as const

/** D 大调、60 BPM（1 拍 = 1 秒）的源曲骨架：每 2 秒一音 */
function dMajor(notes: readonly [time: number, midi: number][]): SourceSong {
  return {
    bpm: 60,
    key: { root: 'D', scale: 'major' },
    notes: notes.map(([time, midi]) => ({ time, midi })),
  }
}

/** D 大调五音（含黑键 F#、C#）：D5 F#4 A3 C#5 E4，时刻 0/2/4/6/8 */
const DIATONIC_RUN: readonly [number, number][] = [
  [0, 74], // D5
  [2, 66], // F#4
  [4, 57], // A3
  [6, 73], // C#5
  [8, 64], // E4
]

describe('音高 → 键位映射（三档键位范围，ADR-0006）', () => {
  it('简单：移调 D 大调 → C 大调，全部落在 7 白键（F#→E、C#→B），八度折叠', () => {
    const chart = convertChart(dMajor(DIATONIC_RUN), 'easy', INFO)

    expect(chart.meta!.keys).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'])
    expect(chart.meta!.quantizeGrid).toBe(DIFFICULTY_RULES.easy.gridBeats) // 60bpm 1 拍 = 1s
    // D5→C5(0) F#4→E4(2) A3→G3(4) C#5→B4(6) E4→D4(1)
    expect(chart.notes.map((n) => n.lane)).toEqual([0, 2, 4, 6, 1])
  })

  it('简单：移调后仍在黑键上的变化音并入上方白键（G#4→F#4→G）', () => {
    const chart = convertChart(dMajor([[0, 68], [2, 68]]), 'easy', INFO) // G#4：D 大调外变化音

    expect(chart.notes.map((n) => n.lane)).toEqual([4, 4]) // → G 键位
  })

  it('中等：不移调，12 半音布局，黑键 F#/C# 落黑键位，域外八度折叠（D5→D4、A3→A4）', () => {
    const chart = convertChart(dMajor(DIATONIC_RUN), 'medium', INFO)

    expect(chart.meta!.keys).toHaveLength(12)
    expect(chart.meta!.keys[1]).toBe('C#4')
    expect(chart.meta!.keys[6]).toBe('F#4')
    // D5→折叠 D4(2) F#4(6) A3→折叠 A4(9) C#5→折叠 C#4(1) E4(4)
    expect(chart.notes.map((n) => n.lane)).toEqual([2, 6, 9, 1, 4])
    expect(chart.notes.some((n) => n.lane === 1 || n.lane === 6), '黑键位被使用').toBe(true)
  })

  it('高级：扩域 G3..D5（20 键 > 中等 12 键），域外八度折叠（F#3→F#4、E5→E4）', () => {
    const chart = convertChart(
      dMajor([
        [0, 74], // D5 → lane 19（不折叠）
        [2, 54], // F#3 → 折叠 F#4 lane 11
        [4, 76], // E5 → 折叠 E4 lane 9
        [6, 57], // A3 → lane 2（扩域内不折叠）
      ]),
      'hard',
      INFO,
    )

    expect(chart.meta!.keys).toHaveLength(20)
    expect(chart.meta!.keys[0]).toBe('G3')
    expect(chart.meta!.keys[19]).toBe('D5')
    expect(chart.notes.map((n) => n.lane)).toEqual([19, 11, 9, 2])
  })
})

describe('量化网格', () => {
  it('演奏抖动吸附到网格：±0.02s 的两音同刻（构成和弦）', () => {
    const chart = convertChart(dMajor([[0.98, 66], [1.02, 69]]), 'medium', INFO)

    expect(chart.notes.map((n) => n.time)).toEqual([1, 1])
    expect(new Set(chart.notes.map((n) => n.chordId)).size).toBe(1)
  })

  it('粗网格将近邻合并为同刻：简单难度 1s 网格把 0.5s 音对合并成单音', () => {
    const chart = convertChart(dMajor([[0.5, 62], [1.0, 66]]), 'easy', INFO)

    expect(chart.notes).toHaveLength(1)
    expect(chart.notes[0]!.time).toBe(1)
    expect(chart.notes[0]!.chordId).toBeUndefined()
    // 保留最高音：F#4(66) 移调后 E4(64) → 键位 2
    expect(chart.notes[0]!.lane).toBe(2)
  })
})

describe('密度过滤（难度间密度单调）', () => {
  /** 40 颗八分音符（每 0.5s 一颗），20 秒 */
  function eighthRun(): SourceSong {
    const notes: [number, number][] = []
    for (let i = 0; i < 40; i += 1) {
      notes.push([i * 0.5, [74, 69, 66, 62][i % 4]!])
    }
    return dMajor(notes)
  }

  it('高级保留全部八分音符，中等隔一保留，简单更稀：计数与密度严格递增', () => {
    const source = eighthRun()
    const charts = {
      easy: convertChart(source, 'easy', INFO),
      medium: convertChart(source, 'medium', INFO),
      hard: convertChart(source, 'hard', INFO),
    }

    expect(charts.hard.notes).toHaveLength(40)
    expect(charts.medium.notes).toHaveLength(20)
    expect(charts.easy.notes.length).toBeLessThan(20)

    const density = (c: typeof charts.easy): number =>
      c.notes.length / c.duration
    expect(density(charts.easy)).toBeLessThan(density(charts.medium))
    expect(density(charts.medium)).toBeLessThan(density(charts.hard))
  })
})

describe('和弦识别与上限', () => {
  /** D 大调主三和弦（D5 F#4 A3）同刻齐鸣 */
  const CHORD: readonly [number, number][] = [[1, 74], [1, 66], [1, 57]]

  it('高级：同刻三音全部保留，共享同一 chordId 且同刻', () => {
    const chart = convertChart(dMajor(CHORD), 'hard', INFO)

    expect(chart.notes).toHaveLength(3)
    expect(new Set(chart.notes.map((n) => n.time)).size).toBe(1)
    expect(new Set(chart.notes.map((n) => n.chordId)).size).toBe(1)
  })

  it('中等：上限 2 键，保留最高两音（D5、F#4），最低音 A3 舍弃', () => {
    const chart = convertChart(dMajor(CHORD), 'medium', INFO)

    expect(chart.notes).toHaveLength(2)
    expect(chart.notes.map((n) => n.lane).sort((a, b) => a - b)).toEqual([2, 6])
    expect(new Set(chart.notes.map((n) => n.chordId)).size).toBe(1)
  })

  it('简单：上限 1 键无和弦，仅保留最高音（移调后 C5 → 键位 0）', () => {
    const chart = convertChart(dMajor(CHORD), 'easy', INFO)

    expect(chart.notes).toHaveLength(1)
    expect(chart.notes[0]!.lane).toBe(0)
    expect(chart.notes[0]!.chordId).toBeUndefined()
  })
})

describe('乐句切分（基于休止检测）与余韵窗口', () => {
  /**
   * 三段结构：A 段 0..9（跨 9 拍）、休止 3s、B 段 12..15（跨 3 拍，不足最小跨度）、
   * 休止 3s、C 段 18..19。B 段应并入 C 段成一句（防止单音符乐句）。
   */
  function threeSections(): SourceSong {
    const notes: [number, number][] = []
    for (let t = 0; t <= 9; t += 1) notes.push([t, 74])
    for (let t = 12; t <= 15; t += 1) notes.push([t, 66])
    notes.push([18, 62], [19, 62])
    return dMajor(notes)
  }

  it('休止 ≥ 2 拍且已成句 ≥ 8 拍 → 边界；短段并入后续乐句', () => {
    const chart = convertChart(threeSections(), 'hard', INFO)

    expect(chart.phrases).toHaveLength(2)
    // 起奏预留整体 +1s：A 段 [1, 10]，B+C 合并 [13, 20]
    expect(chart.phrases![0]).toMatchObject({ start: 1, end: 10 })
    expect(chart.phrases![1]).toMatchObject({ start: 13, end: 20 })
    // 12..15 与 18..19 之间有 3s 休止但跨度不足，未产生第三句
    expect(chart.phrases!.every((p) => p.start < p.end)).toBe(true)
  })

  it('余韵窗口从句末起算、时长为常量，且窗口内无音符', () => {
    const chart = convertChart(threeSections(), 'hard', INFO)

    for (const phrase of chart.phrases!) {
      expect(phrase.sustainStart).toBe(phrase.end)
      expect(phrase.sustainEnd - phrase.sustainStart).toBeCloseTo(SUSTAIN_SECONDS, 6)
      const inWindow = chart.notes.filter(
        (n) => n.time > phrase.sustainStart && n.time <= phrase.sustainEnd,
      )
      expect(inWindow, `乐句 ${phrase.id} 余韵窗口内有音符`).toHaveLength(0)
    }
  })

  it('句内无休止则不切分：连续八分音符为单一乐句', () => {
    const notes: [number, number][] = []
    for (let i = 0; i < 20; i += 1) notes.push([i * 0.5, 74])
    const chart = convertChart(dMajor(notes), 'hard', INFO)

    expect(chart.phrases).toHaveLength(1)
    expect(chart.phrases![0]).toMatchObject({ start: 1, end: 10.5 })
  })
})

describe('谱面起奏预留与边界', () => {
  it('源曲首音符早于预留 → 整体平移，首音符不早于预留常量', () => {
    const chart = convertChart(dMajor([[0, 74], [2, 66]]), 'medium', INFO)

    expect(chart.notes[0]!.time).toBe(LEAD_IN_SECONDS)
    expect(chart.notes[1]!.time).toBe(3)
  })

  it('源曲无音符 → 拒绝', () => {
    expect(() => convertChart(dMajor([]), 'easy', INFO)).toThrow(/无音符/)
  })

  it('convertSong 一次产出三难度谱面', () => {
    const charts = convertSong(dMajor(DIATONIC_RUN), INFO)

    expect(Object.keys(charts)).toEqual(['easy', 'medium', 'hard'])
    expect(charts.easy.meta!.difficulty).toBe('easy')
    expect(charts.medium.meta!.song).toBe('test-song')
    expect(charts.hard.meta!.title).toBe('测试曲')
  })
})

describe('难度规则常量（集中定标，SPEC-0001）', () => {
  it('三档规则齐备且量化网格随难度变细、密度阈值随难度放宽', () => {
    const { easy, medium, hard } = DIFFICULTY_RULES
    expect(easy.gridBeats).toBeGreaterThan(medium.gridBeats)
    expect(medium.gridBeats).toBeGreaterThan(hard.gridBeats)
    expect(easy.minGapBeats).toBeGreaterThan(medium.minGapBeats)
    expect(medium.minGapBeats).toBeGreaterThanOrEqual(hard.minGapBeats)
    expect(easy.maxChordNotes).toBeLessThan(medium.maxChordNotes)
    expect(medium.maxChordNotes).toBeLessThan(hard.maxChordNotes)
    // 键位范围：7 白键 < 12 键 < 扩域
    expect(easy.keys).toHaveLength(7)
    expect(easy.keys.every((k) => !k.includes('#'))).toBe(true)
    expect(medium.keys).toHaveLength(12)
    expect(hard.keys.length).toBeGreaterThan(12)
    // 乐句切分与余韵窗口常量在册
    expect(PHRASE_REST_BEATS).toBeGreaterThan(0)
    expect(PHRASE_MIN_SPAN_BEATS).toBeGreaterThan(0)
    expect(SUSTAIN_SECONDS).toBeGreaterThan(0)
  })
})

/**
 * 卡农真实 fixture（工单四条验收的 Seam 2 断言）。
 * 全部性质在测试内独立计算（不复用转换器的任何检查逻辑）。
 * fixture：Mutopia Project 帕赫贝尔《卡农 D 大调》，Public Domain，60 BPM 单声部。
 */
const CANON_MIDI = join(import.meta.dirname, '..', '..', 'assets', 'fixtures', 'canon-in-d.mid')
const CANON_DIR = join(import.meta.dirname, '..', 'charts', 'canon')
const CANON_INFO = { id: 'canon-in-d', title: '卡农' } as const
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

function canonCharts(): Record<(typeof DIFFICULTIES)[number], Chart> {
  return convertSong(parseMidi(readFileSync(CANON_MIDI)), CANON_INFO)
}

describe('卡农真实 fixture：三难度谱面结构性质（工单 02 验收）', () => {
  it('键位范围正确：简单 7 白键 / 中等 12 键 / 高级扩域，音符全部在界内', () => {
    const charts = canonCharts()

    expect(charts.easy.meta!.keys).toEqual(WHITE_KEY_NOTES)
    expect(
      charts.easy.notes.every((n) => n.lane >= 0 && n.lane <= 6),
      '简单难度只用白键键位',
    ).toBe(true)

    expect(charts.medium.meta!.keys).toHaveLength(12)
    expect(charts.medium.meta!.keys.filter((k) => k.includes('#'))).toHaveLength(5)
    expect(
      charts.medium.notes.every((n) => n.lane >= 0 && n.lane < 12),
      '中等难度键位在 12 键界内',
    ).toBe(true)

    expect(charts.hard.meta!.keys.length).toBeGreaterThan(12)
    expect(
      charts.hard.notes.every(
        (n) => n.lane >= 0 && n.lane < charts.hard.meta!.keys.length,
      ),
      '高级难度键位在扩域界内',
    ).toBe(true)
  })

  it('余韵窗口内无音符（不变式，全部乐句独立扫描）', () => {
    const charts = canonCharts()

    for (const difficulty of DIFFICULTIES) {
      const { notes, phrases } = charts[difficulty]
      expect(phrases, `${difficulty} 应带乐句`).toBeDefined()
      for (const phrase of phrases!) {
        const inside = notes.filter(
          (n) => n.time > phrase.sustainStart && n.time <= phrase.sustainEnd,
        )
        expect(
          inside,
          `${difficulty} 乐句 ${phrase.id} 余韵窗口 (${phrase.sustainStart}, ${phrase.sustainEnd}] 内有 ${inside.length} 颗音符`,
        ).toHaveLength(0)
      }
    }
  })

  it('难度间密度单调：简单 < 中等 < 高级', () => {
    const charts = canonCharts()
    const density = (c: Chart): number => c.notes.length / c.duration

    expect(density(charts.easy)).toBeGreaterThan(0)
    expect(density(charts.easy)).toBeLessThan(density(charts.medium))
    expect(density(charts.medium)).toBeLessThan(density(charts.hard))
  })

  it('乐句边界存在且恰好划分音符；和弦分组合法（同组和弦同刻）', () => {
    const charts = canonCharts()

    for (const difficulty of DIFFICULTIES) {
      const { notes, phrases } = charts[difficulty]
      expect(phrases!.length, `${difficulty} 乐句边界应存在`).toBeGreaterThanOrEqual(2)

      // 乐句依时递增、句间有休止、首末对齐音符
      expect(phrases![0]!.start).toBe(notes[0]!.time)
      expect(phrases![phrases!.length - 1]!.end).toBe(notes[notes.length - 1]!.time)
      for (let i = 1; i < phrases!.length; i += 1) {
        expect(phrases![i]!.start).toBeGreaterThan(phrases![i - 1]!.end)
      }
      // 每颗音符恰属一句（句内有音符、句间休止无音符）
      let cursor = 0
      for (const phrase of phrases!) {
        const span = notes.filter((n) => n.time >= phrase.start && n.time <= phrase.end)
        expect(span.length, `乐句 ${phrase.id} 句内应有音符`).toBeGreaterThan(0)
        expect(span[0]!.time).toBe(phrase.start)
        expect(span[span.length - 1]!.time).toBe(phrase.end)
        cursor += span.length
      }
      expect(cursor, `${difficulty} 乐句应划分全部音符`).toBe(notes.length)

      // 和弦分组合法：同 chordId 必同刻且 ≥2 键；同刻多音必为单一分组
      const byChord = new Map<number, number[]>()
      const simultaneousIds = new Map<number, Set<number | undefined>>()
      for (const note of notes) {
        if (note.chordId !== undefined) {
          byChord.set(note.chordId, [...(byChord.get(note.chordId) ?? []), note.time])
        }
        const ids = simultaneousIds.get(note.time) ?? new Set<number | undefined>()
        ids.add(note.chordId)
        simultaneousIds.set(note.time, ids)
      }
      for (const [chordId, times] of byChord) {
        expect(new Set(times).size, `和弦 ${chordId} 的音符必须同刻`).toBe(1)
        expect(times.length, `和弦 ${chordId} 至少两键同按`).toBeGreaterThanOrEqual(2)
      }
      for (const [time, ids] of simultaneousIds) {
        const members = notes.filter((n) => n.time === time)
        if (members.length >= 2) {
          expect(ids.size, `时刻 ${time} 的同刻音符应构成单一和弦分组`).toBe(1)
          expect(ids.has(undefined), `时刻 ${time} 的同刻音符应带分组`).toBe(false)
        }
      }
    }
  })

  it('已入库谱面产物与新鲜转换一致（npm run charts 可确定性再生成）', () => {
    const charts = canonCharts()

    for (const difficulty of DIFFICULTIES) {
      const artifact = JSON.parse(
        readFileSync(join(CANON_DIR, `${difficulty}.json`), 'utf-8'),
      ) as Chart
      expect(artifact).toEqual(charts[difficulty])
    }
  })
})
