/**
 * LW 插件的索引工具 (协议第 13 节那条 "官方索引")
 *
 * 一份索引要能被人信, 靠的不是"它是我们写的", 而是**每一个字段都能当场重算出来**: 体积、整包
 * sha256、逐文件哈希、发布者指纹、签名 —— 这一份工具把这六样都从包里现算一遍, **验不过的包直接
 * 不进索引** (退出码 1), 而不是把错的东西写进去等装的时候才发现。
 *
 * 跑法:
 *   node tools/lw-plugin-index.mjs build [--dir packages] [--ref plugins-2.7.6]
 *                                       [--base <url 前缀>] [--out index.json]
 *   node tools/lw-plugin-index.mjs check [--dir packages] [--index index.json]
 *                                       [--ref plugins-2.7.6] [--base <url 前缀>]
 *
 * build 重新扫一遍 `--dir` 里每一个 `.lwp`, 逐个验签与验逐文件哈希, 再把整份索引写出来。
 * check 拿现成的那份索引与包重新对一遍 (忽略 `generated` 与 `note` 两个每次都变的字段), 对不上就
 * 报出**是哪一条对不上**; 发版流水线上跑的该是这一条。
 *
 * 三条写死的规矩:
 *
 * - **`--ref` 是内容 tag, 不是 `main`**: jsDelivr 对分支引用会 301 到 `raw.githubusercontent.com`,
 *   而那个域名在常见网络里不通 (2026-10-11 实测) —— 所以索引里的链接一律钉在 tag 上, 换包就得换 tag
 * - **`sha256` 带 `sha256:` 前缀**: 与 `plugin.json` 里的 `files` 表、发布者指纹同一个形状
 *   (Kotlin 那侧 `PluginSignature.digestOf` 也是这个形状), 少一种形状就少一处对不齐的机会
 * - **索引里的 `url` 是第一个可用的地址, 其余 jsDelivr 镜像进 `mirrors`**: 协议那边认的是"任意
 *   https", 主机不通时换一个镜像域就行, 内容同一份
 *
 * **描述与标签走侧车** (`tools/lw-plugin-index.meta.json`, 2026-10-16): `plugin.json` 是**签名载荷**
 * 的一部分, 往里加一个"给人看的简介"就要全部重签 —— 所以这两样放在索引这一侧, 按 `id@version`
 * (或裸 `id`) 合并进条目; 侧车里没有的那一条就没有简介, 不拦。内容是**手写**的, 生成器只搬运
 * 不校验 (与 revoked 同一个待遇)。
 *
 * 验签那一段与 Kotlin 那侧 (`plugin/PluginSignature.kt`) 必须逐字节相同, 规范化规则见 `canonical()`;
 * 签名的工具是 `tools/lw-plugin-sign.mjs`, 两边算的是同一份载荷。
 */

import { createHash, createPublicKey, verify as verifyBytes } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { inflateRawSync } from 'node:zlib'

const args = process.argv.slice(2)
const command = args[0]

function option(name, fallback = null) {
  const at = args.indexOf(`--${name}`)
  return at < 0 ? fallback : args[at + 1]
}

if (command !== 'build' && command !== 'check') {
  console.error('用法: node tools/lw-plugin-index.mjs build [--dir packages] [--ref <内容 tag>] [--base <url 前缀>] [--out index.json]')
  console.error('      node tools/lw-plugin-index.mjs check [--dir packages] [--index index.json] [--ref <内容 tag>] [--base <url 前缀>]')
  process.exit(2)
}

const directory = resolve(option('dir', 'packages'))
const ref = option('ref', 'plugins-2.7.6')
const base = option('base', `https://cdn.jsdelivr.net/gh/yuloong07-star/luwi-plugins@${ref}/packages/`)
const out = resolve(option('out', 'index.json'))
const indexFile = resolve(option('index', 'index.json'))

/** jsDelivr 的几个等价镜像域; 第一个进 `url`, 其余进 `mirrors` */
const MIRRORS = ['fastly.jsdelivr.net', 'gcore.jsdelivr.net', 'testingcf.jsdelivr.net']

/** 规范化 JSON: 与 Kotlin 那侧同一套规则 (键递归按码点排序 / 只留 `,` 与 `:` / 数字只许整数) */
function canonical(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error(`协议里的数字只许是整数, 这一个不是: ${value}`)
    return String(value)
  }
  throw new Error(`规范化不了的 JSON 值: ${String(value)}`)
}

/** 签名载荷: 去掉 `publisher.signature` 的那份清单 + 按路径排序的逐文件哈希 (值不带 `sha256:` 前缀) */
function payloadOf(manifest, files) {
  const withoutSignature = { ...manifest, publisher: { ...(manifest.publisher ?? {}) } }
  delete withoutSignature.publisher.signature
  let text = canonical(withoutSignature)
  text += '\n--files--\n'
  for (const path of Object.keys(files).sort()) text += `${path} ${files[path]}\n`
  return Buffer.from(text, 'utf8')
}

/** 规范化的公钥身份 (方案 3.3): 曲线 OID + 未压缩点 (`0x04 ‖ X ‖ Y`, 各定长 32 字节) 的 sha256 */
function identityOf(spki) {
  const key = createPublicKey({ key: spki, format: 'der', type: 'spki' })
  const jwk = key.export({ format: 'jwk' })
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') throw new Error(`协议只收 P-256, 这一把是 ${jwk.kty}/${jwk.crv}`)
  const oid = Buffer.from([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07])
  const x = Buffer.from(jwk.x, 'base64url')
  const y = Buffer.from(jwk.y, 'base64url')
  if (x.length !== 32 || y.length !== 32) throw new Error('这把 P-256 公钥的点不是定长 32 字节')
  return `sha256:${createHash('sha256').update(Buffer.concat([oid, Buffer.from([0x04]), x, y])).digest('hex')}`
}

const sha256 = (buffer) => `sha256:${createHash('sha256').update(buffer).digest('hex')}`

/**
 * 读一份 zip (只认中央目录, 只解 method 0 与 8)
 *
 * 为什么自己写: 这一层只要读 `plugin.json` 与逐文件哈希, 为它引一个压缩库不值得 —— 而签名工具
 * 那边写包时用的也是"只存不压", 两侧对称。
 */
function unzip(buffer) {
  let eocd = -1
  for (let at = buffer.length - 22; at >= 0; at -= 1) {
    if (buffer.readUInt32LE(at) === 0x06054b50) {
      eocd = at
      break
    }
  }
  if (eocd < 0) throw new Error('这不是一份 zip (找不到中央目录)')
  const count = buffer.readUInt16LE(eocd + 10)
  let at = buffer.readUInt32LE(eocd + 16)
  const entries = {}
  for (let index = 0; index < count; index += 1) {
    const nameLength = buffer.readUInt16LE(at + 28)
    const extraLength = buffer.readUInt16LE(at + 30)
    const commentLength = buffer.readUInt16LE(at + 32)
    const method = buffer.readUInt16LE(at + 10)
    const compressed = buffer.readUInt32LE(at + 20)
    const local = buffer.readUInt32LE(at + 42)
    const name = buffer.slice(at + 46, at + 46 + nameLength).toString('utf8')
    const localName = buffer.readUInt16LE(local + 26)
    const localExtra = buffer.readUInt16LE(local + 28)
    const start = local + 30 + localName + localExtra
    const raw = buffer.slice(start, start + compressed)
    entries[name] = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null
    if (entries[name] === null) throw new Error(`${name}: 不认的压缩方式 ${method}`)
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/** 版本比较: 分段数字比大小, 数字相同再看字符串 (1.1.10 > 1.1.4) */
function compareVersion(left, right) {
  const a = left.split('.')
  const b = right.split('.')
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const x = Number(a[index] ?? 0)
    const y = Number(b[index] ?? 0)
    if (x !== y) return y - x
  }
  return String(right).localeCompare(String(left))
}

/** 一个包 → 一条索引记录; 验不过就抛, 由调用方说说清是哪个包 */
async function entryOf(name, bytes) {
  if (bytes.slice(0, 2).toString() !== 'PK') throw new Error('不是一份 .lwp (前两个字节不是 PK)')
  const entries = unzip(bytes)
  const manifest = JSON.parse(entries['plugin.json']?.toString('utf8') ?? 'null')
  if (manifest === null) throw new Error('包里没有 plugin.json')
  if (manifest.protocol !== 'lw-plugin/1') throw new Error(`protocol 不是 lw-plugin/1: ${manifest.protocol}`)

  const declared = manifest.files ?? {}
  const hashes = {}
  for (const [path, value] of Object.entries(declared)) {
    const content = entries[path]
    if (content === undefined) throw new Error(`plugin.json 里列了 ${path}, 包里没有这一份`)
    hashes[path] = String(value).replace(/^sha256:/, '')
    const actual = sha256(content).replace(/^sha256:/, '')
    if (actual !== hashes[path]) throw new Error(`${path} 的 sha256 对不上 (清单 ${hashes[path]}, 实际 ${actual})`)
  }
  for (const path of Object.keys(entries)) {
    if (path !== 'plugin.json' && !(path in declared)) throw new Error(`${path} 在包里, 但 plugin.json 的 files 没列它`)
  }

  const publisher = manifest.publisher ?? {}
  const der = Buffer.from(String(publisher.key ?? '').replace(/^ecdsa-p256:/, ''), 'base64')
  const fingerprint = identityOf(der)
  const signed = verifyBytes('sha256', payloadOf(manifest, hashes), createPublicKey({ key: der, format: 'der', type: 'spki' }), Buffer.from(String(publisher.signature ?? ''), 'base64'))
  if (!signed) throw new Error('签名验不过 (载荷与 plugin.json 对不上, 或者这份包被改过)')

  const url = `${base}${name}`
  const file = `packages/${name}`
  const described = metaFor(manifest.id, manifest.version)
  return {
    entry: {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      kind: manifest.kind,
      minLw: manifest.minLw,
      api: manifest.api,
      toolPrefix: manifest.toolPrefix,
      capabilities: {
        requested: manifest.capabilities?.requested ?? [],
        dangerous: manifest.capabilities?.dangerous ?? [],
      },
      tools: (manifest.tools ?? []).map((tool) => tool.name),
      publisher: { name: publisher.name, fingerprint, key: publisher.key },
      url,
      mirrors: MIRRORS.map((host) => url.replace('cdn.jsdelivr.net', host)),
      sha256: sha256(bytes),
      size: bytes.length,
      path: file,
      // 侧车那两样 (给人看的): 侧车里没有就整个不写这两个键 (JSON.stringify 会丢掉 undefined)
      description: described?.description,
      tags: described?.tags,
    },
    note: `${fingerprint.slice(7, 15)}…`,
  }
}

const names = (await readdir(directory)).filter((name) => name.endsWith('.lwp')).sort()
if (names.length === 0) throw new Error(`${directory} 里一份 .lwp 都没有`)

/**
 * 侧车: 按 `id@version` (没有就裸 `id`) 给的那两样"给人看的"字段
 *
 * 读不到 (文件不在 / 不是 JSON / 是数组) 就当没有 —— 简介是装饰, 它缺席不该拦住发版
 */
async function metaOf(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`侧车 ${path} 没读成 (${error.message}), 这一次不带简介`)
    return {}
  }
}

const meta = await metaOf(resolve(option('meta', 'tools/lw-plugin-index.meta.json')))

/** 这一条的简介与标签: 先认 `id@version`, 再退裸 `id`; 形状不对的当没有 */
function metaFor(id, version) {
  const one = meta[`${id}@${version}`] ?? meta[id]
  if (one === null || typeof one !== 'object' || Array.isArray(one)) return null
  const description = typeof one.description === 'string' ? one.description : ''
  const tags = Array.isArray(one.tags) ? one.tags.filter((tag) => typeof tag === 'string') : []
  return description === '' && tags.length === 0 ? null : { description, tags }
}

const entries = []
for (const name of names) {
  const bytes = await readFile(join(directory, name))
  let entry
  try {
    ;({ entry } = await entryOf(name, bytes))
  } catch (error) {
    console.error(`✗ ${name}: ${error.message}`)
    console.error('  这份包不进索引 —— 先照 tools/lw-plugin-sign.mjs 重签一份, 不要手改包里的字节')
    process.exit(1)
  }
  entries.push(entry)
  console.log(`✓ ${name}  ${entry.id} ${entry.version}  ${entry.kind}  ${entry.size}B  ${entry.sha256.slice(0, 20)}…`)
  console.log(`  发布者 ${entry.publisher.name}  ${entry.publisher.fingerprint}`)
}
entries.sort((left, right) => left.id.localeCompare(right.id) || compareVersion(left.version, right.version))

const document = {
  format: 'lw-plugin-index/1',
  generated: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  source: 'https://github.com/yuloong07-star/luwi-plugins',
  note: '本文件由 tools/lw-plugin-index.mjs 生成: 每个字段都是从 packages/ 里那份 .lwp 现算的 (逐文件哈希与发布者签名都验过)。sha256 是整包的摘要, 带 sha256: 前缀。revoked 是撤销表, 命中即不该装。',
  plugins: entries,
  revoked: [],
}

/**
 * 现成那份索引里的撤销表 (协议第 12 节, **手写**的那一段)
 *
 * 生成器不许把它抹掉, `check` 也不该因为它对不上: 这一份只负责从包里现算的那几列, 撤销是人的决定。
 */
async function revokedOf(path) {
  try {
    const existing = JSON.parse(await readFile(path, 'utf8'))
    return Array.isArray(existing.revoked) ? existing.revoked : []
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`没读成 ${path} (${error.message})`)
    return []
  }
}

if (command === 'build') {
  document.revoked = await revokedOf(out)
  await writeFile(out, `${JSON.stringify(document, null, 2)}\n`)
  console.log(`\n写好 ${out}: ${entries.length} 份包, 撤销表 ${document.revoked.length} 条`)
} else {
  const existing = JSON.parse(await readFile(indexFile, 'utf8'))
  const strip = (value) => JSON.stringify({ ...value, generated: null, note: null })
  if (existing.format !== document.format) throw new Error(`format 不是 lw-plugin-index/1: ${existing.format}`)
  document.revoked = existing.revoked ?? []
  if (strip(existing) !== strip(document)) {
    console.error('\n索引与 packages/ 对不上 —— 跑一次 build 重新生成, 或者看看是哪一份包换过')
    process.exit(1)
  }
  console.log(`\n${indexFile} 与 packages/ 一致 (${entries.length} 份包)`)
}
