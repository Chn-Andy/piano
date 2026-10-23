# 心琴（XinQin）

水墨武侠风的桌面键盘节奏战斗游戏：玩家跟随下落音符弹琴，琴音化作剑气击杀墨妖。当前为工单 02 阶段：谱面契约与 MIDI→谱面转换器（卡农三难度谱面已产出；游戏运行时仍跑工单 01 的演示谱面，正式谱面接入见工单 03/05）。

## 本地运行

```bash
npm install
npm run dev     # 打开后点击或按任意键开始（浏览器要求用户手势后才能发声）
npm run build   # 类型检查 + 产物输出到 dist/（纯静态，可任意静态托管）
npm test        # 核心模拟器 + 谱面契约 + 转换器结构测试（vitest，node 环境）
npm run charts  # 从公版 MIDI fixture 重新生成三难度谱面 JSON（src/charts/）
```

玩法：白键 `A S D F G H J` 对应一个八度 C4–B4，音符沿轨道落到判定线时按键。判定窗口 Perfect ±50ms / Good ±120ms（`src/core/config.ts` 集中可调），超窗即 Miss 断连击。长按不触发重复判定。

## 架构

- `src/core/` 纯核心模拟器：无 DOM / Web Audio，时间注入（Seam 1，测试主战场）；谱面数据契约在 `src/core/chart.ts`（音符/和弦分组/乐句边界/余韵窗口/难度元数据）
- `src/converter/` MIDI→谱面转换器（构建期工具，Seam 2）：难度规则集中常量在 `src/converter/rules.ts`，`@tonejs/midi` 仅在 `src/converter/midiSource.ts` 引入
- `scripts/generate-charts.ts` 谱面再生成 CLI（`npm run charts`）；产物谱面在 `src/charts/`
- `src/render/` Canvas 2D 渲染壳；`src/audio/` Web Audio 壳（主时钟 + lookahead 调度，见 [ADR-0010](docs/adr/0010-音频主时钟.md)）

## 钢琴采样来源与授权

`assets/samples/`（URL 路径 `/samples/`）：

- **Salamander Grand Piano V3**，Alexander Holm 录制（Yamaha C5），授权 **CC-BY 3.0**（可商用，须署名）：<https://creativecommons.org/licenses/by/3.0/>
- 原始发布：<https://archive.org/details/SalamanderGrandPianoV3>
- 本仓库内为 v8 力度层 mp3 转制，取自 @tonejs/piano 作者（Yotam Mann）托管：<https://tambien.github.io/Piano/audio/>
- 原生采样仅在小三度音高（C4/Ds4/Fs4/A4/C5）；其余白键（D4/E4/F4/G4/B4）取最近原生采样以 `playbackRate` 重采样（`src/audio/piano.ts`），与 @tonejs/piano 官方库做法一致。

## MIDI fixture 来源与授权

`assets/fixtures/canon-in-d.mid`：

- 帕赫贝尔《D 大调卡农》（Pachelbel 1653–1706，作品公版），Mutopia Project 标注 **Public Domain**：<https://www.mutopiaproject.org/cgibin/make-table.cgi?setdir=PachelbelJ/CanonInD>
- 转换谱面产物 `src/charts/canon/{easy,medium,hard}.json` 由 `npm run charts` 从该 fixture 确定性生成，测试锁定产物与新鲜转换一致。
