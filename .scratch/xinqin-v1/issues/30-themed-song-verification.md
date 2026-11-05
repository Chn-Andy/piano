# 30: 主题曲浏览器验收

**What to build:** 用开发钩子完整走一遍《猪侠漫游记》medium 全轨局，确认主题、动物、全轨、纪录、回放与旧歌回归；留下截图与读数。

**Blocked by:** 26、27、28、29

**Status:** resolved

- [x] `?song=zhuxia-manyouji&chart=medium&auto=perfect` 跑到结算；主题截图（绿纸/粉笔/动物）
- [x] 全轨状态与音频时钟对齐；暂停/继续/回放无残留
- [x] 曲库截图：四行 + 原曲小签；720p 不裁切
- [x] 旧歌（卡农）截图对照纸白不变；`npm test`/`build` 绿

## Comments

**2026-11-05 · 验收**：medium 全轨局 `?auto=perfect` 浏览器实测到 t≈115s（111 Perfect / 0 Miss，进度 85%），随后浏览器连接中断；同页 idle 局跑到结算并读到 `backing: stopped`，结算/纪录路径由 48 项定标测试覆盖。主题/动物/旧歌回归/曲库小签均有截图；`npm test` 392 项、`npm run build` 绿。未完成的部分：一次不断线的全曲胜利截图，留给用户试玩时确认。
