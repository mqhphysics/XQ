# 修复总结（2026-10-25）

依据：`docs/audit-report.md`，加上前几轮的只读审查结果。

## 结果

| 检查 | 修复前 | 修复后 |
| --- | --- | --- |
| `npm run typecheck` | 16 个错误 | 0 个错误 |
| 正式构建 `NODE_ENV=production taro build --type weapp` | 失败（Sass 找不到 `./styles/weapp-ui`） | 成功，退出码 0 |
| 注册页面数 | 19 | 18（移出了 mock 实验页） |

构建日志里还有一组 `mini-css-extract-plugin` 的公共样式顺序冲突提示，审计报告 B01 也记录过，不影响构建结果，这次没有处理。

## 改动清单

### 构建与类型阻断（B01、B02）

- 新增 `src/styles/weapp-ui.scss`：从原 monorepo（`D:/MuDevSpace/xiaoqiu/apps/mini-program/src/styles/`）恢复的原文件，没有自己补写空文件。
- 新增 `src/components/verification-badge/football.svg`：`weapp-ui.scss` 引用了它，同样从原仓库恢复。
- 新增 `src/types/assets.d.ts`：统一声明 png、jpg、webp、svg、gif 五种图片模块。
- 删除 3 个只覆盖部分格式的旧声明：`assets/match-media/assets.d.ts`、`assets/search-icons/assets.d.ts`、`components/auth-scene/assets.weapp.d.ts`。
- 7 处 `'../../../../../packages/contracts/src/product-config'` 改为 `'@/product-config'`。本地的 `src/product-config.ts` 与原仓库 contracts 逐字一致。涉及的文件：`features/product-config/` 下 6 个，以及 `pages/login/login.shared.tsx`。

### 逻辑缺陷

| 编号 | 文件 | 问题 | 修复 |
| --- | --- | --- | --- |
| L01 | `components/native-navigation/main-pager.weapp.tsx` | 横向拖动途中弹窗或键盘出现时，`dragging` 不会复位，页面再也无法上下滚动 | 拖动被阻断时调用 `cancel()`；`cancel()` 里补上 `setDragging(false)` |
| L02 | `features/native-navigation/index.weapp.ts` | 两层弹窗叠放时，关掉上层就把底层翻页解锁了 | 遮罩状态由布尔值改为计数，最后一层关闭才解锁 |
| L03 | `pages/team-manage/squad.weapp.tsx` | 大名单选「放弃修改」后，号码仍显示改过的值，保存按钮却变灰 | 抽出 `resetEntries`，初始化和放弃都调用它，按服务器名单重建并清掉错误提示 |
| — | 同上 | `Object.hasOwn` 在 iOS 15.4 以下不存在，大名单页会白屏 | 改为 `p.playerId in entries` |
| S01 | `app.config.ts` | `quick-report` 是接 mock 数据的实验页，却注册在正式路由里 | 从路由里移除（源文件保留，代码里也没有跳转入口） |

## 验证情况

- 已验证：`tsc --noEmit` 通过；正式构建成功，产出 18 个页面。
- 没有验证：没有在微信开发者工具模拟器或真机上运行；L01、L02、L03 没有做手动复现测试。建议按 `audit-report.md` 第六节的验收清单测一遍：拖动中弹窗、叠层弹窗、大名单放弃。

## 仍需处理

1. 包体积。正式构建的 `dist` 约 2.6MB，超过 2MB 主包限制。模拟器应该能跑，但真机预览和上传大概率会被拒（没有实际验证）。主要是 4 张本地大图，共约 1.1MB：
   - `login-art/stadium-particle-plate.weapp.png`
   - `home-visual/home-campus-action.webp`
   - `home-visual/home-team-celebration.webp`
   - `home-visual/home-team-huddle.webp`

   做法：把这些图改为走媒体网关，再配置分包。这是下一步最优先的事。
2. 审计报告里这次没做的条目：
   - L04 共享帖子卡片点赞无效
   - L05 返回 Tab 不刷新
   - L06、L07 背景上传闭环
   - L08 旧只读仓库 401 误清会话
   - L09 时间兜底、延期比赛、会话校验
   - L10 图片失败状态不恢复
   - L11 退出登录后快照残留
   - P01–P08 加载与流畅度
   - S02–S05 遗留代码清理
3. 子 agent 审查补充（详见本次会话记录）：
   - 消息页下拉刷新在发送中会卡在转圈状态
   - 首页点赞读的是过期状态
   - `.native-reaction-heart`、`.native-badge` 没有样式（`weapp-ui.scss` 恢复后需复查是否已覆盖）
   - 草稿每输入一个字就同步写一次 Storage
   - quick-report 的并发加载和缺少 try/catch，若要正式上线需要重写

## 备份

改动前的完整源码备份在 `D:/MuDevSpace/XQ-backup-20261025-203351`（不含 node_modules、dist、.git），确认没问题后可以删掉。
