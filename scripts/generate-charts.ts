/**
 * 谱面再生成 CLI：npm run charts
 * 读取公版 MIDI fixture → 三难度谱面 JSON（src/charts/<曲目>/<难度>.json）。
 *
 * 曲目 fixture 来源与授权（README「MIDI fixture 来源与授权」同步记录）：
 * - 卡农（canon-in-d）：帕赫贝尔《卡农 D 大调》，Mutopia Project 标注 Public Domain
 *   （Pachelbel 1653–1706，作品本身公版）。
 *   https://www.mutopiaproject.org/cgibin/make-table.cgi?setdir=PachelbelJ/CanonInD
 * - 致爱丽丝（fur-elise）：贝多芬 WoO 59，Mutopia Project 标注 Public Domain
 *   （Beethoven 1770–1827，作品本身公版；Mutopia 双手钢琴编配）。
 *   https://www.mutopiaproject.org/cgibin/make-table.cgi?setdir=BeethovenLv/WoO59/fur_Elise_WoO59
 * - 春江花月夜（chun-jiang-hua-yue-ye）：古曲（传统公版）；MIDI 为 Wang Jiayi
 *   1997 年改编制谱，取自 figshare 数据集 "Music.Traditional.Chinese.MIDI"
 *   （DOI 10.6084/m9.figshare.5436022.v1），整集授权 CC BY 4.0：
 *   https://creativecommons.org/licenses/by/4.0/ —— 使用本文件须署名该数据集。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DifficultyName } from '../src/core/chart'
import { convertSong } from '../src/converter/convert'
import { parseMidi } from '../src/converter/midiSource'

/** 曲目注册表：MIDI fixture → 谱面产物（v1 三首，ADR-0008） */
const SONGS = [
  {
    id: 'canon-in-d',
    title: '卡农',
    midi: 'fixtures/canon-in-d.mid',
    dir: 'src/charts/canon',
  },
  {
    id: 'fur-elise',
    title: '致爱丽丝',
    midi: 'fixtures/fur-elise.mid',
    dir: 'src/charts/fur-elise',
  },
  {
    id: 'chun-jiang-hua-yue-ye',
    title: '春江花月夜',
    midi: 'fixtures/chun-jiang-hua-yue-ye.mid',
    dir: 'src/charts/chun-jiang',
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
