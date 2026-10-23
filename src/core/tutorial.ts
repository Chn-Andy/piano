/**
 * 键位引导状态（SPEC 故事 1/2：首次进入约 30 秒白键试按引导）。
 * 纯层：是否已完成以存储标记持久（KeyValueStore 注入），
 * 完成一次即不再打扰（不阻塞已玩过的用户）；30 秒预算与点亮进度
 * 属于装配层的演出细节，不在纯层。
 */

import type { KeyValueStore } from './records'

/** 存储键（版本化；浏览器壳以本地存储实现） */
export const TUTORIAL_KEY = 'xinqin.tutorial.v1'

/** 引导是否已完成；无标记或标记损坏按未完成（宁可重放，不可错失教学） */
export function tutorialDone(store: KeyValueStore): boolean {
  return store.getItem(TUTORIAL_KEY) === '1'
}

/** 标记引导完成（幂等；写失败静默——标记非关键数据） */
export function markTutorialDone(store: KeyValueStore): void {
  try {
    store.setItem(TUTORIAL_KEY, '1')
  } catch {
    // 静默：下次重放引导，无伤大雅
  }
}
