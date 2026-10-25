# 晓球 XQ 全新审计：精简、内部逻辑与使用闭环

日期：2026-10-25。对象：本轮开始时的 `D:\MuDevSpace\XQ`，包含已有的未提交修改和新增文件。

这份报告从当前代码重新建立检查结果，没有沿用前两轮的问题清单。重点是源码是否冗余、加载是否合理、页面与内部子页能否顺畅切换、点击后是否形成实际功能，以及失败和返回路径是否正确。没有实施修复或清理。

## 一、主要结论

当前最大的改进空间不是继续添加页面，而是**收拢已经存在的两套请求策略、三套滑动状态机，以及“组件已经出现、操作却没接上”的边界**。

优先处理顺序建议如下：

1. 修复当前构建和类型检查阻断，恢复可验收的微信产物。
2. 修复拖动中断后滚动锁住、叠层弹窗锁提前释放、大名单“放弃”未恢复数据。
3. 补齐帖子点赞与个人背景上传的操作闭环，明确头像是否需要真正裁剪。
4. 把逻辑 Tab 的重新激活接入按需刷新，拆开消息轮询中的读操作与标记已读写操作。
5. 合并请求安全策略，减少赛事列表过量请求；清理确定不属于 weapp 的遗留实现。

已完成 **36 项隔离验证：15 个缺陷复现场景、8 项性能/实现行为观察、13 项正确性检查**。全部得到预期结果；缺陷案例的 PASS 表示问题成功复现。另有静态确认的构建、引用、功能缺口与维护性问题，不能简单用案例数当成唯一问题总数。

### 检查范围和证据口径

- 273 个 TS/TSX 文件、44 个 SCSS 文件，共 317 个源码文件，约 38,836 行。
- 检查 19 个注册页面及实际 `.weapp` 入口，追踪主要页面、详情宿主、编辑、上传、草稿、消息和返回链路。
- 静态导入图按 weapp 后缀优先解析，同时区分类型引用；动态导入、自动发现的页面配置及样式依赖仍需人工核对，不能把图中的“未达”直接当成可删除。
- 原目录执行无输出类型检查；构建、诊断脚本及本报告放在工程外独立目录。
- 行为测试直接转译当前源码，使用项目现有 React 18 与 react-reconciler。Taro 原生组件、Storage、网络、文件系统和触摸坐标使用受控替身，文件操作只发生在虚拟文件记录中。
- **未运行真实微信页面、未连接真实业务后端、未进行真实上传或修改业务数据**。因此报告能确认代码和 React 状态行为，不能宣称已经实测所有手机的帧率、触摸手感或线上接口。

证据：[inventory.json](./inventory.json)、[test-results.json](./test-results.json)、[checks.cjs](./checks.cjs)、[test-kit.cjs](./test-kit.cjs)。

## 二、先解决当前可运行性阻断

### B01：正式 weapp 构建失败，缺少被直接引用的样式模块

位置：[app-box-sizing.weapp.scss:1](D:/MuDevSpace/XQ/src/app-box-sizing.weapp.scss:1)。

该文件第一行 `@use './styles/weapp-ui';`，工程中没有对应的 `src/styles/weapp-ui`。外部独立副本的正式构建退出码为 1，Sass 明确报 `Can't find stylesheet to import`。

建议恢复实际需要的样式模块，或明确将其职责并入现有文件后移除这个引用。不能通过随便创建空文件来声称修好，因为调用方可能依赖其中的基础样式。

构建另报告多组公共样式顺序冲突警告，涉及消息、帖子、人物和球队管理页面。建议按“基础变量/公共组件/页面样式”确定导入顺序，减少详情宿主与页面入口重复引入样式。当前没有真机证据证明这些警告已造成具体错位，因此不把警告本身当成已复现的视觉 bug。

证据：[build.log](./build.log)。由于构建失败，本轮不拿已有 dist 或失败后的零散文件宣称包体合格、启动正常或发布准备完成。

### B02：TypeScript 严格检查有 16 项错误

证据：[typecheck.log](./typecheck.log)。分类为：

| 分类 | 数量 | 具体问题 |
|---|---:|---|
| 图片模块声明 | 8 | PNG/WebP 文件实际存在，但缺少相应模块类型声明；当前只对部分资源做了局部声明 |
| contracts 引用 | 7 | 多个文件通过五级相对路径引用 `D:\packages\contracts\src\product-config`，该目标不在工程中 |
| 隐式 any | 1 | `product-config.logic.ts` 中 grant 参数失去类型约束，与缺失 contracts 类型有关 |

位置包括 [product-config.logic.ts:1](D:/MuDevSpace/XQ/src/features/product-config/product-config.logic.ts:1)、[use-product-config.ts:1](D:/MuDevSpace/XQ/src/features/product-config/use-product-config.ts:1)、[login.shared.tsx:8](D:/MuDevSpace/XQ/src/pages/login/login.shared.tsx:8)。

工程内已有 [product-config.ts](D:/MuDevSpace/XQ/src/product-config.ts)，定义了相同领域的 ProductConfiguration、CapabilityScope 等类型，却没有成为统一来源。建议先核对它与真实接口是否一致，再统一引用来源，并补齐统一的图片模块声明。这里缺的是类型与工程依赖，不能把所有图片错误误报成图片文件丢失。

这七个 contracts import 都是类型引用。它们阻断 tsc，不能直接据此断言生产 JS 一定会请求这个路径；本次实际构建阻断是 B01 的 Sass 缺失。

## 三、已经复现的逻辑与操作问题

### L01：拖动中途被阻断后，主页面可能一直无法纵向滚动

位置：[main-pager.weapp.tsx:212](D:/MuDevSpace/XQ/src/components/native-navigation/main-pager.weapp.tsx:212)、[main-pager.weapp.tsx:326](D:/MuDevSpace/XQ/src/components/native-navigation/main-pager.weapp.tsx:326)。证据：C01。

复现过程：开始横向拖动 → dragging 变为 true，外层 ScrollView 的 scrollY 关闭 → 弹窗/键盘使 `canDragNativeMain()` 变 false → move 只清空 gesture → end 因 gesture 为空提前返回。dragging 没有恢复，scrollY 留在 false。

测试中主动调用 cancel 可以恢复。这说明问题是中断路径没有完成状态收尾，不是 ScrollView 本身不能滚动。真实场景是否恰好在拖动中触发弹窗或键盘仍需真机覆盖，但代码状态遗漏已经复现。

建议让阻断、touchcancel、页面隐藏、卸载及手势结束共用一个收尾函数：清理 gesture、恢复 dragging、回弹到有效位置。保留现有纵向/横向方向判断，不要简单禁用纵向滚动来掩盖冲突。

验收：拖动时弹出欢迎卡/编辑弹窗、键盘打开、切后台、系统取消触摸，回到页面后仍可上下滚动和左右切页。

### L02：关闭上层弹窗后，下层弹窗仍在，底层翻页却被解锁

位置：[native-ui/index.weapp.tsx:80](D:/MuDevSpace/XQ/src/components/native-ui/index.weapp.tsx:80)、[native-navigation/index.weapp.ts:340](D:/MuDevSpace/XQ/src/features/native-navigation/index.weapp.ts:340)。证据：C02。

每个 NativeDialog 挂载都广播 overlay=true，卸载都广播 false。导航层只维护一个布尔值。两个弹窗叠放时关闭其中一个，会使全局 overlay=false，即使还有一个遮罩存在。

个人资料中“编辑资料 → 绑定邮箱”等结构具备叠层条件，因此这个计数问题有实际调用场景。

建议按实例 token 管理 Set 或计数，只有最后一层退出才解锁；把弹窗、抽屉和其他阻断层共用同一个登记入口。现有返回层栈可保留，无需再创建一套复杂弹窗框架。

### L03：大名单选择“放弃修改”，号码没有恢复，保存按钮却被禁用

位置：[squad.weapp.tsx:69](D:/MuDevSpace/XQ/src/pages/team-manage/squad.weapp.tsx:69)、[squad.weapp.tsx:75](D:/MuDevSpace/XQ/src/pages/team-manage/squad.weapp.tsx:75)。证据：C24。

复现：原号码 7 → 改为 10 → 离开确认选择放弃 → 输入仍显示 10，但 dirty=false，“保存名单”按钮禁用。NativeContentPager 会保留各子页，所以不能指望切到其他 tab 自动销毁这份状态。

原因是 discard 回调只有 `setDirty(false)`，没有重建 entries。阵容编辑页已有更完整的恢复逻辑，大名单没有跟上。

建议将“从当前服务器 roster 重建 entries”集中为一个函数，初始化、取消、放弃和成功保存后都使用它。放弃时同时清理相关错误信息；若有草稿备份，也应同步处理。

验收：号码编辑、勾选/移出球员后选择放弃，再返回必须是服务器版本；继续编辑则完整保留本地修改。

### L04：多处帖子卡片的点赞按钮可点，但没有任何动作

位置：[product-ui/index.tsx:272](D:/MuDevSpace/XQ/src/components/product-ui/index.tsx:272)、[product-ui/index.tsx:391](D:/MuDevSpace/XQ/src/components/product-ui/index.tsx:391)。证据：C03。

在 weapp 分支，按钮不会因缺少 onLike 而禁用，但点击只执行 `onLike?.()` 后返回。球队动态、球员动态和收藏页使用 PostCard 时只传 onOpen，没有传 onLike。

测试确认按钮 enabled，点击后网络请求数为 0。首页传入了自己的处理器，因此这个缺陷不是所有列表都失效，而是同一组件在不同页面能力不一致。

建议让共享卡片拥有统一的默认原生点赞动作，允许页面通过回调覆盖或接收更新；或者明确要求调用方必须提供处理器，不支持点赞时不要展示可交互状态。保留每帖子锁、失败提示和现有互动广播，避免每个列表再复制一份点赞代码。

### L05：返回已经挂载的首页 Tab，不会因缓存过期自动重新读取

位置：[main-pager.weapp.tsx:118](D:/MuDevSpace/XQ/src/components/native-navigation/main-pager.weapp.tsx:118)、[screen.weapp.tsx:111](D:/MuDevSpace/XQ/src/pages/index/screen.weapp.tsx:111)。证据：C32。

主容器会保留访问过的 panel。首页重新读取依赖挂载、赛事变化、真正的页面 useDidShow 或手动刷新；逻辑 Tab 的 active 从 false 变回 true 不会触发读取。

测试在已加载后推进 65 秒，逻辑 Tab 离开再返回没有新增请求，触发真正页面 show 才重新读取。8 秒缓存新鲜期只在发起 request 时判断，并不自己安排刷新。

建议建立轻量“面板变为可见”的读取约定：数据仍新鲜时直接展示，超过新鲜期则保留旧内容并静默刷新；编辑页不要套用自动覆盖草稿的策略。赛程、数据、我的及主队也要按相同原则检查，不能仅依赖物理页面生命周期。

### L06：个人背景没有上传入口，头像也没有实际裁剪交互

位置：[desktop-profile.weapp.tsx:187](D:/MuDevSpace/XQ/src/pages/me/desktop-profile.weapp.tsx:187)、[avatar-cropper/index.weapp.tsx:15](D:/MuDevSpace/XQ/src/components/avatar-cropper/index.weapp.tsx:15)。证据：C23、C04。

- 个人背景是普通 Image，外层也没有更换背景处理。头像按钮有处理器，因此“头像可换”不能说明“背景也能换”。
- AvatarCropper 原生实现实际是选图、压缩、读取、提交，没有裁剪画布、取景预览或确认区域。
- 文件无论实际格式如何，都拼成 `data:image/jpeg`。测试选择并压缩为 PNG 路径，回调仍收到 JPEG MIME。应以实际文件信息为准，或明确转码。
- 使用 readFileSync 做 Base64 读取，会占用逻辑线程；其他原生图片代码已有异步读取路径。

建议把个人背景与球队背景的核心选图/裁剪/编码流程复用，参数化比例、目的和目标 ID；个人背景对应 USER_BACKGROUND 能力需以服务端支持为准。头像若保留裁剪名称，就提供实际取景；若只允许直接选择，应让名称与行为一致。

### L07：球队背景上传的提交、刷新和审核状态混在一起

位置：[cover.weapp.tsx:42](D:/MuDevSpace/XQ/src/pages/team-manage/cover.weapp.tsx:42)。证据：C05、C06。

已复现两个分支：

1. POST 已接受，但后续 onSaved 刷新失败，整个操作被当成保存失败。重试同一张图片时重新生成 clientSubmissionId，形成第二次提交。
2. 受控后端返回 PENDING，界面仍直接提示“球队背景已更新”，没有体现待审核。这里确认的是客户端忽略返回状态；未证明真实后台当前一定对该目的返回 PENDING。

建议拆成“提交是否已接受、展示数据是否刷新、是否待审核”三件事。同一草稿重试沿用稳定提交 ID，收到确定结果后才结束该动作；刷新失败时提示“已提交，显示更新失败”，不要诱导重新提交。

当前裁剪比例为 2.8:1，输出 1120×400；工程约定的目标尺寸是 2240×800。应与服务端要求核对后统一，不能仅凭比例一致判断整个上传契约一致。

### L08：旧只读请求器仍会用旧账号的 401 清除新账号

位置：[readonly-schedule.repository.ts:431](D:/MuDevSpace/XQ/src/features/readonly-schedule/readonly-schedule.repository.ts:431)。证据：C08；对照正确性 C10。

旧赛事/球队目录使用自己的 requestApi。A 发出的请求迟到返回 401，会无条件 clearSession；测试中后来建立的 B 会话被删除。主 product.repository 的原生请求有返回时的账号校验，C10 已确认可以拒绝旧账号响应。

这是两套请求实现实际产生的不一致，不只是目录风格问题。建议让旧只读仓库也通过统一请求内核，保留其 DTO 转换，避免各仓库复制鉴权、异常、缓存和请求头逻辑。

### L09：缺失时间、延期比赛和异常会话的兜底仍不正确

证据：C09、C28、C13。

- [readonly-schedule.repository.ts:363](D:/MuDevSpace/XQ/src/features/readonly-schedule/readonly-schedule.repository.ts:363) 把未知开赛时间转换为 Unix epoch。测试得到 1970-01-01，后续格式化不再知道它原本是“待定”。应在领域层保留 null。
- [home-display.logic.weapp.ts:34](D:/MuDevSpace/XQ/src/pages/index/home-display.logic.weapp.ts:34) 的 upcoming 通过排除少数状态生成，仍包括 POSTPONED 和 DRAFT。测试中延期比赛排在正常未来赛程前。应显式定义允许参与焦点排序的状态。
- [session.ts:17](D:/MuDevSpace/XQ/src/features/product/session.ts:17) 对 Invalid Date 比较得到 false，导致无效 expiresAt 被接受。应要求时间可解析且尚未过期。这不等于服务端鉴权可绕过，但会产生错误登录态。

### L10：帖子图片加载失败后，更新图片地址也不会重新出现

位置：[product-ui/index.tsx:261](D:/MuDevSpace/XQ/src/components/product-ui/index.tsx:261)。证据：C34。

imageFailed 一旦为 true 就把 images 清空，但没有随帖子/图片地址变化恢复。测试给同一帖子换成新地址仍没有图片。保留 panel 的架构会让这份失败状态存活更久。

建议失败状态按图片地址或资源版本管理，地址变化和明确重试时重置；头像和队徽也要区分“没有地址”和“地址加载失败”。

### L11：退出后个人首页快照仍留在本地 Storage

位置：[get-cache-store.weapp.ts:43](D:/MuDevSpace/XQ/src/features/product/get-cache-store.weapp.ts:43)、[session.ts:40](D:/MuDevSpace/XQ/src/features/product/session.ts:40)。证据：C31。

快照会保存 /public/home 的完整返回值，viewer 可包含个人信息。退出只清 session，旧快照未删除。测试使用虚构学号验证残留，没有读取真实用户数据。

建议持久化时排除不需要的个人字段，并在退出时清理相应账号快照。现有账号隔离 key 应保留；本轮没有证明正常游客界面可以直接读取另一个账号的快照。

## 四、加载与流畅度：最值得做的优化

### P01：消息轮询把持续读取和持续写入混成一次刷新

位置：[messages/screen.weapp.tsx:98](D:/MuDevSpace/XQ/src/pages/messages/screen.weapp.tsx:98)、[product.repository.ts:673](D:/MuDevSpace/XQ/src/features/product/product.repository.ts:673)。证据：C21、C33。

私信详情每 8 秒同时获取会话列表、通知列表，并 PUT readConversation。即使没有新的未读内容，也重复写已读。写入又令全局 GET 缓存标旧并增加代次。

两个观察结果：

- 两轮正常详情轮询产生 2 次标已读写请求、2 次会话列表、2 次通知列表。
- 当 PUT 先于同时发出的两个 GET 完成时，主请求器正确地拒用失效代次，两个 GET 会重新请求：原本 2 GET + 1 PUT 变成 4 GET + 1 PUT。

请求器的代次保护应保留。优化应从调用方入手：用已有 getMessages 做读取，有新的未读内容时才标记；详情页按需同步当前会话，不必每轮拉全部通知和会话目录；列表和通知使用各自刷新节奏。后续可以进一步收窄缓存失效范围。

当前代码已经在详情 inactive 或物理页面隐藏时停止轮询，C33 确认 inactive 时没有读取。这一点不应在重构时丢失。

### P02：赛事目录是 1 + 3N 请求，球队目录也拿了超出需要的数据

位置：[readonly-schedule.repository.ts:139](D:/MuDevSpace/XQ/src/features/readonly-schedule/readonly-schedule.repository.ts:139)、[readonly-schedule.repository.ts:283](D:/MuDevSpace/XQ/src/features/readonly-schedule/readonly-schedule.repository.ts:283)。证据：C07。

赛事列表先取清单，再为每项取详情、全部赛程和球队。3 个赛事需要 10 次请求；任意一项失败会使整个 Promise.all 失败。球队目录还通过 getTournament 间接取这三类数据，只为展示球队列表。

建议按渐进顺序改进：先展示赛事基础信息，用户进入详情再取赛程和球队；球队目录直接使用 listTeams。若确实必须展示计数，可先保留占位并渐进补充，或由现有 API 提供轻量摘要。不要为了列表第一屏一次拉齐所有赛事的深层资料。

### P03：缺头像的球员列表会为每名球员请求完整详情

位置：[player-face.weapp.tsx:33](D:/MuDevSpace/XQ/src/components/native-ui/player-face.weapp.tsx:33)、[readonly-team-detail/screen.weapp.tsx:112](D:/MuDevSpace/XQ/src/pages/readonly-team-detail/screen.weapp.tsx:112)。证据：C36。

打开球员 tab 时，缺少头像和肖像的每个 NativePlayerFace 都调用 getPlayer。测试 12 名球员触发 12 次完整详情请求；这些请求的目的只是尝试找到一张小图。

建议优先使用名单接口已经提供的图片与默认头像。确需补图时让名单携带轻量展示地址，或只对屏幕附近的行补查并控制并发。用户真的打开球员档案时再获取完整技术、动态和赛程数据。

### P04：内部内容页全部挂载，主面板也会长期累计保留

位置：[content-pager.weapp.tsx:140](D:/MuDevSpace/XQ/src/components/native-navigation/content-pager.weapp.tsx:140)、[main-pager.weapp.tsx:165](D:/MuDevSpace/XQ/src/components/native-navigation/main-pager.weapp.tsx:165)。证据：C22。

NativeContentPager 无条件渲染所有 pages，测试当前 index=0 时 5 个子页全部挂载。球队动态、完整赛程、名单、统计一起建立节点；球队管理中隐藏阵容页也可能开始自己的读取。主面板的 loaded Set 只增加，最终保留全部五屏。

邻页预热有助于切页，不能简单全部删掉。建议分开“预热数据”和“挂载完整节点”：首屏及相邻页按预算挂载，远页保留轻量占位；恢复必要的 tab、scroll 和草稿状态。保存中的表单与已访问表单要有明确保留策略。

### P05：手势热路径在逻辑线程反复更新 React 状态

位置：[main-pager.weapp.tsx:155](D:/MuDevSpace/XQ/src/components/native-navigation/main-pager.weapp.tsx:155)、[content-pager.weapp.tsx:178](D:/MuDevSpace/XQ/src/components/native-navigation/content-pager.weapp.tsx:178)、[swipe-drawer.weapp.tsx](D:/MuDevSpace/XQ/src/components/native-navigation/swipe-drawer.weapp.tsx)。

主轨道每次移动 setState，并广播指示器事件；内部轨道同时更新 transform 和容器高度；抽屉另有 16ms 定时弹簧。React 侧最终还要经过小程序渲染桥。源码无法证明这些路径在中低端真机也达到流畅帧率。

建议先测量，再减少每帧工作：每帧最多提交一次轨道位置，只通知当前需要的指示器，低频测量高度，把结束时的业务状态更新与连续位置更新分开。若测量证明原生 Swiper 更合适，可先替换无脏数据确认需求的纯浏览子页；有草稿保护的页保留自己的选择确认逻辑。

不建议为了“流畅”立即引入新的动画框架，也不建议把所有手势强行交给同一个巨型控制器。

### P06：首页、球队动态、收藏和聊天没有实际分页预算

首页直接把 home.posts 全量分列；球队动态和名单 map 全量条目；收藏一次读取全部 items；聊天每轮替换完整返回列表。首页没有触底分页处理。图片 lazyLoad 不会减少文字与组件节点数量。

建议先设定首屏渲染批量、渐进展开和列表长度预算，尽量保留现有 API。只有数据量确实超过当前响应方式时，再补后端 cursor 分页与增量消息。聊天需保留历史滚动位置，不能每次增量都强制跳到底。

分列函数 alternatingColumns 使用两次 filter 和循环 shift；大量条目下存在额外数组搬移。可以用两个游标保持当前顺序规则。C29 已确认现有算法不丢条目、不重复、不修改原数组，这些行为应保留。

### P07：图片重复读取，发布前才检查合计大小

位置：[images.weapp.ts:39](D:/MuDevSpace/XQ/src/features/native-social/images.weapp.ts:39)、[compose/screen.weapp.tsx:144](D:/MuDevSpace/XQ/src/pages/compose/screen.weapp.tsx:144)。证据：C27。

选图时先整张读成 Base64 做大小校验并丢弃，发布时再读一次。测试一张图有两次 Base64 读取。多图发布 Promise.all 先编码所有图片，再检查合计是否超过 24,000,000 字符，超限时也已经承担了分配成本。

建议先用文件大小和尺寸元数据校验，发布时只编码一次，并限制同时处理数量。不要把大量 Base64 长期放在 React state。若后端支持独立媒体上传，可进一步改为先传媒体、发布只提交地址；需要后端契约支持，不能单方面改客户端。

部分选图失败时现有代码会清理已经保存的文件，C26 已通过；owned 与 saved 两种文件的释放路径也通过 C20。优化时要保留这些恢复能力。

### P08：长期状态缺少明确上限，热路径还有可省的同步 Storage 操作

证据：C12、C14。

- 详情 history 没有条数上限，entry.state 可保存整份详情数据。测试连续追加 1,000 条仍全部保留；这里只证明保留策略，不声称真实用户已打开这么多页面或发生内存崩溃。
- productGetCache 没有容量淘汰；2 分钟预览判断不等于移除旧 Map 条目。
- readSession 每次读取都先同步删除 legacy key。测试 100 次读取产生 100 次删除操作。迁移清理应尽量放到启动或首次恢复阶段。

建议明确最近详情、缓存条数/字节和快照字段预算。保留位置和必要草稿，不必无限保留整份远端对象。同步 Storage 不应出现在可以使用已验证内存快照的高频路径。

## 五、精简建议：哪些地方值得收，哪些不要盲删

### S01：优先移出仍注册在正式工程中的实验页

位置：[quick-report/index.tsx:35](D:/MuDevSpace/XQ/src/pages/quick-report/index.tsx:35)、[app.config.ts:16](D:/MuDevSpace/XQ/src/app.config.ts:16)。

快速录报页为 1,085 行的 Spike，使用固定 match-spike-001、固定组织和用户、模拟服务器与网络/删除失败按钮。源码清楚标明这是实验，不是已对接的真实比赛录报。静态查找中，除路由注册外没有发现其他正式入口引用它。

建议将实验页和模拟仓库移到工程外归档或独立实验工程，生产路由只保留可使用功能。保留有价值的草稿恢复、版本冲突纯函数和验证思路；真实信息员录报应另接真实比赛、账号、权限和审核接口。不要把 Mock 的“提交成功”当成业务完成。

### S02：11 个高优先级遗留候选，合计约 57.8 KB / 2,595 行

证据：[simplification-candidates.json](./simplification-candidates.json)。以下是 weapp 平台解析下未发现运行时入口的候选，**不是可以直接批量删除的清单**。

| 候选组 | 文件 | 建议处理 |
|---|---|---|
| 旧聊天抽屉 | messaging-drawer/index.tsx、index.scss、index.weapp.scss | 现有原生消息已由独立 screen 承担，核实类型引用后清理旧抽屉实现和样式 |
| 通用头像裁剪占位 | avatar-cropper/index.tsx、index.scss | 明确只保留原生实现；必要类型先移到中性 types 文件 |
| 旧举报弹窗 | report-modal/report-modal.shared.tsx、index.scss | 核对当前原生 ReportModal 已完整覆盖后清理旧实现 |
| 旧偏好存储 | settings-dialog/preferences.h5.ts | 原生有自己的 preferences.weapp，避免两套未说明关系的默认值与持久化 |
| 旧页面样式 | pages/login/index.scss、player-detail/index.scss、readonly-team-detail/index.scss | 核实没有样式间接依赖，再清理被原生样式替代的部分 |

全图有 72 个未出现在运行时遍历中的源码节点，但其中包含自动发现的 page config、纯类型定义和平台薄入口，不能宣称 72 个都是废代码。源码清理主要降低维护成本，加载收益应通过成功产物和请求变化验证。

### S03：把 H5 命名与浏览器分支从原生领域逻辑中分离

当前有 12 个 `.h5.*` 文件，其中 8 个在静态运行时图可达，另有仅类型引用的文件。这与本工程明确的 weapp-only 约定不一致。

可达的许多 `.h5` 文件实际上提供通用业务逻辑，例如消息分类、校园身份请求、邮件认证、首发转换。建议先逐项判断用途：纯逻辑改为中性模块；浏览器媒体/DOM 实现移出本工程；原生必需类型移到 types。不能只按文件名删除仍在使用的业务逻辑。

product.repository 766 行、public-shell.shared 758 行和 me.shared 776 行都保留大量 Web/原生分支。建议按平台职责拆出真正需要的原生部分，减少无效的运行时判断。当前已删除 services/types 两层，而 AGENTS 仍要求该分层；应统一请求内核与类型归属，避免规范和实际结构继续分叉。

### S04：优先合并有实际差异风险的重复逻辑

| 重复区域 | 已发现的实际问题 | 最小建议 |
|---|---|---|
| 两套网络请求器 | 旧只读仓库丢失切号保护，错误和缓存策略不同 | 共用请求内核，保留领域 DTO 映射 |
| 三套水平拖动计算 | 中断收尾策略不同，主分页已锁住滚动 | 共用纯手势状态和投影/取消函数，保留各自边界政策 |
| 页面 load/sequence/cache/error | 多个详情屏重复维护，逻辑 Tab 激活遗漏 | 先对浏览详情抽取小型读取 Hook；不要把编辑提交也塞进去 |
| 图片选择/压缩/读取 | MIME 与异步方式不同，重试 ID 不同 | 一个受控图片准备流程，上传目的与裁剪参数独立 |
| 名单/资料 discard | dirty 清理和实际数据恢复脱节 | 同一份恢复函数用于初始化与放弃 |

相同的 1 行页面 re-export 和页面配置是 Taro 注册的薄入口，不值得为了省几行再套复杂路由生成器。两段相似回调也不一定值得抽象；应优先解决上表中会造成行为不一致的重复。

### S05：控制公共样式叠加的维护成本

public-shell/index.scss 约 1,322 行，app-box-sizing.weapp.scss 约 937 行，再叠加页面和 native-social 样式。建议先统一滚动高度、安全区域、遮罩与表单的基础约定，再清理重复覆盖。不能仅凭选择器相似就删除仍影响原生布局的规则。

本轮不建议重做视觉设计；这里只关注过多覆盖对滚动行为、构建顺序和后续维护的影响。

## 六、19 个注册页面的操作检查矩阵

本表说明源码中能追到什么，不表示 19 页均已完成真机验收。构建阻断修复后，应同时测试“从主容器打开的详情”和“直接进入注册页面”两种路径；它们的滚动宿主和生命周期不同。

| 页面 | 源码中的加载和手势组织 | 点击/写入闭环 | 当前重点 |
|---|---|---|---|
| login | 原生登录 ScrollView、键盘高度适配、Canvas 场景；隐藏时停止动画 | 账号登录、邮箱登录、注册、恢复密码有处理器 | 类型错误；头像以外的登录背景不是用户上传入口；恢复凭据须后端核验 |
| index | 主容器五屏横向轨道；首页使用外层 NativeRefreshScroll | 搜索、焦点比赛、公告、发帖入口、帖子详情、首页点赞可追踪 | 拖动中断恢复、逻辑 Tab 可见刷新、全量 feed |
| data-center | 薄入口转到主容器 data；内部 Swiper 展示积分/射手/助攻 | 球员和球队档案、赛季赛事选择 | 内外手势竞争、长榜单节点、返回后刷新 |
| my-team | 薄入口转到主容器 team；关注条和内嵌球队/球员档案 | 关注管理、设置主队、选择球队/球员有处理器 | 页面保留后的数据更新、缺头像请求扩散 |
| me | 薄入口转到主容器 me；加载 home + me，渲染原生资料组件 | 头像、资料、身份、邮箱、消息、收藏、设置、退出有入口 | 个人背景没有上传动作；失效状态与写后刷新 |
| player-detail | 详情状态/选中 tab 可恢复；四个内容页 | 球队、动态、自己的球员资料编辑可追踪 | 动态点赞未接、全部内容挂载、图片补查 |
| post-detail | 缓存/预览先展示，再读取完整详情 | 点赞、评论、回复、举报、菜单、转发有处理器 | 长评论、图片失败恢复、写成功后的收尾 |
| readonly-tournaments | 旧只读仓库加载目录，状态 loading/ready/failed | 赛事详情入口存在 | 1+3N 请求、无共享缓存、旧账号 401 |
| readonly-tournament-detail | 旧仓库读取详情/赛程/球队 | 赛程和球队目录入口存在 | 重复取深层数据、部分错误导致全页失败 |
| readonly-schedule | 薄入口转到主容器 schedule；过滤器及原生列表 | 比赛和筛选入口存在 | 可见刷新、筛选后滚动与列表预算 |
| readonly-teams | 经 getTournament 取得球队再本地搜索 | 球队详情入口存在 | 可直接用 listTeams，避免额外赛程读取 |
| readonly-match-detail | 评分/事件/阵容内部内容页；详情宿主提供纵向滚动 | 球队、球员、媒体、比赛评论评分有处理器 | 直接入口与宿主路径分别验收；长事件与媒体加载 |
| readonly-team-detail | 动态/赛程/球员/数据/资料五页 | 关注、主队、入队等操作可追踪 | 动态点赞未接、人员图请求、内容全部挂载 |
| quick-report | 固定上下文的实验页，独立保存与冲突演示 | 只操作 Mock 服务状态与本地草稿 | 应移出正式路由；不算真实信息员业务闭环 |
| team-manage | 先并发读管理工作台/球队档案/名单，内部三页 | 资料、球队背景、阵容计划、大名单提交有处理器 | 放弃名单未恢复；背景重试与审核状态；隐藏页预热 |
| person-detail | 用户主页、关联球员与动态 | 私信、球员关联与帖子进入有处理器 | 账号切换、长动态、共享 PostCard 默认动作 |
| messages | 活跃详情 8 秒轮询，主列表 20 秒；隐藏时停止 | 私信、通知已读、联系人、举报、相关内容跳转有处理器 | 持续写已读引发重读；历史列表增量；类别目前主要靠点击 |
| compose | 独立 ScrollView，按账号/范围保存文本与图片草稿 | 选图、表情、标签、转发、发布有处理器 | 多图编码成本、提交成功与退出失败分开、相册取消/超限 |
| favorites | 独立 ScrollView，首次加载并监听收藏变化 | 帖子详情、菜单有入口 | 点赞未接、无独立下拉刷新入口、列表预算 |

### 对“应该能点”的具体验收清单

1. **个人背景**：只有本人可进入编辑；选图取消不改现有图；取景比例一致；提交成功、待审核、展示刷新失败分别反馈；重试不重复提交。
2. **头像**：明确是否支持取景；PNG/JPEG 等 MIME 正确；图片过大在编码前提示；失败仍保留旧头像；成功后所有头像展示同步更新。
3. **球队背景**：正常展示入口与管理入口的权限边界明确；保存中禁止离开；成功提交后刷新失败可单独重试展示；不再次生成相同图片提交。
4. **帖子卡片**：首页、球队、球员、人物、收藏的点赞和评论能力一致；没有能力时明确禁用或提示；作者、队伍、标签与整张卡点击互不误触。
5. **名单**：放弃恢复服务器版本，继续编辑保留草稿；锁定名单不允许编辑；并发版本冲突明确提示；成功提交不得显示成失败。
6. **详情返回**：保留原 tab 和滚动位置；未保存内容先确认；取消离开不应无故滚到顶部。当前 NativeDetailTabs 会先触发 scrollNativeDetailTop，再等待调用方的异步确认，队长页需重点核验取消后的位置。
7. **叠层窗口**：第二层退出后第一层仍保持阻断；系统返回关闭最上层；保存中返回不丢状态；键盘先隐藏再处理页面返回。
8. **逻辑 Tab**：快速连续滑动、点击跨两页、打断动画、内页边缘向外切换、相册回来、切后台再回来，均恢复滚动。只测试正常手指松开不足以覆盖 L01。

## 七、建议采用的最小结构和整改顺序

### 第一轮：恢复可信的检查入口

修复 B01/B02，取得成功 weapp 构建。随后查看真实主包、页面 JS/WXSS、资源和依赖，而不是从源码行数推算包体。把 Mock 实验页从正式路由分离。暂不同时重做主界面。

验收：tsc 为 0；正式构建为 0；19 个正式/实验入口的范围明确；没有用空模块掩盖缺失逻辑。

### 第二轮：修复会破坏用户意图的状态错误

优先 L01、L02、L03、L04。抽出一个手势取消收尾、一个阻断层登记、一个名单恢复函数和一致的帖子动作入口。需要的是这些小而直接的公共机制，不是再建一套总控状态平台。

验收：复现步骤反向变为通过条件；取消、放弃、继续、保存中离开四个分支逐个检查。

### 第三轮：统一读取与面板生命周期

保留现有账号校验、in-flight 去重、ETag 和变更代次；让旧仓库复用它们。浏览页使用统一的资源键与“可见时按年龄读取”策略，保留旧内容和独立错误反馈。消息读写拆开，列表请求按实际页面需要收缩。

可考虑的小型读取接口只负责：资源 key、已有快照、读取函数、当前可见性、错误与重试。编辑表单、提交幂等和权限确认继续由业务层负责，避免一个 Hook 参数越来越多。

### 第四轮：统一图片准备和提交结果

共享选择、文件信息、尺寸约束、实际 MIME、裁剪参数和异步读取；提交结果区分接受/审核/展示。客户端动作 ID 与当前草稿对应，在确定结果之前保持稳定。

验收：JPEG/PNG/GIF、超大图、取消选择、压缩失败、配额不足、上传超时、服务端接受后刷新失败、待审核等场景分别有明确结果。仅在服务端支持的情况下增加个人背景提交。

### 第五轮：安全清理遗留实现

按 S02 逐组核对入口与类型使用，先移动仍用的类型，再移除旧运行时。每组清理后检查构建、路由和相关动作。清理源文件的收益和运行加载收益分别记录。

不要为了精简删除这些已经有效的能力：

- 主请求器拒绝切号前旧响应，C10 通过。
- 并发 GET 去重，C11 通过。
- 返回后新开详情会截断前进历史，C15 通过。
- 明显纵向手势不会触发横向切页，C16 通过。
- 媒体缩放保留已有 query，C17 通过。
- 联赛时间按 UTC+8，C18 通过。
- 草稿按组织和账号隔离，C19 通过。
- 部分图片失败回收、owned/saved 文件清理，C20/C26 通过。
- 隐藏面板不执行刷新、保存忙状态阻止离开，C25/C30 通过。
- 图片选择有互斥锁，C35 通过。

## 八、真机与真实接口验收方案

下列是建议验收方案，不是本轮实测结果。无需一开始全面重建测试框架，先用固定数据量和短操作流程拿到可比较记录。

### 流畅度与加载

| 场景 | 要记录什么 | 合格方向 |
|---|---|---|
| 冷启动到首页 | 第一帧反馈、关键请求数量、资源字节、可交互时间 | 尽早显示反馈；不等待未访问赛事的全部深层数据 |
| 已缓存 Tab 返回 | 页面是否空白、是否按年龄静默刷新 | 已有内容立即可见；过期后能更新 |
| 长列表 | 节点数、图片请求、每批渲染数、触底行为 | 首屏受控；不因打开 tab 同时创建整个历史列表 |
| 手指连续拖动 | 帧耗时分布、长任务、桥接提交频率 | 手势热路径每帧工作可控；中断后可滚动 |
| 30 次详情进入/返回 | 历史条目、内存趋势、请求次数、滚动恢复 | 保留需要的状态，避免无限保留整份详情 |
| 弱网和断网 | 超时反馈、重试、草稿、已提交判定 | 不误报成功/失败；重试不产生额外业务记录 |

帧率需要在目标 Android/iOS 微信设备上测，不可用桌面 Node 执行时间替代。目标可以先设为点击立即有反馈、缓存返回不白屏、拖动没有明显长卡顿，再结合设备能力确定毫秒预算。

### 最小真实业务闭环

- 游客浏览 → 登录 → 主队/关注 → 页面激活时更新。
- 作者发布 → 首页出现 → 打开详情 → 评论/点赞/收藏 → 返回原位置。
- 个人头像/背景及球队背景上传 → 状态反馈 → 重新进入仍显示正确资源。
- 队长编辑名单 → 放弃/恢复 → 保存 → 提交审核 → 锁定后只读。
- 信息员选择真实比赛 → 提交事件 → 管理员审核 → 比分与统计同步；当前 Spike 不能替代这条链。
- 私信发送 → 确认服务端接收 → 消息列表更新 → 标记已读；历史滚动不被轮询打断。

应使用独立测试账号和测试赛事；没有对应后端能力时记录阻碍与待核验项，不用模拟返回冒充联调成功。

## 九、补充安全与工程边界

- 恢复密码界面实际调用姓名、学号、新密码的匿名重置方法，未携带独立恢复凭据。需优先核验后端是否另有可靠验证及限流；本轮没有真实改密测试，也不能仅据前端认定可盗号。可参考 [OWASP 密码恢复指南](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)。
- 网络请求仍散布在 features 中，未落实当前工程要求的 services 收敛。L08 已显示重复请求策略会带来实际缺陷，应优先统一行为，再决定目录迁移范围。
- 没有把看到浏览器同名 API 就一律当成原生崩溃。URLSearchParams 已由本地 Taro 4.2 的 MiniWebpackPlugin 注入运行时实现，C17 按此配置验证；不能将裸 Node 沙箱缺少某个全局当成真实微信缺陷。
- 原生登录 Canvas 已有页面隐藏暂停与卸载销毁逻辑，未把它报告成“始终后台运行”。是否影响登录输入流畅度仍需目标设备测量。
- 本轮没有重新进行依赖漏洞数据库扫描，未把旧轮次的漏洞数量或结论带入本报告。审计重点为当前功能逻辑与精简方案。

## 十、证据与原目录状态

报告和全部脚本位于工程外。本轮基线包含 **39,135 个文件、4,837 个目录**，开始时已有 **411 条 Git 状态记录**；这些已有工作不应被重置、提交或清理。

证据索引：

- [源码和平台导入图](./inventory.json)
- [精简候选明细](./simplification-candidates.json)
- [类型检查原始日志](./typecheck.log)
- [正式构建原始日志](./build.log)
- [36 项验证及分类](./test-results.json)
- [可复跑检查脚本](./checks.cjs)
- [隔离执行环境说明及实现](./test-kit.cjs)
- [原目录前后状态核验](./immutability.json)

### 最终核验结果与例外

截至最终完整快照，`.git` 之外的原目录文件与目录新增、删除、变化均为 **0**；代码、资源、配置、依赖和原有产物的路径、内容摘要及修改时间一致。真实业务数据未被写入。测试和报告均在工程外。

**整个目录完全一致这一要求未通过，原因是 Git 元数据发生了额外变化。** 核验期间先出现一条未改变远端对象指向的重复日志，已备份并恢复该部分；后续快照又出现 Git 对象、索引和 commit/reset 日志变化。本轮没有执行 commit/reset 命令，其来源未确认；没有继续删除这些对象或重写索引以追求对比归零，也没有回滚用户代码或分支。

最后一次完整快照记录 `.git` 内新增 281 个条目、变化 320 个条目，分支指针文件内容未变。最终 Git 状态从 411 条变为 408 条，差异是三个 SVG 不再显示为修改：home-visual/nav-icons.svg、navigation/unselected-team.svg、profile-icons/settings.svg；这三个文件本身的内容和修改时间均与基线一致。

详细记录：[final-integrity-summary.json](./final-integrity-summary.json)、[git-background-final-state.json](./git-background-final-state.json)、[git-metadata-restoration.json](./git-metadata-restoration.json)。因此本报告只确认源码及工作文件没有改动，不宣称 Git 状态或整个文件夹完全未变。

按用户要求立即交付，停止扩展检查。工程外独立构建副本、测试脚本和证据保留在本报告同级目录；没有把审计产物写进原工程。
