// From the repository root: npm run images:optimize
// Requires the cwebp and ImageMagick command-line tools. Original design files stay intact.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = path.join(root, 'public/assets');
const icon = path.join(root, 'design/source/oralo-icon-v1.png');
const recovery = path.join(root, 'design/source/oralo-recovery-ios27.png');
await mkdir(assets, { recursive: true });
const generated = [];

for (const width of [48, 96, 192, 288]) {
  const output = path.join(assets, `oralo-icon-${width}.webp`);
  execFileSync('cwebp', ['-quiet', '-q', '84', '-m', '6', '-sharp_yuv', '-metadata', 'none', '-resize', String(width), String(width), icon, '-o', output]);
  generated.push(output);
}
for (const width of [240, 480, 720]) {
  const output = path.join(assets, `recovery-${width}.webp`);
  execFileSync('cwebp', ['-quiet', '-q', '87', '-m', '6', '-sharp_yuv', '-metadata', 'none', '-resize', String(width), '0', recovery, '-o', output]);
  generated.push(output);
}
for (const [name, width] of [['favicon-48.png', 48], ['apple-touch-icon.png', 180], ['oralo-icon.png', 512]]) {
  const output = path.join(assets, name);
  execFileSync('magick', [icon, '-resize', `${width}x${width}`, '-strip', '-define', 'png:compression-level=9', output]);
  generated.push(output);
}
for (const output of generated) console.log(`${path.basename(output)}\t${(await stat(output)).size} bytes`);
