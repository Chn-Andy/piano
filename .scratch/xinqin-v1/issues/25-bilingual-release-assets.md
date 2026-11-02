# 25: 发行物双语——截图、封面、itch 页、README

**What to build:** 英文玩家在 itch 上能先读到英文再玩到英文，而中文侧一个字都不少。新增 5 张英文截图（曲库 / 战斗中 / 墨潮·纵深 / 余韵·剑鸣 / 终章·印章，与中文 5 张同一渲染路径，用现有开发钩子摆拍），中文 5 张原样保留。新做一张**中英并列**封面（左 *XinQin* 右 心琴，仍是白底水墨构图），原有三张封面文件不动。itch 描述改为中英两段（中文在前、英文在后），发布粘贴单增一节「双语发布怎么填」：截图 10 张的上传顺序、选哪张封面、两段描述怎么摆。README 拆成中文与英文两份并互相链接。最后按说明书里的 11 屏走查清单人工过一遍并由用户确认。

**Blocked by:** 22、23、24（需要英文模式的菜单、结算与战斗画面才能拍到）

**Status:** resolved

**Branch:** `feat/v1.5-bilingual`

- [x] 英文 5 张截图入 `docs/screenshots/` 与 `itch-assets/`；中文 5 张保留不动
- [x] 中英并列封面一张（左 *XinQin* 右 心琴，同构图同配色）；原三张封面文件不动
- [x] itch 描述中英两段（中文在前、英文在后）；`description-plain.txt` 与粘贴单同步
- [x] 发布粘贴单增「双语发布怎么填」一节：10 张截图顺序、封面选哪张、两段描述位置、更新说明怎么写
- [x] `README.en.md` 新建 + `README.md` 顶部一行互链；中文 README 内容不删
- [x] 11 屏走查清单逐条过（标题 / 曲库 / 设置 / 键位引导 / 暂停 / 战斗 HUD / 余韵与终章 / 结算与回放 / 致命错 / 角标切换即时生效 / itch 描述与 10 张截图），用户确认
- [x] `npm test` 与 `npm run build` 绿
- [x] 实际上传 itch 由用户确认后单独执行（本票只备素材与粘贴单）

## Comments

**2026-11-01 · 素材与验收同批**

- 英文 5 张截图（1280×720）：`docs/screenshots/en/{library,battle,ink-tide,sword-song,finale-seal}.png`，
  同份进 `itch-assets/en/`；中文 5 张原样保留。
- **中英并列封面**：新增可重做源 `itch-assets/cover-bilingual.html`（630×500，dsf=2 出 1260×1000），
  产出 `cover-bilingual-630x500.png` 与 `cover-bilingual-2x.png`；原三张封面文件未动。
- itch 双语：新增 `description-en.txt`；`UPLOAD-SHEET.md` 增「4b 双语发布怎么填」
  （title 不动 / tagline 两行 / 封面选哪张 / 10 张截图顺序 / 描述两段）。
- README：`README.en.md` 新建；`README.md` 顶部互链并补 v1.5 一行。
- **11 屏走查（英文模式）**：标题 ✓ / 曲库 ✓ / 设置 ✓ / 键位引导 ✓ / 暂停 ✓ / 战斗 HUD ✓ /
  余韵与终章 ✓（截图即证据：*Sword Song* 爆发、*Finale* 朱印完整不溢出）/ 结算与回放 ✓ /
  致命错 ✓（拦掉采样请求实测 `XinQin / Audio failed to start. Reload to try again.`）/
  角标切换即时生效 ✓ / itch 描述与 10 张截图 ✓。
- **一处按实测改版式**：曲名栏 180px 装不下 *Spring River*（0.12em 字距实测约 187px 会折行），
  给英文加 `html[lang='en'] .song-name { letter-spacing: 0.04em }`（约 165px 单行），
  中文仍是 0.12em——**栏宽没动**（D10）。
- 实际 itch 上传未做：等用户确认后单独执行。

**2026-11-01 · 发布回读记录**

- `feat/v1.5-bilingual` → `main`（fast-forward，22–25 共 4 个 commit），同时推 Gitea（origin）与 GitHub。
- **GitHub Pages 已回读**：线上 `assets/index-DdhTndKa.js` 与本地 `dist/` 同哈希，`lang-badge` 在产物里 —— 线上就是这一版。
- **itch 已上传**：`butler push --userversion 1.5.0` → build **#2274899**（from #2267311），CHANNEL html5 已切换；
  包 981,266 字节、`index.html` 在包根、7 个条目，zip sha256 前 16 位 `baab2f6ad95ef9b9`。
- **待网页端完成的**（butler 只推构建，itch 无页面 API）：Title / Tagline 两行 / 封面换 `cover-bilingual-630x500.png` /
  10 张截图顺序（中文 5 在前）/ 描述中英两段 / 更新说明两句 —— 按 `UPLOAD-SHEET.md` 的「4b 双语发布怎么填」抄。
