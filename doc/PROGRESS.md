# 四川省执业药师继续教育脚本 - 进展文档

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