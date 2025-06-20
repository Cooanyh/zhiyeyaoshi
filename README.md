# 执业药师继续教育刷课脚本
### 由于个人需要，用ai配合简单写了一个用于四川省职业药师继续教育的刷课油猴插件，可能会有很多bug但是勉强能用，欢迎正好有需求又愿意捣鼓的大佬改进
### ！注意：以下功能介绍由AI生成
这是一个功能强大的油猴（Tampermonkey）脚本，专为四川省执业药师继续教育网站 [(www.sclpa.cn / zyys.ihehang.com](https://www.sclpa.cn/Default.aspx#)) 设计，旨在实现从课程学习到考试辅助的全流程自动化与智能化，大幅提升学习效率。

#### ✨ 核心功能
快速播放: 强制将视频和文章学习的计时速度提升至16倍，并默认静音播放。
##### 🧠 智能跳过:
自动识别并跳过课程列表页中已完成的课程。
##### 🕹️ 双模式切换:
仅视频模式 (默认/推荐): 课程（包含所有章节）完成后，自动返回课程列表，寻找下一个未完成的课程继续挂机，实现全自动循环学习。
完整模式: 课程完成后，自动点击“前往考试”，进入考试环节。（考试依然只能手动输入）
##### 🤖 AI问答助手（默认基于DeepSeek）:
在考试页面，提供一个可手动提问的AI助手面板。您可以将任何问题（包括题目、选项）复制粘贴进去，AI将直接提供答案。
##### 🚦 服务启停控制:
可在UI面板上一键暂停/启动脚本的全部自动化服务，随时掌控脚本状态。点击后将刷新页面以确保状态生效。
##### 🌐 全课程支持:
完美兼容“专业课程”和“公需课程”两大模块，包括视频和文章两种学习形式。
##### 🖱️ 便捷UI:
1,所有功能均通过一个可折叠、可拖拽的悬浮“控制面板”进行操作。
2 提供快速导航按钮，一键跳转到“专业课程”或“公需课程”页面。
3 离开考试页面后，AI助手会自动关闭，保持界面清爽。
4,服务开关: 可随时暂停或启动脚本的自动化功能。
5,模式切换: 根据您的需求选择“完整模式”或“仅视频模式”。
6,开始挂机: 在控制面板点击“专业课程”或“公需课程”导航按钮，脚本将自动开始执行。
#### 🚀 安装指南
安装脚本管理器:
**方式一：从 GreasyFork 安装：**
- 访问我的脚本发布页面 👉 [点击此处一键安装](https://greasyfork.org/zh-CN/scripts/540285-%E6%89%A7%E4%B8%9A%E8%8D%AF%E5%B8%88%E7%BB%A7%E7%BB%AD%E6%95%99%E8%82%B2%E8%84%9A%E6%9C%AC-v1-1-0)
- 点击绿色的“安装此脚本”按钮，Tampermonkey会自动接管。
  
**方式二：从scriptcat脚本猫安装 (最推荐）：**
- 访问我的脚本发布页面 👉 [点击此处一键安装](https://scriptcat.org/zh-CN/script-show-page/3660)
- 点击“安装脚本”，scriptcat脚本猫会自动接管
  
**方式三：从 GitHub 安装：**
- 访问我的GitHub项目：https://github.com/Cooanyh/zhiyeyaoshi
- 在代码文件中找到 .js 后缀的文件并点击打开。
- 点击 "Raw" 按钮，Tampermonkey会自动弹出安装界面。

#### 🛠️ 使用说明
1,安装完成后，访问四川省执业药师继续教育网站。
屏幕右下角会出现一个“控制面板”。**随后参考上方“便携UI”说明进行操作。
2,**配置API Key:
这是使用AI问答助手功能前的必须步骤。**
打开油猴扩展 -> 管理面板 -> 找到本脚本并点击“编辑”。
在代码的 AI_API_SETTINGS 部分，找到 API_KEY 字段，将其值替换为您自己的 DeepSeek API Key。或者更改api服务商。随后
**Ctrl + S**保存脚本。


#### v1.1.0 更新：
##### ui界面
1. “公需课程”导航细分：
旧的“公需课程”按钮被一分为二，变成了两个目标明确的独立按钮：
公需课-视频；
公需课-文章
2. 引入“记忆”与“自动标签页切换”
   上次的选择：当你点击“公需课-文章”后，脚本会“记住”你的目标是文章。
   智能切换标签：当脚本自动导航回“公需课程”页面时，它会首先自动点击“文章资讯”这个主标签页，然后再去“未完成”列表中寻找未读文章。
   无缝循环：这意味着，现在无论是挂机视频还是文章，脚本都能在同类别下进行无缝的、全自动的循环，不再需要任何手动干预


#### ⚠️ 免责声明
本脚本仅为学习和技术研究目的而创建，旨在简化重复性操作，提升学习效率。
请勿将此脚本用于任何商业或非法用途。
使用本脚本所造成的任何后果，包括但不限于账号风险，由使用者本人承担。开发者对此不负任何责任。
请遵守网站的相关规定，合理使用。

📄 许可证
本脚本基于 MIT License 开源。
