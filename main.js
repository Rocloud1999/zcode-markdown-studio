'use strict';

// ZCode Markdown Studio (unofficial) — dependency-free Obsidian plugin.
// The only runtime module used is Obsidian's public Plugin API.
const { Plugin, PluginSettingTab, Setting, MarkdownView, Notice, setIcon } = require('obsidian');

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  density: 'comfortable',
  maxWidth: 900,
  showSelectionToolbar: true,
  enableSlashMenu: true,
  decorateReadingView: true,
});

const SLASH_ITEMS = Object.freeze([
  { id: 'h1', icon: 'heading-1', label: '一级标题', hint: '# 标题', text: '# 标题', caret: 2 },
  { id: 'h2', icon: 'heading-2', label: '二级标题', hint: '## 标题', text: '## 标题', caret: 3 },
  { id: 'h3', icon: 'heading-3', label: '三级标题', hint: '### 标题', text: '### 标题', caret: 4 },
  { id: 'bullet', icon: 'list', label: '项目列表', hint: '- 列表项', text: '- 列表项', caret: 2 },
  { id: 'task', icon: 'list-checks', label: '任务清单', hint: '- [ ] 任务', text: '- [ ] 任务', caret: 6 },
  { id: 'quote', icon: 'quote', label: '引用', hint: '> 引用文本', text: '> 引用文本', caret: 2 },
  { id: 'table', icon: 'table', label: '三列表格', hint: 'Markdown 表格', text: '| 列 1 | 列 2 | 列 3 |\n| :--- | :--- | :--- |\n| 内容 | 内容 | 内容 |', caret: 2 },
  { id: 'code', icon: 'code-2', label: '代码块', hint: '```代码```', text: '```javascript\n\n```', caret: 14 },
  { id: 'mermaid', icon: 'workflow', label: 'Mermaid 图', hint: '流程图', text: '```mermaid\nflowchart LR\n  A[开始] --> B[完成]\n```', caret: 24 },
  { id: 'math', icon: 'sigma', label: '数学公式', hint: '$$ LaTeX $$', text: '$$\nE = mc^2\n$$', caret: 3 },
  { id: 'divider', icon: 'minus', label: '分割线', hint: '---', text: '---', caret: 3 },
]);

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function textLineFrom(editor, line) {
  return editor.getLine(line) || '';
}

// Markdown fences are not arbitrary slash-command containers.
function isInsideFence(editor, lineIndex) {
  let open = null;
  for (let line = 0; line < lineIndex; line++) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(textLineFrom(editor, line));
    if (!match) continue;
    const fence = match[1];
    if (!open) {
      open = { ch: fence[0], length: fence.length };
    } else if (fence[0] === open.ch && fence.length >= open.length && /^\s*$/.test(match[2])) {
      open = null;
    }
  }
  return Boolean(open);
}

function insideSlashTrigger(editor) {
  if (editor.somethingSelected()) return null;
  const pos = editor.getCursor();
  const line = textLineFrom(editor, pos.line);
  const match = /^(\s{0,3})\/$/.exec(line);
  if (!match || pos.ch !== line.length || isInsideFence(editor, pos.line)) return null;
  return { line: pos.line, fromCh: match[1].length, toCh: line.length };
}

function offsetPos(editor, absoluteOffset) {
  return editor.offsetToPos(clamp(absoluteOffset, 0, editor.getValue().length));
}

function replaceWithSelection(editor, inserted, startOffset, selectFrom, selectTo) {
  editor.replaceSelection(inserted);
  editor.setSelection(offsetPos(editor, startOffset + selectFrom), offsetPos(editor, startOffset + selectTo));
  editor.focus();
}

function wrapSelection(editor, left, right = left, placeholder = '文本') {
  const from = editor.getCursor('from');
  const selected = editor.getSelection();
  const base = editor.posToOffset(from);
  const all = editor.getValue();
  // In Live Preview the selection usually excludes the Markdown markers.
  // Clicking the same command twice should remove, not duplicate, those markers.
  if (selected && base >= left.length
    && all.slice(base - left.length, base) === left
    && all.slice(base + selected.length, base + selected.length + right.length) === right) {
    const sourceFrom = base - left.length;
    const sourceTo = base + selected.length + right.length;
    editor.replaceRange(selected, offsetPos(editor, sourceFrom), offsetPos(editor, sourceTo));
    editor.setSelection(offsetPos(editor, sourceFrom), offsetPos(editor, sourceFrom + selected.length));
    editor.focus();
    return;
  }
  const body = selected || placeholder;
  const wrapped = left + body + right;
  replaceWithSelection(editor, wrapped, base, left.length, left.length + body.length);
}

function linkSelection(editor) {
  const from = editor.getCursor('from');
  const text = editor.getSelection() || '链接文字';
  const base = editor.posToOffset(from);
  const inserted = `[${text}](https://example.com)`;
  const urlFrom = text.length + 3;
  replaceWithSelection(editor, inserted, base, urlFrom, urlFrom + 'https://example.com'.length);
}

function changeLinePrefix(editor, prefix, pattern) {
  const from = editor.getCursor('from');
  const to = editor.getCursor('to');
  const endLine = to.line > from.line && to.ch === 0 ? to.line - 1 : to.line;
  if (endLine < from.line) return;
  const lines = [];
  for (let i = from.line; i <= endLine; i++) lines.push(textLineFrom(editor, i));
  const already = lines.every(line => pattern.test(line));
  const updated = lines.map(line => already ? line.replace(pattern, '') : prefix + line);
  const fromPos = { line: from.line, ch: 0 };
  const toPos = { line: endLine, ch: lines[lines.length - 1].length };
  editor.replaceRange(updated.join('\n'), fromPos, toPos);
  editor.setSelection({ line: from.line, ch: 0 }, { line: endLine, ch: updated[updated.length - 1].length });
  editor.focus();
}

function insertSnippet(editor, template, caretOffset) {
  const from = editor.getCursor('from');
  const selection = editor.getSelection();
  const base = editor.posToOffset(from);
  const before = from.ch !== 0 ? '\n' : '';
  const after = selection ? '' : '\n';
  const replacement = before + template + after;
  replaceWithSelection(editor, replacement, base, before.length + caretOffset, before.length + caretOffset);
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function renderedTableToMarkdown(table) {
  const trs = [...table.querySelectorAll('tr')];
  const rows = trs.map(tr => [...tr.children].filter(cell => /^(TD|TH)$/i.test(cell.tagName)).map(cell => escapeCell(cell.innerText || cell.textContent || '')));
  if (!rows.length) return '';
  const count = Math.max(1, ...rows.map(row => row.length));
  const normalize = row => [...row, ...Array(Math.max(0, count - row.length)).fill('')];
  const format = row => `| ${normalize(row).join(' | ')} |`;
  return [format(rows[0]), format(Array(count).fill('---')), ...rows.slice(1).map(format)].join('\n');
}

function makeButton(icon, tooltip, handler, text = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'zcm-icon-button';
  button.title = tooltip;
  button.setAttribute('aria-label', tooltip);
  setIcon(button, icon);
  if (text) {
    const span = document.createElement('span');
    span.textContent = text;
    button.append(span);
  }
  button.addEventListener('mousedown', event => event.preventDefault());
  button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); handler(); });
  return button;
}

class MarkdownStudio extends Plugin {
  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData() || {}) };
    this.selectionToolbar = null;
    this.slashMenu = null;
    this.slashIndex = 0;
    this.slashTarget = null;
    this.dismissedSlash = null;
    this.activeLightbox = null;
    this.raf = 0;

    this.applyAppearance();
    this.addSettingTab(new StudioSettingsTab(this.app, this));
    this.addRibbonIcon('paintbrush', '切换 ZCode 风格 Markdown', () => this.toggleEnabled());

    this.addCommand({ id: 'toggle-studio', name: '切换 ZCode Markdown Studio', callback: () => this.toggleEnabled() });
    this.addCommand({ id: 'bold', name: 'Studio：加粗选中文字', editorCallback: editor => wrapSelection(editor, '**') });
    this.addCommand({ id: 'italic', name: 'Studio：斜体选中文字', editorCallback: editor => wrapSelection(editor, '*') });
    this.addCommand({ id: 'inline-code', name: 'Studio：行内代码', editorCallback: editor => wrapSelection(editor, '`', '`', 'code') });
    this.addCommand({ id: 'link', name: 'Studio：插入链接', editorCallback: editor => linkSelection(editor) });
    this.addCommand({ id: 'quote', name: 'Studio：切换引用', editorCallback: editor => changeLinePrefix(editor, '> ', /^>\s?/) });
    this.addCommand({ id: 'bullet-list', name: 'Studio：切换列表', editorCallback: editor => changeLinePrefix(editor, '- ', /^[-*+]\s+/) });
    this.addCommand({ id: 'task-list', name: 'Studio：切换任务', editorCallback: editor => changeLinePrefix(editor, '- [ ] ', /^- \[[ xX]\]\s+/) });
    this.addCommand({ id: 'insert-table', name: 'Studio：插入表格', editorCallback: editor => insertSnippet(editor, SLASH_ITEMS.find(x => x.id === 'table').text, 2) });
    this.addCommand({ id: 'insert-code', name: 'Studio：插入代码块', editorCallback: editor => insertSnippet(editor, SLASH_ITEMS.find(x => x.id === 'code').text, 14) });
    this.addCommand({ id: 'insert-mermaid', name: 'Studio：插入 Mermaid', editorCallback: editor => insertSnippet(editor, SLASH_ITEMS.find(x => x.id === 'mermaid').text, 24) });

    this.registerDomEvent(document, 'selectionchange', () => this.scheduleUiUpdate());
    this.registerDomEvent(document, 'mouseup', () => this.scheduleUiUpdate());
    this.registerDomEvent(document, 'keyup', event => this.onKeyup(event));
    this.registerDomEvent(document, 'keydown', event => this.onKeydown(event), true);
    this.registerDomEvent(document, 'pointerdown', event => this.onPointerDown(event), true);
    this.registerDomEvent(document, 'scroll', () => this.scheduleUiUpdate(), true);
    this.registerDomEvent(window, 'resize', () => this.scheduleUiUpdate());
    this.registerDomEvent(document, 'click', event => this.onImageClick(event));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.hideUi()));
    this.registerEvent(this.app.workspace.on('layout-change', () => this.scheduleUiUpdate()));

    // Does not replace Obsidian's Markdown parser or edit/undo logic.
    this.registerMarkdownPostProcessor(el => this.decorateRenderedMarkdown(el));
  }

  onunload() {
    this.hideUi();
    this.cleanupDecoratedMarkdown();
    if (this.activeLightbox) this.activeLightbox();
    if (this.raf) window.cancelAnimationFrame(this.raf);
    document.body.classList.remove('zcm-enabled', 'zcm-compact');
    document.body.style.removeProperty('--zcm-max-width');
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.applyAppearance();
  }

  applyAppearance() {
    document.body.classList.toggle('zcm-enabled', Boolean(this.settings.enabled));
    document.body.classList.toggle('zcm-compact', this.settings.density === 'compact');
    document.body.style.setProperty('--zcm-max-width', `${clamp(Number(this.settings.maxWidth) || 900, 620, 1320)}px`);
    if (!this.settings.enabled || !this.settings.decorateReadingView) this.cleanupDecoratedMarkdown();
    if (!this.settings.enabled) { this.hideUi(); if (this.activeLightbox) this.activeLightbox(); }
    else this.scheduleUiUpdate();
  }

  async toggleEnabled() {
    this.settings.enabled = !this.settings.enabled;
    await this.saveSettings();
    new Notice(`Markdown Studio 已${this.settings.enabled ? '开启' : '关闭'}`);
  }

  getLiveEditor() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.editor || !this.settings.enabled) return null;
    const leafEl = view.containerEl;
    if (!leafEl || !leafEl.querySelector('.markdown-source-view.is-live-preview')) return null;
    return { editor: view.editor, leafEl };
  }

  editorHasFocus(leafEl) {
    const element = document.activeElement;
    return Boolean(element && leafEl.contains(element) && element.closest('.cm-editor'));
  }

  scheduleUiUpdate() {
    if (this.raf || !this.settings.enabled) return;
    this.raf = window.requestAnimationFrame(() => {
      this.raf = 0;
      this.updateSelectionToolbar();
      if (this.slashMenu) this.checkSlashMenu();
    });
  }

  hideUi() {
    this.hideSelectionToolbar();
    this.hideSlashMenu();
  }

  hideSelectionToolbar() {
    if (this.selectionToolbar) { this.selectionToolbar.remove(); this.selectionToolbar = null; }
  }

  updateSelectionToolbar() {
    const active = this.getLiveEditor();
    if (!active || !this.settings.showSelectionToolbar || !this.editorHasFocus(active.leafEl)) {
      this.hideSelectionToolbar(); return;
    }
    const { editor, leafEl } = active;
    const selection = window.getSelection();
    if (!editor.somethingSelected() || !selection || selection.isCollapsed || !selection.rangeCount || !selection.toString().trim()) {
      this.hideSelectionToolbar(); return;
    }
    const node = selection.anchorNode;
    const inEditor = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    if (!inEditor || !leafEl.contains(inEditor) || !inEditor.closest('.cm-content')) { this.hideSelectionToolbar(); return; }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) { this.hideSelectionToolbar(); return; }

    if (!this.selectionToolbar) {
      const bar = document.createElement('div');
      bar.className = 'zcm-selection-toolbar';
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'Markdown 格式工具栏');
      const items = [
        ['bold', '加粗', () => wrapSelection(editor, '**')],
        ['italic', '斜体', () => wrapSelection(editor, '*')],
        ['code', '行内代码', () => wrapSelection(editor, '`', '`', 'code')],
        ['link', '插入链接', () => linkSelection(editor)],
        ['quote', '引用', () => changeLinePrefix(editor, '> ', /^>\s?/)],
        ['list', '列表', () => changeLinePrefix(editor, '- ', /^[-*+]\s+/)],
      ];
      for (const [icon, label, action] of items) bar.append(makeButton(icon, label, () => {
        action(); this.hideSelectionToolbar();
      }));
      this.selectionToolbar = bar;
      document.body.append(bar);
    }
    const width = this.selectionToolbar.offsetWidth || 254;
    const x = clamp(rect.left + rect.width / 2 - width / 2, 8, Math.max(8, window.innerWidth - width - 8));
    const above = rect.top - 50;
    const y = above >= 8 ? above : Math.min(window.innerHeight - 48, rect.bottom + 9);
    this.selectionToolbar.style.left = `${Math.round(x)}px`;
    this.selectionToolbar.style.top = `${Math.round(y)}px`;
  }

  onKeyup(event) {
    if (!this.settings.enabled || !this.settings.enableSlashMenu || event.isComposing) return;
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key) && this.slashMenu) return;
    this.checkSlashMenu();
    this.scheduleUiUpdate();
  }

  onKeydown(event) {
    if (!this.slashMenu || event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.dismissedSlash = this.slashTarget ? { ...this.slashTarget } : null;
      this.hideSlashMenu();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation();
      this.slashIndex = (this.slashIndex + (event.key === 'ArrowDown' ? 1 : -1) + SLASH_ITEMS.length) % SLASH_ITEMS.length;
      this.renderSlashHighlight();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation();
      this.chooseSlash(SLASH_ITEMS[this.slashIndex]);
    }
  }

  onPointerDown(event) {
    if (this.slashMenu && !(event.target instanceof Element && this.slashMenu.contains(event.target))) {
      this.dismissedSlash = this.slashTarget ? { ...this.slashTarget } : null;
      this.hideSlashMenu();
    }
  }

  checkSlashMenu() {
    if (!this.settings.enableSlashMenu || !this.settings.enabled) { this.hideSlashMenu(); return; }
    const active = this.getLiveEditor();
    if (!active || !this.editorHasFocus(active.leafEl)) { this.hideSlashMenu(); return; }
    const trigger = insideSlashTrigger(active.editor);
    if (!trigger) { this.dismissedSlash = null; this.hideSlashMenu(); return; }
    if (this.dismissedSlash) {
      const same = this.dismissedSlash.editor === active.editor
        && this.dismissedSlash.line === trigger.line
        && this.dismissedSlash.fromCh === trigger.fromCh;
      if (same) return;
      this.dismissedSlash = null;
    }
    if (this.slashTarget && this.slashTarget.editor === active.editor && this.slashTarget.line === trigger.line && this.slashMenu) return;
    this.slashTarget = { editor: active.editor, ...trigger };
    this.slashIndex = 0;
    this.showSlashMenu(active.leafEl);
  }

  showSlashMenu(leafEl) {
    this.hideSlashMenu(false);
    const menu = document.createElement('div');
    menu.className = 'zcm-slash-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', '插入 Markdown 区块');
    const label = document.createElement('div');
    label.className = 'zcm-slash-label';
    label.textContent = '插入区块 · ↑↓ 选择 · Enter 确认';
    menu.append(label);
    SLASH_ITEMS.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'zcm-slash-option';
      button.dataset.index = String(index);
      button.setAttribute('role', 'option');
      const ico = document.createElement('span');
      ico.className = 'zcm-slash-option-icon';
      setIcon(ico, item.icon);
      const content = document.createElement('span');
      content.className = 'zcm-slash-option-label';
      content.textContent = item.label;
      const hint = document.createElement('span');
      hint.className = 'zcm-slash-option-hint';
      hint.textContent = item.hint;
      button.append(ico, content, hint);
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation(); this.chooseSlash(item);
      });
      menu.append(button);
    });
    document.body.append(menu);
    this.slashMenu = menu;
    const cursor = leafEl.querySelector('.cm-cursor-primary') || leafEl.querySelector('.cm-cursor');
    const rect = cursor?.getBoundingClientRect() || leafEl.getBoundingClientRect();
    const width = 300;
    let x = clamp(rect.left, 8, Math.max(8, window.innerWidth - width - 8));
    let y = rect.bottom + 12;
    if (y + 390 > window.innerHeight) y = Math.max(8, rect.top - 390);
    menu.style.left = `${Math.round(x)}px`;
    menu.style.top = `${Math.round(y)}px`;
    this.renderSlashHighlight();
  }

  renderSlashHighlight() {
    this.slashMenu?.querySelectorAll('.zcm-slash-option').forEach((el, index) => {
      const isCurrent = index === this.slashIndex;
      el.classList.toggle('is-selected', isCurrent);
      el.setAttribute('aria-selected', String(isCurrent));
      if (isCurrent) el.scrollIntoView({ block: 'nearest' });
    });
  }

  chooseSlash(item) {
    const target = this.slashTarget;
    if (!target || !item) { this.hideSlashMenu(); return; }
    const { editor, line, fromCh, toCh } = target;
    // Re-check before editing: a click may have changed the caret or the line.
    const current = textLineFrom(editor, line);
    if (current.slice(fromCh, toCh) !== '/') { this.hideSlashMenu(); return; }
    const base = editor.posToOffset({ line, ch: fromCh });
    editor.replaceRange(item.text, { line, ch: fromCh }, { line, ch: toCh });
    editor.setCursor(offsetPos(editor, base + item.caret));
    this.hideSlashMenu();
    editor.focus();
  }

  hideSlashMenu(clearTarget = true) {
    if (this.slashMenu) { this.slashMenu.remove(); this.slashMenu = null; }
    if (clearTarget) this.slashTarget = null;
  }

  async writeClipboard(text, what) {
    try { await navigator.clipboard.writeText(text); new Notice(`${what}已复制`); }
    catch (error) { console.error('[Markdown Studio] Clipboard copy failed', error); new Notice('复制失败：请检查剪贴板权限'); }
  }

  cleanupDecoratedMarkdown() {
    // Return existing renderer nodes to their original position on disable.
    document.querySelectorAll('.zcm-table-frame').forEach(frame => {
      const table = [...frame.children].find(el => el.tagName === 'TABLE');
      if (table) frame.replaceWith(table);
    });
    document.querySelectorAll('.zcm-code-frame').forEach(frame => {
      const pre = [...frame.children].find(el => el.tagName === 'PRE');
      if (pre) frame.replaceWith(pre);
    });
  }

  decorateRenderedMarkdown(el) {
    if (!this.settings.enabled || !this.settings.decorateReadingView) return;
    // Only wrapping completed render nodes; never mutates the Markdown file.
    el.querySelectorAll('table').forEach(table => {
      if (table.closest('.zcm-table-frame')) return;
      const parent = table.parentElement;
      if (!parent) return;
      const frame = document.createElement('div');
      frame.className = 'zcm-table-frame';
      parent.insertBefore(frame, table);
      frame.appendChild(table);
      frame.appendChild(makeButton('copy', '复制表格为 Markdown', () => this.writeClipboard(renderedTableToMarkdown(table), '表格')));
    });
    el.querySelectorAll('pre').forEach(pre => {
      if (pre.closest('.zcm-code-frame') || !pre.querySelector('code')) return;
      // Obsidian may already provide a copy button; do not add duplicate controls.
      const parent = pre.parentElement;
      if (!parent) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'zcm-code-frame';
      parent.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);
      const code = pre.querySelector('code');
      const langClass = [...code.classList].find(name => /^language-/.test(name));
      if (langClass) {
        const tag = document.createElement('span');
        tag.className = 'zcm-code-language';
        tag.textContent = langClass.slice('language-'.length).slice(0, 25);
        wrapper.appendChild(tag);
      }
    });
  }

  onImageClick(event) {
    if (!this.settings.enabled || !(event.target instanceof HTMLImageElement)) return;
    const image = event.target;
    const inReading = image.closest('.markdown-preview-view');
    const inLive = image.closest('.markdown-source-view.is-live-preview');
    if (!inReading && !(inLive && event.altKey)) return;
    if (image.closest('a') && !event.altKey) return;
    if (!image.naturalWidth || image.classList.contains('emoji')) return;
    event.preventDefault();
    event.stopPropagation();
    this.showImageLightbox(image);
  }

  showImageLightbox(image) {
    const overlay = document.createElement('div');
    overlay.className = 'zcm-lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', image.alt || '图片预览');
    overlay.setAttribute('aria-modal', 'true');
    const img = document.createElement('img');
    img.src = image.currentSrc || image.src;
    img.alt = image.alt || '';
    const close = makeButton('x', '关闭图片预览', () => stop());
    close.classList.add('zcm-lightbox-close');
    overlay.append(img, close);
    const onKey = event => { if (event.key === 'Escape') stop(); };
    if (this.activeLightbox) this.activeLightbox();
    const stop = () => {
      overlay.remove(); document.removeEventListener('keydown', onKey, true);
      if (this.activeLightbox === stop) this.activeLightbox = null;
    };
    this.activeLightbox = stop;
    overlay.addEventListener('click', event => { if (event.target === overlay) stop(); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    close.focus();
  }
}

class StudioSettingsTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'ZCode Markdown Studio' });
    containerEl.createEl('p', { text: '非官方设计风格适配：保留 Obsidian 原生实时预览编辑和 Markdown 源文件。' });
    new Setting(containerEl).setName('启用 Studio 风格').setDesc('同时调整实时预览和阅读视图').addToggle(toggle => toggle
      .setValue(this.plugin.settings.enabled).onChange(async value => { this.plugin.settings.enabled = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('排版密度').setDesc('紧凑模式更接近 ZCode 的高信息密度').addDropdown(dropdown => dropdown
      .addOption('comfortable', '舒适').addOption('compact', '紧凑')
      .setValue(this.plugin.settings.density).onChange(async value => { this.plugin.settings.density = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('编辑宽度').setDesc('仅影响 Markdown 内容区域').addSlider(slider => slider
      .setLimits(620, 1320, 20).setValue(this.plugin.settings.maxWidth).setDynamicTooltip()
      .onChange(async value => { this.plugin.settings.maxWidth = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('选区浮动工具栏').setDesc('在实时预览中选中文字时出现').addToggle(toggle => toggle
      .setValue(this.plugin.settings.showSelectionToolbar).onChange(async value => { this.plugin.settings.showSelectionToolbar = value; await this.plugin.saveSettings(); this.plugin.hideUi(); }));
    new Setting(containerEl).setName('/ 插入菜单').setDesc('在空白行输入 /，快速插入标题、表格、任务和代码块').addToggle(toggle => toggle
      .setValue(this.plugin.settings.enableSlashMenu).onChange(async value => { this.plugin.settings.enableSlashMenu = value; await this.plugin.saveSettings(); this.plugin.hideUi(); }));
    new Setting(containerEl).setName('增强阅读视图').setDesc('增加表格复制按钮和代码语言标识').addToggle(toggle => toggle
      .setValue(this.plugin.settings.decorateReadingView).onChange(async value => { this.plugin.settings.decorateReadingView = value; await this.plugin.saveSettings(); }));
    containerEl.createEl('p', { text: '请在「设置 → 编辑器 → 默认编辑模式」中选择「实时预览」，才能获得所见即所得编辑体验。关闭插件不会改变任何 Markdown 原文。', cls: 'setting-item-description' });
  }
}

module.exports = MarkdownStudio;
// Exposed solely for dependency-free Node smoke tests.
module.exports.__test = { DEFAULT_SETTINGS, SLASH_ITEMS, insideSlashTrigger, isInsideFence, wrapSelection, changeLinePrefix, linkSelection, insertSnippet, renderedTableToMarkdown, escapeCell };
