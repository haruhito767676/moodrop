import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeName, numberedName, splitExt, savedKey } from '../src/lib/names.js';

test('sanitizeName replaces characters that are illegal on some OS', () => {
  assert.equal(sanitizeName('a/b\\c:d*e?f"g<h>i|j.pdf'), 'a_b_c_d_e_f_g_h_i_j.pdf');
});

test('sanitizeName avoids hidden/parent names and trailing dots', () => {
  assert.equal(sanitizeName('..'), '_');
  assert.equal(sanitizeName('.hidden.txt'), '_hidden.txt');
  assert.equal(sanitizeName('name. '), 'name');
});

test('sanitizeName avoids Windows reserved names', () => {
  assert.equal(sanitizeName('CON'), '_CON');
  assert.equal(sanitizeName('nul.txt'), '_nul.txt');
});

test('sanitizeName falls back when empty', () => {
  assert.equal(sanitizeName('   '), 'file');
  assert.equal(sanitizeName(null, '無題'), '無題');
});

test('sanitizeName truncates by UTF-8 bytes and keeps the extension', () => {
  const out = sanitizeName('あ'.repeat(200) + '.pdf');
  assert.ok(new TextEncoder().encode(out).length <= 200);
  assert.ok(out.endsWith('.pdf'));
});

test('numberedName inserts the counter before the extension', () => {
  assert.equal(numberedName('資料.pdf', 2), '資料 (2).pdf');
  assert.equal(numberedName('README', 3), 'README (3)');
  assert.equal(numberedName('a.tar.gz', 2), 'a.tar (2).gz');
});

test('splitExt ignores dotfiles and very long "extensions"', () => {
  assert.deepEqual(splitExt('.bashrc'), ['.bashrc', '']);
  assert.deepEqual(splitExt('a.' + 'x'.repeat(20)), ['a.' + 'x'.repeat(20), '']);
});

test('savedKey drops volatile query params and the hash', () => {
  const a = savedKey('https://m.example/pluginfile.php/1/mod_resource/content/1/a.pdf?forcedownload=1#x');
  const b = savedKey('https://m.example/pluginfile.php/1/mod_resource/content/1/a.pdf');
  assert.equal(a, b);
});

import { rankFolders } from '../src/lib/names.js';

test('rankFolders puts the exact match first and drops unrelated folders', () => {
  const out = rankFolders(['線形代数', '情報工学I', '情報工学II', '体育'], '情報工学I');
  assert.deepEqual(out.slice(0, 1), ['情報工学I']);
  assert.ok(!out.includes('体育'));
});

test('rankFolders matches a folder named without the year/semester words', () => {
  assert.deepEqual(rankFolders(['物理学実験', 'その他'], '2026年度 前期 物理学実験'), ['物理学実験']);
});

test('rankFolders returns nothing when there is no resemblance', () => {
  assert.deepEqual(rankFolders(['体育'], '微分積分'), []);
});
