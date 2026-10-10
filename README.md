# luwi-plugins

**Luwi 的插件生态** —— [Luwi](https://github.com/yuloong07-star/Luwi) 的"设备侧能力扩展层":
协议 [`lw-plugin/1`](docs/LW-软件插件协议.md) 的全文、对外接口那一份 (`lwplugin-api`)、两份能跑起来的
样例插件、签名工具, 以及签好名的示例包。

Luwi 本体在 [yuloong07-star/Luwi](https://github.com/yuloong07-star/Luwi), 基于
[Miuzarte/LittleWhale](https://github.com/Miuzarte/LittleWhale) (Apache-2.0)。这一份仓库的目标很
具体: **不认识 Luwi 作者的人, 照着这里的三样东西能做出第四份插件**。

## 这是什么, 不是什么

Luwi 有三层扩展点, 本仓库只管**最下面那一层**:

| 层 | 载体 | 能加什么 | 不能加什么 |
| :-- | :-- | :-- | :-- |
| 技能 | `SKILL.md` | 提示词与作业流程 | 任何行为 |
| dsh 插件 | host 侧 JS 模块 | dsh 的工具、命令词、GUI 面板钩子 | 碰不到 Android |
| **LW 插件** (本仓库) | `.lwp` 包 | **设备侧能力**: 新工具、新监测器、浮标外观、声明式面板、桌面组件 | 改不了 Luwi 自己的清单与既有界面 |

非目标同样写死在这儿 (免得越做越大): 不做插件之间互相调用、不做"改 Luwi 已有界面"、不做
商店式的推荐评分付费。这一层只做**索引 + 安装 + 撤销**。

## 三个域, 与今天走到哪一步

主进程只认识一种插件宿主接口 (`ILwPlugin`, 见协议第 9 节), 三个 `kind` 的差别只在**宿主进程在哪**:

| `kind` | 宿主 | 天生能做 | 状态 |
| :-- | :-- | :-- | :-- |
| `companion` | 另一个 APK (绑定 Service) | **新权限、新清单组件** (桌面小组件只能走这条) | **已接通**, 本仓库两份样例都是它 |
| `dex` | Luwi 自己声明的 `:plugin` 进程 | 碰 Android 框架、跑自己的逻辑 | 未接通 (P2) |
| `script` | Luwi 主进程内的解释器 | 把已有能力拼起来, 零编译 | 未接通 (P3) |
| `theme` | 没有宿主 (一串资源) | 只换浮标外观 | 未接通 (P3) |

**未接通的那三种现在装不进来** —— 装的时候点名拒绝, 不会假装成功、也不会静默忽略。所以今天要写插件,
就写 `companion`。

## 快速开始 · 装一份现成的

装 **鲸鱼娘桌面小组件** (要 Luwi ≥ 2.6.0):

1. 先装同签名的伴侣 APK —— 见 [samples/whale-widget](samples/whale-widget/plugin/README.md)
2. Luwi → 右上角那颗「菜单」按钮 → 设置 → 插件 → **「从链接装入」**, 粘下面这一条

```
https://cdn.jsdelivr.net/gh/yuloong07-star/Luwi@main/plugins/whale-widget-1.1.2.lwp
```

同一份包也躺在本仓库的 [packages/](packages/whale-widget-1.1.2.lwp), 用设置页那颗「装入插件包」
选它一样能装 —— **两条路走的是同一条校验链**, 从链接装不比从本地装少验一样东西。

两条要记住的: **装上 ≠ 能用** (装完要在设置页逐条勾能力, 敏感档默认全不勾, 再启用); 这一份样例
一条能力都不要, 所以它装上就能用, 一个勾选框都不用点。

## 快速开始 · 自己写一个

以 `companion` 域为例, 五步:

### 1 · 起一份工程

```bash
git clone https://github.com/yuloong07-star/luwi-plugins.git
cd luwi-plugins
```

自己那份工程引 `:lwplugin-api` (那个模块零依赖、零资源, 只有两个手写 Binder 抽象、一份常量与几个
把结果装进 `Bundle` 的小工具)。也可以直接要 `dist/lwplugin-api-1.jar`, 对着它编译。

**不许引用 Luwi 的内部类或它的 `R`** —— 插件只活在协议第 9 节那两个接口上。

### 2 · 写 `plugin.json`

最少这几样 (`kind=companion`): `protocol` / `id` / `name` / `version` / `minLw` / `api` / `kind` /
`toolPrefix` / `entry` / `capabilities` / `tools`。逐字段规则见协议第 4 节, 现成的两份在
[samples/companion/plugin/plugin.json](samples/companion/plugin/plugin.json) 与
[samples/whale-widget/plugin/plugin.json](samples/whale-widget/plugin/plugin.json)。

### 3 · 实现 `ILwPlugin`

一个 Service (`android:permission` 用 Luwi 声明的那条自定义权限护住), 实现三个方法:

| 方法 | 干什么 |
| :-- | :-- |
| `describe()` | 回 `id` / `name` / `version` / `api` / `tools` / `capabilities`, **必须与包里那份 `plugin.json` 逐字一致**, 不一致就拒绝启用 |
| `lifecycle(event, args)` | `attach` (给 context) / `enable` / `disable` / `detach` |
| `invoke(tool, args)` | 回 `{ ok, text, images, data }` —— 与内置 `lw_*` 的返回形状一样, 于是模型分不出"内置 or 插件" |

要什么能力一律经 `ILwPluginContext.call(capability, args)`, 没有第二条路。整份参照
[samples/companion](samples/companion/src/main/java/io/github/yuloong07star/luwi/sample/companion/CompanionPluginService.kt)
就是一份能跑的最小实现 (三条工具: 纯算的、要普通能力的、要敏感能力的)。

### 4 · 签名

```bash
node tools/lw-plugin-sign.mjs keygen --out my.key --name 我的发布者
node tools/lw-plugin-sign.mjs sign --dir my-plugin --key my.key --out signed --zip my-plugin.lwp
```

**私钥绝不进仓库、也绝不发给别人** (keygen 会把它写成 PKCS#8 PEM)。`sign` 会把发布者公钥、指纹与
逐文件 sha256 清单写进 `plugin.json`, 再可选打一个单文件 `.lwp` (那个 zip 只存不压)。

开发期不签名也走得通: 把解开的目录手工放进手机, 再到设置页打开**开发者模式** (开着时界面常驻一句
红字)。正式发出去的那一份必须是签了名的。

### 5 · 装机

把包 (或解开的目录) 放到手机上, 设置 → 插件 → **「装入插件包」**; 也可以 `adb push` 之后用桥那条
`{"op":"install","path":"/sdcard/DSH/<你的目录>"}`。装完勾能力、再启用。

## 协议速览 (`lw-plugin/1`)

下面这一份是**速览**, 遇到不一致以 [docs/LW-软件插件协议.md](docs/LW-软件插件协议.md) 那份冻结全文
为准 (协议第 0 节是决策记录, 冲突时它最大)。

### 包与签名

- 单文件 `.lwp` 就是一个 zip (只存不压), 也接受**解开的目录**给本地开发用
- 必含 `plugin.json`, 可带 `README.md` / `LICENSE` / `art/` / `theme/` / `panel/` / `main.dex`
- 签名算法 **ECDSA P-256 / SHA-256, 默认也是唯一**; 公钥是 SPKI-DER 的 base64, 签名是 DER 的 base64
  —— Node 的 `crypto` 与 Android 的 `Signature("SHA256withECDSA")` 两边原生互通, 不引第三方库
- 签的是"规范化后的 `plugin.json`" + 每个文件的 sha256 清单; 规范化规则两侧**逐字节相同**, 这一条
  由 `tools/lw-plugin-sign.mjs` 与设备侧的实现各自守住
- 上限: **32 MB / 2000 个文件**, 超了在解包前就拒

### `plugin.json` 的必填项

| 字段 | 规则 |
| :-- | :-- |
| `protocol` | 只认 `lw-plugin/1`, 别的值直接拒 |
| `id` | 反向域名, 全局唯一; 装过同 `id` 即视为同一插件 (升级) |
| `version` | 语义化三段, 只许升不许降 |
| `minLw` | 低于它拒绝安装, 并说清要哪个版本 |
| `api` | 对外 API 的版本 (现在是 `1`) |
| `kind` | `companion` / `dex` / `script` / `theme` |
| `toolPrefix` | `[a-z][a-z0-9_]{1,15}`, 全局唯一; `lw` `dsh` `agent` 是保留字 |
| `entry` | `companion` 要 `package` + `service` |
| `publisher` | `name` / `key` / `signature` (除开发者模式外必填) |
| `capabilities` | `requested` 与 `dangerous` 两个数组; **出现未知能力一律拒绝安装** |
| `tools` | 每条 `<toolPrefix>_<动作>` + `summary` + `params` (参数只认一个窄子集) |
| `files` | 相对路径 → `sha256:<hex>` |

### 能力表

插件只能从这张表里挑, 一条都不多给。**普通档**装的时候一次确认, **敏感档**逐条勾选、默认全不勾:

| 档 | 能力 | 现在 |
| :-- | :-- | :-- |
| 普通 | `device.read` `sensor.read` `notify.post` `speech.speak` `clipboard` `files.own` | 已接通 |
| 普通 | `location.read` `files.read:<前缀>` `net.http:<域名>` `ui.theme` `ui.panel` | 声明可装, 调用时如实拒 (按 P2/P3/P4 逐个接通) |
| 敏感 | `session.post` (把一句话投进会话) | **已接通** (走 `voice/inbox.jsonl`, `source` 记 `plugin:<id>`) |
| 敏感 | `screen.read` `screen.write` `input.key` `system.write` `camera` `media` `session.create` `session.read` `privileged.key` `privileged.shell` | 声明可装, 调用时如实拒 |

两条纪律: 每个能力在运行时**逐次**对照声明与授权, 不缓存成"这个插件是可信的"; 同一能力可以
**授权但降级** (例如只给粗定位、只给一个子目录)。

### 工具、生命周期、信任

- 内置工具永远是 `lw_*` (管理插件的那条是 `lw_plugin`); 插件工具是 `<toolPrefix>_<动作>`, 描述与参数
  schema 全部来自 `plugin.json` —— 插件不能运行时偷偷改自己的工具表
- 生命周期: 装入 (验签名与哈希清单 → 查 protocol / id / 版本 / 前缀 / 未知能力 / 体积) → 确认 (把能力和
  它的含义逐条摆给用户) → 落地 (`$DSH_HOME/plugins/<id>/<version>/`, 另写一个 `current`) → 注册 → 启用
- **升级不热替换**: 新版装成新目录再切 `current`, 升级完要重启 host; **卸载**先停宿主、撤注册, 再问一句
  "它自己那份数据要不要一起删"
- 伴侣那条路靠 Luwi 声明的一条自定义权限护住 Service
  (`io.github.yuloong07star.luwi.permission.PLUGIN`, `signature|dangerous`): 同签名伴侣自动拿到, 第三方
  伴侣要用户在系统弹窗里点一次同意
- 发布者指纹显示在插件页上; 第一次见到一把新公钥会单独提示一句"这是一个新发布者"
- **审计**: 每次能力调用 (含被拒的) 记一条, 落 `$DSH_HOME/plugins/.audit/<id>.log`
- **撤销**: `$DSH_HOME/plugins/.revoked.json`, 可以整包撤也可以按能力撤

### URL 安装

只许 https (重定向到 http 即中止), 下到暂存区后走**与本地包完全同一条**校验链。**不做自动更新**
—— dex 的更新等于换一份代码在跑, 必须人点一下。

### 安全边界

**装一个插件 = 信任它**。它拿到的能力就是你勾给它的那些; 勾了 `privileged.shell` 就等于把特权交给它。
`dex` 域跑在 Luwi 自己的另一个进程里, 崩了或卡死会被兜住 (转成一条工具错误文本), 但**它拿到的那份
权限是真的**。另外, 破坏性操作那道应用层弹窗已经撤掉, "要不要做"只在提示词层面问一句 —— 也就是说
**人没看见就等于没拦**。这也是为什么能力授权、签名、撤销、审计这四样一个都不能少。

## 目录

| 路径 | 是什么 |
| :-- | :-- |
| [docs/LW-软件插件协议.md](docs/LW-软件插件协议.md) | **协议全文** (2026-10-08 冻结的 v1, 一字未改) |
| [docs/LW-软件插件协议-讨论稿.md](docs/LW-软件插件协议-讨论稿.md) | 冻结前的讨论稿 —— 决策记录, 已被冻结版取代的地方见它第 0 节第 11 条 |
| [lwplugin-api/](lwplugin-api) | 对外接口那一份 (`ILwPlugin` / `ILwPluginContext` / 常量与 `Bundle` 小工具), 零依赖零资源 |
| [dist/lwplugin-api-1.jar](dist/lwplugin-api-1.jar) | 上面那个模块产出的 API jar, 第三方插件对着它编译就行 |
| [samples/companion/](samples/companion) | 样例伴侣: 三条工具 + 自带界面 + 被 Luwi 绑的 Service |
| [samples/whale-widget/](samples/whale-widget) | 样例伴侣: 鲸鱼娘桌面小组件 (协议 10.4 那条路的实物) |
| [tools/lw-plugin-sign.mjs](tools/lw-plugin-sign.mjs) | 签名工具: `keygen` 与 `sign` |
| [packages/](packages) | 签好名、可以直接装的包 |

## 构建

需要 JDK 21、Android SDK (`compileSdk 37` / `build-tools 37.0.0`)。两份样例都是独立的 Gradle 模块,
与 Luwi 主工程只共三样东西: 那份接口 (`:lwplugin-api`)、一条自定义权限、以及包里那份 `plugin.json`。

```bash
./gradlew :lwplugin-api:assembleRelease      # 出 AAR, 里面的 classes.jar 就是 dist 那份 API jar
./gradlew :sample-companion:assembleDebug
./gradlew :sample-whale-widget:assembleDebug
```

样例 APK 要用与 Luwi 同一把 debug keystore 签才是"同签名伴侣"那一档 (系统自动给 `signature` 级权限),
所以两份 `build.gradle.kts` 在那儿取 `LW_DEBUG_KEYSTORE` / `ANDROID_USER_HOME` /
`ANDROID_SDK_HOME` / 用户主目录下的 `.android/debug.keystore`。

## 许可与协议

**本仓库的代码与文档**: [Apache-2.0](LICENSE), 与 Luwi、以及 Luwi 的上游 LittleWhale 相同。

**你写的插件不必跟着用 Apache-2.0** —— 你的插件是你的作品, 协议 (Apache-2.0 / MIT / GPL / 闭源…)
你自己定, 只要**别把 `lwplugin-api` 的源码或 `dist/` 那份 jar 抄进你的包里再改许可**; 想链接它
编译就 `implementation` 引这个模块, 或者对着那份 jar 编译。

几条要写清的:

- **发布者签名是身份, 不是许可**: 它证明"这份包是这把私钥签的、之后一个字节都没被改过", 与你的插件
  用什么开源许可无关。**私钥丢了就换一把新的** —— 那等于换了一个发布者, 用户会看到"这是一个新发布者"
- 包里可以带一份 `LICENSE` 与 `README.md` (协议允许), 建议带上: 用户看到的插件页会列出来
- **随包发的样例动图** (`samples/whale-widget/art/dance-1.gif`) 是 Luwi 作者自己的那份参考动图, 与
  本仓库同许可; 你想发自己的样例时, 注意别把别人的素材打进包里
- **Luwi 的插件层不提供沙箱**: 装一个插件就是信任它, 这一条在协议里刻意写成了设计前提, 而不是缺陷

## Credits

- [Miuzarte/LittleWhale](https://github.com/Miuzarte/LittleWhale) (Apache-2.0) —— Luwi 的全部基础;
  本仓库的插件层是在它之上做的应用级扩展
- [yuloong07-star/Luwi](https://github.com/yuloong07-star/Luwi) (Apache-2.0) —— 插件协议、接口、样例与
  签名工具的家
