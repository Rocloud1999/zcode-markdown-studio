import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'src/main.js'), 'utf8');

function moduleFactory() {
  const mod = { exports: {} };
  class FakePlugin {
    constructor() { this.app = { workspace: { on() { return { off() {} }; }, getActiveViewOfType() { return null; } } }; this.commands = []; }
    async loadData() { return {}; }
    async saveData() {}
    addSettingTab() {}
    addRibbonIcon() {}
    addCommand(command) { this.commands.push(command); }
    registerDomEvent() {}
    registerEvent() {}
    registerMarkdownPostProcessor() {}
  }
  const fakeDocument = {
    querySelectorAll() { return []; },
    body: {
      classList: { toggle() {}, remove() {} },
      style: { setProperty() {}, removeProperty() {} },
    },
  };
  const fakeWindow = { requestAnimationFrame() { return 1; }, cancelAnimationFrame() {} };
  const context = vm.createContext({
    module: mod,
    exports: mod.exports,
    require: id => {
      if (id !== 'obsidian') throw new Error('Unexpected dependency: ' + id);
      return { Plugin: FakePlugin, PluginSettingTab: class {}, Setting: class {}, MarkdownView: class {}, Notice: class {}, setIcon() {} };
    },
    document: fakeDocument,
    window: fakeWindow,
    console,
    navigator: {},
  });
  vm.runInContext(source, context, { filename: 'src/main.js' });
  return mod.exports;
}

const PluginClass = moduleFactory();
const helpers = PluginClass.__test;

class Editor {
  constructor(text, start = 0, end = start) { this.text = text; this.a = start; this.b = end; }
  getValue() { return this.text; }
  getLine(line) { return this.text.split('\n')[line]; }
  posToOffset(pos) {
    return this.text.split('\n').slice(0, pos.line).reduce((sum, item) => sum + item.length + 1, 0) + pos.ch;
  }
  offsetToPos(offset) {
    const lines = this.text.slice(0, offset).split('\n');
    return { line: lines.length - 1, ch: lines.at(-1).length };
  }
  getCursor(what) {
    if (what === 'from') return this.offsetToPos(Math.min(this.a, this.b));
    if (what === 'to') return this.offsetToPos(Math.max(this.a, this.b));
    return this.offsetToPos(this.b);
  }
  getSelection() { return this.text.slice(Math.min(this.a, this.b), Math.max(this.a, this.b)); }
  somethingSelected() { return this.a !== this.b; }
  setSelection(a, b) { this.a = this.posToOffset(a); this.b = this.posToOffset(b); }
  setCursor(pos) { this.setSelection(pos, pos); }
  replaceSelection(inserted) {
    const lo = Math.min(this.a, this.b);
    const hi = Math.max(this.a, this.b);
    this.text = this.text.slice(0, lo) + inserted + this.text.slice(hi);
    this.a = this.b = lo + inserted.length;
  }
  replaceRange(inserted, from, to = from) {
    const lo = this.posToOffset(from); const hi = this.posToOffset(to);
    this.text = this.text.slice(0, lo) + inserted + this.text.slice(hi);
    this.a = this.b = lo + inserted.length;
  }
  focus() {}
}

test('plugin exports valid Obsidian class and registers functionality', async () => {
  const plugin = new PluginClass();
  await plugin.onload();
  const ids = plugin.commands.map(x => x.id);
  for (const id of ['toggle-studio', 'bold', 'inline-code', 'link', 'quote', 'insert-table', 'insert-mermaid']) {
    assert.ok(ids.includes(id), `missing ${id}`);
  }
  plugin.onunload();
});

test('wrap selection changes real Markdown and reselects just original text', () => {
  const editor = new Editor('hello world', 6, 11);
  helpers.wrapSelection(editor, '**');
  assert.equal(editor.text, 'hello **world**');
  assert.equal(editor.getSelection(), 'world');
});

test('empty selection creates editable placeholder', () => {
  const editor = new Editor('', 0);
  helpers.wrapSelection(editor, '`', '`', 'code');
  assert.equal(editor.text, '`code`');
  assert.equal(editor.getSelection(), 'code');
});

test('link command selects URL for immediate editing', () => {
  const editor = new Editor('OpenAI', 0, 6);
  helpers.linkSelection(editor);
  assert.equal(editor.text, '[OpenAI](https://example.com)');
  assert.equal(editor.getSelection(), 'https://example.com');
});

test('line formatting toggles multiple lines, retaining native text', () => {
  const editor = new Editor('one\ntwo\nthree', 0, 7);
  helpers.changeLinePrefix(editor, '> ', /^>\s?/);
  assert.equal(editor.text, '> one\n> two\nthree');
  helpers.changeLinePrefix(editor, '> ', /^>\s?/);
  assert.equal(editor.text, 'one\ntwo\nthree');
});

test('a selection ending at the next line boundary does not modify that line', () => {
  const editor = new Editor('A\nB\nC', 0, 2);
  helpers.changeLinePrefix(editor, '- ', /^[-*+]\s+/);
  assert.equal(editor.text, '- A\nB\nC');
});

test('slash trigger occurs on a sole slash, not in running prose', () => {
  const valid = new Editor('title\n  /', 9);
  assert.equal(helpers.insideSlashTrigger(valid).fromCh, 2);
  assert.equal(helpers.insideSlashTrigger(new Editor('test /', 6)), null);
  assert.equal(helpers.insideSlashTrigger(new Editor('//', 2)), null);
});

test('slash menu is disabled within Markdown fenced code regions', () => {
  const source = new Editor('```js\n/\n```', 7);
  assert.equal(helpers.isInsideFence(source, 1), true);
  assert.equal(helpers.insideSlashTrigger(source), null);
  const afterFence = new Editor('```js\nx\n```\n/', 13);
  assert.equal(helpers.isInsideFence(afterFence, 3), false);
  assert.notEqual(helpers.insideSlashTrigger(afterFence), null);
});

test('insert snippet positions the caret inside code block', () => {
  const editor = new Editor('Start\n', 6);
  const code = helpers.SLASH_ITEMS.find(x => x.id === 'code');
  helpers.insertSnippet(editor, code.text, code.caret);
  assert.ok(editor.text.includes('```javascript\n\n```'));
  assert.equal(editor.getCursor().line, 2);
});

test('Markdown GFM cell escaping prevents accidental extra columns', () => {
  assert.equal(helpers.escapeCell('a|b\nc'), 'a\\|b c');
});


test('Escape dismisses slash palette until the slash trigger changes', () => {
  const editor = new Editor('/', 1);
  const plugin = new PluginClass();
  plugin.settings = { ...helpers.DEFAULT_SETTINGS };
  plugin.slashTarget = { editor, line: 0, fromCh: 0, toCh: 1 };
  plugin.slashMenu = { remove() {} };
  plugin.getLiveEditor = () => ({ editor, leafEl: {} });
  plugin.editorHasFocus = () => true;
  let opened = 0;
  plugin.showSlashMenu = () => { opened++; };
  plugin.onKeydown({ key: 'Escape', preventDefault() {} });
  assert.equal(plugin.slashMenu, null);
  plugin.checkSlashMenu();
  assert.equal(opened, 0);
  editor.text = '/a'; editor.a = editor.b = 2;
  plugin.checkSlashMenu();
  assert.equal(plugin.dismissedSlash, null);
  editor.text = '/'; editor.a = editor.b = 1;
  plugin.checkSlashMenu();
  assert.equal(opened, 1);
});

test('full instantiation and unload require no downloaded dependencies', async () => {
  const plugin = new PluginClass();
  await plugin.onload();
  assert.equal(plugin.settings.enabled, true);
  assert.equal(typeof plugin.settings.maxWidth, 'number');
  plugin.onunload();
});


test('format toolbar removes existing emphasis when clicked twice', () => {
  const editor = new Editor('one', 0, 3);
  helpers.wrapSelection(editor, '**');
  assert.equal(editor.text, '**one**');
  helpers.wrapSelection(editor, '**');
  assert.equal(editor.text, 'one');
  assert.equal(editor.getSelection(), 'one');
});
