import { CATEGORIES, NEW_DAYS, faviconUrl, formatDuration, hostOf } from './shared.js';

const $ = (s) => document.querySelector(s);

function greet(name) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}!` : `${part}!`;
}

function tickClock() {
  $('#clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function tile(site, cat, isNew) {
  const a = document.createElement('a');
  a.className = 'tile';
  a.href = site.url;
  a.style.setProperty('--c', cat.color);
  a.dataset.search = `${site.name} ${hostOf(site.url)}`.toLowerCase();

  const icon = document.createElement('div');
  icon.className = 'icon';
  if (site.icon) {
    if (/^https?:\/\//.test(site.icon)) {
      const img = document.createElement('img');
      img.src = site.icon; img.alt = '';
      icon.append(img);
    } else {
      icon.textContent = site.icon; // emoji
    }
  } else {
    const img = document.createElement('img');
    img.src = faviconUrl(site.url);
    img.alt = '';
    img.onerror = () => {
      img.remove();
      const l = document.createElement('span');
      l.className = 'letter';
      l.textContent = (site.name || '?').trim().charAt(0).toUpperCase();
      icon.append(l);
    };
    icon.append(img);
  }

  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = site.name;

  a.append(icon, name);
  if (isNew) {
    const r = document.createElement('span');
    r.className = 'ribbon';
    r.textContent = 'NEW';
    a.append(r);
  }
  return a;
}

function section({ id, label, emoji, color }, sites, isNewSection) {
  const sec = document.createElement('section');
  sec.className = 'section' + (isNewSection ? ' new' : '');
  sec.dataset.cat = id;
  sec.innerHTML = `
    <div class="section-head">
      <span class="badge" style="--c:${color}">${emoji}</span>
      <h2></h2>
      <span class="count"></span>
    </div>
    <div class="grid"></div>`;
  sec.querySelector('h2').textContent = label;
  sec.querySelector('.count').textContent = `${sites.length} site${sites.length === 1 ? '' : 's'}`;
  const grid = sec.querySelector('.grid');
  const now = Date.now();
  for (const s of sites) {
    const cat = CATEGORIES.find((c) => c.id === s.category) || CATEGORIES[CATEGORIES.length - 1];
    const fresh = s.addedAt && now - s.addedAt < NEW_DAYS * 86400000;
    grid.append(tile(s, isNewSection ? { ...cat, color } : cat, fresh && !isNewSection));
  }
  return sec;
}

function render(family) {
  const root = $('#sections');
  root.innerHTML = '';
  $('#greeting').textContent = greet(family?.kidName);

  if (!family) {
    root.innerHTML = `<div class="empty"><div class="big-emoji">👋</div>
      <p>This start page isn't set up yet.<br>Ask a parent to open <a href="options.html">Parent settings</a>.</p></div>`;
    return;
  }

  const sites = (family.sites || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  if (!sites.length) {
    root.innerHTML = `<div class="empty"><div class="big-emoji">🌱</div><p>No websites yet. A parent can add some!</p></div>`;
    return;
  }

  const now = Date.now();
  const fresh = sites
    .filter((s) => s.addedAt && now - s.addedAt < NEW_DAYS * 86400000)
    .sort((a, b) => b.addedAt - a.addedAt);
  if (fresh.length) {
    root.append(section({ id: 'new', label: 'New for you', emoji: '✨', color: getComputedStyle(document.documentElement).getPropertyValue('--new').trim() }, fresh, true));
  }

  for (const cat of CATEGORIES) {
    const list = sites.filter((s) => (s.category || 'other') === cat.id ||
      (cat.id === 'other' && !CATEGORIES.some((c) => c.id === s.category)));
    if (list.length) root.append(section(cat, list, false));
  }
  applyFilter();
}

function applyFilter() {
  const q = $('#find').value.trim().toLowerCase();
  for (const sec of document.querySelectorAll('.section')) {
    let shown = 0;
    for (const t of sec.querySelectorAll('.tile')) {
      const hit = !q || t.dataset.search.includes(q);
      t.hidden = !hit;
      if (hit) shown++;
    }
    sec.hidden = shown === 0;
  }
}

async function showScreenTime() {
  try {
    const u = await chrome.runtime.sendMessage({ type: 'todayUsage' });
    const total = Object.values(u?.totals || {}).reduce((a, b) => a + b, 0);
    $('#screen-time').textContent = total ? `⏱️ Time online today: ${formatDuration(total)}` : '';
  } catch {}
}

$('#find').addEventListener('input', applyFilter);
tickClock();
setInterval(tickClock, 10000);

const { family } = await chrome.storage.local.get('family');
render(family || null);
showScreenTime();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.family) render(changes.family.newValue || null);
});
