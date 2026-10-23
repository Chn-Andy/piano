# 01: 骨架与第一个音符（tracer）

**What to build:** 玩家打开页面即看到斗琴画面：音符沿轨道下落到判定线，按对应白键（A S D F G H J）立即听到采样琴声并获得 Perfect / Good / Miss 三级判定反馈。这是贯穿"模拟器—音频—渲染"全层的最小纵切，同时确立项目地基：音频主时钟（ADR-0010）、纯核心模拟器与 Seam 1 测试范式。

**Blocked by:** None（可立即开始）

**Status:** ready-for-agent

- [ ] `npm run dev` 打开即见下落音符与判定线，白键按键出采样琴声
- [ ] 三级判定按 ±50ms / ±120ms 初始窗口正确显示（常量集中可调）
- [ ] 长按不触发重复判定（keydown 去重）
- [ ] 核心模拟器为纯层（不引用 DOM / Web Audio），注入固定时钟的单测覆盖：命中、Miss、窗口边界、去重
- [ ] 游戏时间轴跟随 `audioContext.currentTime`，并补立 ADR-0010
