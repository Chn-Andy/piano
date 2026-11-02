# 24: 战斗画布英文——HUD、判定、余韵与终章印、倒计时

**What to build:** 打一局英文模式的斗琴，画布上找不到一个汉字。渲染器改为接收整套文案；字体栈按语言切换（英文模式在栈首前置拉丁衬线，仍不打包字体）。三处按汉字字形定死的几何要改成按测量走：终章朱印的宽度改为「测量字宽 + 两侧朱砂边」，高度与位置不变——**印面围住词，而不是词挤进按两字定死的印面**；和弦重击标号按测量收敛到怪物半径 1.4 倍以内；倒计时数词随语言（中文仍四三二一、英文 4 3 2 1）。状态读数一律用登记过的短名（*Heart 12/30*、*Phrase 3 / 7*、*Last phrase*、*Combo · Damage ×N*、*Vitality*、*Sovereign*、*CLARITY*），余韵三档题字 *Resonance / Ink Surge / Sword Song*，判定 *Perfect* / *Good* / *Miss*，偏差 *on time* / *early N* / *late N*。

**Blocked by:** 22（文案表与语言开关）

**Status:** resolved

**Branch:** `feat/v1.5-bilingual`

- [x] 渲染器从文案表取字；英文模式下画布零汉字（逐条走查 HUD 与演出）
- [x] 英文模式字体栈前置拉丁衬线（Iowan Old Style / Palatino / Georgia）并保留原中文栈兜底；25 / 52 / 96px 三档实测观感可接受，不合格退回原栈
- [x] 终章印宽 = 测量字宽 + 两侧朱砂边，印高与位置不变；印面不越出画布边界
- [x] 印面与重击标号的尺寸收敛抽成纯函数并有测试（先例 `hudGeometry.test.ts`）：印宽随字宽单调增长、印高恒定、重击标号宽度 ≤ 半径 1.4 倍
- [x] 倒计时随语言：中文 四三二一 / 英文 4 3 2 1
- [x] HUD 短名全部生效：*Heart 12/30*、*Phrase 3 / 7*、*Last phrase*、*Combo · Damage ×N*、*Vitality* + 当前/上限、*Sovereign*、*CLARITY*
- [x] 演出与外显文案英文可用：余韵三档题字、判定闪示、偏差小字、异色音符题字（*Frost* / *Venom* / *Blast*）
- [x] 测试与构建绿；判定窗口、血量、伤害、充能与谱面零改动

## Comments

**2026-11-01 · 实现与验证同批（commit `1dccf12`）**

- 渲染器 `setCopy(copy, locale)`：画布上的字全部来自文案表；英文模式字体栈前置
  Iowan / Palatino / Georgia，中文栈兜底，**不打包字体**。
- **印面围住词**（`labelGeometry.finaleSealBox`）：中文仍是 2 字宽 + 两侧朱砂边（与改前逐像素一致），
  英文 *Finale* 跟着长；和弦重击标号按 `fitLabelFontSize` 收到半径 1.4 倍以内；倒计时随语言。
- HUD 短名走查：Vitality / Heart N/30 / Combo · Damage ×N / Phrase N / M / Last phrase / Sovereign /
  CLARITY / HEAVY / Frost / Venom / Blast / 余韵三档。
- **浏览器实测**：致爱丽丝 easy 整局（`auto=perfect`，含终章）hook `fillText`，画布共画过
  **260 个不同字符串，零汉字**（含 Finale 印章、Sovereign、Last phrase）。
- **中文回归**：同一 hook 在 locale=zh 下画出的仍是 气血 / 琴心 N/30 / 连击 · 伤害 / 完美 / 正点 /
  第 N / 句 / 剑鸣 / 寒毒爆 / 琴心通明 / 重 / 四三二一，无英文读数泄漏。
- 375 项测试与构建绿；对局数值与谱面零改动。
