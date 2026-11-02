# 23: 结算与纯层句子双语，加机器守卫

**What to build:** 打完一局，结算卡上的每个字都是玩家选的语言。三个纯层模块交出它们最后的中文：偏移建议、进度行、掌握度释义改为**接收文案函数**再返回句子，纯层从此不持有任何玩家可见字面量。结算卡整屏英文化（斗琴告捷/落败、走到 X% 与两种结局、曲名全名、难度、评级、精度/最长连击/掌握度、掌握度释义一行、听我的演奏/再听一遍、回放读数行、统计行、三个按钮），掌握度四档与评级名走表。同时上线**机器守卫**：一条测试扫两份字典——中英键集必须完全相同且无空串、英文值里出现任何汉字即失败、中文值里出现整句英文即失败（白名单：`XinQin`、评级 `S`–`C`、`×`）。原来断言中文字面量的 `rating.test.ts` / `progress.test.ts` 改为传入「回显键名与参数」的假文案函数，断言键名与参数而不是措辞。

**Blocked by:** 22（文案表与语言开关）

**Status:** resolved

**Branch:** `feat/v1.5-bilingual`

- [x] `rating.offsetAdvice` / `progress.progressLine` / `mastery.masteryLine` 改为接收文案函数返回句子，三个模块不再含玩家可见字面量
- [x] 结算卡英文可用：胜负标题、走到 X%（封顶 99%）、血尽 / 墨妖未绝、曲名全名 *Moonlight on the Spring River*、难度、评级、精度、最长连击、掌握度徽记与释义、新纪录 / 本机最佳
- [x] 回放区块英文可用：*Hear my playing* / *Play again*、`Last N s · N hits · N misses · incl. Finale`
- [x] 统计行英文可用：总伤害 / 琴心通明 / 完美 / 良好 / 失误
- [x] 掌握度四档（初演/弹熟/精熟/未入册）与评级 S–C 的显示名走表
- [x] 机器守卫测试：键集相同、无空串、英文值无汉字、中文值无整句英文（白名单如上）
- [x] `rating.test.ts` / `progress.test.ts` 改为断言键名与参数；文案后续再改不需动这些测试
- [x] 测试与构建绿；对局数值与纪录结构零改动

## Comments

**2026-11-01 · 实现与验证同批（commit `c51604c`）**

- **纯层交出最后的字**：`offsetAdvice(…, copy)`、`progressLine(…, copy)`、`masteryLine(level, copy)`、
  `replayLabel(active, copy)`；`REPLAY_LABELS` 与掌握度徽记表离开纯层。
- **缝 C**：三个测试文件改用 `src/i18n/keyEcho.ts` 的「回显键名与参数」假表（如 `advice.fix(+23,23,true)`），
  断言键与参数而不是措辞——以后再改文案不必动这些测试。
- **结算卡全英文**：Duel Lost / Reached 17% — you fell / 曲名全名 / Accuracy / Best combo / Mastery /
  Unrecorded + 释义 / Hear my playing / Last 20 s · 0 hits · 10 misses / Total damage … / Again / Back to Library。
- **机器守卫**（`copy.test.ts`）：键集与种类对拍、无空串、英文值零汉字、中文值无整段英文、
  17 个插值产出同样受检、倒计时两语言各四拍。
- **浏览器实测**（`?auto=idle&chart=hard` 败局结算）：结算页文本零汉字。
- 368 项测试与构建绿。
