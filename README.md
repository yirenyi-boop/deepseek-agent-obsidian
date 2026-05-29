# DeepSeek Agent for Obsidian

DeepSeek 驱动的 AI Agent 插件，能自主读写搜索 Obsidian 笔记，执行多步任务。

## 功能

- 🤖 **Agent 模式** — 自动规划、执行、观察的多步任务处理
- 📖 **总结笔记** — 一键总结当前笔记
- 📊 **生成周报** — 自动搜索日记并汇总
- 🔍 **全文搜索** — 搜索 vault 内容
- ✏️ **批量编辑** — 搜索替换、批量修改
- 📝 **创建笔记** — 根据已有内容生成新笔记
- 🧠 **V4 Pro 推理** — 支持 DeepSeek V4 Pro 深度思考模式

## 安装

### 通过 BRAT（推荐）

1. 安装 [BRAT](https://obsidian.md/plugins?id=obsidian42-brat) 插件
2. `设置 → BRAT → Add Beta plugin`
3. 输入 `你的GitHub用户名/deepseek-agent-obsidian`
4. 启用插件

### 手动安装

复制 `deepseek-agent/` 到 `.obsidian/plugins/` 目录

## 使用

1. `设置 → DeepSeek Agent` 中填写 API Key
2. 点击左侧 🤖 图标打开聊天面板
3. 输入任务或点击快捷按钮

## 配置

| 设置 | 说明 |
|------|------|
| API Key | [platform.deepseek.com](https://platform.deepseek.com/api_keys) 获取 |
| 模型 | V4 Flash（快速）/ V4 Pro（深度推理） |
| Thinking | V4 Pro 的深度思考模式 |
| Temperature | 生成随机性 0-2 |
