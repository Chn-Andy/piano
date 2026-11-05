# 31: 曲库背景透出战斗轨道 / 判定线 / 键位标签

**What to build:** 菜单、曲库、设置只画纸面；斗琴的轨道线、判定线与底部键位标签不得从半透明菜单背后透出来。第四行曲库和「原曲」小签把内容撑高后，这个泄漏被用户一眼看到。

**Blocked by:** None

**Status:** resolved

- [x] 曲库/设置/标题/引导走 paper-only 背景板
- [x] 1920×1080 与 1280×720 复核：背景干净，无战场线/键位标签
- [x] 战斗画面（含暂停/结算）仍画完整战场
- [x] `npm test` / `npm run build` 绿

## Comments

**2026-11-05 · 修复**：`#overlay` 是 78% 半透明纸色，`drawBackdrop` 之前仍调用完整 `drawField`，所以战场轨道线、判定线与底部键位标签从菜单背后透出；第四行曲库把内容撑高后更明显。给 `Renderer.draw` 加 `paperOnly` 参数：纸面 + 纸纹后直接返回；`drawBackdrop` 传 `true`，并把 `settings` 也纳入背景板分支。战斗（含暂停/结算）仍画完整战场。
