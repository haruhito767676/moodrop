import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixHeaderMojibake,
  parseFilenameFromDisposition,
  extractRealFileLink,
} from '../src/lib/moodle.js';

test('RFC 5987 filename* wins over plain filename', () => {
  const h = `attachment; filename="fallback.pdf"; filename*=UTF-8''%E8%B3%87%E6%96%99.pdf`;
  assert.equal(parseFilenameFromDisposition(h, 'x'), '資料.pdf');
});

test('raw UTF-8 bytes in a plain filename are repaired', () => {
  const garbled = Buffer.from('資料.pdf', 'utf8').toString('latin1');
  assert.equal(parseFilenameFromDisposition(`attachment; filename="${garbled}"`, 'x'), '資料.pdf');
});

test('plain ASCII is left untouched', () => {
  assert.equal(fixHeaderMojibake('lecture1.pdf'), 'lecture1.pdf');
});

test('falls back when there is no header', () => {
  assert.equal(parseFilenameFromDisposition(null, 'fallback'), 'fallback');
});

test('extractRealFileLink prefers pluginfile.php and resolves relative URLs', () => {
  const html =
    '<a href="/mod/resource/view.php?id=1&amp;redirect=1">x</a>' +
    '<object data="x"></object><a href="/pluginfile.php/5/mod_resource/content/1/a.pdf?forcedownload=1">y</a>';
  assert.equal(
    extractRealFileLink(html, 'https://m.example/mod/resource/view.php?id=1'),
    'https://m.example/pluginfile.php/5/mod_resource/content/1/a.pdf?forcedownload=1'
  );
});

test('extractRealFileLink returns null when nothing matches', () => {
  assert.equal(extractRealFileLink('<p>none</p>', 'https://m.example/'), null);
});

import { filenameFromUrl } from '../src/lib/moodle.js';

test('filenameFromUrl takes the decoded last path segment when it has an extension', () => {
  assert.equal(
    filenameFromUrl('https://m.example/pluginfile.php/5/mod_resource/content/1/%E8%AC%9B%E7%BE%A9.pdf?forcedownload=1'),
    '講義.pdf'
  );
});

test('filenameFromUrl returns empty for pages without a file-like name', () => {
  assert.equal(filenameFromUrl('https://m.example/mod/resource/view.php?id=3'), '');
  assert.equal(filenameFromUrl('not a url'), '');
});
