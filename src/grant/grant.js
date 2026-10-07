import { getRootHandle } from '../lib/store.js';

const msg = document.getElementById('msg');
const send = (granted) => chrome.runtime.sendMessage({ type: 'GRANT_RESULT', granted });

const root = await getRootHandle();
document.getElementById('name').textContent = root ? `「${root.name}」` : '';

document.getElementById('allow').addEventListener('click', async () => {
  try {
    const result = root ? await root.requestPermission({ mode: 'readwrite' }) : 'denied';
    await send(result === 'granted');
    if (result === 'granted') window.close();
    else msg.textContent = '許可されませんでした。';
  } catch (e) {
    msg.textContent = String((e && e.message) || e);
  }
});
