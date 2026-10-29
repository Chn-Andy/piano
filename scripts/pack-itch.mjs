/**
 * itch.io 上传包打包（工单 07 的 `npm run pack:itch` 实现）。
 *
 * 为什么不用系统 `zip`：发布环境不一定装了 zip（容器里就常常没有），而
 * 那条命令还会先删掉旧包——一旦 zip 缺失，产物直接消失、失败信息埋在
 * `sh: zip: not found` 里。这里用 Node 内置 zlib 手写 ZIP（deflate，无依赖），
 * 在 Windows / macOS / Linux 与任意容器里行为一致。
 *
 * 约定（与 README「发布步骤」一致）：包根直接是 dist/ 的内容（index.html 在
 * 根），不是 `dist/` 目录本身。
 */
import { deflateRawSync } from 'node:zlib'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const DIST = process.argv[2] ?? 'dist'
const OUT = process.argv[3] ?? 'xinqin-itch.zip'

/** 递归列出 dist 下的全部文件（相对路径、正斜杠、按字典序决定顺序） */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.isFile()) out.push(full)
  }
  return out
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** 固定的 DOS 时间戳（1980-01-01 00:00），保证同产物同字节（可复现） */
const DOS_TIME = 0
const DOS_DATE = (0 << 9) | (1 << 5) | 1

const files = walk(DIST)
const locals = []
const centrals = []
let offset = 0

for (const file of files) {
  const name = Buffer.from(relative(DIST, file).split(sep).join('/'), 'utf8')
  const raw = readFileSync(file)
  const deflated = deflateRawSync(raw, { level: 9 })
  // 已压缩的音频/图片可能压不动：取较小的那个
  const useDeflate = deflated.length < raw.length
  const data = useDeflate ? deflated : raw
  const crc = crc32(raw)

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0) // 本地文件头签名
  local.writeUInt16LE(20, 4) // 解压所需版本 2.0
  local.writeUInt16LE(0x0800, 6) // 文件名 UTF-8
  local.writeUInt16LE(useDeflate ? 8 : 0, 8) // 压缩方法：deflate / store
  local.writeUInt16LE(DOS_TIME, 10)
  local.writeUInt16LE(DOS_DATE, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(raw.length, 22)
  local.writeUInt16LE(name.length, 26)
  local.writeUInt16LE(0, 28) // 无 extra field

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0) // 中央目录签名
  central.writeUInt16LE(20, 4) // 创建版本
  central.writeUInt16LE(20, 6) // 解压所需版本
  central.writeUInt16LE(0x0800, 8)
  central.writeUInt16LE(useDeflate ? 8 : 0, 10)
  central.writeUInt16LE(DOS_TIME, 12)
  central.writeUInt16LE(DOS_DATE, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(raw.length, 24)
  central.writeUInt16LE(name.length, 28)
  central.writeUInt16LE(0, 30) // extra
  central.writeUInt16LE(0, 32) // comment
  central.writeUInt16LE(0, 34) // 磁盘号
  central.writeUInt16LE(0, 36) // 内部属性
  central.writeUInt32LE(0, 38) // 外部属性
  central.writeUInt32LE(offset, 42) // 本地头偏移

  locals.push(local, name, data)
  centrals.push(central, name)
  offset += local.length + name.length + data.length
}

const centralBuffer = Buffer.concat(centrals)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0) // 中央目录结束签名
end.writeUInt16LE(0, 4)
end.writeUInt16LE(0, 6)
end.writeUInt16LE(files.length, 8)
end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(centralBuffer.length, 12)
end.writeUInt32LE(offset, 16)
end.writeUInt16LE(0, 20)

const zip = Buffer.concat([...locals, centralBuffer, end])
writeFileSync(OUT, zip)

const mb = (zip.length / 1024 / 1024).toFixed(2)
const rootIndex = files.some((f) => relative(DIST, f) === 'index.html')
console.log(`${OUT}: ${files.length} 个文件、${mb} MB；index.html 在包根：${rootIndex ? '是' : '否（请检查 dist/）'}`)
if (!rootIndex) process.exitCode = 1
// 供体检用：列出顶层条目
console.log('条目：' + files.map((f) => relative(DIST, f).split(sep).join('/')).join(' '))
