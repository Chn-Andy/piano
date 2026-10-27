/**
 * 游戏可调常量（集中定标处）。
 * SPEC-0001：判定窗口、密度阈值等全部是集中的可调常量，初值定标在实现阶段完成。
 * 单位：秒（音频主时钟域）。
 * 手感定标总账（当前值/理由/调整入口/再定标流程）见 docs/calibration.md（工单 06）。
 */

import type { DifficultyName } from './chart'

export const JUDGMENT_WINDOWS = {
  /** Perfect 判定半宽：|按键 - 音符| ≤ 此值 → Perfect（边界含） */
  perfect: 0.05,
  /** Good 判定半宽：|按键 - 音符| ≤ 此值 → Good（边界含）；超出不判定，音符等待 Miss */
  good: 0.12,
} as const

export type JudgmentTierName = keyof typeof JUDGMENT_WINDOWS

/* ── 战斗数值（工单 03）──────────────────────────────────────────────
 * 定标目标（SPEC：普通玩家整首打不完、认真弹能清完）——理由见各常量；
 * 首版定标，06 号票负责手感打磨。全部集中于此，改动不应破坏测试结构
 * （测试断言的是关系与分档行为，不是具体数字）。
 */

/** 单音符基线伤害：Perfect 命中、无连击加成时对墨妖造成 10 点伤害 */
export const BASE_DAMAGE = 10

/** 判定质量对伤害的折扣：Perfect 全额，Good ×0.7（Miss 无伤害，走扑空，ADR-0011） */
export const TIER_DAMAGE_FACTOR = {
  Perfect: 1,
  Good: 0.7,
} as const

/** 连击 → 伤害倍率分档（边界含）：达到 minCombo 即享 multiplier，未达任何档为 ×1.0 */
export const COMBO_MULTIPLIER_STOPS = [
  { minCombo: 10, multiplier: 1.2 },
  { minCombo: 25, multiplier: 1.5 },
  { minCombo: 50, multiplier: 2.0 },
] as const

/**
 * 墨潮生成（工单 08 重定标，取代 v1 的集火分段公式）：
 * AoE 把总输出摊到全场、余韵升格为真实伤害事件，HP 预算必须重推。
 *
 * 记账单位不变：「认真玩家」每音符期望伤害（FOCUSED_PLAYER ≈ 8 点），
 * 波内音符数 × 它 = 该波的 HP 预算。定标目标（SPEC）：认真弹可杀于线前、
 * 随意弹守不住——按 ADR-0012 的前排承伤模型（最前妖吃全额）推导：
 *
 * 1. 有效输出速率（命中 + 余韵 AoE，以基线伤害为单位）：认真玩家
 *    （95% 命中、Perfect 抖动）句句 grand，≈ 命中 0.95 ×(1 + grand 档
 *    结伤比 1.0) ≈ 1.9；普通玩家（三失其一、Good 居多、连击难破 10 档）
 *    句句 minor，≈ 0.7 ×(1 + minor 档结伤比 0.3) ≈ 0.9。
 * 2. 清波时间 = 波总预算 ÷ (有效输出 × 群吸收系数)，吸收系数 =
 *    Σ 0.6^级（错峰 5s ≈ 纵深 2.8 度 ≈ 1 级）：2 妖 ≈ 1.6、3 妖 ≈ 2.0、
 *    4 妖 ≈ 2.1（封顶后）。
 * 3. 前排单妖击杀时间 = DEMON_HP_FRACTION × 预算 ÷ 命中输出：认真玩家
 *    各难度 ≈ 10–15s < TRAVEL_SECONDS(18s)，杀于线前有 3–8s 余量；
 *    普通玩家同量 ≈ 20–30s > 18s——波末妖带血抵阵开始咬人（每口
 *    BATTLEFIELD.BITE_DAMAGE）。守线压力来自「下一只何时到线」，
 *    miss 的代价是它提前到来（ADR-0011 的因果结构）。
 * 4. 墨主 HP 挂在终章乐句预算上（末乐句音符 × 期望伤害 ×
 *    LORD_HP_FRACTION）：终章 grand 结伤 = 同预算 × grand 档结伤比 ×
 *    终章倍率 = 1.5 > 1.2 → 满血墨主可被终章斩首（构造性保证）。
 *    谱面无乐句则无终章，墨主退用波预算（LORD_WAVE_FALLBACK_FRACTION）。
 * （首版定标：三玩家模型性质测试钉住可胜可败；11 号票终定标。）
 */
export const HORDE_PLAN = {
  /** 各难度波宽（秒）：生成节奏随难度——波越窄，增援越密 */
  WAVE_SECONDS: { easy: 32, medium: 30, hard: 26 },
  /** 每波墨妖只数：难度越高群越大（末波墨主独行，不占此数） */
  GROUP_SIZE: { easy: 2, medium: 3, hard: 4 },
  /** 同波妖的出场错峰（秒）：拉开纵深层级、错开咬线节奏 */
  GROUP_STAGGER_SECONDS: 5,
  /** 每只墨妖 HP = 波内音符数 × 期望伤害 × 此比例（群只数不改单只厚度） */
  DEMON_HP_FRACTION: 0.55,
  /** 墨主 HP = 终章乐句音符预算 × 此比例（斩首不变式的被减数，见上 4） */
  LORD_HP_FRACTION: 1.2,
  /** 谱面无乐句时的墨主 HP 比例（×末波音符预算；无乐句即无终章） */
  LORD_WAVE_FALLBACK_FRACTION: 0.6,
  /** 「认真玩家」假设（记账用，与 v1 同源），用于把音符数换算成 HP 预算 */
  FOCUSED_PLAYER: {
    /** 命中率 */
    hitRate: 0.9,
    /** 长期连击均摊倍率（多数时间在 10+ 档附近） */
    comboMultiplier: 1.05,
    /** 判定良莠均摊（Perfect ×1 与 Good ×0.7 的混合） */
    tierFactor: 0.85,
  },
} as const

/* ── 战场推进（工单 08，ADR-0011：怪物到位才造成威胁）────────────────
 * 墨妖成群自战场深处生成，恒速向琴阵（GLOSSARY：琴阵，纵深 0）推进；
 * 抵达后停止推进，每 ATTACK_BEATS 拍咬一口直至被杀。所有量均为集中
 * 常量；波次生成（HORDE_PLAN）与 HP 预算推导另见其注释。
 */

export const BATTLEFIELD = {
  /**
   * 参考拍长（120 BPM，与 main.ts 倒计时同源）。「每 2 拍咬一口」以
   * 此拍长折算成 ATTACK_BEATS × BEAT_SECONDS——曲目自身的 BPM 不进
   * 模拟器（模拟器只有谱面时间轴）。
   */
  BEAT_SECONDS: 0.5,
  /** 纵深总行程（度）：怪物在战场最深处生成，向琴阵（纵深 0）推进 */
  SPAWN_DEPTH: 10,
  /**
   * 全程推进耗时（秒）＝生成→抵琴阵：恒速 = SPAWN_DEPTH / TRAVEL_SECONDS
   * ≈ 0.56 度/秒。定标（认真弹可杀于线前、随意弹守不住，见 HORDE_PLAN）：
   * 认真玩家清完一波约需 0.35–0.45 × 波宽（见 HP 预算推导），留足
   * 「杀于线前」的余量；普通玩家同波需 0.6–0.8 × 波宽，后段妖抵达
   * 琴阵开始咬人——18 秒行程把这条分界线放在两个玩家模型的缝隙里。
   * （首版定标；11 号票终定标。）
   */
  TRAVEL_SECONDS: 18,
  /** 抵达琴阵后每 ATTACK_BEATS 拍咬一口（首口在抵达后一个整间隔） */
  ATTACK_BEATS: 2,
  /**
   * 一口的伤害：恰为玩家上限的 1/10——空手玩家被一只妖守线咬 10 秒
   * 咬死；两只妖并线则 5 秒。掉血按「挨咬次数」可数（承 v1 反击的
   * 可读性），威胁完全来自怪物到位（ADR-0011）。
   */
  BITE_DAMAGE: 10,
  /**
   * 剑气纵深衰减（ADR-0012）：每次命中打击全场，伤害随纵深逐级递减，
   * 每级 ×AOE_DECAY_RATIO。定标理由：
   * - 0.6/级：前三级 1 / 0.6 / 0.36 肉眼可辨地「前排吃最多」；再深
   *   一级仍有 0.216，剑气扫到不成空炮；
   * - 上限 4 级（覆盖纵深 8 度以外）：生成深度 10 度封顶于 0.6^4 ≈
   *   0.13——新生妖在战场尽头挨零头伤害，但每一击都入账（守线时
   *   对深处妖的磨血是真实的，只是次要）。
   */
  AOE_DECAY_RATIO: 0.6,
  /** 每级纵深的大小（度）：level = min(CAP, floor(depth / LEVEL_DEPTH)) */
  AOE_LEVEL_DEPTH: 2,
  /** 衰减级数上限 */
  AOE_LEVEL_CAP: 4,
} as const

/** 玩家血量上限（挨咬 10 口即空；见 BATTLEFIELD.BITE_DAMAGE） */
export const PLAYER_MAX_HP = 100

/**
 * 和弦音符（GLOSSARY）：同组琴键在齐按窗口内全部命中 → 重击。
 * - CHORD_TOGETHER_WINDOW：成员按键彼此相差 ≤ 此值才算「齐按」。
 *   比判定窗（±0.12s）更紧——散着按完两键只能各算各的命中。
 * - CHORD_MULTIPLIER：重击总伤 = 成员伤害之和 × 此倍率（即加成部分
 *   = 成员伤害和 × (倍率 - 1)，在成员各自命中之后一次结清）。
 * - 半按语义：按下的成员各自正常命中结伤害（无重击倍率），未按的成员
 *   照常 Miss 走扑空——部分命中按比例兑现，不连坐。
 */
export const CHORD_TOGETHER_WINDOW = 0.08
export const CHORD_MULTIPLIER = 2.0

/* ── 余韵与终章（工单 04，ADR-0007）──────────────────────────────────
 * 乐句末自动触发余韵：规模 = 该乐句表现分（句内连击 + 判定质量）分档。
 * 表现分取 0..1，两个维度的加权和：
 * - 判定质量 quality = (Perfect×1 + Good×GOOD_CREDIT) / 句内音符数；
 * - 句内连击 fullness = 句内最长不断连击 / 句内音符数。
 * 分档两刀三档（TIER_EDGES 升序，边界含）：
 * - 0.70：普通玩家（三失其一、Good 居多）常落 minor，认真玩家稳过 major；
 * - 0.90：grand 是「仰望时刻」，留给近乎无瑕的乐句——
 *   认真玩家（95% 命中 + Perfect 抖动）多数乐句 quality≈0.97、fullness≈0.95，
 *   表现分 ≈ 0.96 稳进 grand；普通玩家 quality≈0.55、fullness≈0.5，
 *   ≈ 0.53 落 minor。终章（末乐句）在此基础上另作加强演出，不占档位。
 */
export const SUSTAIN = {
  /** Good 对判定质量的折算（Perfect 全额，Miss 无贡献） */
  GOOD_CREDIT: 0.6,
  /** 判定质量权重 */
  QUALITY_WEIGHT: 0.7,
  /** 句内连击权重 */
  COMBO_WEIGHT: 0.3,
  /** 分档边界（表现分 ≥ 边界升档；minor < 边界1 ≤ major < 边界2 ≤ grand） */
  TIER_EDGES: [0.7, 0.9] as const,
} as const

/* ── 余韵/终章 AoE 结伤（工单 08：余韵从纯演出升格为真实伤害事件）──────
 * 伤害 = 句内音符数 × 期望伤害 × 档位结伤比（× 终章倍率）。以句内音符
 * 预算记账（同 HORDE_PLAN），弹得越好炸得越狠：
 * - minor 0.3：普通玩家的余韵是挠痒（约占其输出的三成）；
 * - major 0.65：认真以上的乐句给一半多的额外输出；
 * - grand 1.0：近乎无瑕的乐句，剑气把整句火力再打一遍；
 * - FINALE_MULTIPLIER 1.5：终章 grand = 1.5 个句预算 > 墨主的
 *   HORDE_PLAN.LORD_HP_FRACTION(1.2) 个句预算 → 满血墨主可被斩首
 *   （构造性保证；major 终章 0.975 < 1.2，斩不下来——斩首只属于 grand）。
 */
export const SUSTAIN_STRIKE = {
  /** 各档结伤比（× 句内音符预算） */
  TIER_DAMAGE_FRACTION: { minor: 0.3, major: 0.65, grand: 1.0 },
  /** 终章倍率（终章 = 加强版余韵，演出与结伤同升） */
  FINALE_MULTIPLIER: 1.5,
} as const

/* ── 评级（工单 05，GLOSSARY：评级 S/A/B/C；ADR-0008：无独立分数系统）──
 * 结算评级映射（rating.ts）：败局一律 C；胜局按精度分档——
 * - S_ACCURACY 0.95：与余韵 grand（0.90）同级的仰望门槛，且要求全程零失误
 *   （一次 Miss 就断连击招反击，不配"完胜"叙事）；
 * - A_ACCURACY 0.80：认真玩家（九成命中、Perfect 居多）的稳定段。
 */
export const RATING = {
  /** 升 S 的精度门槛（边界含；另需 miss === 0） */
  S_ACCURACY: 0.95,
  /** 升 A 的精度门槛（边界含） */
  A_ACCURACY: 0.8,
} as const
