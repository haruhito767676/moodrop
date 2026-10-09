import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const load = (lang) => JSON.parse(readFileSync(`_locales/${lang}/messages.json`, 'utf8'));
const en = load('en');
const ja = load('ja');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const sources = walk('src');

// Chrome は、メッセージの中の $名前$ を placeholders の定義で置き換え、定義がなかったり、
// 対になっていない $ があったりすると、そのロケールのメッセージを丸ごと読み込まない。
// 同じ検査をここでもやる（これを破ると、画面にキー名がそのまま出る）。
function chromeProblems(file, name) {
  const out = [];
  for (const [key, entry] of Object.entries(file)) {
    const msg = entry.message;
    const defined = Object.keys(entry.placeholders || {}).map((s) => s.toLowerCase());
    const rest = msg.replace(/\$\$/g, '').replace(/\$([A-Za-z0-9_@]+)\$/g, (_, n) => {
      if (!defined.includes(n.toLowerCase())) out.push(`${name}.${key}: $${n}$ is not defined`);
      return '';
    });
    if (rest.includes('$')) out.push(`${name}.${key}: stray "$" in ${JSON.stringify(msg)}`);
    for (const [pn, p] of Object.entries(entry.placeholders || {})) {
      if (!/^\$[1-9]$/.test(p.content)) out.push(`${name}.${key}: placeholder ${pn} should be $1..$9`);
      if (!new RegExp(`\\$${pn}\\$`, 'i').test(msg)) out.push(`${name}.${key}: placeholder ${pn} is unused`);
    }
  }
  return out;
}
// 置き換え後の $1/$2 の集合
const args = (e) => Object.values(e.placeholders || {}).map((p) => p.content).sort().join(',');

test('message files are acceptable to Chrome (no undefined or stray $)', () => {
  assert.deepEqual([...chromeProblems(en, 'en'), ...chromeProblems(ja, 'ja')], []);
});

test('message names are unique ignoring case (Chrome treats them as case-insensitive)', () => {
  for (const [name, file] of [['en', en], ['ja', ja]]) {
    const lower = Object.keys(file).map((k) => k.toLowerCase());
    assert.equal(new Set(lower).size, lower.length, `${name} has names that differ only by case`);
    for (const k of Object.keys(file)) assert.match(k, /^[A-Za-z0-9_@]+$/);
  }
});

test('en and ja define exactly the same keys', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ja).sort());
});

test('en and ja take the same arguments in every message', () => {
  for (const k of Object.keys(en)) assert.equal(args(en[k]), args(ja[k]), `arguments differ for "${k}"`);
});

test('every key used in the source exists in the locale files', () => {
  const used = new Set();
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    if (file.endsWith('.html')) {
      for (const m of text.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) used.add(m[1]);
    } else if (file.endsWith('.js')) {
      // t('key', …) の呼び出し（三項演算子の両側のキーも拾う）
      for (const call of text.matchAll(/\bt\(([^()]*)\)/g)) {
        for (const m of call[1].matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)) used.add(m[1]);
      }
    }
  }
  const missing = [...used].filter((k) => !(k in en));
  assert.deepEqual(missing, []);
});

test('manifest strings are localized', () => {
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
  assert.equal(manifest.default_locale, 'en');
  for (const v of [manifest.name, manifest.description, manifest.action.default_title]) {
    const key = v.match(/^__MSG_(\w+)__$/)?.[1];
    assert.ok(key && key in en, `${v} should reference an existing message`);
  }
});
