---
tags:
  - markdown
  - studio
---

# ZCode Markdown Studio

> 打开 **实时预览**（Live Preview）并启用插件，试试直接编辑这篇笔记。

## 简洁且信息密集的排版

在编辑过程中，标题、**加粗**、*斜体*、`inline code`、[链接](https://obsidian.md) 和 [[双链]] 仍然是原生 Obsidian Markdown。选中一段文字试试浮动工具栏。

### 任务清单

- [x] 原生 Markdown 文件
- [x] 选区浮动工具栏
- [x] 在空行输入 `/` 插入区块
- [ ] 自己动手编辑这篇文档

### 紧凑的表格

| 模块 | 作用 | 状态 |
| :--- | :--- | :--- |
| Live Preview | 所见即所得式编辑 | 可用 |
| Slash 菜单 | 快捷插入 | 可用 |
| 外观控制 | 紧凑 / 舒适 | 可用 |

## 代码块

```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
console.log(greet('Obsidian'));
```

> [!tip] 原生功能优先
> 公式、双链、附件、图表继续由 Obsidian 负责渲染。插件只增强视觉和编辑交互。

## 数学公式

$$
E = mc^2
$$

## Mermaid

```mermaid
flowchart LR
  A[Markdown 源文件] --> B[Obsidian Live Preview]
  B --> C[Studio 视觉与交互]
```

---

尝试在下方单独输入 `/`，然后用 ↑ ↓ 和 Enter 选择要插入的区块：

