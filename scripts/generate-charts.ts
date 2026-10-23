/**
 * 谱面再生成 CLI：npm run charts
 * 读取公版 MIDI fixture → 三难度谱面 JSON（src/charts/<曲目>/<难度>.json）。
 *
 * 曲目 fixture 来源与授权：
 * - 卡农（canon-in-d）：帕赫贝尔《卡农 D 大调》，Mutopia Project 标注 Public Domain
 *   （Pachelbel 1653–1706，作品本身公版）。
 *   https://www.mutopiaproject.org/cgibin/make-table.cgi?setdir=PachelbelJ/CanonInD
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DifficultyName } from '../src/core/chart'
import { convertSong } from '../src/converter/convert'
import { parseMidi } from '../src/converter/midiSource'

/** 曲目注册表：MIDI fixture → 谱面产物（工单 05 曲库接入前，先服务卡农） */
const SONGS = [
  {
    id: 'canon-in-d',
    title: '卡农',
    midi: 'assets/fixtures/canon-in-d.mid',
    dir: 'src/charts/canon',
  },
] as const

for (const song of SONGS) {
  const source = parseMidi(readFileSync(song.midi))
  const charts = convertSong(source, { id: song.id, title: song.title })
  for (const difficulty of Object.keys(charts) as DifficultyName[]) {
    const chart = charts[difficulty]
    const path = join(song.dir, `${difficulty}.json`)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(chart, null, 2)}\n`)
    const chordCount = new Set(
      chart.notes.filter((n) => n.chordId !== undefined).map((n) => n.chordId),
    ).size
    console.log(
      `${song.title} ${difficulty}: ` +
        `${chart.notes.length} 音符 · ${(chart.notes.length / chart.duration).toFixed(2)} 音符/秒 · ` +
        `${chart.meta!.keys.length} 键位 · ${chart.phrases!.length} 乐句 · ${chordCount} 和弦 → ${path}`,
    )
  }
}
