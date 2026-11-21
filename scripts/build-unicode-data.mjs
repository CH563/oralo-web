// Rebuild only when intentionally updating the pinned Unicode data.
// Usage: node scripts/build-unicode-data.mjs [directory-with-source-txt-files]
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sources = {
  scripts: ['https://www.unicode.org/Public/16.0.0/ucd/Scripts.txt', '9e88f0a677df47311106340be8ede2ecdacd9c1c931831218d2be6d5508e0039'],
  categories: ['https://www.unicode.org/Public/16.0.0/ucd/extracted/DerivedGeneralCategory.txt', '7676ab755a41ef82108460238569e60ad65c191ddafe61b36c6765ec1353f293'],
  emoji: ['https://www.unicode.org/Public/emoji/16.0/emoji-test.txt', '24f0c534e86cf142e2496953e8f0e46a3e702392911eddcd29c6cced85139697'],
};
const data = {};
for (const [name, [url, hash]] of Object.entries(sources)) {
  const bytes = process.argv[2] ? await readFile(`${process.argv[2]}/${name}.txt`) : Buffer.from(await (await fetch(url)).arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error(`Unicode source hash mismatch: ${name}`);
  data[name] = bytes.toString('utf8');
}
function ranges(source, accepts) {
  const entries = [];
  for (const line of source.split('\n')) {
    const match = line.match(/^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*(\w+)/);
    if (match && accepts(match[3])) entries.push([parseInt(match[1], 16), parseInt(match[2] || match[1], 16)]);
  }
  entries.sort((a,b) => a[0] - b[0]);
  const merged = [];
  for (const [start,end] of entries) {
    const last = merged.at(-1);
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else merged.push([start,end]);
  }
  return merged.flat();
}
// A greedy prefix trie consumes complete emoji before classifying their components.
const trie = new Map();
for (const line of data.emoji.split('\n')) {
  const match = line.match(/^([0-9A-F ]+)\s*;/);
  if (!match) continue;
  const characters = match[1].trim().split(/\s+/).map(hex => String.fromCodePoint(parseInt(hex,16)));
  let node = trie;
  for (const char of characters) { if (!node.has(char)) node.set(char, new Map()); node = node.get(char); }
  node.set('', true);
}
function expression(node) {
  const branches = [];
  for (const [char, children] of node) if (char) branches.push(char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + expression(children));
  const result = branches.length > 1 ? `(?:${branches.join('|')})` : branches[0] || '';
  return node.has('') && result ? `(?:${result})?` : result;
}
const tables = {
  han: ranges(data.scripts, category => category === 'Han'),
  unassigned: ranges(data.categories, category => category === 'Cn'),
  numbers: ranges(data.categories, category => category.startsWith('N')),
  symbols: ranges(data.categories, category => category.startsWith('S')),
  hidden: ranges(data.categories, category => /^[CM]/.test(category) || category === 'Zl' || category === 'Zp'),
  punctuation: ranges(data.categories, category => category.startsWith('P')),
  spaces: ranges(data.categories, category => category === 'Zs'),
};
const output = `// Generated from Unicode 16.0.0 / Emoji 16.0 by scripts/build-unicode-data.mjs.\n// Copyright Unicode, Inc. Distributed under Unicode License v3; see UNICODE-LICENSE.txt.\n// Classification uses pinned tables rather than the browser's Unicode property escapes.\nexport const UNICODE_VERSION = '16.0.0';\nexport const ranges = ${JSON.stringify(tables)};\nexport const emojiPattern = ${JSON.stringify(expression(trie))};\n`;
await writeFile(new URL('../public/tools/unicode-data.js', import.meta.url), output);
console.log(`Generated pinned Unicode data: ${Buffer.byteLength(output)} bytes.`);
