# 36: v1.6 发布（Pages + itch）

**What to build:** 把 v1.6 主题曲与 31–35 号修复发到 GitHub Pages 和 itch.io；同份构建、双语商店素材。

**Status:** resolved

- [x] `npm test` 392 项 / `npm run build` 绿
- [x] `npm run pack:itch`：3.4 MB / 8 个文件，`index.html` 在包根，zip 校验无坏项
- [x] 提交 `ce14023` 并推 GitHub；Pages run **42006627265** success，线上 index/JS/音频与 dist 同哈希
- [x] 推 Gitea 镜像 `hncao/piano`（同 commit）
- [x] butler 推 html5 `--userversion 1.6.0`，build **#2304503**（from #2274899），channel 已切 1.6.0
- [x] 回读 itch 嵌入 `20119642-2304503`，JS `index-D2cGSe0K.js` 与本地同哈希；顶层打开启动到 title
- [ ] itch 页面手工元数据（标题/两段描述/10 图/更新说明）交用户粘贴

## Comments

**2026-11-05 · 准备**：v1.6 新增《猪侠漫游记》全轨/主题/动物；31–35 修复曲库背景泄漏、中等 U I O、阴影、琴阵线、混音。发布素材更新：中文/英文曲库与主题曲战斗截图各 2 张，description-plain/en 与 UPLOAD-SHEET 升到 v1.6。


## Comments

**2026-11-05 · 发布回读**

| 渠道 | 读数 |
|---|---|
| GitHub Pages | run [42006627265](https://github.com/Chn-Andy/piano/actions/runs/42006627265) success；`https://chn-andy.github.io/piano/` 的 index.html 与 dist 同哈希 `37317ad387cefa4e`；JS `assets/index-D2cGSe0K.js` 同哈希 `0a6e77dc75d89a17`；`songs/zhuxia-manyouji.mp3` 同哈希 `581c8a0d7346a284` |
| Gitea | `hncao/piano` 已推 `ce14023` |
| itch.io | upload #20119642 / build **#2304503** / version **1.6.0**；嵌入 `https://html-classic.itch.zone/html/20119642-2304503/index.html?v=1793872834` 返回 200，JS 同哈希；顶层打开进入 title（canvas 存在，`__xq.phase=title`） |

**itch 页面元数据仍是 v1.5**：正文还写「三首公版名曲」，10 张截图还是旧图。v1.6 的中英描述、截图顺序与更新说明已写进 `itch-assets/UPLOAD-SHEET.md` / `description-plain.txt` / `description-en.txt`，需要在 Edit game 里手工替换；butler 只能推构建，不能改页面字段。

**GitHub 认证**：原 credential store 里的 token 失效；本次用 GitHub 设备登录授权（GitHub CLI OAuth，repo scope），token 以 600 权限存于 `/opt/data/.github-token` 与 credential store `/opt/data/.github-credentials`。可在 GitHub Settings → Applications → GitHub CLI 撤销。
