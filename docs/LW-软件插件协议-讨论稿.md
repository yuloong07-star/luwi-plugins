# LW 软件插件协议 (讨论稿)

状态: **讨论稿, 未冻结**。冻结条件是第 16 节那几个未决点全部有答复, 且第 15 节 P0 的骨架跑通一次
版本: `lw-plugin/1`
落点: Luwi 的"设备侧能力扩展层" (与技能、dsh 插件三足鼎立, 见第 1 节)

## 0 · 决策记录

本文的每一处设计都从主人 2026-10-08 这十句话来, 有冲突时以本节为准

| # | 决定 | 影响 |
| :-- | :-- | :-- |
| 1 | 是**给别人写的生态** | 一切以"不认识发布者也要能安全装"为前提, 不能有"反正是自己写的"这种假设 |
| 2 | **做 dex 域** | 需要 `:plugin` 进程 + 类加载器 + 一份稳定的 API jar (见 8.2) |
| 3 | 伴侣 APK 走**绑定 AIDL**, 同签名 `signature` 级、第三方 `dangerous` 级 | 见 9 与 11 |
| 4 | 界面只给**声明式设置项 + 动作按钮**; 伴侣 APK 可以自带界面, 我们只给入口 | 见 10 |
| 5 | **允许从 URL 下载安装** | 见 13, 强制 https + 强制签名校验 |
| 6 | `lw_` 前缀保留给内置, 插件工具用 `<toolPrefix>_` 前缀, 重名拒绝安装 | 见 6 |
| 7 | **能驱动对话** (`session.*` 作为一个独立能力档) | 见 5 |
| 8 | 插件**不能**互相调用 | 见 8.4 |
| 9 | 协议里**要有撤销机制** | 见 12 |
| 10 | 破坏性操作那五条**不再由应用层弹窗拦** (2026-10-08 已随批次 0 删除, 见 `DSH-LW-2.5.0-开发计划.md` 回执), 改为提示词层面问一次 | 见 14, 这一条改变了整份协议的安全重心 |

## 1 · 目标与非目标

**目标**: 让第三方 (包含只做美术的人) 在不重新编译 Luwi 的前提下, 给这台手机**增加能力** ——
新工具、新监测器、新的浮标外观、新的面板、新的桌面组件、新的界面入口

LW 现在有几层扩展点, 这一层是补上缺的那一块, 三层的分工要一直清楚

| 层 | 载体 | 能加什么 | 不能加什么 | 现状 |
| :-- | :-- | :-- | :-- | :-- |
| 技能 | `SKILL.md` | 提示词与作业流程 | 任何行为 | 已有 (`skills/android-device-control`) |
| dsh 插件 | host 侧 JS 模块 | dsh 的工具、命令词、GUI 面板钩子 | 碰不到 Android | 已有 (`host-plugin/index.mjs`) |
| **LW 插件** | 本文的 `.lwp` 包 | **设备侧能力**: 新工具、监测器、外观、面板、组件 | 改不了 LW 自己的清单与既有界面 | 本文要定的 |

**非目标** (明确写出来, 免得越做越大)

- 不做插件之间的依赖与互相调用
- 不做"插件改 LW 已有界面" (只能用声明式设置项 / 面板 / 伴侣自带界面)
- 不做插件市场式的推荐、评分、付费 —— 只做"索引 + 安装 + 撤销"
- 不把插件做成沙箱: 装一个插件就是信任它, 这一点在安装页上要说清

## 2 · 核心设计: 一份 AIDL, 三个域

主进程只认识一种插件宿主接口 (AIDL)。三个 `kind` 的差别只在**宿主进程在哪**:

| kind | 宿主在哪 | 天生能做 | 代价 |
| :-- | :-- | :-- | :-- |
| `script` | LW 主进程内的解释器 | 组合已有能力 (轻, 零编译) | 碰不到新 Android API |
| `dex` | LW 自己声明的 `:plugin` 进程 | 碰 Android 框架、跑自己的逻辑 | 要签名 + 要隔离 + 要 API jar |
| `companion` | 另一个 APK (绑定 Service) | **新权限、新清单组件 (桌面小组件在这里)** | 用户要单独装那个 APK |

分层的两端固定成这样

```
模型 / dsh
   ↕ (工具调用, 与 lw_* 完全相同)
主进程: 能力检查 + 用户授权 + 审计 + 工具注册 + 主题加载
   ↕ AIDL (本文第 9 节)
宿主: :plugin 进程 (dex / script)  或  伴侣 APK (companion)
   ↕ Java 接口 (dex) / 解释器 API (script) / 插件自己的代码 (companion)
插件本体
```

**为什么这么分**: 能力检查、授权、审计只有一处 —— 主进程。插件永远不能直接够到模型, 只能注册成工具;
三个域共享同一条闸, 于是"加一个新域"不用再想一遍安全

## 3 · 包格式与签名

- 单文件 `.lwp`, 就是一个 zip (也接受解开的目录, 给本地开发用)
- 必含 `plugin.json`; 可选 `main.dex` / `art/` / `theme/` / `panel/` / `README.md` / `LICENSE`
- **必须签名**: 发布者用私钥对"规范化后的 `plugin.json` + 每个文件 sha256 的清单"签名
- 算法默认 **ECDSA P-256 / SHA-256** (Android 全版本都有); Ed25519 更小更快, 但老 ROM 的 Conscrypt 不一定有, 先实测再决定要不要当默认
- 签名与公钥写在 `plugin.json` 的 `publisher` 里; 文件哈希清单在 `files` 字段
- **未签名包**: 只接受本地手工放入, 且必须在设置里打开"开发者模式"才允许启用; 界面上永远标红
- 大小上限与文件数上限要写死 (建议 32 MB / 2000 个文件), 免得一个包把 host 树撑爆

## 4 · `plugin.json` 规格

```json
{
  "protocol": "lw-plugin/1",
  "id": "io.example.timer",
  "name": "番茄钟",
  "version": "1.0.4",
  "minLw": "2.5.0",
  "api": "1",
  "kind": "dex",
  "toolPrefix": "timer",
  "entry": { "dex": "main.dex", "class": "io.example.timer.Plugin" },
  "publisher": {
    "name": "someone",
    "key": "ecdsa-p256:MFkwEwYH...",
    "signature": "MEUCIQ..."
  },
  "capabilities": {
    "requested": ["notify.post", "speech.speak", "sensor.read", "session.post"],
    "dangerous": []
  },
  "tools": [
    {
      "name": "timer_start",
      "summary": "开一轮番茄钟",
      "params": { "minutes": { "type": "integer" } }
    }
  ],
  "ui": {
    "settings": [
      { "key": "minutes", "type": "int", "default": 25, "title": "每轮分钟" }
    ],
    "actions": [
      { "id": "start", "title": "开一轮", "tool": "timer_start" }
    ],
    "theme": { "ball": "theme/ball.json" },
    "panel": "panel/main.json"
  },
  "files": { "main.dex": "sha256:...", "theme/ball.json": "sha256:..." }
}
```

字段规则

| 字段 | 必填 | 规则 |
| :-- | :-- | :-- |
| `protocol` | 是 | 只认 `lw-plugin/1`, 别的值直接拒 |
| `id` | 是 | 反向域名, 全局唯一; 装过同 id 即视为同一插件 (升级) |
| `version` | 是 | 语义化三段; 只允许升不许降 (降级要显式确认) |
| `minLw` | 是 | 低于它就拒绝安装, 并在界面上说清要哪个版本 |
| `api` | 是 | API jar 的版本, 与 `minLw` 各管一件事 (见第 16 节) |
| `kind` | 是 | `script` / `dex` / `companion` / `theme` |
| `toolPrefix` | 是 | `[a-z][a-z0-9_]{1,15}`, 全局唯一; `lw` `dsh` `agent` 是保留字 |
| `capabilities` | 是 | `requested` 与 `dangerous` 两个数组; **出现未知能力一律拒绝安装** |
| `ui` | 否 | 只支持第 10 节列出的那几种声明, 多余的键拒绝 |
| `entry` | 是 | 按 kind 给 (`script` / `dex`+`class` / `package`+`service`; `theme` 不需要) |

## 5 · 能力表

插件只能从这个表里挑。**未知能力拒绝安装**这一条是刻意的: 忽略未知能力会造出"我以为只给了很小的权限"

**普通档 (安装时列出, 一次确认)**

| 能力 | 含义 |
| :-- | :-- |
| `device.read` | 电量 / 网络 / 存储 / 设备信息 |
| `sensor.read` | 传感器与光感 |
| `location.read` | 位置 (粗 / 精由用户在设置里另给) |
| `notify.post` | 发通知 / 横幅 |
| `speech.speak` | 让 LW 念一句话 |
| `clipboard` | 剪贴板读 / 写 |
| `files.own` | 只读自己那个插件目录 |
| `files.read:<路径前缀>` | 读指定范围 (例如 `/sdcard/DSH`) |
| `net.http:<域名>` | 只允许访问列出的域名 |
| `ui.theme` | 提供浮标外观 (第 10 节) |
| `ui.panel` | 提供一页声明式面板 |

**敏感档 (安装时逐条勾选, 默认全不勾)**

| 能力 | 含义 |
| :-- | :-- |
| `screen.read` | 截图 / 读控件树 / OCR |
| `screen.write` | 点击 / 滑动 / 打字 / 起应用 / 建虚拟屏 |
| `input.key` | 按键与组合键 |
| `system.write` | 改系统设置 (亮度 / 音量 / 超时…) |
| `camera` | 用摄像头取帧 |
| `media` | 媒体库、播放、拍照 |
| `session.post` | **驱动对话**: 把一句话投进某一场会话 |
| `session.create` | 还能开一场新的会话 |
| `session.read` | 读会话里的回答 |
| `privileged.key` | 借特权通道按键 (root / Shizuku) |
| `privileged.shell` | 借特权通道执行命令 |

两条落地的规矩

- 每个能力在运行时**逐次**对照声明与授权, 不缓存成"这个插件是可信的"
- 同一能力可以"授权但降级": 例如 `location.read` 只给粗定位, `files.read` 只给一个子目录

## 6 · 工具注册与命名

- 内置工具永远是 `lw_*`
- 插件工具名 = `<toolPrefix>_<动作>`, 例如 `timer_start`
- **前缀全局唯一**: 装第二个用同一前缀的插件直接拒绝安装, 提示它换一个
- `lw` / `dsh` / `agent` 三个前缀是保留字, 声明它们即拒绝
- 工具描述与参数 schema 全部来自 `plugin.json`, 主进程只做校验与转发 —— 插件不能运行时偷偷改自己的工具表
- 插件工具在模型眼里与 `lw_*` 长得一样 (同样的文本 + 图片返回形状), 于是"内置 or 插件"对模型是透明的

## 7 · 生命周期

| 阶段 | 做什么 | 失败要说什么 |
| :-- | :-- | :-- |
| 下载 | 到 `.lwtmp/` 暂存, 只许 https | 网络 / 体积 / 重定向到 http |
| 校验 | 解包前先验签名与哈希清单; 再查 protocol / id / 版本 / 前缀 / 未知能力 | 具体是哪一条不过 |
| 确认 | 把**能力和它的含义**逐条摆给用户, 敏感档默认不勾 | 用户取消 = 什么都不落地 |
| 落地 | `$DSH_HOME/plugins/<id>/<version>/`, 另写 `current` 指向 | 目录写不进去 |
| 注册 | 工具 + 主题 + 面板 + 设置项 | 与已有工具重名 |
| 启用 | 起宿主, 调 `onEnable` | 宿主起不来要说清是哪一步 |

另外三条

- **升级**: 保留旧版本目录, 新版本装成新目录再切 `current`。**不允许热替换正在跑的 dex** —— 升级要重启 host, 界面要说清这件事
- **卸载**: 先停宿主 → 撤注册 → 问一句"它自己那份数据要不要一起删" → 删目录 → 留一条记录 (id / 版本 / 时间)
- **状态恢复**: LW 重启后按 `current` 重放注册与 `onEnable`, 插件不能让"重启之后就不见了"

## 8 · 三个域的边界

### 8.1 companion (伴侣 APK)

- LW 侧只声明一个可以绑定出去的 Service 接口与一条自定义权限 (见 11)
- 伴侣实现 `ILwPlugin` (第 9 节), 把 `describe()` 回的内容与它包里那份 `plugin.json` 对照, 不一致就拒绝
- 伴侣自己申请它要的 Android 权限 —— **这是"新权限"唯一的合法来源**
- 伴侣可以自己带界面 (Activity / 桌面小组件), LW 只给一个入口 (第 10 节)
- 它碰不到 LW 的进程内存, 也拿不到特权 (除非 LW 按声明代它做)

### 8.2 dex

这一域是主人点名要的, 也是最需要小心的那一域

**跑在哪**: LW 清单里预先声明的 `:plugin` 进程。清单是静态的, 所以**做不到"一个插件一个进程"** —— 只能是共享一个 `:plugin`, 或者预留三四个 (`:plugin1`…`:plugin4`) 轮转。建议先共享一个, 把"现在哪个插件在跑"记下来

**怎么加载**: 优先 `InMemoryDexClassLoader` (把 dex 读进内存再加载, 顺带避开可写目录那条越来越紧的限制); 退回 `DexClassLoader`。每个插件一个 ClassLoader, 插件之间不共享静态状态

**API jar**: 另发一份只含接口与数据类的 `lwplugin-api-1.jar`, 插件对着它编译。插件**不许**引用 LW 的内部类或 `R` —— 引用了就等于把"LW 改一行插件就可能崩"这件事写进协议。API 版本由 `context.api()` 暴露, 与 `plugin.json` 的 `api` 字段对照

**隔离与崩**: 插件抛异常 → 转成一条工具错误文本, 绝不带走 LW; 插件卡死 → 主进程那条调用超时并如实报 ("这个插件没在预期时间内回答"), 不重试

**它做不到什么**: 加不了清单组件 (桌面小组件 / 新服务 / 新接收器), 加不了新权限, 画不了 LW 的界面

### 8.3 script

- 跑在 LW 主进程内的解释器里 (与 dsh 的 Node 不是同一个, 这里是设备侧那一层)
- 只能调声明过的能力, 拿不到 Java / Android API
- 定位是"把已有能力拼起来"的轻插件: 新快捷指令、新自动指令规则、简单的工具编排
- 这一域可以晚一点做 (第 15 节的 P3), 因为前两域已经能把生态跑起来

### 8.4 插件之间

**不能互相调用**, 也不共享数据目录。要协作只能经 LW 中转 (一个插件把结果写成文件, 另一个按能力读)。这一条是刻意的: 一旦允许互调, 依赖图与权限放大就没人管得住

## 9 · AIDL 接口草案

两个接口, 方向相反。名字里的 `Lw` 前缀留给这一层, 与工具前缀是两回事

```aidl
// 插件实现这个, LW 调它。kind 不同, 宿主不同, 但接口是同一份
interface ILwPlugin {
    // 插件自述 (与它包里那份 plugin.json 对照用)
    Bundle describe();
    // "attach" (给了 context) / "enable" / "disable" / "detach"
    void lifecycle(String event, in Bundle args);
    // 调一个工具。返回 { ok, text, images[], data }, 与 lw_* 的返回形状一致
    Bundle invoke(String tool, in Bundle args);
}

// LW 实现这个, 在 "attach" 时作为 IBinder 交给插件。插件**只能**从这里够到设备
interface ILwPluginContext {
    // capability 取自第 5 节那张表; 未声明或未授权一律拒绝并如实说
    Bundle call(String capability, in Bundle args);
    // 插件自己的设置读写 (只碰它自己那一段)
    Bundle settings(in Bundle defaults);
    Bundle store(String op, in Bundle args);
    void log(int level, String message);
    int api();
}
```

`attach` 那一次传下去的 `Bundle` 里有: `context` (`ILwPluginContext` 的 binder)、插件自己的目录、LW 的版本、语言、当前模式。**能力调用一律经 `context.call`**, 插件拿不到别的路

## 10 · 美术与界面通道

这一节直接对着主人的用例 (桌面组件 / 其它美术 UI / 更换 ball 图标)

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

- 五个状态对应现在 `BallView` 那几档; 帧序列是可选的 (不做也能跑)
- `hideBuiltinText` 给"自己画了字"的主题用 (默认 false, 保留"正在听"那三个字)
- 真正的活不在协议, 在 `BallView`: 它现在是自己画的渐变球, 要加一条"外部位图 / 帧序列"的分支, 读不到就回退内置画法
- **多个主题插件可以同时装着, 但同一时刻只启用一个** (设置页里选)

### 10.2 声明式面板

球菜单里加一项, 点开是一页由 `panel/main.json` 描述的内容: 段落 (标题 / 正文 / 图片)、按钮 (调某个工具)、开关 (写自己的设置)。**不给自由布局**, 免得插件把浮标那套排版搞坏

### 10.3 伴侣自带界面

伴侣 APK 想怎么做界面都行, LW 只给入口: 插件页上一个"打开"按钮, 用 `lw_intent` 那条链起它的 Activity

### 10.4 桌面小组件

**必须由伴侣 APK 声明** `AppWidgetProvider`。三种配合方式, 按需要挑

- 部件只展示: 伴侣自己读 LW 的 ContentProvider 拿数据
- 部件能操作: 伴侣经 AIDL 让 LW 干活 (受同一套能力检查)
- LW 主动推: LW 有变化时给伴侣一个回调, 它去刷新自己的部件

## 11 · 权限与信任模型

**伴侣 APK 那条路** (决定 3)

LW 声明一条自定义权限, 两种保护级同时写上:

```xml
<permission
    android:name="io.github.yuloong07star.luwi.permission.PLUGIN"
    android:protectionLevel="signature|dangerous" />
```

同签名的伴侣自动拿到, 第三方伴侣要用户在系统弹窗里点同意。**这一条要在目标 ROM 上实测一次** (`signature|dangerous` 这条组合的语义是"满足任一即授予", 与设计意图相符, 但组合标志在个别 ROM 上被改动过)

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
- 每个插件页能看到最近若干条; 全部写进 `$DSH_HOME/plugins/.audit/<id>.log`, 有上限自己滚
- 能力被拒也要记 —— "它想干什么"比"它干成了什么"更有信息量

**撤销** (决定 9)

- `$DSH_HOME/plugins/.revoked.json`: `{ id, key指纹, reason, at }`
- 三个来源: 随 APK 发的内置清单 / 索引里那份 `revoked` 列表 / 用户手动拉黑
- 命中即: 不加载 / 停用宿主 / 插件页红字说明原因 / 提示卸载
- 也支持**按能力撤回** (撤销 `privileged.shell` 而不是整包), 因为很多情况下只是"它要得太多"

## 13 · URL 安装与索引

**两种入口**

- 官方索引: 一个 JSON (`lw-plugin-index/1`), 列 `id` / `version` / `url` / `sha256` / `size` / 发布者 / 能力 / `minLw`, 末尾带一份 `revoked`
- 裸 URL: 用户直接粘一个 `.lwp` 地址

**两条都走的校验链** (一步都不许省)

1. 只许 https, 重定向到 http 即中止
2. 下到 `.lwtmp/` 暂存, 校验体积上限
3. 校验发布者签名与每个文件的哈希
4. 校验 `protocol` / `minLw` / 前缀冲突 / 重名 / 未知能力
5. 把能力逐条摆给用户 (敏感档默认不勾)
6. 落地 → 注册 → 启用

**明确不做**: 不做"自动更新已启用的插件"。dex 的更新等于换一份代码在跑, 必须人点一下

## 14 · 安全边界与已知风险

**这一节是要写给用户看的, 不是写给自己看的**

1. **装一个插件 = 信任它**。`dex` 域跑在 LW 自己的另一个进程里, 它拿到的能力就是你在第 5 节里勾给它的那些; 勾了 `privileged.shell` 就等于把特权交给它
2. **破坏性操作那道机器闸已经撤掉了** (决定 10, 2026-10-08 落地): 应用层不再弹窗, "要不要做"只由提示词层面问一句 —— 也就是说, **人没看见就等于没拦**。这是主人的明确选择, 但协议这一侧的配套要跟上: 能力授权、签名、撤销、审计这四样一个都不能少
3. **建议保留"留痕"** (不是阻拦): 危险能力 (`privileged.*` / `system.write` / `screen.write` / `session.post`) 的调用即使不弹窗, 也至少写进审计与通知栏摘要。这样事后还查得到
4. **dex 域与 Play 政策**: 动态加载可执行代码在 Play 上是不允许的。LW 是侧载, 不受影响, 但这件事不能带进商店
5. **URL 安装是供应链的入口**: 索引本身也建议签名 (虽然每个插件各自签名已经能挡篡改, 但索引被替换会变成"把用户引到一个同名不同发布者的插件")

## 15 · 2.5.0 落地范围与验收

这一套本身就是一个版本级的工程。建议在 2.5.0 里按 P0…P6 推进, 每一步都能停下来交付

| 阶段 | 内容 | 验收 |
| :-- | :-- | :-- |
| P0 | 协议冻结 + 骨架: `plugin.json` 规格、能力表、`ILwPlugin` / `ILwPluginContext`、安装 / 启用 / 卸载 / 审计、设置页插件段 | 用手工解开的一个目录插件跑通"装 → 启用 → 出现在工具表 → 卸载" |
| P1 | companion 域 + 签名校验 + `signature\|dangerous` 权限 | 一个样例伴侣 APK 的工具能被模型调到 |
| P2 | dex 域: `:plugin` 进程 + 类加载器 + API jar + 崩 / 卡两条兜底 | 一个样例 dex 插件的工具能被模型调到; 插件抛异常时 LW 不受影响 |
| P3 | script 域 + 主题包 (浮标外观) + `BallView` 那条外部位图分支 | 换一套图标生效; 删掉插件回退内置画法 |
| P4 | 声明式面板 + 动作按钮 | 球菜单里那一项点开能用, 按钮能调到插件工具 |
| P5 | URL 安装 + 索引 + 撤销表 | 从 URL 装一个包; 校验失败 / 撤销命中两条路都要看得见 |
| P6 | 三个样例插件 (companion / dex / 主题) + 一份写给外部作者的文档 | 三份样例各自有 README, 照着能做出第四个 |

**排期 (主人 2026-10-08 已定)**: 它排在 17 条需求之后当**批次 9**, 其余批次顺序不动。
它是那版计划里唯一一条"可以整体切到下一个小版本"的批次 —— 周期够就 P0~P6 做完再出 2.5.0,
周期不够就在批次 8 结束时先出 2.5.0, 它整体成为 2.5.1。两条路都不动协议本身

## 16 · 未决

| # | 问题 | 我的建议 |
| :-- | :-- | :-- |
| 1 | 签名算法默认用 ECDSA P-256 还是 Ed25519 | P-256 (兼容性稳), Ed25519 实测通过再当备选 |
| 2 | `minLw` 之外要不要再单列一个 `api` 版本 | 要。`minLw` 管"这个应用够不够新", `api` 管"这份 API jar 对不对得上" (本文已按"要"写) |
| 3 | dex 域是共享一个 `:plugin` 进程还是预留三四个轮转 | 先共享一个, 需要更强隔离时再开池 |
| 4 | `session.post` 能不能开新会话 (不只是投一句话) | 已按决定 7 拆成 `session.post` 与 `session.create` 两档, 后者默认不授 |
| 5 | 主题插件能不能改"输入条"与"文本框"的外观 | 2.5.0 只改浮标; 输入条与文本框一起放开是下一版的事 |
| 6 | 索引托管在哪 (GitHub Releases / 自建 / 两者都认) | 先认任意 https URL, 官方索引放仓库 Releases |
| 7 | 撤销表随 APK 发的部分多久更新一次 | 跟着版本走 + 索引里那份每次打开插件页时拉一次 |
| 8 | `theme` 这一档要不要单独一个 `kind` | 要 (见附录)。主题包不能声明能力, 也不需要宿主进程 |

## 附 · 三个样例插件的目录骨架

```
# companion (新权限 / 桌面小组件走这条)
io.example.widget/
  plugin.json          kind=companion, package+service, toolPrefix=widget
  README.md
  (伴侣 APK 自己那份工程里: 一个 Service 实现 ILwPlugin, 一个 AppWidgetProvider)

# dex (行为插件走这条)
io.example.timer/
  plugin.json          kind=dex, main.dex + class, toolPrefix=timer
  main.dex
  README.md

# 主题 (只做美术, 不需要一行代码)
io.example.theme.glass/
  plugin.json          kind=theme, toolPrefix=glass, 不声明任何能力
  theme/ball.json
  art/ball-idle.png …
  README.md
```

主题包这一档是本文新加的 `kind: "theme"`: 它不能声明任何能力, 也不需要宿主进程 —— 于是"只做美术的人"也能发插件
