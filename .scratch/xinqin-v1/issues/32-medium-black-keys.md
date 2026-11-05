# 32: 中等难度右手黑键 T Y U → U I O

**What to build:** 中等难度的三个右手黑键从 `T / Y / U` 改为 `U / I / O`，落在 `J / K / L` 正上方，减少手腕左探；白键与左手黑键 `W / E` 不变。

**Blocked by:** None

**Status:** resolved

- [x] `layoutForKeys(notes, difficulty)` 支持中等难度局部覆盖：F#4=U、G#4=I、A#4=O
- [x] 曲库键位预览、战斗底部键位标签、实际输入统一走同一布局
- [x] 高级难度保持 `W E T Y U` + `I O P`，不受影响
- [x] 键位单测更新（中等 U I O / 高级 T Y U）
- [x] `npm test` 392 项、`npm run build` 绿

## Comments

**2026-11-05 · 实现**：`src/core/keymap.ts` 增加 `MEDIUM_BLACK_KEYS` 与 `MEDIUM_NOTE_TO_PHYSICAL`；`layoutForKeys` 按难度选表，中等用 U I O，其余用默认表。`main.ts` 四个调用点（初始布局、曲库预览、开战、背景板）都传入难度。浏览器实测：曲库 Medium 预览为 `A W S E D F U J I K O L`；Canon Medium 战斗底部标签一致，无 T/Y 残留。ADR-0006 已加修订说明：高级仍 T Y U，跨难度右手黑键肌肉记忆不再完全共享。
