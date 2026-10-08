import { getRootHandle } from '../lib/store.js';
import { t, applyI18n } from '../lib/i18n.js';

applyI18n();

const msg = document.getElementById('msg');
const send = (granted) => chrome.runtime.sendMessage({ type: 'GRANT_RESULT', granted });

const root = await getRootHandle();
if (root) document.getElementById('body').textContent = t('grantBody', root.name);

document.getElementById('allow').focus();
document.getElementById('allow').addEventListener('click', async () => {
  try {
    const result = root ? await root.requestPermission({ mode: 'readwrite' }) : 'denied';
    if (result === 'granted') {
      await send(true);
      window.close();
    } else msg.textContent = t('grantDenied');
  } catch (e) {
    msg.textContent = String((e && e.message) || e);
  }
});
