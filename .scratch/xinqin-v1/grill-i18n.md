# 访谈：双语 UI（中 / EN）

状态：**访谈结束**（2026-11-01）。三轮 17 个问题全部落定：D1–D7（口径与范围）、D8–D13（命名、印面、文案表、文档、itch）、D14–D17（tagline、词表、验收、ADR）。下一步 to-spec。

## Facts（已量，圆点后是出处）

**F1 玩家可见文案约 105 条，散在 8 个运行时文件里，没有一处集中的文案表。**
扫描方法：`src/**/*.ts` 去注释后取含 CJK 的行 + 人工分辨玩家可见与开发者可见。

| 文件 | 可见文案量 | 内容 |
|---|---|---|
| `src/main.ts` | ≈55 | 全部 DOM 面板：标题 / 曲库 / 设置 / 键位引导 / 暂停 / 结算卡 / 致命错 |
| `src/render/renderer.ts` | ≈25 | 全部画布文字（见 F2） |
| `src/charts/index.ts` | 9 | `DIFFICULTY_LABELS` 三档 + 曲名 3 + blurb 3 |
| `src/core/mastery.ts` | 8 | 4 个档位名 + 4 句释义（`masteryLine`） |
| `src/core/progress.ts` | 3 | `progressLine` 三种结局句（带插值） |
| `src/core/tints.ts` | 3 | 寒音 / 毒音 / 爆音 |
| `src/core/rating.ts` | 2 | `offsetAdvice` 两句模板（带插值） |
| `src/core/replay.ts` | 1 | `REPLAY_LABELS`（听我的演奏 / 再听一遍） |
| `index.html` | 2 | `<title>心琴 · 斗琴</title>`、标题印章 `content: '琴'` |

**F2 画布文字只有一个出口：`renderer.ts` 的 19 处 `fillText`。**字体是
`SERIF = '"Noto Serif SC", "Songti SC", "SimSun", serif'`（`renderer.ts:208`）。
文案清单：余韵三档题字（余韵 / 墨浪 / 剑鸣，30 / 44 / 58px）、终章（82px，印面内）、
完美 / 良好 / 失误（25px）、偏差小字（正点 / 早 N / 晚 N，12px）、倒计时数词、琴心通明、
墨主、和弦重击标记「重」、`连击 · 伤害 ×N`、`最后一句` / `第 N / M 句`、`气血`、`琴心 N/30`。

**F3 终章是一枚印章，印面尺寸按两个汉字定的。**`FINALE_SHOW.labelSize = 82`，
印面 `w = size*2 + pad*2 = 232`、`h = size*1.5 = 123`（`renderer.ts:199`、`1755-1785`）。
两个汉字撑满印面；英文 *Finale* 六字母按 0.5em 估宽 ≈ 246px，双侧溢出且横竖比例失衡。

**F4 倒计时用汉字数词**：`COUNT_NUMERALS = ['四','三','二','一']`（`renderer.ts:255`），96px 居中。

**F5 纪录与本机存档不存文案，切语言不会打乱旧数据。**`records` 只存
`rating: 'S'|'A'|'B'|'C'` 与 `mastery: 'first'|'seasoned'|'mastered'|'none'` 这类英文键，
显示名由 `MASTERY_LABELS` 映射（`core/mastery.ts:23-26`）。

**F6 设置键是版本化的 `xinqin.settings.v1`**（`core/settings.ts:21`），`coerceSettings`
对缺字段取默认、越界钳回（`settings.ts:47-58`）。加 `locale` 属兼容变更；
**升 v2 会让玩家现有音量与音画偏移一起归零**。

**F7 曲库文案是纯数据，函数签名里没有 locale**：`DIFFICULTY_LABELS` 是模块常量，
`song.title / song.blurb` 直接进模板（`charts/index.ts:26-52`，`main.ts:322-327`）。

**F8 已上架 itch（v1.4，butler build #2267311），页面素材全中文**：
`itch-assets/UPLOAD-SHEET.md`、`description-plain.txt` 与全部截图皆中文；`README.md` 也是。
英文玩家点进来会先看到中文商店页，再看到（本次之后）英文游戏。

**F9 `docs/adr/0008-v1范围与非目标.md` 明写 v1 范围含「UI 中文」**——本次改动令该句失效，
须在该 ADR 追加日期附注（不是删掉）。

**F10 无 i18n 依赖、无构建期文案抽取**：`package.json` 只有 vite / typescript / vitest /
@tonejs/midi / tsx；产物是单页静态包（`assets/` 只有 5 个 mp3 采样，字体一个都没打包）。

**F11 测试基线 349 项**（README v1.4）。测试里的中文是测试名与断言描述，不属玩家文案，不译。

**F12 键位已把字母区吃掉大半**：白键 `A S D F J K L`、黑键 `W E T Y U`，高级难度向上
`I O P`、向下 `Z X C`（README「玩法」节）。剩余空闲字母 `B G H M N R V` 全在琴键手位上。

**F13 曲名栏容不下长英文名。**曲库行是 `grid-template-columns: 180px 1fr`、曲名 22px 衬线
（`index.html:143-152`），估约容 12–14 个拉丁字符：*Canon in D*（10）、*Für Elise*（9）够，
*Moonlight on the Spring River*（28）会折行。结算卡的 `.card-song` 是 `white-space: nowrap`
（`index.html:333-335`）——折不了，只会顶出去。

**F14 封面本身是一张文字构图**（vision 读图）：`心琴`（黑色大标题）+ `水墨斗琴`（红小标）+
红方印 `琴` + 「音符落处，剑气斩妖」+ 底部键帽 `A W S E D T J U K` + 右下 `XINQIN`。
itch 一页只能传一张 630×500 封面（`UPLOAD-SHEET.md` §3），`cover-final.png` 是 1260×1000 二倍图。

**F15 截图 5 张**（`docs/screenshots/` 与 `itch-assets/` 各一份同名副本）：
曲库 / 战斗中 / 墨潮·纵深 / 余韵·剑鸣 / 终章·印章；除墨潮那张 1440×757，其余 1280×720。

**F16 没有封面生成脚本**：`scripts/` 只有 `generate-charts.ts` 与 `pack-itch.mjs`。
英文封面是重做一张图（设计工作量），不是代码。

**F17 带插值的玩家可见句子有 4 处**：`rating.offsetAdvice`（2 句模板）、
`progress.progressLine`（3 句模板）、结算统计行、判定闪示的偏差小字。
把文案抽进字典会改纯层函数签名 → `rating.test.ts` / `progress.test.ts` 里断言中文字面量的用例要跟着改写。

## Decisions（按轮记）

### Round 1（2026-11-01）

- **D1 · 译文口径 = 意象重写 + 一张固定对照表**（Q1）。专名每词只钉一个英文，句子按英文语感重写，不逐字直译。对照表落 `GLOSSARY.md` 新增的双语词表节（Round 3 落笔）。初始定调：琴心 → *Heartstring*、墨妖 → *Ink Fiend*、墨主 → *Ink Sovereign*、余韵 → *Resonance*、终章 → *Finale*、气血 → *Vitality*、初演/弹熟/精熟 → *First Play / Seasoned / Mastered*；Perfect / Good / Miss 沿用代码里的英文枚举。
- **D2 · 英文模式全英文，一个汉字都不留**（Q2，**推翻了我的推荐**）。标题字、CSS 角印 `琴`、终章朱印、汉字倒计时数词全部英文化。连锁：需要英文游戏名（→ Q8）、印面要按拉丁字重排（→ Q9）、封面要重做（→ Q13）、倒计时改为阿拉伯数字 4/3/2/1。
- **D3 · 默认语言跟随浏览器，手选后记住**（Q3）。存 `settings.locale: 'zh' | 'en' | null`（null = 跟随系统）；键仍用 `xinqin.settings.v1`，**不升 v2**（升版会清掉玩家音量与音画偏移，见 F6）。
- **D4 · 切换入口 = 设置面板一行 + 曲库标题右侧常驻「中 / EN」小角标**（Q4）。不做快捷键：空闲字母只剩 `B G H M N R V`，全在琴键手位上（F12）。
- **D5 · 英文模式字体栈首插拉丁衬线**（Q5）：`'Iowan Old Style', 'Palatino Linotype', Georgia` + 原中文栈兜底，零打包；实测 25/52/96px 三档不合格就退回原栈。
- **D6 · 同一概念允许两个长度，都由词表登记**（Q6）：HUD 用短名（*Heart 12/30*、*Phrase 3 / 7*），曲库/结算/引导用全名；不许临场缩写。
- **D7 · 范围扩到 itch 商店页 + README + 截图，中英并存、中文不删**（Q7，**超出我的推荐**）。英文为新增内容，不是替换。文档与页面形态见 Q12 / Q13。

### Round 2（2026-11-01）

- **D8 · 英文游戏名 = XinQin**（Q8）。拼音品牌不动：封面右下已印 `XINQIN`、itch 标题已是「心琴 · XinQin」；另起英文名会与机制名撞车（琴心 = *Heartstring*）。标题屏全英文时是衬线大字距的 *XinQin*。
- **D9 · 印面围住词，而不是词挤进印面**（Q9）。终章印宽改为 `measureText(label).width + 两侧朱砂边`，高度沿用 `size*1.5`；标题角印保持 40×40 方形，红方内放拉丁字母 **X**（`index.html` 的 `content` 改 `X`）。
- **D10 · 曲名一句两长**（Q10，按 D6 办）。卡农 → *Canon in D*；致爱丽丝 → *Für Elise*；春江花月夜 → 曲库短名 *Spring River*、结算卡与引导用全名 *Moonlight on the Spring River*；blurb 写一句出处。**不动曲库 180px 栏宽**。
- **D11 · 文案集中单表 + 编译期穷举**（Q11）。`src/i18n/` 一个 `MsgKey` 联合 + 中英两份 `Record<MsgKey, string>`；带插值的 4 处改成语文案函数（F17）；另加键集对拍测试。接受 `rating.test.ts` / `progress.test.ts` 的断言改写。
- **D12 · README 两文件互链**（Q12，笔答未反对）：`README.md`（中）+ `README.en.md`（英），各自顶部一行互链。
- **D13 · itch 一页双语 + 新做中英并列封面**（Q13）。描述中文在前英文在后；截图 10 张分两组；封面新做一张左 *XinQin* 右 *心琴* 的同构图版，中文原封面留在 `itch-assets/` 不动；不开第二页。

### Round 3（2026-11-01）

- **D14 · 英文 tagline = *A duel in ink. Every note a blade.***（Q14）。标题屏副题与封面 tagline 共用这一句。
- **D15 · 词表全按草案**（Q15）：墨妖 *Ink Fiend*、墨主 *Ink Sovereign*（短名 *Sovereign*）、余韵三档 *Resonance / Ink Surge / Sword Song*、「重」保留 *HEAVY* 并按 `measureText` 收到半径 1.4 倍以内（不换符号）。
- **D16 · 验收两层**（Q16）：① 单元测试扫两份字典——英文值含 CJK 即失败、中文值含整句英文即失败（白名单 `XinQin` / `S`–`C` / `×`）；② 11 屏人工走查清单（标题 / 曲库 / 设置 / 键位引导 / 暂停 / 战斗 HUD / 余韵与终章 / 结算卡 / 回放 / 致命错 / itch 描述）。不做浏览器端逐屏 e2e。
- **D17 · 文档落位**（Q17）：新开 `docs/adr/0017-双语UI与全英文模式.md`；ADR-0008 追加「附注（2026-11-01，双语访谈）」一行，非目标清单不动；词表按 D1 落 `GLOSSARY.md`。

## 对照表（已定；词条已落 GLOSSARY.md）

| 中文 | 英文全名 | HUD 短名 | 出处 |
|---|---|---|---|
| 心琴 | *XinQin* | — | `<title>`、标题屏 h1 |
| 斗琴 | *duel* | — | 斗琴告捷 → *Duel Won* / 斗琴落败 → *Duel Lost* |
| 琴阵 | *the Line* | — | 守线 → *hold the line* |
| 墨妖 | *Ink Fiend* | — | 怪物、结算句 |
| 墨主 | *Ink Sovereign* | *Sovereign* | `renderer.ts:1258` 名牌（15px，血条下 12px） |
| 墨潮 | *Ink Tide* | — | 描述、说明 |
| 余韵 | *Resonance* | *Resonance* | minor 档题字（30px） |
| 墨浪 | *Ink Surge* | — | major 档题字（44px） |
| 剑鸣 | *Sword Song* | — | grand 档题字（58px） |
| 终章 | *Finale* | *Finale* | 印章内文字（82px，印宽按测量） |
| 琴心 | *Heartstring* | *Heart* | 槽顶读数 `琴心 12/30` → *Heart 12/30* |
| 琴心通明 | *Heartstring Clarity* | *CLARITY* | `renderer.ts:802` 爆发题字 |
| 气血 | *Vitality* | — | `renderer.ts:1526` 血条左端 |
| 异色音符 | *tinted note* | — | 谱面说明 |
| 寒音 / 毒音 / 爆音 | *Frost* / *Venom* / *Blast* | 同 | `core/tints.ts:16-18` |
| 和弦音符 | *chord note* | — | 说明 |
| 重（重击字符） | *HEAVY* | *HEAVY* | `renderer.ts:1267`，单字符位（见 Q15） |
| 完美 / 良好 / 失误 | *Perfect* / *Good* / *Miss* | 同 | 判定闪示（25px） |
| 正点 / 早 N / 晚 N | *on time* / *early N* / *late N* | 同 | 偏差小字（12px） |
| 连击 | *combo* | — | `连击 · 伤害 ×N` → *Combo · Damage ×N* |
| 句 | *phrase* | — | `第 3 / 7 句` → *Phrase 3 / 7*；最后一句 → *Last phrase* |
| 简单 / 中等 / 高级 | *Easy* / *Medium* / *Hard* | 同 | 曲库难度格 |
| 掌握度 | *Mastery* | — | 结算卡 dt |
| 初演 / 弹熟 / 精熟 / 未入册 | *First Play* / *Seasoned* / *Mastered* / *Unrecorded* | 同 | 徽记 |
| 精度 / 最长连击 | *Accuracy* / *Best combo* | — | 结算卡 dt |
| 走到 X% | *Reached X%* | — | `progress.ts:94-96` 三句 |
| 血尽 / 墨妖未绝 | *you fell* / *fiends still standing* | — | 同上 |
| 听我的演奏 / 再听一遍 | *Hear my playing* / *Play again* | 同 | `core/replay.ts:29` |
| 未挑战 / 新纪录 / 本机最佳 | *Not played* / *New record* / *Best* | 同 | 曲库与结算 |
| 开战 / 设置 / 再来一次 / 返回曲库 | *Fight* / *Settings* / *Again* / *Back to Library* | 同 | 按钮（保留 `（回车）` → *(Enter)*） |
| 暂停 / 继续 / 放弃 | *Paused* / *Resume* / *Quit* | 同 | 暂停面板 |
| 键位引导 / 键位图示 | *Key guide* / *Keys* | 同 | 引导与曲库 |
| 音画偏移 / 琴声音量 / 战斗音效音量 | *Audio offset* / *Piano volume* / *Battle SFX* | 同 | 设置 |
| 毫秒 | *ms* | 同 | 偏移读数 |

## Open（当前前沿）

空。访谈结束，共享理解达成——下一步按用户惯例走 to-spec → to-tickets → implement-spec。

## 已落的产物

- `GLOSSARY.md`：27 个词条补上英文名（括号内），并在 气血 / 琴心 / 掌握度 / 余韵 / 异色音符 / 终章 六处定义里补了玩家会看到的英文标签。
- `docs/adr/0017-双语UI与全英文模式.md`：新建。记三条决定（全英文含印章、集中单表 + 编译期穷举、itch 一页双语）与五条后果。
- `docs/adr/0008-v1范围与非目标.md`：追加 2026-11-01 附注，原句「UI 中文」交棒给 0017。
- 本文件：F1–F17 事实、D1–D17 决定、对照表草案（35 条）。

## Deferred（交付阶段的工作项，不占访谈）

- 曲库标题 `心琴 · 曲库` → *XinQin · Library*；结算卡曲名走全名——按 D8/D10 顺推。
- `document.documentElement.lang` 与 `<title>` 随切换热更新。
- 结构上支持 N 语言、只交付 2 语言（不引 i18n 库、不按需加载、不打包字体）。
- 英文 5 张截图布景（`?song=&diff=&auto=` 开发钩子，与现有 5 张同一渲染路径）+ 中英并列封面重做。
