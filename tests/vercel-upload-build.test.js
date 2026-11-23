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
      'public/zh/tools/microphone-test/index.html',
      'public/en/tools/camera-test/index.html'
    ]) assert.ok(existsSync(path.join(directory, page)), page);
    const article = readFileSync(path.join(directory, 'public/zh/blog/five-minute-work-update/index.html'), 'utf8');
    assert.match(article, /noindex, nofollow/);
    assert.match(article, /900/);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});
