import { makeSetupCode, parseSetupCode } from './shared.js';

const $ = (s) => document.querySelector(s);
const local = chrome.storage.local;

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('kidsafe:' + text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function showStatus(s) {
  const el = $('#status');
  if (!s || !s.lastTry) { el.textContent = 'Not connected yet.'; el.className = 'note'; return; }
  if (s.ok && s.familyFound) {
    el.textContent = `✅ Connected. Last sync ${new Date(s.lastSync).toLocaleTimeString()}.`;
    el.className = 'note ok';
  } else if (s.ok) {
    el.textContent = '⚠️ Connected to Firebase, but no family was found for this code. Create it from the parent dashboard first.';
    el.className = 'note bad';
  } else {
    el.textContent = `❌ Sync failed: ${s.error}`;
    el.className = 'note bad';
  }
}

async function openSettings() {
  $('#gate').hidden = true;
  $('#settings').hidden = false;
  const { config, syncStatus } = await local.get(['config', 'syncStatus']);
  if (config) $('#code').value = makeSetupCode(config);
  showStatus(syncStatus);
}

$('#gate-go').addEventListener('click', async () => {
  const { pinHash } = await local.get('pinHash');
  if ((await sha256($('#gate-pin').value)) === pinHash) openSettings();
  else $('#gate-msg').textContent = 'Wrong PIN.';
});
$('#gate-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#gate-go').click(); });

$('#save').addEventListener('click', async () => {
  const el = $('#status');
  let config;
  try {
    config = parseSetupCode($('#code').value);
  } catch (e) {
    el.textContent = '❌ ' + e.message; el.className = 'note bad';
    return;
  }
  const { pinHash } = await local.get('pinHash');
  const pin = $('#pin').value.trim();
  if (!pinHash && pin.length < 4) {
    el.textContent = '❌ Please choose a PIN of at least 4 digits so your kid cannot change these settings.';
    el.className = 'note bad';
    return;
  }
  const update = { config };
  if (pin) update.pinHash = await sha256(pin);
  await local.set(update);
  $('#pin').value = '';
  el.textContent = 'Connecting...'; el.className = 'note';
  showStatus(await chrome.runtime.sendMessage({ type: 'configChanged' }));
});

$('#sync').addEventListener('click', async () => {
  $('#status').textContent = 'Syncing...';
  showStatus(await chrome.runtime.sendMessage({ type: 'syncNow' }));
});

const { pinHash } = await local.get('pinHash');
if (pinHash) $('#gate').hidden = false;
else openSettings();
