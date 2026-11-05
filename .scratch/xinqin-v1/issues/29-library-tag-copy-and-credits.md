# 29: 曲库「原曲」小签、双语文案与素材署名

**What to build:** 曲库 medium/hard 难度格出现「原曲」小签（easy 没有）；简介改「主题曲 · 原创」/「Theme song · Original」；「原曲」文案进集中表；README 与 itch 描述署名「心心念念」并说明全轨来源。

**Blocked by:** 26、27

**Status:** resolved

- [x] 曲库小签只在 medium/hard，720p 下不增高/不折行
- [x] 中英文案各一条，`copy.test.ts` 全绿
- [x] README 素材段 + itch 描述 + ADR-0019/README 曲目数
- [x] `npm test`、`npm run build` 绿

## Comments

**2026-11-05 · 实现**：曲库 medium/hard 格出现「原曲」/「Full」小签，easy 没有；简介改「主题曲 · 原创」/「Theme song · Original」；`library.originalTag` 进中英表。README、README.en、itch 页、上传单与 GLOSSARY 已同步；署名「心心念念」。720p 曲库截图四行完整、按钮可见、小签不折行。`npm test` 392 项 + `npm run build` 绿。
