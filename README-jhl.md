# 四川执业药师 · 金航联平台脚本

适用于 `sc.mtnet.com.cn`，提供视频课程导航、章节切换、静音控制，以及 AI 考试辅助。支持 ScriptCat（脚本猫）和 Tampermonkey。

[![金航联脚本 近24小时安装](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fscriptcat.org%2Fapi%2Fv2%2Fscripts%2F3827&query=%24.data.today_install&label=%E8%BF%9124%E5%B0%8F%E6%97%B6%E5%AE%89%E8%A3%85&color=brightgreen&style=flat&cacheSeconds=300)](https://scriptcat.org/zh-CN/script-show-page/3827) [![金航联脚本 总安装](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fscriptcat.org%2Fapi%2Fv2%2Fscripts%2F3827&query=%24.data.total_install&label=%E6%80%BB%E5%AE%89%E8%A3%85&color=brightgreen&style=flat&cacheSeconds=300)](https://scriptcat.org/zh-CN/script-show-page/3827) [![金航联脚本 脚本猫版本](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fscriptcat.org%2Fapi%2Fv2%2Fscripts%2F3827&query=%24.data.script.version&label=%E8%84%9A%E6%9C%AC%E7%8C%AB%E7%89%88%E6%9C%AC&color=5967bf&style=flat&cacheSeconds=300)](https://scriptcat.org/zh-CN/script-show-page/3827)

[安装金航联脚本](https://raw.githubusercontent.com/Cooanyh/zhiyeyaoshi/main/JHL-zyys.user.js) · [脚本猫发布页](https://scriptcat.org/zh-CN/script-show-page/3827) · [问题反馈](https://github.com/Cooanyh/zhiyeyaoshi/issues)

## 与主脚本的差距

**金航联版保留基础课程与 AI 考试辅助，尚未同步主脚本的新功能。视频倍速目前不可用。** 面板中的倍率滑块目前不能实现有效倍速。

| 功能 | 金航联版 1.5.2 | 主脚本 1.3.7 |
| --- | --- | --- |
| 视频倍速 | 不可用 | 支持 1–16 倍设置及 H5 倍速保护 |
| 全能托管 | 未实现，分别选择任务入口 | 按五个阶段处理课程和考试，并保存阶段 |
| 公需课分类遍历 | 未实现主脚本的遍历流程 | 支持 |
| 独立文章入口 | 无 | 支持 |
| 考试失败纠错与答案记忆 | 未实现 | 尝试修正错题，保留已确认答案 |
| 重试上限与失败场次汇总 | 未实现 | 可配置次数，跳过耗尽场次并汇总 |

两个脚本独立维护版本号，**1.5.2 不代表比 1.3.7 功能更完整**。如果可以选择学习平台，且需要这些新增功能，可考虑主脚本适配的 `zyys.ihehang.com` 平台，详见[主脚本说明](https://github.com/Cooanyh/zhiyeyaoshi/blob/main/README-main.md)。主脚本不能直接在金航联平台使用。

## 已有功能

- **快捷导航**：专业课视频、公需科目视频、专业课考试和公需课考试。
- **课程处理**：筛选未完成课程，进入学习，检测章节进度并切换下一未完成章节。
- **播放控制**：提供静音开关，并尝试恢复暂停的视频；后台运行仍受浏览器和平台限制。
- **AI 考试助手**：提取题目、请求 AI、填写答案，支持手动确认和可选自动模式。
- **手动提问**：在考试助手中单独输入问题，查看 AI 返回结果。
- **服务开关**：启停自动化服务，保存任务选择、播放设置及 AI 配置。

## 安装与使用

1. 安装 [ScriptCat（脚本猫）](https://scriptcat.org/) 或 [Tampermonkey](https://www.tampermonkey.net/)。
2. 从 [GitHub 安装链接](https://raw.githubusercontent.com/Cooanyh/zhiyeyaoshi/main/JHL-zyys.user.js) 或[脚本猫发布页](https://scriptcat.org/zh-CN/script-show-page/3827)安装金航联脚本。
3. 登录金航联平台并刷新页面，确认出现控制面板。服务首次使用默认开启，静音默认开启。
4. 需要 AI 功能时，在控制面板输入 DeepSeek API Key，输入完成后点击输入框外部即可保存。
5. 点击所需课程或考试的快捷入口。课程流程按所选任务查找未完成内容。
6. 进入考试页后，在 AI 助手中点击“开始自动答题”。请核对答案和平台结果。

安装后请确认脚本已启用，避免同时运行多个副本。

### 考试模式

- **手动确认模式（默认）**：请求 AI 后，点击“确认并填写答案”，检查已选答案，再点击“确认并交卷”。
- **自动模式**：勾选自动模式后，仍需点击答题按钮启动当前考试的处理；助手会依次请求 AI、填写答案和交卷，随后返回列表。

自动模式选择会保存在脚本管理器中。它没有主脚本的失败识别和纠错重试流程，交卷后返回列表不代表考试通过。若未通过，需人工核对并按平台要求处理，平台可能要求重新学习对应课程。

## AI 配置与数据

- 默认接口为 `https://api.deepseek.com/chat/completions`，默认模型为 `deepseek-v4-flash`，并关闭思考模式；可用性取决于服务商及账号权限。
- API Key 和设置保存在脚本管理器的本地存储中；AI 功能会向配置接口发送题目、选项或手动提问内容。
- 视频课程处理不需要 API Key。不要把真实 Key 写入源码或反馈截图。
- 如需更换服务商或模型，请参考[更换 AI 模型教程](https://p.kdocs.cn/s/HNQBR5RAACAEW)。

## 常见问题

### 调整滑块后仍然没有倍速

这是金航联版当前的已知限制。倍率滑块和保存值不代表播放器实际倍率，也不保证缩短平台记录的学习时长。

### 为什么每次考试还要点击按钮

进入考试页后会创建考试助手，但不会自动启动当前考试的 AI 请求。自动模式控制点击答题按钮后的填写和交卷流程，不等于主脚本的全能托管。

### 考试失败后会不会自动纠错

不会。当前版本没有错题修正、已确认答案记忆、有限次数重试或失败汇总，需要自行处理未通过场次。

### 面板未出现或课程不继续

确认当前域名为 `sc.mtnet.com.cn`、脚本已启用且服务处于运行状态，再刷新页面。网页结构变化、跨域播放器或浏览器后台限制都可能影响功能，请提供复现步骤和已隐藏个人信息的报错。

## 问题反馈与许可

请通过 [GitHub Issues](https://github.com/Cooanyh/zhiyeyaoshi/issues) 反馈，注明“金航联版”、脚本版本、浏览器、脚本管理器、复现步骤和实际结果。截图及日志中请隐藏密码、API Key、Cookie 和个人信息。

本项目用于个人学习及网页自动化研究，与平台无隶属关系。请遵守平台规则，核验自动化结果，不用于未授权访问或恶意请求。当前版本采用 [CC BY-NC-SA 4.0](https://github.com/Cooanyh/zhiyeyaoshi/blob/main/LICENSE)，使用和修改需署名，禁止商业使用，衍生作品须以相同许可分享。
