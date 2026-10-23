import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 架构一致性测试：验收标准"核心模拟器为纯层（不引用 DOM / Web Audio）"。
 *
 * 运行环境本身也是一半证明：vitest 以 node 环境执行本目录（无 document /
 * AudioContext），核心模拟器若触碰这些 API 会在运行期崩溃；
 * 此测试把"源码不引用"这一半也钉死，防止纯层被悄悄腐蚀。
 */
const FORBIDDEN =
  /\b(document|window|AudioContext|performance|requestAnimationFrame|fetch|navigator|localStorage|setTimeout|setInterval)\b/

function tsFilesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...tsFilesUnder(full))
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full)
    }
  }
  return out
}

describe('核心层纯度（src/core 不引用 DOM / Web Audio / 全局定时器）', () => {
  it('src/core 下所有源码不含浏览器与音频全局引用', () => {
    const files = tsFilesUnder(import.meta.dirname)
    expect(files.length, 'src/core 应有源码被扫描').toBeGreaterThan(0)
    for (const file of files) {
      const src = readFileSync(file, 'utf-8')
      for (const line of src.split('\n')) {
        expect(line, `${file}: ${line.trim()}`).not.toMatch(FORBIDDEN)
      }
    }
  })
})
