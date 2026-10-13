# 随仓库发的插件包

这一层放**签好名、可以直接装的 `.lwp`**, 以及 companion 插件要绑的那个**伴侣 APK**。放这里的理由只有
一个: 它们需要一个**稳定的 https 链接** —— 协议第 13 节那条"从链接安装"要的就是一个能下到字节的地址,
而协议第 8.1 节那条 `entry.apk` 要的是伴侣 APK 的地址。

**插件包只住这里** (2026-10-11 主人定的口径): Luwi 应用仓库那边不放 `.lwp`, 它的 `plugins/` 只剩一页
指路。链接钉在内容 tag 上而不是 `@main` —— jsDelivr 对分支引用会 301 到 raw, 而 raw 在常见网络里不通。

```
art-whale-widget-2.0.0.lwp  https://cdn.jsdelivr.net/gh/yuloong07-star/luwi-plugins@plugins-2.7.6/packages/art-whale-widget-2.0.0.lwp
art-ball-theme-1.0.0.lwp    https://cdn.jsdelivr.net/gh/yuloong07-star/luwi-plugins@plugins-2.7.6/packages/art-ball-theme-1.0.0.lwp
inline-timer-1.0.0.lwp      https://cdn.jsdelivr.net/gh/yuloong07-star/luwi-plugins@plugins-2.7.6/packages/inline-timer-1.0.0.lwp
```

`cdn.jsdelivr.net` 不通时把域名换成 `fastly.jsdelivr.net` / `gcore.jsdelivr.net` / `testingcf.jsdelivr.net`
任一个, 内容同一份。

## 索引

这一层的机器可读版本是仓库根上那份 [index.json](../index.json) (`lw-plugin-index/1`, 协议第 13 节):
上面每一份包的 `id` / `version` / `url` / `sha256` / `size` / 发布者指纹 / 能力 / `minLw`, 末尾带一份
`revoked`。**它是从包现算的, 不是手抄的** —— `tools/lw-plugin-index.mjs` 会把每份包拆开, 逐文件哈希与
发布者签名都验一遍; 验不过的那一份根本不进索引 (退出码 1):

```bash
node tools/lw-plugin-index.mjs check --dir packages   # 索引与包一致吗 (发版前跑这条)
node tools/lw-plugin-index.mjs build --dir packages   # 重新生成 index.json
```

链接一律钉在**内容 tag** 上 (`--ref`, 现在是 `plugins-2.7.6`): jsDelivr 对分支引用会 301 到 raw, 而 raw
在常见网络里不通 —— 所以**换包就换 tag**, 新文件名与 `--ref` 一起更新, 旧 tag 留着不动。
`revoked` 是留给人的那一段 (协议第 12 节): 要撤一份包时往那条数组里加一条 `{ id, fingerprint, reason, at }`,
生成器只从包里算那几列, 不会把这张表抹掉。

**索引自己的地址也钉在 tag 上** (同一个理由): 手机上取得到的是
`https://cdn.jsdelivr.net/gh/yuloong07-star/luwi-plugins@index-1/index.json`;
下次重新生成索引时另打一个 tag (`index-2`), 旧的那一份留着不动。

**为什么不用 GitHub Release 的直链**: `github.com` 的 Release 下载在这两台机器上都实测不通 (2026-10-11:
手机侧 ICMP 通而 443 超时), 而 jsDelivr 通 —— 协议那边认的是"任意 https", 换一条能下到字节的就行。

## 怎么装

Luwi → 右上角那颗「菜单」按钮 → 设置 → 插件 → **「从链接装入」**, 把链接粘进去。**粘一条就够**:
包里写着伴侣 APK 的地址, 装完顺手就把它也装上 (有 root / Shizuku 时静默装, 没有时交给系统安装器)。

| 包 | 它是什么 | 伴侣 APK | 最低 Luwi |
| :-- | :-- | :-- | :-- |
| `art-whale-widget-2.0.0.lwp` | **鲸鱼娘 (art 域, 推荐)**: 零代码、零能力, 桌面上那一格由 Luwi 的宿主槽画 | **不需要** | 2.7.6 |
| `art-ball-theme-1.0.0.lwp` | **浮标外观 (art 域)**: 五个状态五张图, 装完在设置页「浮标外观」那一行挑 | **不需要** | 2.7.6 |
| `inline-timer-1.0.0.lwp` | 番茄钟 (inline 域样例): 一份 dex 跑在 Luwi 的 `:plugin` 进程里, 会把状态推到图文槽 | 不需要 (但**要先把作者指纹加进 `.inline-allow.json`**) | 2.7.6 |
| `whale-widget-1.1.4.lwp` | 鲸鱼娘桌面小组件 | 包里带地址, 自动装 (`whale-widget-1.1.4-companion.zip`) | 2.6.0 |
| `whale-widget-1.1.2.lwp` | 鲸鱼娘桌面小组件 (旧的一份) | 要自己装, 而那一份 APK 只在 GitHub Release 上 | 2.6.0 |

**新装就用第一份**: 它和下面两份做的是同一件事 (桌面上放一只会动的鲸鱼娘), 差别只在**不用装第二个
APK** —— 下面那两份是 companion 那条路的实物, 留着给"要独立组件名"那种场合。

链接用仓库原地址 (`https://raw.githubusercontent.com/yuloong07-star/luwi-plugins/main/packages/…`)
也行, 或者 jsDelivr 那一份 (`https://cdn.jsdelivr.net/gh/yuloong07-star/luwi-plugins@main/packages/…`)
—— 协议那边认的是"任意 https"。**本仓库这份说明与 `entry.apk` 写的都是 jsDelivr 那条**。

**从链接装不比从本地装少验一样东西**: 下到 app 私有目录之后走的是同一条链 —— 验发布者签名与逐文件
哈希、查 `protocol` / `minLw` / 工具前缀冲突 / 未知能力, 全过才落地; 而**装完还要在设置页勾能力、
再启用**, 光装上什么都不做 (鲸鱼娘一条能力都不要, 所以那一步没有要勾的)。

## 伴侣 APK 为什么叫 `.zip`

`whale-widget-1.1.4-companion.zip` **就是那份伴侣 APK**, 只是改了个扩展名。原因只有一个: jsDelivr 对
`.apk` 会 **301 跳到 `raw.githubusercontent.com`** (对 `.exe` 直接 403), 而那个域名在常见网络里是
连不上的 (2026-10-11 实测: 手机上打开它一直转圈); 换成 CDN 肯直发的扩展名就行了 —— 它不按大小卡
(同一时刻一个 32 MB 的 `.wasm` 是 200 直发的)。字节一个都没动, 手动下载之后把后缀改回 `.apk` 即可装。

## 一条发版纪律: **文件名不要复用**

jsDelivr 对同名文件有很长的边缘缓存 (2026-10-11 实测: 同一个 `@main` 路径被重发三次, 它一直给的是
第一次那一版, 连 `purge.jsdelivr.net` 都没把那一份刷掉)。所以**每一版都换新文件名** (版本号就在
名字里), 而不是原地改内容 —— 这也正是这一层只留最新那一份、旧版本跟 Release 走的原因。

## 一条纪律

**私钥不进仓库**。这一层只放签好的结果; 想重签一份就照
[samples/whale-widget/plugin/README.md](../samples/whale-widget/plugin/README.md) 里那几条命令走一遍。
