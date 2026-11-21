// npm run videos:optimize — requires ffmpeg and cwebp.
// Keep the source video in the ignored design/source/videos directory.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'design/source/videos/mirror-original.mp4');
const assets = path.join(root, 'public/assets');
const video = path.join(assets, 'oralo-mirror-demo.mp4');
const poster = path.join(assets, 'mirror-poster.webp');
await stat(source);
await mkdir(assets, { recursive: true });
const temporary = await mkdtemp(path.join(tmpdir(), 'oralo-mirror-'));
try {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', source,
    '-map', '0:v:0', '-vf', 'scale=720:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-map_metadata', '-1', '-an', video]);
  const frame = path.join(temporary, 'poster.png');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-ss', '1.5',
    '-i', source, '-frames:v', '1', '-vf', 'scale=720:-2', frame]);
  execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', '-sharp_yuv', '-metadata', 'none', frame, '-o', poster]);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
for (const file of [video, poster]) console.log(`${path.basename(file)}\t${(await stat(file)).size} bytes`);
