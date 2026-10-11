# 随仓库发的插件包

这一层放**签好名、可以直接装的 `.lwp`**, 以及 companion 插件要绑的那个**伴侣 APK**。放这里的理由只有
一个: 它们需要一个**稳定的 https 链接** —— 协议第 13 节那条"从链接安装"要的就是一个能下到字节的地址,
而协议第 8.1 节那条 `entry.apk` 要的是伴侣 APK 的地址。

**为什么不用 GitHub Release 的直链**: `github.com` 的 Release 下载在这两台机器上都实测不通 (2026-10-11:
手机侧 ICMP 通而 443 超时), 而 jsDelivr 通 —— 协议那边认的是"任意 https", 换一条能下到字节的就行。

## 怎么装

Luwi → 右上角那颗「菜单」按钮 → 设置 → 插件 → **「从链接装入」**, 把链接粘进去。**粘一条就够**:
包里写着伴侣 APK 的地址, 装完顺手就把它也装上 (有 root / Shizuku 时静默装, 没有时交给系统安装器)。

| 包 | 它是什么 | 伴侣 APK | 最低 Luwi |
| :-- | :-- | :-- | :-- |
| `whale-widget-1.1.3.lwp` | 鲸鱼娘桌面小组件 | 包里带地址, 自动装 (`whale-widget-1.1.3.apk`) | 2.6.0 |
| `whale-widget-1.1.2.lwp` | 鲸鱼娘桌面小组件 (旧的一份) | 要自己装, 而那一份 APK 只在 GitHub Release 上 | 2.6.0 |

链接用仓库原地址 (`https://raw.githubusercontent.com/yuloong07-star/luwi-plugins/main/packages/…`)
也行, 或者 jsDelivr 那一份 (`https://cdn.jsdelivr.net/gh/yuloong07-star/luwi-plugins@main/packages/…`)
—— 协议那边认的是"任意 https"。**本仓库这份说明与 `entry.apk` 写的都是 jsDelivr 那条**。

**从链接装不比从本地装少验一样东西**: 下到 app 私有目录之后走的是同一条链 —— 验发布者签名与逐文件
哈希、查 `protocol` / `minLw` / 工具前缀冲突 / 未知能力, 全过才落地; 而**装完还要在设置页勾能力、
再启用**, 光装上什么都不做 (鲸鱼娘一条能力都不要, 所以那一步没有要勾的)。

## 一条纪律

**私钥不进仓库**。这一层只放签好的结果; 想重签一份就照
[samples/whale-widget/plugin/README.md](../samples/whale-widget/plugin/README.md) 里那几条命令走一遍。