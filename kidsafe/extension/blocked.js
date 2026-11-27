const raw = location.hash.slice(1) || '';
let url = raw;
try { url = decodeURIComponent(raw); } catch {}
let host = '';
try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
document.getElementById('site').textContent = host || url || 'a website';

if (url) chrome.runtime.sendMessage({ type: 'blocked', url }).catch(() => {});

const btn = document.getElementById('ask');
btn.addEventListener('click', async () => {
  btn.disabled = true;
  try {
    await chrome.runtime.sendMessage({ type: 'ask', url });
    document.getElementById('msg').textContent = '✅ Request sent! Your parent will see it.';
    btn.textContent = '✅ Asked';
  } catch {
    document.getElementById('msg').textContent = 'Could not send the request. Try again later.';
    btn.disabled = false;
  }
});
