# 33: 战斗音符与判定线的硬阴影清理

**What to build:** 去掉音符的拖尾、外发光、内高光与判定线下面的粗底影/平行虚线；音符平涂、判定线单笔，保留判定带的功能性淡晕。

**Status:** resolved

- [x] 音符移除 trail / tint glow / PAPER_SHEEN 内描边，体块改为近乎平涂
- [x] 判定线移除 14px 淡墨底影；`dryBrush` 从三道平行笔画改为单笔
- [x] 主题曲 Medium 实测：音符为扁平墨块，判定线单线，无拖尾/发光/阴影
- [x] `npm test` / `npm run build` 绿

## Comments

**2026-11-05**：用户反馈战斗里音符与线的阴影生硬。按"做不好就移除"处理：`drawNotes` 不再画拖尾、tint 外发光和内圈湿墨高光；`drawField` 不再画 14px 判定线底影；`dryBrush` 不再用 ±1.15px 的三道平行笔画制造影子。判定带（Perfect/Good 的极淡渐变）保留，因为它承担判定窗口的可读性，不是装饰阴影。
