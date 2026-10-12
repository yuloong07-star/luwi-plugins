# BallPet · 浮标外观 (art 样例)

给 Luwi 那颗浮标换一套画法: 一份 `theme/ball.json` + 几张图 = 一套新的浮标外观,
**不写一行代码、也不用装第二个 APK**。

这一份比 [`art-ball-theme`](../art-ball-theme) 多两样东西, 所以两个都留着:

- **六个状态** (待机 / 正在听 / 正在想 / 正在说 / 偷看 / 出错), 每个状态一套配色
- **帧序列**: 「正在听」用的是 24 帧 12 fps 的脉冲动画, 而不是一张静态图

## 目录

```
ballpet/
├─ README.md                  ← 你在这里
├─ tools/build-art.mjs        素材生成器 (纯 Node, 零依赖)
└─ plugin/                    这个目录就是插件包的内容
   ├─ plugin.json             kind: art, 零能力零工具
   ├─ README.md
   ├─ theme/ball.json         六个状态 + ring + frames
   └─ art/                    30 张 PNG
      ├─ ball-{idle,listening,thinking,speaking,peeked,failed}.png
      └─ listen/frame-00..23.png
```

## 跑一遍

```sh
cd samples/ballpet
node tools/build-art.mjs              # 重新生成 plugin/art/ 下的 30 张图
```

生成器是纯 Node 的 (PNG 编码写在脚本里), 不依赖 Pillow / sharp / 任何 npm 包 ——
所以在没装 python 的手机上也能改图重跑。

## 打包签名

```sh
node tools/lw-plugin-sign.mjs sign --dir samples/ballpet/plugin \
  --key <你自己的私钥> --out signed --zip signed/ballpet-1.0.0.lwp
```

私钥不进仓库; 这一层只推源码, 签好的 `.lwp` 按纪律放 [`packages/`](../../packages)
(而且**文件名不要复用**, 换版本就换名字)。

## 装完怎么验

1. 装上之后 Luwi → 设置 → 插件 → **「浮标外观」** 那一行里能挑到「BallPet」
2. 挑中之后球立刻换成琉璃球; 说一句话 -> 「正在听」那一档应当动起来 (脉冲帧)
3. 换回「内置画法」立刻恢复; **把插件删掉也应当恢复** —— 这一条是 art 域的验收判据

## 两条纪律 (与 art 域其它样例一致)

- `theme/ball.json` 里的路径不许绝对、不许 `..`、不许反斜杠, 解出来必须落在插件目录里
- `art` 域**不带任何代码、不声明任何能力**; 读不到资源一律回退内置画法, 不许把球画没
