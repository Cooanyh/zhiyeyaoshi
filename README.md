# 四川省执业药师继续教育脚本

本仓库维护两个平台的独立用户脚本，支持 ScriptCat（脚本猫）和 Tampermonkey。请按实际进入的学习平台选择安装，详细教程分别维护在各自的说明文档中。

**主脚本**

[![主脚本 近24小时安装](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fscriptcat.org%2Fapi%2Fv2%2Fscripts%2F3660&query=%24.data.today_install&label=%E8%BF%9124%E5%B0%8F%E6%97%B6%E5%AE%89%E8%A3%85&color=brightgreen&style=flat&cacheSeconds=300)](https://scriptcat.org/zh-CN/script-show-page/3660) [![主脚本 总安装](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fscriptcat.org%2Fapi%2Fv2%2Fscripts%2F3660&query=%24.data.total_install&label=%E6%80%BB%E5%AE%89%E8%A3%85&color=brightgreen&style=flat&cacheSeconds=300)](https://scriptcat.org/zh-CN/script-show-page/3660) [![主脚本 脚本猫版本](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fscriptcat.org%2Fapi%2Fv2%2Fscripts%2F3660&query=%24.data.script.version&label=%E8%84%9A%E6%9C%AC%E7%8C%AB%E7%89%88%E6%9C%AC&color=5967bf&style=flat&cacheSeconds=300)](https://scriptcat.org/zh-CN/script-show-page/3660)

**金航联脚本**

[![金航联脚本 近24小时安装](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fscriptcat.org%2Fapi%2Fv2%2Fscripts%2F3827&query=%24.data.today_install&label=%E8%BF%9124%E5%B0%8F%E6%97%B6%E5%AE%89%E8%A3%85&color=brightgreen&style=flat&cacheSeconds=300)](https://scriptcat.org/zh-CN/script-show-page/3827) [![金航联脚本 总安装](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fscriptcat.org%2Fapi%2Fv2%2Fscripts%2F3827&query=%24.data.total_install&label=%E6%80%BB%E5%AE%89%E8%A3%85&color=brightgreen&style=flat&cacheSeconds=300)](https://scriptcat.org/zh-CN/script-show-page/3827) [![金航联脚本 脚本猫版本](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fscriptcat.org%2Fapi%2Fv2%2Fscripts%2F3827&query=%24.data.script.version&label=%E8%84%9A%E6%9C%AC%E7%8C%AB%E7%89%88%E6%9C%AC&color=5967bf&style=flat&cacheSeconds=300)](https://scriptcat.org/zh-CN/script-show-page/3827)

## 选择脚本

| 脚本 | 适用网站 | 独立说明 | 安装 |
| --- | --- | --- | --- |
| 主脚本 | `www.sclpa.cn`、`zyys.ihehang.com` | [主脚本 README](https://github.com/Cooanyh/zhiyeyaoshi/blob/main/README-main.md) | [GitHub](https://raw.githubusercontent.com/Cooanyh/zhiyeyaoshi/main/zhiyeyaoshi.user.js) · [脚本猫](https://scriptcat.org/zh-CN/script-show-page/3660) · [Greasy Fork](https://greasyfork.org/zh-CN/scripts/540285) |
| 金航联脚本 | `sc.mtnet.com.cn` | [金航联 README](https://github.com/Cooanyh/zhiyeyaoshi/blob/main/README-jhl.md) | [GitHub](https://raw.githubusercontent.com/Cooanyh/zhiyeyaoshi/main/JHL-zyys.user.js) · [脚本猫](https://scriptcat.org/zh-CN/script-show-page/3827) |

## 两脚本功能对比

**金航联版目前保留基础课程与 AI 考试辅助，尚未同步主脚本 1.3.7 的全能托管和考试纠错流程。** 两个脚本分别维护版本号，金航联版的 1.5.2 不代表功能比主脚本 1.3.7 更新或更完整。

| 功能 | 主脚本 1.3.7 | 金航联版 1.5.2 |
| --- | --- | --- |
| 视频倍速 | 支持 1–16 倍设置，包含 H5 倍速保护 | 倍速不可用；面板中的倍率设置不代表实际生效 |
| 视频静音与后台播放处理 | 支持静音，尝试恢复后台暂停 | 支持静音，包含旧版后台防暂停处理 |
| 课程与考试快捷导航 | 专业课、公需视频、公需文章及两类考试 | 专业课、公需视频及两类考试，无独立文章入口 |
| 全能托管 | 按五个阶段推进，并保存当前阶段 | 未实现，需分别选择任务入口 |
| 公需课分类遍历 | 包含分类切换与未完成内容遍历 | 未实现主脚本的分类遍历流程 |
| AI 答题 | 包含题目提取、答案选择与提交 | 支持题目提取、答案填写与交卷，提供手动确认及可选自动模式 |
| 考试失败纠错 | 尝试提取错题、请求 AI 修正并重新作答 | 未实现 |
| 已确认答案记忆 | 重试时优先使用记忆答案 | 未实现 |
| 重试上限与失败场次汇总 | 可配置重试次数，跳过耗尽场次并汇总提示 | 未实现 |

金航联版的自动模式会在交卷后返回列表，但没有主脚本的考试结果识别与纠错重试流程。未通过的考试需要自行核对并按平台要求处理，不能把“自动交卷”视为“自动通过”。

如果可以选择学习平台，并且需要上述新增功能，优先考虑主脚本适配的平台；已经使用金航联平台的用户应安装金航联脚本。主脚本不能直接替代金航联版，两个平台的页面结构和流程不同。

安装后请确认脚本已启用，避免同时运行多个副本。

## 问题反馈

通过 [GitHub Issues](https://github.com/Cooanyh/zhiyeyaoshi/issues) 反馈，注明脚本名称、版本、浏览器、脚本管理器及复现步骤。请隐藏密码、API Key、Cookie 和个人信息。

## 使用边界与许可

用于个人学习及网页自动化研究，与学习平台无隶属关系。请遵守平台规则，核验自动化结果，不用于未授权访问或恶意请求。

自 1.2.13 起采用 [CC BY-NC-SA 4.0](https://github.com/Cooanyh/zhiyeyaoshi/blob/main/LICENSE)：使用和修改需署名，禁止商业使用，衍生作品须以相同许可分享。更早版本请查看对应历史许可。
