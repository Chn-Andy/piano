/**
 * 难度规则（集中常量，定标可调）——MIDI→谱面转换器的全部难度差异归此一处
 * （SPEC-0001：键位映射范围、量化网格粗细、密度过滤、和弦识别、休止切分）。
 *
 * ## 键位映射范围（ADR-0006 难度=键位范围）
 * - 简单：7 白键 C4..B4（物理键 A S D F G H J）。全曲按调号移调至 C 大调/a 小调
 *   使全部音级落在白键上；移调后仍处黑键的变化音并入上方白键（导音上行倾向：
 *   C#→D、D#→E、F#→G、G#→A、A#→B）；高低八度一律折叠进该八度。
 * - 中等：12 半音 C4..B4（白键 A S D F G H J + 黑键 W E T Y U）。不移调（保留
 *   原调黑键），八度折叠进该八度。
 * - 高级：扩域 G3..D5 共 20 键（较中等的 C4..B4 向下 3 个半音、向上 2 个半音；
 *   白键 12 + 黑键 8，仍在字母键预算内，工单 03 负责物理键映射）。不移调，
 *   八度折叠进键域（键域跨度 19 半音 ≥ 一个八度，任何音高可唯一落位）。
 *   范围选定理由：覆盖常见古典钢琴织体的音域（低音根音约 G3 至旋律高音约 D5），
 *   卡农（F#3..F#5）仅 4% 音符需折叠。
 *
 * ## 其余规则（均以拍为单位，1 拍 = 四分音符；秒 = 拍 × 60/bpm）
 * - gridBeats 量化网格：每拍等分数。量化 = 时刻吸附 + 同格判定同刻（和弦识别的
 *   容差即网格本身）；简单 1 拍 / 中等半拍 / 高级四分之一拍。
 * - minGapBeats 密度过滤：保留事件间的最小间距；和弦整组作为一个事件，
 *   贪心保留（不足间距的事件舍弃）。
 * - maxChordNotes 和弦识别：同刻最多并存键数，超出保留最高音（旋律优先）；
 *   简单 1（无和弦）/ 中等 2 / 高级 3。
 * - 乐句切分（休止检测）：音符间休止 ≥ PHRASE_REST_BEATS 拍、且当前乐句跨度
 *   已达 PHRASE_MIN_SPAN_BEATS 拍 → 句边界；跨度不足的换气并入后续乐句
 *   （防止终止式长音被切成残句）。末句不保证最小跨度（尾声）。
 * - SUSTAIN_SECONDS 余韵窗口（ADR-0007 约 0.5–1s）：窗口 (句末, 句末+窗口] 内
 *   保证无音符——由切分规则保证：句间休止 ≥ PHRASE_REST_BEATS × 60/bpm 须大于
 *   SUSTAIN_SECONDS（即 bpm < 200），createChart 兜底校验、违反即抛错。
 * - LEAD_IN_SECONDS 起奏预留：首音符不早于此时刻（目送第一颗音符落下的时间）。
 */

import type { DifficultyName } from '../core/chart'

/** 简单难度键位布局：7 白键（与 src/core/keymap.ts 的 WHITE_KEY_NOTES 一致） */
export const EASY_KEYS = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'] as const

/** 中等难度键位布局：一个八度 12 半音（白键 + 黑键，位置同真钢琴） */
export const MEDIUM_KEYS = [
  'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4',
  'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
] as const

/** 高级难度键位布局：G3..D5 扩域 20 键（向下 3 半音、向上 2 半音） */
export const HARD_KEYS = [
  'G3', 'G#3', 'A3', 'A#3', 'B3', 'C4',
  'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4',
  'G4', 'G#4', 'A4', 'A#4', 'B4', 'C5',
  'C#5', 'D5',
] as const

/** 音高 → 键位的映射方式 */
export interface DifficultyRule {
  /** 量化网格：每拍等分数（时刻吸附 + 同格=同刻） */
  readonly gridBeats: number
  /** 密度过滤：保留事件间最小间距（拍） */
  readonly minGapBeats: number
  /** 和弦识别：同刻最多并存键数（超出保留最高音） */
  readonly maxChordNotes: number
  /** 键位布局（自左至右钢琴音名；音符 lane 为其下标） */
  readonly keys: readonly string[]
  /** 移调到白键域（简单难度：大调→C / 小调→a） */
  readonly transposeToWhite: boolean
  /** 键位映射方式：diatonic=白键折叠 / chromatic=八度折叠 */
  readonly pitchMapping: 'diatonic' | 'chromatic'
}

/** 三档难度规则（唯一定义处；初值定标可调） */
export const DIFFICULTY_RULES: Record<DifficultyName, DifficultyRule> = {
  easy: {
    gridBeats: 1,
    minGapBeats: 2,
    maxChordNotes: 1,
    keys: EASY_KEYS,
    transposeToWhite: true,
    pitchMapping: 'diatonic',
  },
  medium: {
    gridBeats: 0.5,
    minGapBeats: 1,
    maxChordNotes: 2,
    keys: MEDIUM_KEYS,
    transposeToWhite: false,
    pitchMapping: 'chromatic',
  },
  hard: {
    gridBeats: 0.25,
    minGapBeats: 0.25,
    maxChordNotes: 3,
    keys: HARD_KEYS,
    transposeToWhite: false,
    pitchMapping: 'chromatic',
  },
}

/** 乐句切分：休止 ≥ 此拍数视为换气口（句边界候选） */
export const PHRASE_REST_BEATS = 2

/** 乐句切分：当前乐句跨度达此拍数方可在换气口切分（短段并入后续） */
export const PHRASE_MIN_SPAN_BEATS = 8

/** 余韵窗口时长（秒，ADR-0007：约 0.5–1s） */
export const SUSTAIN_SECONDS = 0.6

/** 起奏预留：谱面首音符不早于此时刻（秒） */
export const LEAD_IN_SECONDS = 1

/** 音名字母 → 音高级（pitch class） */
const ROOT_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/**
 * 解析音名（如 'C4'、'F#4'、'Bb3'）为 MIDI 音高数（C4 = 60）。
 * 键位布局与移调计算的共用工具。
 */
export function noteNameToMidi(name: string): number {
  const match = /^([A-G])(#|b)?(-?\d+)$/.exec(name)
  if (match === null) throw new Error(`无法解析音名：${name}`)
  let pc = ROOT_PC[match[1]!]!
  if (match[2] === '#') pc += 1
  if (match[2] === 'b') pc -= 1
  return (Number(match[3]) + 1) * 12 + pc
}
