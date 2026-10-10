# 随仓库发的插件包

这一层放**签好名、可以直接装的 `.lwp`**。放这里的理由只有一个: 它们需要一个**稳定的 https 链接**
—— 协议第 13 节那条"从链接安装"要的就是一个能下到字节的地址。

## 怎么装

Luwi → 右上角那颗「菜单」按钮 → 设置 → 插件 → **「从链接装入」**, 把链接粘进去。

| 包 | 它是什么 | 要不要先装伴侣 APK | 最低 Luwi |
| :-- | :-- | :-- | :-- |
| `whale-widget-1.1.2.lwp` | 鲸鱼娘桌面小组件 | 要 (同签名那一档) | 2.6.0 |

链接用仓库原地址 (`https://raw.githubusercontent.com/yuloong07-star/luwi-plugins/main/packages/…`)
也行, 或者 jsDelivr 那一份 (`https://cdn.jsdelivr.net/gh/yuloong07-star/luwi-plugins@main/packages/…`)
—— 协议那边认的是"任意 https"。本仓库的 README 写的是 jsDelivr 那条。

**从链接装不比从本地装少验一样东西**: 下到 app 私有目录之后走的是同一条链 —— 验发布者签名与逐文件
哈希、查 `protocol` / `minLw` / 工具前缀冲突 / 未知能力, 全过才落地; 而**装完还要在设置页勾能力、
再启用**, 光装上什么都不做。

## 一条纪律

**私钥不进仓库**。这一层只放签好的结果; 想重签一份就照
[samples/whale-widget/plugin/README.md](../samples/whale-widget/plugin/README.md) 里那几条命令走一遍。
