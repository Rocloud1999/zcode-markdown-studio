# ZCode Markdown Studio — Obsidian 插件（非官方）

让 Obsidian 的原生 **Live Preview（实时预览）** 更接近 ZCode 的紧凑、克制、清晰的 Markdown 阅读与编辑体验。

> **定位**：一个可直接安装、可修改的 v0.1.0 原型，不是 ZCode 官方产品，也不是对其前端源码或 Streamdown React 渲染器的移植。

## 立即安装（无需 Node.js）

1. 在本仓库点击 **Code → Download ZIP**，解压项目源码（也可以执行 `git clone https://github.com/Rocloud1999/zcode-markdown-studio.git`）。
2. 找到你的 Obsidian 库目录，进入 `<Vault>/.obsidian/plugins/`（如果 `plugins` 不存在，先建立），在里面创建 `zcode-markdown-studio/` 文件夹。
3. 从下载的项目根目录复制 **`manifest.json`、`main.js`、`styles.css`** 三个文件到该插件文件夹，得到：

   ```text
   <Vault>/.obsidian/plugins/zcode-markdown-studio/
   ├── manifest.json
   ├── main.js
   └── styles.css
   ```

4. 重新启动 Obsidian，打开「**设置 → 第三方插件 / Community plugins**」，允许第三方插件并开启「**ZCode Markdown Studio**」。
5. 打开「**设置 → 编辑器 → 默认编辑模式**」，选择 **实时预览（Live Preview）**，打开任意 `.md` 笔记开始编辑。

Windows：`<Vault>\\.obsidian\\plugins\\`；macOS/Linux：`<Vault>/.obsidian/plugins/`。

如果找不到 `.obsidian` 文件夹，请在文件管理器里显示隐藏文件。请先备份知识库，建议先在测试库试用。

## 已实现

- **实时所见即所得式编辑**：基于 Obsidian 官方 Live Preview；标题、粗体、列表、图片、表格等仍由 Obsidian 负责渲染与编辑，保留撤销历史、光标、文件保存、双链和插件生态。
- **统一外观**：实时预览与阅读视图、代码块、表格、引用、callout、内联代码、图片、数学公式的紧凑样式。
- **选中文字浮动工具栏**：加粗、斜体、行内代码、链接、引用、列表。也可在 Obsidian 命令面板搜索 `Studio` 调用编辑命令。
- **`/` 插入菜单**：在**空白行**输入一个 `/`，打开菜单，可用 ↑ ↓ / Enter 选择标题、任务清单、表格、代码块、Mermaid、LaTeX、分割线等。输入 Esc 可关闭。按键适用于标准英文斜杠 `/`。
- **阅读视图增强**：表格悬停复制为 Markdown、代码语言标签、单击图片预览。Live Preview 中按 `Alt` + 单击图片，可预览而不干扰普通编辑。
- **设置选项**：启停、舒适/紧凑密度、内容宽度、工具栏、斜杠菜单、阅读增强；可从功能区画笔图标快速启停。
- **零运行时第三方依赖**：不加载网络 JS、不发送笔记数据；只依赖 Obsidian 内置 API。

## 使用示例

`demo/Markdown-Studio-体验.md` 可以复制到库中试用。

### 选区操作

1. 在 Live Preview 中选中词句。
2. 在浮动条点击粗体、斜体、代码、链接等。
3. 选中的内容会被改成 Markdown 源文本，Live Preview 负责呈现结果。

### Slash 菜单

1. 在新的一行键入 `/`（允许 0–3 个缩进空格）。
2. 用鼠标选一个区块，或用上下方向键和 Enter 选择。
3. 原本的 `/` 被 Markdown 模板替换，光标跳到预设编辑位置。

### 插入命令

按 `Ctrl/Cmd + P`，搜索「Studio」，可看到各种编辑命令，适合自定义快捷键。

## 源代码 / 开发

`src/main.js` 是全部插件逻辑源码，`styles.css` 是主题。为降低使用与审计门槛，此原型采用原生 CommonJS JavaScript，**无需 npm install**。

```bash
cd zcode-markdown-studio
npm test        # Node.js 自带 node:test 的逻辑测试
npm run build   # 将 src/main.js 构建为插件入口 main.js
```

开发时把本项目放在 `<Vault>/.obsidian/plugins/zcode-markdown-studio/`，编辑后执行 `npm run build` 并重新加载插件。

## 限制与已知边界

- **不是 Typora/Milkdown 类独立编辑内核**。所见即所得基于 Obsidian 原生 Live Preview：将光标移到当前 Markdown 语法处时，原始标记可能暂时显示。这是刻意保留的可编辑行为。
- 不会重写 Obsidian 的 Markdown 解析器，不追求 ZCode 前端逐像素复刻；复杂的合并单元格/HTML 表格复制为 Markdown 时可能丢失结构。
- 已测试 Node 代码语法与纯逻辑单测；**没有在真实 Obsidian 1.5+ GUI 中进行集成测试**。建议先在测试库试用，发现冲突可以在插件设置中禁用样式。
- 其他主题/插件可能覆盖 CSS；如果样式未生效，请先排查 CSS snippets 和主题冲突。
- `id` 和显示名称为本原型用途，未提交 Obsidian 社区插件目录，需要手动安装。

## 设计与授权说明

设计原则参考 [ZCode 官方 DESIGN.md](https://github.com/zai-org/ZCode/blob/main/DESIGN.md)：语义化颜色、14px 左右的紧凑正文层级、4px 间距节奏、弱边框、深浅色兼容、阅读可辨性。这里只**重新编写** CSS 和交互代码，没有复制 ZCode 的业务实现、图片、字体、图标文件或原始 CSS，也不包含其商标素材。

[ZCode 原仓库 NOTICE](https://github.com/zai-org/ZCode/blob/main/NOTICE.md) 说明第一方源码为 Apache-2.0，第三方素材及依赖需分别遵守各自许可。此插件自己的原创代码以 [MIT](LICENSE) 许可发布，并运行于用户已安装的 Obsidian 环境。图标调用 Obsidian 内置的 `setIcon` API，没有捆绑第三方图标文件。

本项目与 ZCode / Z.ai 无隶属或背书关系。
