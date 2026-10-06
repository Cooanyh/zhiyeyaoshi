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

主脚本包含 H5 视频倍速、全能托管、公需分类遍历及考试失败纠错重试。**金航联版倍速不可用，尚未同步全能托管、错题纠正、答案记忆和失败汇总等功能。** 两个脚本独立维护版本号，不能按版本数字大小判断功能领先程度。

徽章读取脚本猫公开数据，会自动更新，可能有缓存延迟。GitHub 与各发布页版本可能不同步，安装后请核对实际版本，避免启用多个副本。

## 发布页同步

将对应的源码链接用于“源代码同步”，将对应 README 链接用于“默认附加信息”，格式选择 **Markdown**。链接跟随 `main` 分支，不固定到单次提交。

| 平台脚本 | 源代码同步 | 附加信息同步 |
| --- | --- | --- |
| 主脚本 | [zhiyeyaoshi.user.js](https://raw.githubusercontent.com/Cooanyh/zhiyeyaoshi/main/zhiyeyaoshi.user.js) | [README-main.md](https://raw.githubusercontent.com/Cooanyh/zhiyeyaoshi/main/README-main.md) |
| 金航联脚本 | [JHL-zyys.user.js](https://raw.githubusercontent.com/Cooanyh/zhiyeyaoshi/main/JHL-zyys.user.js) | [README-jhl.md](https://raw.githubusercontent.com/Cooanyh/zhiyeyaoshi/main/README-jhl.md) |

## 反馈与开发

通过 [GitHub Issues](https://github.com/Cooanyh/zhiyeyaoshi/issues) 反馈，注明脚本名称、版本、浏览器、脚本管理器及复现步骤。请隐藏密码、API Key、Cookie 和个人信息。

用户脚本直接安装运行，无需构建。修改后可执行以下静态检查，并在获得授权的真实页面验证对应流程：

```powershell
node --check .\zhiyeyaoshi.user.js
node --check .\JHL-zyys.user.js
git diff --check
```

## 使用边界与许可

用于个人学习及网页自动化研究，与学习平台无隶属关系。请遵守平台规则，核验自动化结果，不用于未授权访问或恶意请求。

自 1.2.13 起采用 [CC BY-NC-SA 4.0](https://github.com/Cooanyh/zhiyeyaoshi/blob/main/LICENSE)：使用和修改需署名，禁止商业使用，衍生作品须以相同许可分享。更早版本请查看对应历史许可。
