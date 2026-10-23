/**
 * 游戏可调常量（集中定标处）。
 * SPEC-0001：判定窗口、密度阈值等全部是集中的可调常量，初值定标在实现阶段完成。
 * 单位：秒（音频主时钟域）。
 * 手感定标总账（当前值/理由/调整入口/再定标流程）见 docs/calibration.md（工单 06）。
 */

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

/** 判定质量对伤害的折扣：Perfect 全额，Good ×0.7（Miss 无伤害，走墨妖反击） */
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
 * 墨妖出场计划：怪物随歌曲段落出场，墨主压轴。
 * 分段宽度与 HP 定标：
 * - 以「认真玩家」每音符期望伤害为记账单位：基线 10 × 命中率 0.9 ×
 *   连击均档 1.05 × 判定良莠混合 0.85 ≈ 每音符 8 点（推导见 combat.ts）。
 * - 墨妖 HP = 所在段音符数 × 期望伤害 × INK_DEMON_HP_FRACTION(0.75)：
 *   认真玩家用段内约七成音符即可击杀，留出换气余量。
 * - 墨主 HP = 末段音符数 × 期望伤害 × INK_LORD_HP_FRACTION(1.0)：
 *   比同规模墨妖厚 1/3，认真玩家需吃下末段绝大多数音符才能压哨清场——
 *   「认真弹能清完」的门槛，但绝不侥幸。
 * - 普通玩家（命中约 2/3、连击难破 10 档）每音符伤害不到假设的七成，
 *   各段累积清不完，且 Miss 反击持续掉血（见 COUNTER_DAMAGE），中途见败。
 */
export const MONSTER_PLAN = {
  /** 出场分段宽度（秒）：约每半分钟一场遭遇 */
  SEGMENT_SECONDS: 30,
  /** 「认真玩家」假设，用于把段内音符数换算成 HP 预算 */
  FOCUSED_PLAYER: {
    /** 命中率 */
    hitRate: 0.9,
    /** 长期连击均摊倍率（多数时间在 10+ 档附近） */
    comboMultiplier: 1.05,
    /** 判定良莠均摊（Perfect ×1 与 Good ×0.7 的混合） */
    tierFactor: 0.85,
  },
  /** 墨妖 HP 占段内期望伤害的比例 */
  INK_DEMON_HP_FRACTION: 0.75,
  /** 墨主 HP 占末段期望伤害的比例（> 墨妖比例 ⇒ 数值上更厚） */
  INK_LORD_HP_FRACTION: 1.0,
} as const

/**
 * 玩家血量与墨妖反击（Miss 的代价）。
 * 定标：COUNTER_DAMAGE 6 点 × 17 次 Miss = 击空 100 HP——卡农任一难度
 * 音符量都在 82+，普通玩家（命中约 2/3）全场 Miss 25+，撑不到歌末；
 * 认真玩家（命中九成以上）Miss 通常不超过 10 次（反击至多 60 点），
 * 血线安全地留有重心。HP 与反击按「挨打次数」而非比例计：掉血节奏
 * 对玩家是可数的，失误几次会死一目了然。
 */
export const PLAYER_MAX_HP = 100
export const COUNTER_DAMAGE = 6

/**
 * 和弦音符（GLOSSARY）：同组琴键在齐按窗口内全部命中 → 重击。
 * - CHORD_TOGETHER_WINDOW：成员按键彼此相差 ≤ 此值才算「齐按」。
 *   比判定窗（±0.12s）更紧——散着按完两键只能各算各的命中。
 * - CHORD_MULTIPLIER：重击总伤 = 成员伤害之和 × 此倍率（即加成部分
 *   = 成员伤害和 × (倍率 - 1)，在成员各自命中之后一次结清）。
 * - 半按语义：按下的成员各自正常命中结伤害（无重击倍率），未按的成员
 *   照常 Miss 招致墨妖反击——部分命中按比例兑现，不连坐。
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
