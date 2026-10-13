import { copyFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'src', 'main.js');
const output = join(root, 'main.js');
const code = await readFile(source, 'utf8');
if (!code.includes("require('obsidian')") || !code.includes('module.exports = MarkdownStudio;')) {
  throw new Error('Source does not match the expected Obsidian CommonJS entrypoint.');
}
await copyFile(source, output);
console.log('Built main.js (no dependencies required).');
