import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, copyFileSync, rmSync, readFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], {cwd: root}).toString().split('\0').filter(Boolean);
}

function localImports(file, seen = new Set()) {
  const relative = path.relative(root, file);
  if (seen.has(relative)) return seen;
  seen.add(relative);
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    let target = path.normalize(path.join(path.dirname(file), match[1]));
    if (!path.extname(target)) target += '.mjs';
    localImports(target, seen);
  }
  return seen;
}

function uploadSet(files) {
  const directory = mkdtempSync(path.join(tmpdir(), 'oralo-vercel-upload-'));
  for (const file of files) {
    const destination = path.join(directory, file);
    mkdirSync(path.dirname(destination), {recursive: true});
    copyFileSync(path.join(root, file), destination);
  }
  copyFileSync(path.join(root, '.vercelignore'), path.join(directory, '.gitignore'));
  const git = ['-c', 'safe.directory=*', '-C', directory];
  execFileSync('git', [...git, 'init', '-q']);
  execFileSync('git', [...git, 'add', '-A']);
  return {
    directory,
    kept: execFileSync('git', [...git, 'ls-files', '-z']).toString().split('\0').filter(Boolean)
  };
}

test('the Vercel upload keeps every file npm run build imports and still builds', () => {
  const files = trackedFiles();
  const {directory, kept} = uploadSet(files);
  try {
    const imported = [...localImports(path.join(root, 'scripts/build-site.mjs'))];
    assert.deepEqual(imported.sort(), [
      'scripts/build-site.mjs',
      'scripts/render-markdown.mjs',
      'scripts/structured-data.mjs',
      'src/content/device-tools.mjs'
    ]);
    for (const file of imported) assert.ok(kept.includes(file), `${file} would be removed by .vercelignore`);
    for (const file of [
      'src/content/blog-index.json',
      'src/content/blog/five-minute-work-update.zh.md',
      'src/content/blog/five-minute-work-update.en.md',
      'src/content/blog/get-back-on-script.zh.md',
      'src/content/blog/get-back-on-script.en.md',
      'src/content/blog/dingtalk-window-casting-teleprompter.zh.md',
      'src/content/blog/from-slides-to-script.zh.md',
      'src/content/blog/from-slides-to-script.en.md',
      'public/zh/blog/dingtalk-window-casting-teleprompter/dingtalk-window-casting-redacted.jpg',
      'public/zh/blog/dingtalk-window-casting-teleprompter/dingtalk-window-guide.png',
      'public/zh/blog/from-slides-to-script/from-slides-to-script-demo-audience-display-and-mac-prompter.jpg',
      'public/en/blog/from-slides-to-script/from-slides-to-script-demo-audience-display-and-mac-prompter.jpg',
      'public/zh/blog/from-slides-to-script/from-slides-to-script-demo-chart-slide-and-prompter.jpg',
      'public/en/blog/from-slides-to-script/from-slides-to-script-demo-chart-slide-and-prompter.jpg',
      'src/templates/device-tool.html',
      'public/privacy/index.html',
      'public/support/index.html'
    ]) assert.ok(kept.includes(file), file);
    for (const file of [
      'scripts/build-unicode-data.mjs',
      'scripts/optimize-images.mjs',
      'scripts/optimize-videos.mjs',
      'scripts/generate-app-store-qr.swift',
      'tests/device-session.test.js'
    ]) {
      assert.ok(files.includes(file), `${file} is not tracked, so the ignore rule is untested`);
      assert.equal(kept.includes(file), false, `${file} is still in the Vercel upload`);
    }
    execFileSync(process.execPath, ['scripts/build-site.mjs'], {cwd: directory, stdio: 'pipe'});
    for (const page of [
      'public/zh/blog/index.html',
      'public/en/blog/five-minute-work-update/index.html',
      'public/zh/blog/get-back-on-script/index.html',
      'public/en/blog/get-back-on-script/index.html',
      'public/zh/tools/microphone-test/index.html',
      'public/en/tools/camera-test/index.html'
    ]) assert.ok(existsSync(path.join(directory, page)), page);
    const article = readFileSync(path.join(directory, 'public/zh/blog/five-minute-work-update/index.html'), 'utf8');
    assert.doesNotMatch(article, /noindex, nofollow/);
    assert.match(article, /2026-11-23T18:06:07\+08:00/);
    assert.match(article, /900/);
    const second = readFileSync(path.join(directory, 'public/zh/blog/get-back-on-script/index.html'), 'utf8');
    assert.doesNotMatch(second, /noindex, nofollow|内部交付说明|内部编辑说明|\bnull\b|已测试成功/);
    assert.match(second, /2026-11-24T12:43:08\+08:00/);
    assert.match(second, /离稿发挥之后，怎样接回下一句/);
    assert.match(second, /虚构的内部分享教学示例/);
    const uploadedConfig = JSON.parse(readFileSync(path.join(directory, 'vercel.json'), 'utf8'));
    assert.ok(uploadedConfig.headers.some(entry => entry.source === '/:lang(zh|en)/blog/:slug((?!(?:five-minute-work-update|get-back-on-script|dingtalk-window-casting-teleprompter|from-slides-to-script)(?:/|$))[a-z0-9-]+)'));
    const dingtalk = readFileSync(path.join(directory, 'public/zh/blog/dingtalk-window-casting-teleprompter/index.html'), 'utf8');
    assert.doesNotMatch(dingtalk, /noindex, nofollow/);
    assert.match(dingtalk, /2026-11-24T19:22:47\+08:00/);
    assert.equal(existsSync(path.join(directory, 'public/en/blog/dingtalk-window-casting-teleprompter/index.html')), false);
    for (const lang of ['zh', 'en']) {
      const slides = readFileSync(path.join(directory, `public/${lang}/blog/from-slides-to-script/index.html`), 'utf8');
      assert.doesNotMatch(slides, /noindex, nofollow|内部交付说明|内部编辑说明|ready-for-publication|已测试成功|\bnull\b/);
      assert.match(slides, /2026-11-25T10:42:42\+08:00/);
      assert.match(slides, /from-slides-to-script-demo-audience-display-and-mac-prompter\.jpg/);
      assert.match(slides, /from-slides-to-script-demo-chart-slide-and-prompter\.jpg/);
    }
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});
