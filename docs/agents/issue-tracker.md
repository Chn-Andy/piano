# Issue tracker: Local Markdown

Issue 与 spec 以 markdown 文件形式存在于 `.scratch/`。本仓库无 git 远端（单人项目），不走任何在线 tracker。

## Conventions

- 一个 feature 一个目录：`.scratch/<feature-slug>/`
- Spec 位于 `.scratch/<feature-slug>/spec.md`（当前：`.scratch/xinqin-v1/spec.md`）
- 工单一票一文件：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 起编号，永不合并成单个 tickets 文件
- Triage 状态记录在工单文件顶部的 `Status:` 行（角色字符串见 `triage-labels.md`）
- 评论与讨论历史以 `## Comments` 标题追加在文件底部

## 当 skill 说 "publish to the issue tracker"

在 `.scratch/<feature-slug>/` 下新建文件（目录不存在则创建）。

## 当 skill 说 "fetch the relevant ticket"

按引用路径读文件。用户通常会直接传路径或工单号。

## Wayfinding operations

供 `/wayfinder` 使用。**map** 是一个文件，每个 ticket 一个 **child** 文件。

- **Map**: `.scratch/<effort>/map.md`（Notes / Decisions-so-far / Fog 主体）
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`，从 `01` 编号，正文含问题。`Type:` 行记录类型（`research`/`prototype`/`grilling`/`task`）；`Status:` 行记录 `claimed`/`resolved`
- **Blocking**: 顶部 `Blocked by: NN, NN` 行。所列文件全部 `resolved` 才算解除阻塞
- **Frontier**: 扫描 `.scratch/<effort>/issues/` 中 open、unblocked、unclaimed 的票，编号小者优先
- **Claim**: 动手前先写 `Status: claimed` 并保存
- **Resolve**: 在 `## Answer` 标题下追加答案，置 `Status: resolved`，并把上下文指针（要点+链接）追加到 `map.md` 的 Decisions-so-far
