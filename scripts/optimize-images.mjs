// From the repository root: npm run images:optimize
// Requires the cwebp and ImageMagick command-line tools. Original design files stay intact.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, stat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = path.join(root, 'public/assets');
const icon = path.join(root, 'design/source/oralo-icon-v1.png');
const screenshotsOnly = process.argv.includes('--screenshots');
await mkdir(assets, { recursive: true });
const generated = [];

if (!screenshotsOnly) {
  for (const width of [48, 96, 192, 288]) {
    const output = path.join(assets, `oralo-icon-${width}.webp`);
    execFileSync('cwebp', ['-quiet', '-q', '84', '-m', '6', '-sharp_yuv', '-metadata', 'none', '-resize', String(width), String(width), icon, '-o', output]);
    generated.push(output);
  }

  for (const [name, width] of [['favicon-48.png', 48], ['apple-touch-icon.png', 180], ['oralo-icon.png', 512]]) {
    const output = path.join(assets, name);
    execFileSync('magick', [icon, '-resize', `${width}x${width}`, '-strip', '-define', 'png:compression-level=9', output]);
    generated.push(output);
  }
}
// PNG originals are local-only. Copy native captures into design/source/screenshots/.
// Run npm run images:optimize -- --screenshots to rebuild just the app screenshots.
const temporary = await mkdtemp(path.join(tmpdir(), 'oralo-screenshots-'));
try {
  for (const name of ['library', 'prepare', 'review', 'reader', 'pronunciation', 'ipad']) {
    const source = path.join(root, 'design/source/screenshots', `${name}.png`);
    await stat(source).catch(() => { throw new Error(`Missing local screenshot source: ${source}`); });
    // Simulator captures can store landscape orientation in metadata. Apply it before stripping.
    const normalized = path.join(temporary, `${name}.png`);
    execFileSync('magick', [source, '-auto-orient', '-strip', normalized]);
    for (const width of name === 'ipad' ? [640, 1280] : [320, 640]) {
      const output = path.join(assets, `app-${name}-${width}.webp`);
      execFileSync('cwebp', ['-quiet', '-q', '86', '-m', '6', '-sharp_yuv', '-metadata', 'none', '-resize', String(width), '0', normalized, '-o', output]);
      generated.push(output);
    }
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
// The livestream photograph is separate from native app captures; its original stays local.
if (!screenshotsOnly) {
  const source = path.join(root, 'design/source/creator-live-v1.png');
  for (const width of [480, 960]) {
    const output = path.join(assets, `creator-live-${width}.webp`);
    execFileSync('cwebp', ['-quiet', '-q', '80', '-m', '6', '-sharp_yuv', '-metadata', 'none', '-resize', String(width), '0', source, '-o', output]);
    generated.push(output);
  }
}
for (const output of generated) console.log(`${path.basename(output)}\t${(await stat(output)).size} bytes`);
