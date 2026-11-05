# 26: 主题曲全轨伴奏（medium / hard）

**What to build:** 《猪侠漫游记》在 medium / hard 战斗里播放原曲全轨（含人声，人声比钢琴低 3dB），从谱面时间原点（原曲 2.776s）起播；easy 不加载。暂停随音频上下文冻结，结算与回放时停掉；加载失败降级纯钢琴版。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `assets/songs/zhuxia-manyouji.mp3`（2.776s 起、138.2s、160k）入库，随 Pages/itch 发布
- [x] 曲目配置声明 backing：文件、适用难度（medium/hard）、增益
- [x] Backing 模块：fetch/decode/缓存、按 `roundStartAt` 调度、音乐总线、停止/淡出
- [x] easy 不加载、不播放；全轨局照常显示评级并入册
- [x] 回放只响钢琴 + 伴奏；加载失败 console 警告 + 钢琴版
- [x] 浏览器实测：medium 开局能进、`__xq` 读数正常、结算不残留全轨

## Comments

**2026-11-05 · 实现**：`assets/songs/zhuxia-manyouji.mp3`（2.776s 起、138.2s、160k、2.7MB）入库；`src/audio/backing.ts` 负责 fetch/decode/缓存、按 `roundStartAt` 调度、音乐总线、淡出停源。加载异步化，晚到则按当前谱面偏移切入；easy 不加载。浏览器实测 medium `__xq.backing` 从 `playing` 到结算 `stopped`；easy 为 `none`；旧歌为 `none`。
