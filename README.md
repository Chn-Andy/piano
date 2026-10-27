# 心琴（XinQin）

水墨武侠风的桌面键盘节奏战斗游戏：音符随曲下落，按真实钢琴布局的字母键弹奏，
命中的琴音化作剑气斩杀自深处涌来的墨妖；乐句末「余韵」自动引爆战果，曲至高潮「终章」决胜负。
v1.1：墨妖成群推进到琴阵（守线制）、异色音符（寒/毒/爆）、连击蓄能的「琴心通明」。
三首公版曲目（卡农 / 致爱丽丝 / 春江花月夜）× 三档难度，纯网页零后端，
一份静态产物双平台上架（GitHub Pages + itch.io，[ADR-0009](docs/adr/0009-技术底座与发布.md)）。

门面截图见 [docs/screenshots/](docs/screenshots/)（曲库 / 战斗中 / 墨潮·纵深 / 余韵·剑鸣 / 终章·印章）。

## 本地运行

```bash
npm install
npm run dev        # 开发服务器；打开后点击或按任意键开始（浏览器要求用户手势后才能发声）
npm test           # 核心模拟器 + 谱面契约 + 转换器结构测试（vitest，node 环境；v1.1 基线 221 项）
npm run build      # 类型检查 + 产物输出到 dist/（相对路径 base，任意静态托管可直接部署）
npm run preview    # 本地预览构建产物
npm run charts     # 从公版 MIDI fixture 重新生成三难度谱面 JSON（src/charts/）
npm run pack:itch  # 构建 + 打包 itch.io HTML5 上传包 → 仓库根 xinqin-itch.zip（不入库）
```

玩法：白键 `A S D F J K L` 对应一个八度 C4–B4，黑键 `W E T Y U` 嵌于其间，
高级难度向两侧扩域（上排 `I O P` / 下排 `Z X C` 及黑键）。音符沿轨道落到判定线时按键，
判定窗口 Perfect ±50ms / Good ±120ms（`src/core/config.ts` 集中可调），
超窗即 Miss 断连击。长按不触发重复判定；`Esc` 暂停。

v1.1 的战斗：墨妖成群自战场深处向**琴阵**推进，miss 只让剑气扑空（**不再直接扣血**）——
掉血的唯一来源是墨妖抵阵后每两拍咬一口，所以 miss 的代价是「输出变少 → 墨潮逼近」。
剑气是全屏纵深衰减的 AoE：每次命中打击全场，前排吃满、后排递减。
谱面上约 6% 的音符是**异色音符**（寒音：全场击退减速 / 毒音：最前怪中毒 / 爆音：前二重击），
连击还会给**琴心**蓄能，满槽自动释放全场爆发「琴心通明」。全部数值集中在
`src/core/config.ts`，定标理由见 [docs/calibration.md](docs/calibration.md)。

开发验证钩子（URL 查询参数，普通玩家不受影响）：`?auto=perfect`（按谱面时刻
自动完美弹奏）、`?auto=idle`（静置验败局）、`?song=<id>`、`?chart=easy|medium|hard`。

## 发布步骤（本机无 gh CLI / 无凭据，按网页操作）

### GitHub Pages

1. **建仓**：github.com 网页上 New repository（例如 `piano`，Public，不要初始化 README）。
2. **推送**：在仓库根目录执行（替换 `<用户名>/<仓库名>`）：
   ```bash
   git remote add origin git@github.com:<用户名>/<仓库名>.git   # 或 https://github.com/<用户名>/<仓库名>.git
   git push -u origin main
   ```
   推送 `main` 会触发 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)：
   测试 → 构建 → 部署（全部官方 actions）。
3. **启用 Pages**：仓库网页 Settings → Pages → Build and deployment →
   Source 选 **GitHub Actions**（不是 Deploy from a branch）。保存后等 workflow 跑绿。
4. **游玩地址**：`https://<用户名>.github.io/<仓库名>/`（产物为相对路径 base，
   项目子路径直接可用）。后续每次 push 到 `main` 自动重新部署；
   Actions 页也可手动 workflow_dispatch。

### itch.io

1. 打上传包：`npm run pack:itch` → 仓库根 `xinqin-itch.zip`（index.html 在包根）。
2. [itch.io/game/new](https://itch.io/game/new)：Kind of project 选 **HTML5**，
   Uploads 上传 `xinqin-itch.zip` 并勾选 *This file will be played in the browser*。
3. 文案、标签、授权声明与表单字段：直接照 [docs/itch-page.md](docs/itch-page.md) 粘贴。

## 采样按需加载与体积账目（工单 07 审计）

**结论：远在预算内，无需进一步优化。** 全部运行时资产约 1.1MB，对「几十 MB 级」
预算占用约 3%：

| 资产 | 体积 | 加载时机 |
|---|---|---|
| index.html | 6.4 KB（gzip 1.75 KB） | 首屏 |
| JS 产物（含 3 曲 × 3 难度谱面 JSON 与全部代码） | 119 KB（gzip 32 KB） | 首屏 |
| 钢琴采样 5 × mp3 | 936 KB | 首次用户手势后一次性预取并解码 |

- **首屏**（标题画面）只拉 HTML + JS（gzip 约 34 KB），零音频请求——
  浏览器要求用户手势才能发声，采样加载顺势后置。
- **预热即全部**：原生采样仅 5 个小三度音高（C4/Ds4/Fs4/A4/C5），谱面键域
  G3..D5 的其余音名一律取最近采样重采样发声（`src/audio/piano.ts`）。因此
  任一曲目任一难度都可能用到全部 5 个文件，「按谱面键域挑选加载」没有可省的
  字节——首次手势后一次加载即等效于选曲预热，进曲库时早已就绪。
- **幂等**：`Piano.load()` 成功后不再重复拉取/解码（重开一局零重复流量）；
  失败不缓存，同会话可重试。
- **键域钉子**：入库谱面键域必须落在键位定标表（采样可覆盖范围）内，
  由测试锁定（`src/converter/convert.test.ts`），越界在测试期就红，不会
  演变成线上开局崩溃。
- 构建期输入（MIDI fixture）已移出 `assets/`（vite publicDir），不进产物。

## 架构

- `src/core/` 纯核心模拟器：无 DOM / Web Audio，时间注入（Seam 1，测试主战场）；谱面数据契约在 `src/core/chart.ts`（音符/和弦分组/乐句边界/余韵窗口/难度元数据）
- `src/converter/` MIDI→谱面转换器（构建期工具，Seam 2）：难度规则集中常量在 `src/converter/rules.ts`，`@tonejs/midi` 仅在 `src/converter/midiSource.ts` 引入
- `scripts/generate-charts.ts` 谱面再生成 CLI（`npm run charts`）；产物谱面在 `src/charts/`
- `src/render/` Canvas 2D 渲染壳；`src/audio/` Web Audio 壳（主时钟 + lookahead 调度，见 [ADR-0010](docs/adr/0010-音频主时钟.md)）
- 手感与数值定标记录：[docs/calibration.md](docs/calibration.md)

## 钢琴采样来源与授权

`assets/samples/`（URL 路径 `/samples/`）：

- **Salamander Grand Piano V3**，Alexander Holm 录制（Yamaha C5），授权 **CC-BY 3.0**（可商用，须署名）：<https://creativecommons.org/licenses/by/3.0/>
- 原始发布：<https://archive.org/details/SalamanderGrandPianoV3>
- 本仓库内为 v8 力度层 mp3 转制，取自 @tonejs/piano 作者（Yotam Mann）托管：<https://tambien.github.io/Piano/audio/>
- 原生采样仅在小三度音高（C4/Ds4/Fs4/A4/C5）；其余白键（D4/E4/F4/G4/B4）取最近原生采样以 `playbackRate` 重采样（`src/audio/piano.ts`），与 @tonejs/piano 官方库做法一致。

**采样再下载**（文件缺失/损坏时；URL 已核对，字节数与入库文件一致）：

```bash
cd assets/samples
for n in C4 Ds4 Fs4 A4 C5; do
  curl -LO "https://tambien.github.io/Piano/audio/${n}v8.mp3"
done
```

## MIDI fixture 来源与授权

`fixtures/`（仓库根；v1 三首，ADR-0008。构建期输入，不进发布产物）：

- `canon-in-d.mid` —— 帕赫贝尔《D 大调卡农》（Pachelbel 1653–1706，作品公版），Mutopia Project 标注 **Public Domain**：<https://www.mutopiaproject.org/cgibin/make-table.cgi?setdir=PachelbelJ/CanonInD>
- `fur-elise.mid` —— 贝多芬《致爱丽丝》WoO 59（Beethoven 1770–1827，作品公版，双手钢琴编配），Mutopia Project 标注 **Public Domain**：<https://www.mutopiaproject.org/cgibin/make-table.cgi?setdir=BeethovenLv/WoO59/fur_Elise_WoO59>
- `chun-jiang-hua-yue-ye.mid` —— 古曲《春江花月夜》（传统公版）；MIDI 为 Wang Jiayi 1997 年改编制谱（文件内文本事件 "Copyright _ 1997 by Wang Jiayi"），取自 figshare 数据集 [Music.Traditional.Chinese.MIDI](https://doi.org/10.6084/m9.figshare.5436022.v1)，整集授权 **CC BY 4.0**：<https://creativecommons.org/licenses/by/4.0/>（使用须署名该数据集）
- 转换谱面产物 `src/charts/<曲目>/{easy,medium,hard}.json` 由 `npm run charts` 从上述 fixture 确定性生成，测试锁定产物与新鲜转换一致。
