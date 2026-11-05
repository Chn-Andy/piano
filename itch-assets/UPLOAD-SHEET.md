# itch.io 发布粘贴单（心琴 v1.6）

打开 https://itch.io/game/new ，按下面顺序填。所有素材都在本目录。

## 1. 基本信息

| 字段 | 填这个 |
|---|---|
| Title | `心琴 · XinQin` |
| Project URL（自动生成） | `xinqin`（游戏地址会变成 `xxx.itch.io/xinqin`） |
| Classification | **Game** → **Play in browser (HTML5)** |
| Kind of project | **HTML5** |
| Release status | **Released** |
| Pricing | **No payments** 或 `$0 or donate` |
| Genre | `Action`（可再加 `Music`） |
| Tags | `rhythm`、`music`、`keyboard`、`singleplayer`、`pixel-art`（可选 `piano`） |

## 2. 短描述（Tagline）

```
水墨武侠 × 钢琴节奏战斗：音符落处，剑气斩妖。
```

## 3. 封面

上传本目录的 **`cover-630x500.png`**（630×500，官方推荐尺寸）。
如需更清晰可传 `cover-final.png`（1260×1000，2 倍图）。

## 4. 截图（按顺序上传；双语发布用 10 张，中文在前）

中文 5 张（曲库/战斗中已换 v1.6 图，其余 3 张沿用）：

1. `shot-曲库.png`
2. `shot-战斗中.png`
3. `shot-墨潮·纵深.png`
4. `shot-余韵·剑鸣.png`
5. `shot-终章·印章.png`

英文 5 张（library/battle 已换 v1.6 图，其余 3 张沿用；同目录 `en/`，源文件另存 `docs/screenshots/en/`）：

6. `en/library.png`
7. `en/battle.png`
8. `en/ink-tide.png`
9. `en/sword-song.png`
10. `en/finale-seal.png`

## 4b. 双语发布怎么填（v1.5 起）

**一个页面装两种语言**（ADR-0017：不开第二个 itch 页——一个 zip、一个语言开关，
两页会让每次发版都要推两遍、两处写更新说明）。

- **Title** 保持 `心琴 · XinQin`：已经是双语，不必改。
- **Tagline** 填两行（itch 的短描述支持换行）：
  ```
  水墨武侠 × 钢琴节奏战斗：音符落处，剑气斩妖。
  A duel in ink. Every note a blade.
  ```
- **Cover** 传 `cover-bilingual-630x500.png`（1260×1000 二倍图同名 `-2x`）。
  这一张就是为双语做的：左 *XinQin*、右 心琴、中英两行标语。原 `cover-630x500.png`
  与 `cover-final.png` 保留在仓库里，不再上传（itch 一页只能挂一张封面）。
  封面可重做：源文件 `cover-bilingual.html`（630×500，按 deviceScaleFactor=2 截 2x）。
- **Screenshots** 按上面 10 张的顺序传：中文 5 张在前（现有中文读者），英文 5 张在后。
- **Description** 用 `description-plain.txt`（中文）整段贴进富文本编辑器，
  空一行，再把 `description-en.txt`（英文）整段贴在同一页下半部分。
  两个小标题「玩法」「Keys」各自用 ¶ → Header 2。
- **更新说明** 用第 7 节的 v1.6 中英两段（主题曲 / Theme song）。

## 5. 上传包

**`xinqin-itch.zip`**（3.4 MB / 8 个文件，`index.html` 在包根）
勾选 **"This file will be played in the browser"**
→ Embed options 里把 viewport 设为 **1280 × 720**，勾 **Fullscreen button**

## 6. 正文（Description）

> ⚠️ 实测教训：itch 的 Description 是**富文本编辑器**，不解析 Markdown。
> 直接粘贴带 ``` 和 `**` 的文本会在页面上原样显示。请改用同目录的
> **`description-plain.txt`**（已去掉所有标记），小节标题用编辑器工具栏的
> ¶ → Header 2 手动设置。

```text
**《心琴》是一场水墨斗琴。**

音符随曲下落，你按真实钢琴布局的字母键弹奏——命中的琴音化作剑气，
斩杀自战场深处涌来的墨妖。墨妖成群推进到琴阵，抵阵后每两拍咬你一口：
miss 不会直接扣血，但剑气扑空、火力变弱，墨潮就一步步压到面前。
连击叠加伤害，和弦是双手齐下的重击；乐句终了，余韵自动引爆你方才弹出的战果，
弹得越好，墨浪越盛。曲至高潮，终章印章落下，与墨主决一胜负。

### 玩法

- **三首公版名曲 + 一首主题曲 × 三档难度**：卡农 / 致爱丽丝 / 春江花月夜，以及《猪侠漫游记》——
  medium / hard 带原曲全轨与浅绿粉主题、可爱山贼动物，easy 仍是纯钢琴版；
  简单 7 白键起步，中等 12 键加黑键，高级扩至 20 键双排手位。
- **判定**：音符落到判定线时按键，Perfect ±50ms / Good ±120ms，
  Miss 断连击（不掉血——掉血只来自墨妖抵阵后的咬击）。
- **守线**：墨妖成群自战场深处推进到琴阵，抵阵后每两拍咬一口（10 血）；
  剑气是全屏纵深衰减的 AoE——每次命中打击全场，前排吃满、后排递减。
  血空即败，撑到歌末并清完全场（含墨主）则胜。
- **异色音符**（约 6%）：寒音（全场击退并减速）、毒音（最前怪中毒掉血）、
  爆音（最前两只重击）——谱面里确定性编排，同曲重开布局一致。
- **琴心**：连击蓄能，满槽自动释放全场爆发「琴心通明」，无需任何额外按键。
- **余韵**：乐句结束自动演出，规模随你这一句的表现分档——弹好一句，看一句的杰作。
- **评级**：S / A / B / C，本机保存最佳纪录，随时回来超越自己。
- 纯网页、打开即玩、零安装；支持音画偏移校准与音乐/音效双轨音量。

### 键位

- 白键：`A S D F J K L`（一个八度 C4–B4）
- 黑键：`W E T Y U`（嵌于白键之间，同真钢琴）
- 高级难度向两侧扩域：上行 `I O P`，下行 `Z X C`
- `Esc` 暂停 / 返回；`↑↓` 选曲，`←→` 选难度，`回车` 开战

**仅支持桌面键盘**（无触屏适配）。

### 授权声明

- 钢琴采样：**Salamander Grand Piano V3**，Alexander Holm 录制（Yamaha C5），
  授权 **CC-BY 3.0**：<https://creativecommons.org/licenses/by/3.0/> ·
  原始发布 <https://archive.org/details/SalamanderGrandPianoV3> ·
  本作使用其 v8 力度层 mp3 转制（Yotam Mann 托管版本）。
- 曲目（均为公有领域乐谱）：
  - 帕赫贝尔《D 大调卡农》——MIDI 来自 [Mutopia Project](https://www.mutopiaproject.org/)（Public Domain）
  - 贝多芬《致爱丽丝》WoO 59——MIDI 来自 [Mutopia Project](https://www.mutopiaproject.org/)（Public Domain）
  - 古曲《春江花月夜》——MIDI 来自 [Music.Traditional.Chinese.MIDI](https://doi.org/10.6084/m9.figshare.5436022.v1)（**CC BY 4.0**）
- 游戏本体（代码、谱面生成器、水墨渲染）：本项目原创。
```

（以上为历史 Markdown 版，**不要直接粘**，用 `description-plain.txt`。）

## 7. 更新说明（Release notes）

```
v1.6 主题曲：新增《猪侠漫游记》—— medium/hard 播放原曲全轨（新混音：人声 +2.8dB、
琴声 −2.9dB），浅绿粉单曲主题、水墨可爱山贼动物与玫瑰刀疤野猪王墨主；easy 仍是纯钢琴版。
曲库四首；中等黑键改为 W E U I O；战斗去掉音符拖尾与判定线硬阴影，琴阵线加「琴阵 / FRONT」标注。
```

```
v1.6 Theme song: Pig Hero's Journey — Medium/Hard play the original full track
(new mix: vocals +2.8 dB, piano −2.9 dB), with a pale-green/pink stage skin,
cute ink bandit animals and a scarred boar-king Ink Sovereign; Easy stays piano-only.
Four songs; Medium black keys are now W E U I O; note trails and hard shadows removed.
```

## 8. 可玩外链（可选）

在 Edit game → **Embed options / External links** 里填 GitHub Pages：
`https://chn-andy.github.io/piano/`

## 发布后（如给我 itch API key）

butler 已装在 `/opt/data/bin/butler`。命令行更新版本只需：

```bash
BUTLER_API_KEY=<你的key> /opt/data/bin/butler push /opt/data/piano/xinqin-itch.zip <用户名>/xinqin:html5
BUTLER_API_KEY=<你的key> /opt/data/bin/butler status <用户名>/xinqin:html5
```
