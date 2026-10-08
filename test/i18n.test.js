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
const subs = (s) => [...new Set(s.match(/\$\d/g) || [])].sort().join(',');

test('en and ja define exactly the same keys', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ja).sort());
});

test('en and ja use the same $1/$2 placeholders in every message', () => {
  for (const k of Object.keys(en)) {
    assert.equal(subs(en[k].message), subs(ja[k].message), `placeholders differ for "${k}"`);
  }
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
