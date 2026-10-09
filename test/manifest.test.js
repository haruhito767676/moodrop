import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPublicKey, createHash } from 'node:crypto';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

// 拡張機能のIDは、manifest の key（公開鍵）から決まる。フォルダを動かしても設定が残るよう、IDを固定している。
// うっかり key を消したり変えたりすると、利用者の設定がすべて消えるので、ここで気づけるようにする。
const EXPECTED_ID = 'oamgehaiklcfedniokdpainhbnnfgjpm';

test('manifest has a valid public key that pins the extension id', () => {
  assert.ok(manifest.key, 'manifest.key is missing');
  const der = Buffer.from(manifest.key, 'base64');
  const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
  assert.equal(key.asymmetricKeyType, 'rsa');
  const id = createHash('sha256').update(der).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, (c) => 'abcdefghijklmnop'['0123456789abcdef'.indexOf(c)]);
  assert.equal(id, EXPECTED_ID);
});

test('manifest and package.json have the same version', () => {
  assert.equal(manifest.version, JSON.parse(readFileSync('package.json', 'utf8')).version);
});
