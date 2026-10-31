/**
 * 和声拼写的唯一定义处（伴奏声部用）：给定根音与一组音级，判定三度是
 * 大三度还是小三度。伴奏只承担和声，这一判定直接决定它和旋律是否打架——
 * 定在 a 小调的曲子上配出 C#，会一直顶住旋律里的 C。
 *
 * 判定顺序（确定性，无随机）：
 * 1. 音级集合里只有小三度（+3）→ 小三度；
 * 2. 有小三度也有大三度（+4）→ 大三度（同时出现时取更亮的一档）；
 * 3. 只有一个三度 → 用它；
 * 4. 听不出三度（纯五度/八度织体）→ 按调性兜底：小调配小三度，否则大三度。
 */

/** 三度性质的音级：大三度 | 小三度 */
export function harmonicThird(
  rootPc: number,
  pitchClasses: ReadonlySet<number>,
  minorKey: boolean,
): number {
  const minor = (rootPc + 3) % 12
  const major = (rootPc + 4) % 12
  if (pitchClasses.has(minor) && !pitchClasses.has(major)) return minor
  if (pitchClasses.has(major)) return major
  return minorKey ? minor : major
}
