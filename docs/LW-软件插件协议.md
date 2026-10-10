# LW 软件插件协议

状态: **已冻结 v1** (主人 2026-10-08 拍板) · 版本: `lw-plugin/1` ·
落点: Luwi 的"设备侧能力扩展层" (与技能、dsh 插件三足鼎立, 见第 1 节)

这一份是 `docs/LW-软件插件协议-讨论稿.md` 的**冻结版**, 讨论稿保持原样当决策记录 (它第 0 节那十条
决定的原文在那儿)。这一次冻结做三件事, 其余一处未动:

1. 第 16 节八条未决**逐条答复** (见第 16 节, 那份表现在叫"已决"而不是"未决")
2. 决策 3 里那句"伴侣 APK 走**绑定 AIDL**"**改成两侧都走手写 Binder** (理由见第 0 节第 11 条)
3. 第 15 节把 **P0 / P1 的落地边界**写死 (哪几条能力真接通, 哪些 kind 这一版不收)

**冻结的判据**: 协议文本不再会因为写代码而改。往后只有两种改动可以进来 —— 一是主人新拍板的决定
(进第 0 节加一行), 二是实测撞出来的事实 (进第 14 节或第 16 节, 且要带读数)。

## 0 · 决策记录

本文的每一处设计都从主人 2026-10-08 这几句话来, 有冲突时以本节为准

| # | 决定 | 影响 |
| :-- | :-- | :-- |
| 1 | 是**给别人写的生态** | 一切以"不认识发布者也要能安全装"为前提, 不能有"反正是自己写的"这种假设 |
| 2 | **做 dex 域** | 需要 `:plugin` 进程 + 类加载器 + 一份稳定的 API jar (见 8.2) |
| 3 | 伴侣 APK 走**绑定 Service**, 同签名 `signature` 级、第三方 `dangerous` 级 | 见 9 与 11 |
| 4 | 界面只给**声明式设置项 + 动作按钮**; 伴侣 APK 可以自带界面, 我们只给入口 | 见 10 |
| 5 | **允许从 URL 下载安装** | 见 13, 强制 https + 强制签名校验 |
| 6 | `lw_` 前缀保留给内置, 插件工具用 `<toolPrefix>_` 前缀, 重名拒绝安装 | 见 6 |
| 7 | **能驱动对话** (`session.*` 作为一个独立能力档) | 见 5 |
| 8 | 插件**不能**互相调用 | 见 8.4 |
| 9 | 协议里**要有撤销机制** | 见 12 |
| 10 | 破坏性操作那五条**不再由应用层弹窗拦**, 改为提示词层面问一次 | 见 14, 这一条改变了整份协议的安全重心 |
| 11 | **接口两侧都是手写 Binder** (2026-10-08 冻结时改, 取代原来的"绑定 AIDL") | app 模块里出现 `.aidl` 就会生成 Java, 而 Java 编译把 AGP 那条坏掉的资源管线拉回构建 (`channel/LwPrivilegedService.kt` 就是为这件事手写的)。所以: 主进程侧手写 `IBinder`, 对外发的 API 包里给的是**同一份手写基类源码/jar**, 作者那边也不需要 AIDL —— 见 9 |

## 1 · 目标与非目标

**目标**: 让第三方 (包含只做美术的人) 在不重新编译 Luwi 的前提下, 给这台手机**增加能力** ——
新工具、新监测器、新的浮标外观、新的面板、新的桌面组件、新的界面入口

LW 现在有几层扩展点, 这一层是补上缺的那一块, 三层的分工要一直清楚

| 层 | 载体 | 能加什么 | 不能加什么 | 现状 |
| :-- | :-- | :-- | :-- | :-- |
| 技能 | `SKILL.md` | 提示词与作业流程 | 任何行为 | 已有 (`skills/*`) |
| dsh 插件 | host 侧 JS 模块 | dsh 的工具、命令词、GUI 面板钩子 | 碰不到 Android | 已有 (`host-plugin/index.mjs`) |
| **LW 插件** | 本文的 `.lwp` 包 | **设备侧能力**: 新工具、监测器、外观、面板、组件 | 改不了 LW 自己的清单与既有界面 | 本文定的 |

**非目标** (明确写出来, 免得越做越大)

- 不做插件之间的依赖与互相调用
- 不做"插件改 LW 已有界面" (只能用声明式设置项 / 面板 / 伴侣自带界面)
- 不做插件市场式的推荐、评分、付费 —— 只做"索引 + 安装 + 撤销"
- 不把插件做成沙箱: 装一个插件就是信任它, 这一点在安装页上要说清

## 2 · 核心设计: 一份接口, 三个域

主进程只认识一种插件宿主接口 (第 9 节那份手写 Binder)。三个 `kind` 的差别只在**宿主进程在哪**:

| kind | 宿主在哪 | 天生能做 | 代价 | 这一版 |
| :-- | :-- | :-- | :-- | :-- |
| `companion` | 另一个 APK (绑定 Service) | **新权限、新清单组件 (桌面小组件在这里)** | 用户要单独装那个 APK | **P0/P1 做这一个** |
| `dex` | LW 自己声明的 `:plugin` 进程 | 碰 Android 框架、跑自己的逻辑 | 要签名 + 要隔离 + 要 API jar | P2 |
| `script` | LW 主进程内的解释器 | 组合已有能力 (轻, 零编译) | 碰不到新 Android API | P3 |
| `theme` | 没有宿主 (一串资源) | 换浮标外观 | 只能换外观 | P3 |

分层的两端固定成这样

```
模型 / dsh
   ↕ (工具调用, 与 lw_* 完全相同)
主进程: 能力检查 + 用户授权 + 审计 + 工具注册 + 主题加载
   ↕ 手写 Binder (第 9 节)
宿主: 伴侣 APK (companion)  或  :plugin 进程 (dex / script)
   ↕ 插件自己的代码
插件本体
```

**为什么这么分**: 能力检查、授权、审计只有一处 —— 主进程。插件永远不能直接够到模型, 只能注册成工具;
各域共享同一条闸, 于是"加一个新域"不用再想一遍安全

## 3 · 包格式与签名

- 单文件 `.lwp`, 就是一个 zip (也接受解开的目录, 给本地开发用)
- 必含 `plugin.json`, 可选 `README.md` / `LICENSE` / `art/` / `theme/` / `panel/` / `main.dex`
- **发布者签名**: 私钥对"规范化后的 `plugin.json` + 每个文件 sha256 的清单"签名
- 算法 **ECDSA P-256 / SHA-256 是默认也是唯一**: 公钥是 `spki-DER` 的 base64, 签名是 `DER` 的 base64,
  于是 Node (`crypto.sign('sha256', …)`) 与 Android (`Signature("SHA256withECDSA")` + `X509EncodedKeySpec`)
  两边原生互通, 不需要任何第三方库。Ed25519 不进 2.5.x (老 ROM 的 Conscrypt 不一定有, 实测过再说)
- 签名与公钥写在 `plugin.json` 的 `publisher` 里 (`key` / `signature`), 逐文件哈希在 `files` 字段
- **未签名包**: 只接受本地手工放入 (目录或 `.lwp`), 且必须在设置里打开**开发者模式**才允许启用。
  界面上常驻红字, 与"已签名"分开
- 大小上限 **32 MB**, 文件数上限 **2000** 个, 超出即在解包前拒绝

## 4 · `plugin.json` 规格

```json
{
  "protocol": "lw-plugin/1",
  "id": "io.example.timer",
  "name": "番茄钟",
  "version": "1.0.4",
  "minLw": "2.5.1",
  "api": "1",
  "kind": "companion",
  "toolPrefix": "timer",
  "entry": { "package": "io.example.timer", "service": "io.example.timer.TimerPlugin" },
  "publisher": {
    "name": "someone",
    "key": "ecdsa-p256:MFkwEwYH...",
    "signature": "MEUCIQ..."
  },
  "capabilities": {
    "requested": ["notify.post", "speech.speak", "device.read"],
    "dangerous": ["session.post"]
  },
  "tools": [
    {
      "name": "timer_start",
      "summary": "开一轮番茄钟",
      "params": { "minutes": { "type": "integer", "required": true, "description": "每轮分钟" } }
    }
  ],
  "ui": {
    "settings": [
      { "key": "minutes", "type": "int", "default": 25, "title": "每轮分钟" }
    ],
    "actions": [
      { "id": "start", "title": "开一轮", "tool": "timer_start" }
    ]
  },
  "files": { "plugin.json": "sha256:...", "README.md": "sha256:..." }
}
```

| 字段 | 必填 | 规则 |
| :-- | :-- | :-- |
| `protocol` | 是 | 只认 `lw-plugin/1`, 别的值直接拒 |
| `id` | 是 | 反向域名, 全局唯一; 装过同 id 即视为同一插件 (升级) |
| `name` | 是 | 给人看的名字, 1..40 字 |
| `version` | 是 | 语义化三段; 只允许升不许降 (降级要显式确认) |
| `minLw` | 是 | 低于它就拒绝安装, 并在界面上说清要哪个版本 |
| `api` | 是 | API jar 的版本 (这一版是 `1`), 与 `minLw` 各管一件事 |
| `kind` | 是 | `companion` / `dex` / `script` / `theme`; **P0/P1 只收 `companion`**, 其余三种装的时候点名拒绝 |
| `toolPrefix` | 是 | `[a-z][a-z0-9_]{1,15}`, 全局唯一; `lw` `dsh` `agent` 是保留字 |
| `entry` | 是 | 按 kind 给 (`companion` 要 `package` + `service`; `dex` 要 `dex` + `class`; `script` 要 `script`; `theme` 不需要) |
| `publisher` | 除开发者模式外必填 | `name` / `key` / `signature` |
| `capabilities` | 是 | `requested` 与 `dangerous` 两个数组; **出现未知能力一律拒绝安装** |
| `tools` | 否 | 每条 `name` (必须是 `<toolPrefix>_<动作>`) / `summary` / `params` |
| `ui` | 否 | 只支持第 10 节列出的那几种声明; **P0/P1 里必须缺省或写成空对象** (声明式设置与面板是 P4), 写了别的键即拒绝安装 |
| `files` | 除开发者模式外必填 | 相对路径 → `sha256:<hex>` |

**`tools[].params` 的窄子集** (它就是往 dsh 的 `defineTool` 参数表上映射, 多一个键就拒绝):
每项认 `type` (`string` / `integer` / `number` / `boolean` / `array` / `object`) / `description` /
`required` / `enum` / `items` (array 用, 递归同一份子集)

## 5 · 能力表

插件只能从这个表里挑。**未知能力拒绝安装**这一条是刻意的: 忽略未知能力会造出"我以为只给了很小的权限"

**普通档 (安装时列出, 一次确认)**

| 能力 | 含义 | P0/P1 |
| :-- | :-- | :-- |
| `device.read` | 电量 / 网络 / 存储 / 设备信息 | **接通** |
| `sensor.read` | 传感器与光感 | **接通** |
| `location.read` | 位置 (粗 / 精由用户在设置里另给) | 声明可装, 调用即如实拒 (P2 接通) |
| `notify.post` | 发通知 / 横幅 | **接通** |
| `speech.speak` | 让 LW 念一句话 | **接通** |
| `clipboard` | 剪贴板读 / 写 | **接通** |
| `files.own` | 只读自己那个插件目录 | **接通** |
| `files.read:<路径前缀>` | 读指定范围 (例如 `/sdcard/DSH`) | 声明可装, 调用即如实拒 (P2 接通) |
| `net.http:<域名>` | 只允许访问列出的域名 | 声明可装, 调用即如实拒 (P2 接通) |
| `ui.theme` | 提供浮标外观 (第 10 节) | 声明可装, 调用即如实拒 (P3 接通) |
| `ui.panel` | 提供一页声明式面板 | 声明可装, 调用即如实拒 (P4 接通) |

**敏感档 (安装时逐条勾选, 默认全不勾)**

| 能力 | 含义 | P0/P1 |
| :-- | :-- | :-- |
| `screen.read` | 截图 / 读控件树 / OCR | 声明可装, 调用即如实拒 (P2 接通) |
| `screen.write` | 点击 / 滑动 / 打字 / 起应用 / 建虚拟屏 | 同上 |
| `input.key` | 按键与组合键 | 同上 |
| `system.write` | 改系统设置 (亮度 / 音量 / 超时…) | 同上 |
| `camera` | 用摄像头取帧 | 同上 |
| `media` | 媒体库、播放、拍照 | 同上 |
| `session.post` | **驱动对话**: 把一句话投进某一场会话 | **接通** (走 `voice/inbox.jsonl`, `source` 记 `plugin:<id>`) |
| `session.create` | 还能开一场新的会话 | 声明可装, 调用即如实拒 |
| `session.read` | 读会话里的回答 | 声明可装, 调用即如实拒 |
| `privileged.key` | 借特权通道按键 (root / Shizuku) | 声明可装, 调用即如实拒 |
| `privileged.shell` | 借特权通道执行命令 | 声明可装, 调用即如实拒 |

两条落地的规矩

- 每个能力在运行时**逐次**对照声明与授权, 不缓存成"这个插件是可信的"
- 同一能力可以"授权但降级": 例如 `location.read` 只给粗定位, `files.read` 只给一个子目录
- **"声明可装"与"接通"是两件事**: 没接通的那一条在调用时回一句点名的话 ("`screen.read` 这一版还没接通,
  它要等 2.5.1 的 P2"), 绝不假装成功、也不静默忽略

## 6 · 工具注册与命名

- 内置工具永远是 `lw_*`; 管理插件那一条是 `lw_plugin`
- 插件工具名 = `<toolPrefix>_<动作>`, 例如 `timer_start`
- **前缀全局唯一**: 装第二个用同一前缀的插件直接拒绝安装, 提示它换一个
- `lw` / `dsh` / `agent` 三个前缀是保留字, 声明它们即拒绝
- 工具描述与参数 schema 全部来自 `plugin.json`, 主进程只做校验与转发 —— 插件不能运行时偷偷改自己的工具表
- 插件工具在模型眼里与 `lw_*` 长得一样 (同样的文本 + 图片返回形状), 于是"内置 or 插件"对模型是透明的

## 7 · 生命周期

| 阶段 | 做什么 | 失败要说什么 |
| :-- | :-- | :-- |
| 装入 | 目录或 `.lwp`; 先验签名与哈希清单, 再查 protocol / id / 版本 / 前缀 / 未知能力 / 体积 | 具体是哪一条不过 |
| 确认 | 把**能力和它的含义**逐条摆给用户, 敏感档默认不勾 | 用户取消 = 什么都不落地 |
| 落地 | `$DSH_HOME/plugins/<id>/<version>/`, 另写 `current` 指向 (一个内容为版本号的文本文件) | 目录写不进去 |
| 注册 | 工具 + 主题 + 面板 + 设置项 | 与已有工具重名 |
| 启用 | 起宿主, 调 `onEnable` (companion 是绑它的 Service) | 宿主起不来要说清是哪一步 |

另外三条

- **升级**: 保留旧版本目录, 新版本装成新目录再切 `current`。**不允许热替换正在跑的宿主** —— 升级完要重启
  host, 界面要说清这件事
- **卸载**: 先停宿主 → 撤注册 → 问一句"它自己那份数据要不要一起删" → 删目录 → 留一条记录
- **状态恢复**: LW 重启后按 `current` 重放注册与 `onEnable`, 插件不能让"重启之后就不见了"

## 8 · 三个域的边界

### 8.1 companion (伴侣 APK)

- LW 侧声明一个自定义权限 (见 11), 伴侣的 Service 用它护住, 于是只有 LW 绑得上
- 伴侣实现第 9 节那个接口, 把 `describe()` 回的内容与它包里那份 `plugin.json` 对照, 不一致就拒绝
- 伴侣自己申请它要的 Android 权限 —— **这是"新权限"唯一的合法来源**
- 伴侣可以自己带界面 (Activity / 桌面小组件), LW 只给一个入口 (第 10 节)
- 它碰不到 LW 的进程内存, 也拿不到特权 (除非 LW 按声明代它做)

### 8.2 dex

- **跑在哪**: LW 清单里预先声明的 `:plugin` 进程。清单是静态的, 所以做不到"一个插件一个进程" ——
  先共享一个, 把"现在哪个插件在跑"记下来 (P2)
- **怎么加载**: 优先 `InMemoryDexClassLoader`, 退回 `DexClassLoader`; 每个插件一个 ClassLoader,
  插件之间不共享静态状态
- **API jar**: 另发一份只含接口与数据类的 `lwplugin-api-1.jar`, 插件对着它编译; 插件**不许**引用
  LW 的内部类或 `R`
- **隔离与崩**: 插件抛异常 → 转成一条工具错误文本, 绝不带走 LW; 插件卡死 → 主进程那条调用超时并如实报
  ("这个插件没在预期时间内回答"), 不重试

### 8.3 script

- 跑在 LW 主进程内的解释器里, 只能调声明过的能力, 拿不到 Java / Android API (P3)
- 定位是"把已有能力拼起来"的轻插件: 新快捷指令、新自动指令规则、简单的工具编排

### 8.4 插件之间

**不能互相调用**, 也不共享数据目录。要协作只能经 LW 中转 (一个插件把结果写成文件, 另一个按能力读)。
这一条是刻意的: 一旦允许互调, 依赖图与权限放大就没人管得住

## 9 · 接口: 手写 Binder

两个接口, 方向相反。名字里的 `Lw` 前缀留给这一层, 与工具前缀是两回事。
**两侧都是手写 `Binder`**, 没有 `.aidl` (理由见第 0 节第 11 条), 信封一律是 `Bundle`

| 接口 | 谁实现 | 方法 |
| :-- | :-- | :-- |
| `ILwPlugin` | **插件** (companion 是它的 Service, dex 是加载出来的类) | `describe()` / `lifecycle(event, args)` / `invoke(tool, args)` |
| `ILwPluginContext` | **LW 主进程** | `call(capability, args)` / `settings(defaults)` / `store(op, args)` / `log(level, message)` / `api()` |

固定下来的几条:

- 描述符: `io.github.yuloong07star.luwi.plugin.ILwPlugin` 与
  `io.github.yuloong07star.luwi.plugin.ILwPluginContext`
- transaction code 从 1 开始按上表顺序编号, 参数与返回都是 `Bundle`, `String` 键名用小驼峰
- `invoke` 回的 `Bundle` 是 `{ ok: Boolean, text: String, images: String[], data: Bundle }`,
  与 `lw_*` 的返回形状一致; `images` 里是**路径** (工作区或插件自己目录里的图), 宿主读文件再挂进上下文
- `describe()` 回的 `{ id, name, version, api, tools[], capabilities{requested, dangerous} }` 必须与
  包里那份 `plugin.json` 一致, 不一致即拒绝启用
- `lifecycle` 的事件名: `attach` (给 context) / `enable` / `disable` / `detach`
- `attach` 那一次传下去的 `Bundle` (: `context` (`ILwPluginContext` 的 binder) / `dir` (插件自己的目录) /
  `lw` (LW 版本) / `language` / `mode` (当前模式))
- **能力调用一律经 `context.call`**, 插件拿不到别的路
- 跨进程那一侧的主进程实现要校验 `Binder.getCallingUid()` 与插件登记的那个 uid (companion 是它的包 uid,
  dex 是 `:plugin` 进程的 uid), 对不上即拒

## 10 · 美术与界面通道

### 10.1 浮标外观 (这条不需要 dex)

插件包里带图片或矢量资源 + 一份 `theme/ball.json`:

```json
{
  "name": "圆润蓝球",
  "sizeDp": 48,
  "hideBuiltinText": false,
  "states": {
    "idle": "art/ball-idle.png",
    "listening": "art/ball-listening.png",
    "thinking": "art/ball-thinking.png",
    "speaking": "art/ball-speaking.png",
    "peeked": "art/ball-peeked.png"
  },
  "ring": { "listening": "#6EF3B0", "thinking": "#FFC24D", "speaking": "#B388FF" },
  "frames": { "listening": { "dir": "art/listen", "count": 24, "fps": 12 } }
}
```

- 五个状态对应现在 `BallView` 那几档; 帧序列可选
- `hideBuiltinText` 给"自己画了字"的主题用 (默认 false, 保留"正在听"那三个字)
- 真正的活不在协议, 在 `BallView`: 加一条"外部位图 / 帧序列"的分支, 读不到就回退内置画法 (P3)
- **多个主题插件可以同时装着, 但同一时刻只启用一个** (设置页里选)

### 10.2 声明式面板

球菜单里加一项, 点开是一页由 `panel/main.json` 描述的内容: 段落 (标题 / 正文 / 图片)、按钮 (调某个工具)、
开关 (写自己的设置)。**不给自由布局**, 免得插件把浮标那套排版搞坏 (P4)

### 10.3 伴侣自带界面

伴侣 APK 想怎么做界面都行, LW 只给入口: 插件页上一个"打开"按钮, 直接把它那个 Activity 起起来

### 10.4 桌面小组件

**必须由伴侣 APK 声明** `AppWidgetProvider`, 只能进伴侣的清单 (这是 companion 这一档存在的第一个理由)。
三种配合方式按需要挑, 都要经同一个 `ILwPluginContext` 走能力检查

## 11 · 权限与信任模型

**伴侣 APK 那条路** (决定 3)

LW 声明一条自定义权限, 两种保护级同时写上:

```xml
<permission
    android:name="io.github.yuloong07star.luwi.permission.PLUGIN"
    android:protectionLevel="signature|dangerous" />
```

同签名的伴侣自动拿到, 第三方伴侣要用户在系统弹窗里点同意。**这一条要在目标 ROM 上实测一次**
(`signature|dangerous` 的语义是"满足任一即授予", 与设计意图相符, 但组合标志在个别 ROM 上被改动过)。
LW 自己也要 `<uses-permission>` 这一条, 否则绑不上护住了的 Service

**发布者信任**

- 每个插件页显示: 发布者名字、公钥指纹、首次见到该公钥的时间
- 第一次装某个新公钥的插件时单独提示一句"这是一个新发布者"
- 公钥目录落 `$DSH_HOME/plugins/.publishers/`, 用户可以删掉某一条 (等于不再信任它之后的包)

**信任分级** (只影响界面怎么标, 不改变能力检查)

| 档 | 条件 | 界面 |
| :-- | :-- | :-- |
| 官方 | 与 LW 同签名 | 不额外提示 |
| 已签名 | 有有效签名 + 已知发布者 | 显示发布者与指纹 |
| 新发布者 | 有有效签名但没见过这个公钥 | 单独提示一次 |
| 未签名 | 开发者模式下的本地包 | 常驻红字 |

## 12 · 审计与撤销

**审计** (这是"别人也能写"必须配的东西)

- 每次 `context.call` 记一条: 时间 / 插件 / 能力 / 参数摘要 / 结果摘要
- 全部写进 `$DSH_HOME/plugins/.audit/<id>.log`, 有上限自己滚 (512 KiB, 超了留尾部 500 行)
- 每个插件页能看到最近若干条
- **能力被拒也要记** —— "它想干什么"比"它干成了什么"更有信息量
- 危险能力 (`privileged.*` / `system.write` / `screen.write` / `session.post`) 的调用即使不弹窗,
  至少留一条痕

**撤销** (决定 9, P5 落地)

- `$DSH_HOME/plugins/.revoked.json`: `{ id, key指纹, reason, at }`
- 三个来源: 随 APK 发的内置清单 / 索引里那份 `revoked` 列表 / 用户手动拉黑
- 命中即: 不加载 / 停用宿主 / 插件页红字说明原因 / 提示卸载
- 也支持**按能力撤回** (撤销 `privileged.shell` 而不是整包)

## 13 · URL 安装与索引 (P5)

- 官方索引: 一个 JSON (`lw-plugin-index/1`), 列 `id` / `version` / `url` / `sha256` / `size` / 发布者 /
  能力 / `minLw`, 末尾带一份 `revoked`; 托管位置先认**任意 https URL**, 官方那一份放仓库 Releases
- 裸 URL: 用户直接粘一个 `.lwp` 地址
- 两条都走同一条校验链, 一步都不许省: 只许 https (重定向到 http 即中止) → 下到 `.lwtmp/` 暂存并校验体积 →
  验签名与逐文件哈希 → 校验 protocol / `minLw` / 前缀冲突 / 重名 / 未知能力 → 把能力逐条摆给用户 →
  落地 → 注册 → 启用
- **明确不做**: 自动更新已启用的插件。dex 的更新等于换一份代码在跑, 必须人点一下

## 14 · 安全边界与已知风险

这一节是写给用户看的, 不是写给自己看的

1. **装一个插件 = 信任它**。`dex` 域跑在 LW 自己的另一个进程里, 它拿到的能力就是你在第 5 节里勾给它的
   那些; 勾了 `privileged.shell` 就等于把特权交给它
2. **破坏性操作那道机器闸已经撤掉了** (决定 10): 应用层不再弹窗, "要不要做"只由提示词层面问一句 ——
   也就是说, **人没看见就等于没拦**。这是主人的明确选择, 但协议这一侧的配套要跟上: 能力授权、签名、
   撤销、审计这四样一个都不能少
3. **URL 安装是供应链的入口**: 索引本身也建议签名 (虽然每个插件各自签名已经能挡篡改, 但索引被替换会变成
   "把用户引到一个同名不同发布者的插件")
4. **dex 域与商店政策**: 动态加载可执行代码在 Play 上是不允许的。LW 是侧载, 不受影响, 但不能带进商店
5. **手写 Binder 的代价**: 没有 AIDL 编译器帮着对描述符与 transaction code, 两侧的编号必须靠一份
   常量表 + 静态校验 (`tools/check-plugins.mjs`) 守住 —— 这是第 0 节第 11 条那条决定的账

## 15 · 落地范围与验收

| 阶段 | 内容 | 验收 | 状态 |
| :-- | :-- | :-- | :-- |
| P0 | 协议冻结 + 骨架: 规格 / 能力表 / 接口 / 安装启用卸载 / 审计 / 设置页插件段 | 一个手工解开的目录插件跑通"装 → 启用 → 出现在工具表 → 卸载" | 2026-10-08 开工 |
| P1 | companion 域 + 签名校验 + `signature\|dangerous` 权限 | 一个样例伴侣 APK 的工具能被调到; 改一个字节的包被拒 | 2026-10-08 开工 |
| P2 | dex 域: `:plugin` 进程 + 类加载器 + API jar + 崩 / 卡两条兜底 | 样例 dex 插件的工具能被调到; 插件抛异常时 LW 不受影响 | 2.5.1 之后 |
| P3 | script 域 + 主题包 + `BallView` 那条外部位图分支 | 换一套图标生效; 删掉插件回退内置画法 | 2.5.1 之后 |
| P4 | 声明式面板 + 动作按钮 | 球菜单里那一项点开能用, 按钮能调到插件工具 | 2.5.1 之后 |
| P5 | URL 安装 + 索引 + 撤销表 | 从 URL 装一个包; 校验失败 / 撤销命中两条路都要看得见 | 2.5.1 之后 |
| P6 | 三个样例插件 (companion / dex / 主题) + 一份写给外部作者的文档 | 三份样例各自有 README, 照着能做出第四个 | 2.5.1 之后 |

**排期**: 它排在 2.5.0 的其余批次之后, 按 2.5.0 计划第 9 节的取法**整体成为 2.5.1** (2.5.0 已于
2026-10-08 发版)。P0 与 P1 一起做 —— P0 单做交付不了"出现在工具表"这一条, 骨架要靠样例伴侣才验得动

## 16 · 已决 (原"未决", 2026-10-08 冻结时逐条答复)

| # | 问题 | 答复 |
| :-- | :-- | :-- |
| 1 | 签名算法默认用 ECDSA P-256 还是 Ed25519 | **P-256 是默认也是唯一**; Ed25519 要实测过 Conscrypt 再说 |
| 2 | `minLw` 之外要不要再单列一个 `api` 版本 | **要**。`minLw` 管"这个应用够不够新", `api` 管"这份 API jar 对不对得上" |
| 3 | dex 域是共享一个 `:plugin` 进程还是预留三四个轮转 | **先共享一个**, 需要更强隔离时再开池 |
| 4 | `session.post` 能不能开新会话 (不只是投一句话) | **拆两档**: `session.post` 只投一句话, `session.create` 才能开会话, 后者默认不授 |
| 5 | 主题插件能不能改"输入条"与"文本框"的外观 | **2.5.x 只改浮标**, 输入条与文本框一起放开是下一版的事 |
| 6 | 索引托管在哪 | **先认任意 https URL**, 官方索引放仓库 Releases |
| 7 | 撤销表随 APK 发的部分多久更新一次 | **跟着版本走** + 索引里那份每次打开插件页时拉一次 |
| 8 | `theme` 这一档要不要单独一个 `kind` | **要**: 它不能声明任何能力, 也不需要宿主进程 |

## 附 · 样例骨架

```
# companion (新权限 / 桌面小组件走这条) —— P1 做的这一份
samples/companion/
  plugin.json          kind=companion, package+service, toolPrefix=hello
  README.md
  (伴侣 APK 自己那份工程里: 一个 Service 实现 ILwPlugin, 一个自带 Activity)

# dex (行为插件走这条) —— P2
io.example.timer/
  plugin.json          kind=dex, main.dex + class, toolPrefix=timer
  main.dex
  README.md

# 主题 (只做美术, 不需要一行代码) —— P3
io.example.theme.glass/
  plugin.json          kind=theme, toolPrefix=glass, 不声明任何能力
  theme/ball.json
  art/ball-idle.png …
  README.md
```
