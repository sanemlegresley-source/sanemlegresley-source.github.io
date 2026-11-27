import {
  CATEGORIES, DEFAULT_SITES, FamilyStore, allowedDomains, dayKey, faviconUrl, formatDuration,
  hostOf, makeSetupCode, normalizeUrl, parseSetupCode, randomId,
} from './shared.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const LS_KEY = 'kidsafe.parent.config';

let store = null;
let config = null;
let family = null;
const usageCache = {}; // day -> usage doc (or null)
let selectedDay = dayKey();

// ---------- helpers ----------
function msg(el, text, ok = true) { el.textContent = text; el.className = 'msg ' + (text ? (ok ? 'ok' : 'bad') : ''); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function daysBack(n) { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); }
function niceDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (key === dayKey()) return 'Today';
  if (key === daysBack(1)) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
function iconHtml(site) {
  if (site?.icon && !/^https?:/.test(site.icon)) return esc(site.icon);
  const src = site?.icon || faviconUrl(site?.url || '');
  return src ? `<img src="${esc(src)}" alt="" onerror="this.replaceWith(document.createTextNode('🌐'))">` : '🌐';
}
function isAllowed(domain) {
  const list = allowedDomains(family);
  return list.some((d) => domain === d || domain.endsWith('.' + d));
}

// ---------- tooltip ----------
const tip = $('#tooltip');
function bindTip(el, textFn) {
  el.addEventListener('pointermove', (e) => {
    tip.textContent = textFn();
    tip.hidden = false;
    const x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + 'px';
    tip.style.top = (e.clientY - tip.offsetHeight - 10) + 'px';
  });
  el.addEventListener('pointerleave', () => { tip.hidden = true; });
}

// ---------- setup ----------
function showSetup() {
  $('#setup').hidden = false;
  $('#app').hidden = true;
  $('#seen').innerHTML = '';
}

$$('[data-setup]').forEach((b) => b.addEventListener('click', () => {
  $$('[data-setup]').forEach((x) => x.classList.toggle('active', x === b));
  $('#form-new').hidden = b.dataset.setup !== 'new';
  $('#form-join').hidden = b.dataset.setup !== 'join';
}));

$('#form-new').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const cfg = { projectId: f.get('projectId').trim(), apiKey: f.get('apiKey').trim(), familyId: randomId(24) };
  const el = $('#setup-msg');
  msg(el, 'Creating family...');
  try {
    const s = new FamilyStore(cfg);
    const now = Date.now();
    await s.saveFamily({
      kidName: f.get('kidName').trim(),
      blockUnlisted: true,
      createdAt: now,
      // starter sites are not marked "new"
      sites: DEFAULT_SITES.map((x) => ({ ...x, id: randomId(10), addedAt: 0 })),
    });
    connect(cfg);
  } catch (err) {
    msg(el, err.message + ' (Check the project ID, API key, and that Firestore + rules are set up.)', false);
  }
});

$('#form-join').addEventListener('submit', async (e) => {
  e.preventDefault();
  const el = $('#setup-msg');
  try {
    const cfg = parseSetupCode(new FormData(e.target).get('code'));
    const fam = await new FamilyStore(cfg).getFamily();
    if (!fam) throw new Error('No family found for that code.');
    connect(cfg);
  } catch (err) {
    msg(el, err.message, false);
  }
});

function connect(cfg) {
  config = cfg;
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  store = new FamilyStore(cfg);
  $('#setup').hidden = true;
  $('#app').hidden = false;
  $('#setup-code').value = makeSetupCode(cfg);
  loadAll();
}

// ---------- navigation ----------
$$('[data-view].tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab[data-view]').forEach((x) => x.classList.toggle('active', x === b));
  $$('section.view').forEach((v) => { v.hidden = v.dataset.view !== b.dataset.view; });
}));

// ---------- data loading ----------
async function loadFamily() {
  family = (await store.getFamily()) || { sites: [] };
  family.sites ||= [];
}

async function loadUsage(day, force = false) {
  if (!force && day in usageCache && day !== dayKey()) return usageCache[day];
  usageCache[day] = await store.getUsage(day);
  return usageCache[day];
}

async function loadAll() {
  try {
    await loadFamily();
    await Promise.all(Array.from({ length: 7 }, (_, i) => loadUsage(daysBack(i), true)));
    if (selectedDay !== dayKey() && !(selectedDay in usageCache)) await loadUsage(selectedDay);
    renderAll();
  } catch (err) {
    $('#seen').innerHTML = `<span class="dot"></span> ${esc(err.message)}`;
  }
}

function renderAll() {
  renderSeen();
  renderDaySelect();
  renderUsage();
  renderActivity();
  renderRequests();
  renderSites();
  renderSettings();
}

function renderSeen() {
  const t = usageCache[dayKey()]?.updatedAt;
  const on = t && Date.now() - t < 3 * 60000;
  $('#seen').innerHTML = t
    ? `<span class="dot ${on ? 'on' : ''}"></span> Kid's browser ${on ? 'online' : 'last seen ' + ago(t)}`
    : `<span class="dot"></span> No data from the extension today`;
}

// ---------- usage view ----------
function renderDaySelect() {
  const sel = $('#day');
  sel.innerHTML = Array.from({ length: 14 }, (_, i) => {
    const k = daysBack(i);
    return `<option value="${k}" ${k === selectedDay ? 'selected' : ''}>${niceDay(k)} (${k})</option>`;
  }).join('');
}

$('#day').addEventListener('change', async (e) => {
  selectedDay = e.target.value;
  await loadUsage(selectedDay);
  renderUsage();
  renderActivity();
});
$('#refresh').addEventListener('click', loadAll);

function siteForDomain(domain) {
  return family.sites.find((s) => {
    const h = hostOf(s.url);
    return h && (domain === h || domain.endsWith('.' + h));
  });
}

function renderUsage() {
  const u = usageCache[selectedDay] || {};
  const totals = Object.entries(u.totals || {}).sort((a, b) => b[1] - a[1]);
  const sum = totals.reduce((a, [, v]) => a + v, 0);
  const blocked = Object.values(u.blocked || {}).reduce((a, b) => a + (b.count || 0), 0);
  $('#s-total').textContent = formatDuration(sum);
  $('#s-sites').textContent = totals.length;
  $('#s-blocked').textContent = blocked;

  const bars = $('#site-bars');
  if (!totals.length) {
    bars.innerHTML = `<div class="empty">No browsing recorded for ${esc(niceDay(selectedDay).toLowerCase())}.</div>`;
  } else {
    const max = totals[0][1];
    bars.innerHTML = '';
    for (const [domain, sec] of totals.slice(0, 25)) {
      const row = document.createElement('div');
      row.className = 'bar-row';
      const site = siteForDomain(domain);
      row.innerHTML = `
        <div class="bar-name"><img src="${esc(faviconUrl('https://' + domain))}" alt="" onerror="this.style.visibility='hidden'">
          <span>${esc(site?.name || domain)}</span>${isAllowed(domain) || family.blockUnlisted === false ? '' : '<b class="not-allowed">not on list</b>'}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(sec / max) * 100}%"></div></div>
        <div class="bar-val">${formatDuration(sec)}</div>`;
      bindTip(row, () => `${domain}: ${formatDuration(sec)} (${Math.round((sec / sum) * 100)}% of the day)`);
      bars.append(row);
    }
    if (totals.length > 25) bars.insertAdjacentHTML('beforeend', `<div class="muted">+ ${totals.length - 25} more sites</div>`);
  }

  // last 7 days
  const days = Array.from({ length: 7 }, (_, i) => daysBack(6 - i));
  const vals = days.map((d) => Object.values(usageCache[d]?.totals || {}).reduce((a, b) => a + b, 0));
  const vmax = Math.max(...vals, 60);
  const week = $('#week');
  week.innerHTML = '';
  days.forEach((d, i) => {
    const col = document.createElement('div');
    col.className = 'week-col' + (d === selectedDay ? ' sel' : '');
    col.innerHTML = `<div class="lbl-val">${vals[i] ? formatDuration(vals[i]) : ''}</div><div class="col" style="height:${(vals[i] / vmax) * 85}%"></div>`;
    bindTip(col, () => `${niceDay(d)}: ${formatDuration(vals[i])} online`);
    col.addEventListener('click', () => { $('#day').value = d; $('#day').dispatchEvent(new Event('change')); });
    week.append(col);
  });
  let labels = week.nextElementSibling;
  if (!labels || !labels.classList.contains('week-labels')) {
    labels = document.createElement('div');
    labels.className = 'week-labels';
    week.after(labels);
  }
  labels.innerHTML = days.map((d) => {
    const [y, m, dd] = d.split('-').map(Number);
    return `<div>${new Date(y, m - 1, dd).toLocaleDateString([], { weekday: 'short' })}</div>`;
  }).join('');
}

// ---------- activity view ----------
function renderActivity() {
  $('#act-day').textContent = niceDay(selectedDay).toLowerCase();
  const sessions = (usageCache[selectedDay]?.sessions || []).slice().reverse();
  $('#sessions').innerHTML = sessions.length
    ? sessions.map((s) => `<tr>
        <td class="num">${new Date(s.s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</td>
        <td>${esc(s.d)}</td>
        <td class="page" title="${esc(s.t)}">${esc(s.t || '')}</td>
        <td class="num">${formatDuration(s.sec)}</td></tr>`).join('')
    : `<tr><td colspan="4" class="empty">No visits recorded.</td></tr>`;
}

// ---------- requests view ----------
function renderRequests() {
  const merged = {};
  for (let i = 0; i < 7; i++) {
    const day = daysBack(i);
    for (const [domain, b] of Object.entries(usageCache[day]?.blocked || {})) {
      const m = merged[domain] ||= { domain, count: 0, asked: false, last: 0, url: b.url };
      m.count += b.count || 0;
      m.asked ||= !!b.asked;
      if ((b.last || 0) > m.last) { m.last = b.last; m.url = b.url; }
    }
  }
  const list = Object.values(merged)
    .filter((m) => !isAllowed(m.domain) && !(family.dismissed || []).includes(m.domain))
    .sort((a, b) => (b.asked - a.asked) || (b.last - a.last));

  const askedCount = list.filter((m) => m.asked).length;
  $('#req-count').hidden = !askedCount;
  $('#req-count').textContent = askedCount;

  const el = $('#requests');
  if (!list.length) { el.innerHTML = '<div class="empty">Nothing blocked recently. 🎉</div>'; return; }
  el.innerHTML = '';
  for (const m of list) {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `
      <div class="ico"><img src="${esc(faviconUrl('https://' + m.domain))}" alt="" onerror="this.replaceWith(document.createTextNode('🌐'))"></div>
      <div class="meta"><b>${esc(m.domain)}</b><small>${esc(m.url || '')}</small>
        <small>${m.count} attempt${m.count === 1 ? '' : 's'}, last ${ago(m.last)}</small></div>
      ${m.asked ? '<span class="tag asked">Asked</span>' : ''}
      <button class="btn small" data-act="allow">Allow</button>
      <button class="btn small ghost" data-act="dismiss">Dismiss</button>`;
    $('[data-act=allow]', row).addEventListener('click', () => {
      $('.tab[data-view=sites]').click();
      editSite(null, { name: m.domain.split('.').slice(-2, -1)[0]?.replace(/^./, (c) => c.toUpperCase()) || m.domain, url: 'https://' + m.domain, category: 'other' });
    });
    $('[data-act=dismiss]', row).addEventListener('click', async () => {
      family.dismissed = [...new Set([...(family.dismissed || []), m.domain])];
      await store.saveFamily({ dismissed: family.dismissed });
      renderRequests();
    });
    el.append(row);
  }
}

// ---------- sites view ----------
$('#cat-select').innerHTML = CATEGORIES.map((c) => `<option value="${c.id}">${c.emoji} ${esc(c.label)}</option>`).join('');

function editSite(site, prefill) {
  const f = $('#site-form');
  const s = site || prefill || {};
  f.elements.id.value = site?.id || '';
  f.elements.name.value = s.name || '';
  f.elements.url.value = s.url || '';
  f.elements.category.value = s.category || 'other';
  f.elements.icon.value = s.icon || '';
  f.elements.domains.value = (s.domains || []).join(', ');
  f.elements.markNew.checked = site ? !!site.addedAt && Date.now() - site.addedAt < 7 * 86400000 : true;
  $('#site-form-title').textContent = site ? `Edit ${site.name}` : 'Add a website';
  $('#site-submit').textContent = site ? 'Save changes' : 'Add website';
  $('#site-cancel').hidden = !site;
  msg($('#site-msg'), '');
  f.scrollIntoView({ behavior: 'smooth', block: 'start' });
  f.elements.name.focus();
}

$('#site-cancel').addEventListener('click', () => { $('#site-form').reset(); editSite(null); });

$('#site-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const el = $('#site-msg');
  const url = normalizeUrl(f.elements.url.value);
  if (!url) { msg(el, 'Please enter a valid web address.', false); return; }
  const domains = f.elements.domains.value.split(',').map((d) => d.trim()).filter(Boolean);
  const id = f.elements.id.value;
  const old = family.sites.find((s) => s.id === id);
  const site = {
    id: id || randomId(10),
    name: f.elements.name.value.trim(),
    url,
    category: f.elements.category.value,
    icon: f.elements.icon.value.trim(),
    domains,
    addedAt: f.elements.markNew.checked ? (old?.addedAt && Date.now() - old.addedAt < 7 * 86400000 ? old.addedAt : Date.now()) : 0,
  };
  const sites = id ? family.sites.map((s) => (s.id === id ? site : s)) : [...family.sites, site];
  msg(el, 'Saving...');
  try {
    await store.saveFamily({ sites });
    family.sites = sites;
    f.reset();
    editSite(null);
    msg(el, `✅ ${site.name} ${id ? 'updated' : 'added'}. Your kid's browser picks it up within a minute.`);
    renderSites();
    renderRequests();
    renderUsage();
  } catch (err) {
    msg(el, err.message, false);
  }
});

function renderSites() {
  const root = $('#site-list');
  root.innerHTML = '';
  if (!family.sites.length) { root.innerHTML = '<div class="panel empty">No websites yet. Add one above.</div>'; return; }
  for (const cat of CATEGORIES) {
    const list = family.sites.filter((s) => (s.category || 'other') === cat.id ||
      (cat.id === 'other' && !CATEGORIES.some((c) => c.id === s.category)))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) continue;
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<h2>${cat.emoji} ${esc(cat.label)} <span class="muted">(${list.length})</span></h2><div class="list"></div>`;
    const lst = $('.list', panel);
    for (const s of list) {
      const isNew = s.addedAt && Date.now() - s.addedAt < 7 * 86400000;
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `
        <div class="ico">${iconHtml(s)}</div>
        <div class="meta"><b>${esc(s.name)}</b><small>${esc(s.url)}${s.domains?.length ? ' + ' + esc(s.domains.join(', ')) : ''}</small></div>
        ${isNew ? '<span class="tag new">New</span>' : ''}
        <button class="btn small ghost" data-act="edit">Edit</button>
        <button class="btn small ghost" data-act="del">Remove</button>`;
      $('[data-act=edit]', row).addEventListener('click', () => editSite(s));
      $('[data-act=del]', row).addEventListener('click', async () => {
        if (!confirm(`Remove ${s.name} from the allowed list?`)) return;
        const sites = family.sites.filter((x) => x.id !== s.id);
        await store.saveFamily({ sites });
        family.sites = sites;
        renderSites();
        renderRequests();
      });
      lst.append(row);
    }
    root.append(panel);
  }
}

// ---------- settings view ----------
function renderSettings() {
  const f = $('#settings-form');
  f.elements.kidName.value = family.kidName || '';
  f.elements.blockUnlisted.checked = family.blockUnlisted !== false;
}

$('#settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const data = { kidName: f.elements.kidName.value.trim(), blockUnlisted: f.elements.blockUnlisted.checked };
  try {
    await store.saveFamily(data);
    Object.assign(family, data);
    msg($('#settings-msg'), '✅ Saved.');
  } catch (err) {
    msg($('#settings-msg'), err.message, false);
  }
});

$('#copy-code').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#setup-code').value); $('#copy-code').textContent = 'Copied!'; }
  catch { $('#setup-code').select(); }
  setTimeout(() => { $('#copy-code').textContent = 'Copy'; }, 1500);
});

$('#disconnect').addEventListener('click', () => {
  if (!confirm('Forget this family on this device? You can reconnect later with the setup code.')) return;
  localStorage.removeItem(LS_KEY);
  location.reload();
});

// ---------- start ----------
let saved = null;
try { saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch {}
if (saved?.familyId) connect(saved); else showSetup();

setInterval(() => { if (store && document.visibilityState === 'visible') loadAll(); }, 60000);
