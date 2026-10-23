# 心琴（XinQin）

水墨武侠风的桌面键盘节奏战斗游戏：音符随歌下落，玩家按真实钢琴布局的字母键弹奏，琴音化作剑气击杀墨妖。当前为工单 01 阶段：骨架与第一个音符（端到端最小纵切）。

## 本地运行

```bash
npm install
npm run dev     # 打开后点击或按任意键开始（浏览器要求用户手势后才能发声）
npm run build   # 类型检查 + 产物输出到 dist/（纯静态，可任意静态托管）
npm test        # 核心模拟器单测（vitest，node 环境——核心层不依赖浏览器 API）
```

玩法：白键 `A S D F G H J` 对应一个八度 C4–B4，音符沿轨道落到判定线时按键。判定窗口 Perfect ±50ms / Good ±120ms（`src/core/config.ts` 集中可调），超窗即 Miss 断连击。长按不触发重复判定。

## 架构

- `src/core/` 纯核心模拟器：无 DOM / 无 Web Audio，时间注入（Seam 1，测试主战场）
- `src/render/` Canvas 2D 渲染壳；`src/audio/` Web Audio 壳（主时钟 + lookahead 调度，见 [ADR-0010](docs/adr/0010-音频主时钟.md)）
- 谱面数据契约在 `src/core/chart.ts`（工单 02 以此为种子扩展）

## 钢琴采样来源与授权

`assets/samples/`（URL 路径 `/samples/`）：

- **Salamander Grand Piano V3**，Alexander Holm 录制（Yamaha C5），授权 **CC-BY 3.0**（可商用，须署名）：<https://creativecommons.org/licenses/by/3.0/>
- 原始发布：<https://archive.org/details/SalamanderGrandPianoV3>
- 本仓库内为 v8 力度层 mp3 转制，取自 @tonejs/piano 作者（Yotam Mann）托管：<https://tambien.github.io/Piano/audio/>
- 原生采样仅在小三度音高（C4/Ds4/Fs4/A4/C5）；其余白键（D4/E4/F4/G4/B4）取最近原生采样以 `playbackRate` 重采样（`src/audio/piano.ts`），与 @tonejs/piano 官方库做法一致。
