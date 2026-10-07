import test from 'node:test';
import assert from 'node:assert/strict';
import { exists, uniqueName, writeFile, existsAtPath } from '../src/lib/fs.js';

// File System Access API の最小限の模擬（フォルダ = Map）
class NotFound extends Error { constructor() { super('nf'); this.name = 'NotFoundError'; } }
class Mismatch extends Error { constructor() { super('tm'); this.name = 'TypeMismatchError'; } }

function makeDir(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    async getFileHandle(name, { create = false } = {}) {
      const v = map.get(name);
      if (v && typeof v !== 'string') throw new Mismatch();
      if (v === undefined) {
        if (!create) throw new NotFound();
        map.set(name, '');
      }
      return {
        async createWritable() {
          const chunks = [];
          return new WritableStream({
            write: (c) => { chunks.push(c); },
            close: () => { map.set(name, chunks.join('')); },
            abort: () => {},
          });
        },
      };
    },
    async getDirectoryHandle(name) {
      const v = map.get(name);
      if (v === undefined) throw new NotFound();
      if (typeof v === 'string') throw new Mismatch();
      return v;
    },
    async removeEntry(name) { map.delete(name); },
  };
}

const streamOf = (...parts) => new ReadableStream({ start(c) { parts.forEach((p) => c.enqueue(p)); c.close(); } });

test('exists distinguishes files, folders and missing names', async () => {
  const dir = makeDir({ 'a.pdf': 'x', sub: makeDir() });
  assert.equal(await exists(dir, 'a.pdf'), true);
  assert.equal(await exists(dir, 'sub'), true);
  assert.equal(await exists(dir, 'nope.pdf'), false);
});

test('uniqueName appends the first free counter', async () => {
  const dir = makeDir({ '資料.pdf': 'x', '資料 (2).pdf': 'x' });
  assert.equal(await uniqueName(dir, '資料.pdf'), '資料 (3).pdf');
  assert.equal(await uniqueName(dir, 'new.pdf'), 'new.pdf');
});

test('writeFile streams the body into the file', async () => {
  const dir = makeDir();
  await writeFile(dir, 'a.txt', streamOf('he', 'llo'));
  assert.equal(dir.map.get('a.txt'), 'hello');
});

test('writeFile removes a half-written new file when the stream fails', async () => {
  const dir = makeDir();
  const bad = new ReadableStream({ start(c) { c.enqueue('x'); c.error(new Error('network')); } });
  await assert.rejects(writeFile(dir, 'a.txt', bad), /network/);
  assert.equal(dir.map.has('a.txt'), false);
});

test('existsAtPath follows folders without creating them', async () => {
  const root = makeDir({ 科目: makeDir({ 'a.pdf': 'x' }) });
  assert.equal(await existsAtPath(root, ['科目', 'a.pdf']), true);
  assert.equal(await existsAtPath(root, ['科目', 'b.pdf']), false);
  assert.equal(await existsAtPath(root, ['無い', 'a.pdf']), false);
  assert.equal(root.map.has('無い'), false);
});
