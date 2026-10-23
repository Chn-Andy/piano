/**
 * 游戏可调常量（集中定标处）。
 * SPEC-0001：判定窗口、密度阈值等全部是集中的可调常量，初值定标在实现阶段完成。
 * 单位：秒（音频主时钟域）。
 */

export const JUDGMENT_WINDOWS = {
  /** Perfect 判定半宽：|按键 - 音符| ≤ 此值 → Perfect（边界含） */
  perfect: 0.05,
  /** Good 判定半宽：|按键 - 音符| ≤ 此值 → Good（边界含）；超出不判定，音符等待 Miss */
  good: 0.12,
} as const

export type JudgmentTierName = keyof typeof JUDGMENT_WINDOWS
