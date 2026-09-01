# 四川省执业药师继续教育脚本 - 进展文档

## 项目纳管初始化（2026-09-01）

### 已完成内容

- 已将上游仓库克隆至大项目下的独立目录 `zhiyeyaoshi`。
- 已核验 Git 远程 `origin` 指向 `https://github.com/Cooanyh/zhiyeyaoshi.git`，当前检出提交为 `9a55a0ef5cd7952169cd15a630e2ce0a21e4e9d3`。
- 已新增项目根目录 `Programs.md`，记录用途、上游来源、合规边界、运行/验证提示与独立管理约定。
- 已检查仓库根及其现有目录，未发现 `AGENTS.md`。

### 当前状态

- 项目已纳入“脚本猫”大项目，业务脚本未修改。
- 尚未执行浏览器端功能验证；本阶段仅完成仓库与文档初始化。

### 遇到的问题

- 仓库未发现可直接运行的测试或构建配置，后续功能改动应使用用户脚本管理器和授权页面进行真实验证。

### 下一步计划

- 收到明确功能需求后，在本子项目内评估并修改对应脚本。
- 每完成一个明确阶段继续更新本文件，并在功能完成后按项目流程进行变更检查、测试、提交和推送。

## 纳管文档版本管理（2026-09-01）

- 已检查本阶段变更，仅包括 `Programs.md` 与本进展记录，未涉及业务脚本。
- 下一步：以“docs: 初始化子项目说明与进展记录”提交并推送至该项目的既有 `origin`。

---

## v1.3.6 更新日志 (主脚本)

**更新日期**: 2026-04-24

### DeepSeek 模型升级

- 将模型从 `deepseek-chat` 升级为 `deepseek-v4-flash`
- 添加 `thinking: {"type": "disabled"}` 参数，关闭思考模式以获得更快响应
- 保留原有的 `temperature: 0.2` 参数配置
- 版本号: 1.3.5 → 1.3.6

### 修改位置
- 文件: `zhiyeyaoshi.user.js` 第 1356 行附近

### 代码变更
```javascript
// 修改前
const payload = {
    model: "deepseek-chat",
    ...
    temperature: 0.2
};

// 修改后
const payload = {
    model: "deepseek-v4-flash",
    ...
    temperature: 0.2,
    thinking: {"type": "disabled"}
};
```

### 备份文件
- 旧版本备份至: `Backup files/zhiyeyaoshi.user.js.bakv1.3.5`

---

## v1.5.2 更新日志 (金航联平台版本)

**更新日期**: 2026-04-24

### DeepSeek 模型升级

- 将模型从 `deepseek-chat` 升级为 `deepseek-v4-flash`
- 添加 `thinking: {"type": "disabled"}` 参数，关闭思考模式以获得更快响应
- 版本号: 1.5.1 → 1.5.2

### 修改位置
- 文件: `JHL-zyys.user.js` 第 431 行附近

### 代码变更
```javascript
// 修改前
data: JSON.stringify({ model: 'deepseek-chat', messages: [...], stream: false })

// 修改后
data: JSON.stringify({ model: 'deepseek-v4-flash', messages: [...], stream: false, thinking: {"type": "disabled"} })
```

### 备份文件
- 旧版本备份至: `Backup files/JHL-zyys.user.js.bakv1.5.1`

---

## Git 提交信息

```
commit d085f56
升级 DeepSeek 模型至 v4-flash 并关闭思考模式

- JHL-zyys.user.js: 将模型从 deepseek-chat 升级为 deepseek-v4-flash，添加 thinking: {type: disabled}
- zhiyeyaoshi.user.js: 将模型从 deepseek-chat 升级为 deepseek-v4-flash，添加 thinking: {type: disabled}，保留原有 temperature 参数
- JHL-zyys.user.js 版本更新至 1.5.2
- zhiyeyaoshi.user.js 版本更新至 1.3.6
- 备份旧版本至 Backup files 文件夹
```

---

## v1.3.0 更新日志 (历史)

**更新日期**: 2026-04-01

### 主要改进

#### 1. 全新现代化GUI界面

- 采用渐变色设计（紫色主题 #667eea → #764ba2）
- 圆角设计（16px圆角）
- 悬浮阴影效果，增强层次感
- 平滑动画过渡

#### 2. AI助手面板优化

- 绿色渐变主题
- 加载动画效果
- 优化输入框和结果显示区域

#### 3. 用户体验提升

- 动态脉冲动画显示服务运行状态
- 导航按钮图标+文字组合
- 直接在面板内配置API Key

---

**作者**: Coren  
**许可证**: CC BY-NC-SA 4.0  
**项目地址**: https://github.com/Cooanyh/zhiyeyaoshi
