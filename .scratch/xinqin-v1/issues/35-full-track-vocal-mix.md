# 35: 全轨混音——人声太小、琴声太大

**What to build:** 让《猪侠漫游记》的全轨听起来像一首歌：人声浮到前面，玩家琴声退到伴奏里；不改判定、不改入册。

**Status:** resolved

- [x] 重混全轨：人声 0.98（初版 0.708，+2.8dB），bass 1.7、other 1.45、drums 1.0，总增益 1.2、limiter 0.92
- [x] 全轨局玩家琴声压到 `FULL_TRACK_PIANO_GAIN = 0.72`（−2.9dB）；纯钢琴局/easy 保持 1
- [x] backing 总线增益 0.5 → 0.64（+2.1dB）
- [x] 全轨加载失败时把琴声恢复到 1，不留下“变小声的纯钢琴局”
- [x] 资产 138.2s / 2,765,366B，真峰值 −0.3dBFS；`npm test` 392 项、`npm run build` 绿
- [x] 浏览器实测 medium `backing: playing`，无控制台错误

## Comments

**2026-11-05 · 混音**：用户反馈「人声太小、琴声太大、不像一首歌」。人声 +2.8dB、伴奏 +2.1dB、琴声 −2.9dB，人声相对琴声约 +7.8dB。重混文件先落在 `/opt/data/cache/scratch/zhuxia-manyouji.new.mp3`，A/B 片段在 `zhuxia-mix-old-20s.mp3` / `zhuxia-mix-new-20s.mp3`。旧资产备份在 `/opt/data/cache/scratch/zhuxia-manyouji.old.mp3`。若还要更靠人声，优先调 `FULL_TRACK_PIANO_GAIN` 或重混人声，不要改判定窗口。
