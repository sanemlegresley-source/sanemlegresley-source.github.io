// KidSafe background worker:
//  1. measures how long each website is the active, focused tab
//  2. blocks every site that is not on the parent's allow-list
//  3. every minute, uploads usage and downloads the latest allow-list

import { FamilyStore, allowedDomains, dayKey, hostOf } from './shared.js';

const TICK_MIN = 1;          // sync + flush every minute
const MAX_CHUNK_SEC = 120;   // never credit more than this per flush (protects against sleep/suspend)
const MAX_SESSIONS = 600;    // per day
const KEEP_DAYS = 7;         // local copies of usage

// ---------- serial queue so async event handlers never interleave ----------
let chain = Promise.resolve();
function serial(fn) {
  chain = chain.then(fn, fn).catch((e) => console.warn('[KidSafe]', e));
  return chain;
}

// ---------- storage helpers ----------
const local = chrome.storage.local;
const session = chrome.storage.session;

async function getConfig() {
  return (await local.get('config')).config || null;
}

async function getStore() {
  const cfg = await getConfig();
  return cfg ? new FamilyStore(cfg) : null;
}

async function loadUsage(day) {
  const key = `usage:${day}`;
  return (await local.get(key))[key] || { date: day, totals: {}, sessions: [], blocked: {} };
}

async function saveUsageLocal(day, usage) {
  const { dirtyDays = [] } = await local.get('dirtyDays');
  if (!dirtyDays.includes(day)) dirtyDays.push(day);
  await local.set({ [`usage:${day}`]: usage, dirtyDays });
}

// ---------- time tracking ----------
// "current" = { domain, title, since } for the site being looked at right now.

async function commitCurrent() {
  const { current } = await session.get('current');
  if (!current) return;
  const now = Date.now();
  const sec = Math.min(Math.round((now - current.since) / 1000), MAX_CHUNK_SEC);
  if (sec > 0) {
    const day = dayKey();
    const usage = await loadUsage(day);
    usage.totals[current.domain] = (usage.totals[current.domain] || 0) + sec;
    const last = usage.sessions[usage.sessions.length - 1];
    const start = now - sec * 1000;
    if (last && last.d === current.domain && last.s + (last.sec + 15) * 1000 >= start) {
      last.sec += sec;
      if (current.title) last.t = current.title;
    } else {
      usage.sessions.push({ d: current.domain, t: (current.title || '').slice(0, 120), s: start, sec });
      if (usage.sessions.length > MAX_SESSIONS) usage.sessions.splice(0, usage.sessions.length - MAX_SESSIONS);
    }
    await saveUsageLocal(day, usage);
  }
  await session.set({ current: { ...current, since: now } });
}

async function setCurrentFromTab(tab) {
  await commitCurrent();
  let current = null;
  if (tab && /^https?:/.test(tab.url || '')) {
    const domain = hostOf(tab.url);
    if (domain) current = { domain, title: tab.title || '', since: Date.now() };
  }
  await session.set({ current });
}

async function refreshCurrent() {
  const idle = await chrome.idle.queryState(60);
  if (idle !== 'active') return setCurrentFromTab(null);
  const win = await chrome.windows.getLastFocused().catch(() => null);
  if (!win || !win.focused) return setCurrentFromTab(null);
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  return setCurrentFromTab(tab || null);
}

chrome.tabs.onActivated.addListener(() => serial(refreshCurrent));
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (tab.active && (info.url || info.title || info.status === 'complete')) serial(refreshCurrent);
});
chrome.windows.onFocusChanged.addListener(() => serial(refreshCurrent));
chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener(() => serial(refreshCurrent));

// ---------- blocking ----------

const BLOCK_RULE = 1;
const ALLOW_RULE = 2;

async function applyRules(family) {
  const domains = allowedDomains(family);
  const block = family ? family.blockUnlisted !== false : false;
  const addRules = [];
  if (block) {
    addRules.push({
      id: BLOCK_RULE,
      priority: 1,
      action: { type: 'redirect', redirect: { regexSubstitution: chrome.runtime.getURL('blocked.html') + '#\\0' } },
      condition: { regexFilter: '^https?://.*', resourceTypes: ['main_frame'] },
    });
    if (domains.length) {
      addRules.push({
        id: ALLOW_RULE,
        priority: 2,
        action: { type: 'allow' },
        condition: { requestDomains: domains, resourceTypes: ['main_frame'] },
      });
    }
  }
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [BLOCK_RULE, ALLOW_RULE],
    addRules,
  });
}

async function recordBlocked(url, ask) {
  const domain = hostOf(url);
  if (!domain) return;
  const day = dayKey();
  const usage = await loadUsage(day);
  const b = usage.blocked[domain] || { count: 0, url, asked: false };
  if (ask) {
    b.asked = true;
    b.askedAt = Date.now();
  } else {
    b.count += 1;
  }
  b.url = url.slice(0, 300);
  b.last = Date.now();
  usage.blocked[domain] = b;
  await saveUsageLocal(day, usage);
}

// ---------- sync ----------

async function sync() {
  const store = await getStore();
  if (!store) return;
  const status = { lastTry: Date.now() };
  try {
    // Push usage
    const { dirtyDays = [] } = await local.get('dirtyDays');
    const today = dayKey();
    const days = dirtyDays.includes(today) ? dirtyDays : [...dirtyDays, today];
    for (const day of days) {
      const u = await loadUsage(day);
      await store.saveUsage(day, { date: day, totals: u.totals, sessions: u.sessions, blocked: u.blocked, updatedAt: Date.now() });
    }
    await local.set({ dirtyDays: [] });

    // Pull allow-list
    const family = await store.getFamily();
    if (family) {
      await local.set({ family });
      await applyRules(family);
    }
    status.ok = true;
    status.lastSync = Date.now();
    status.familyFound = !!family;
  } catch (e) {
    status.ok = false;
    status.error = String(e.message || e);
  }
  await local.set({ syncStatus: status });

  // Housekeeping: drop old local days
  const all = await local.get(null);
  const cutoff = dayKey(new Date(Date.now() - KEEP_DAYS * 86400000));
  const old = Object.keys(all).filter((k) => k.startsWith('usage:') && k.slice(6) < cutoff);
  if (old.length) await local.remove(old);
}

async function tick() {
  await refreshCurrent();
  await sync();
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'tick') serial(tick);
});

async function ensureAlarm() {
  const a = await chrome.alarms.get('tick');
  if (!a) chrome.alarms.create('tick', { periodInMinutes: TICK_MIN });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await ensureAlarm();
  const { family } = await local.get('family');
  await applyRules(family || null);
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  serial(tick);
});

// ---------- messages from pages ----------

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'blocked') {
    serial(() => recordBlocked(msg.url, false)).then(() => reply({ ok: true }));
    return true;
  }
  if (msg?.type === 'ask') {
    serial(async () => { await recordBlocked(msg.url, true); await sync(); }).then(() => reply({ ok: true }));
    return true;
  }
  if (msg?.type === 'syncNow') {
    serial(tick).then(async () => reply((await local.get('syncStatus')).syncStatus || {}));
    return true;
  }
  if (msg?.type === 'configChanged') {
    serial(async () => {
      await local.remove('family');
      await applyRules(null);
      await tick();
    }).then(async () => reply((await local.get('syncStatus')).syncStatus || {}));
    return true;
  }
  if (msg?.type === 'todayUsage') {
    loadUsage(dayKey()).then(reply);
    return true;
  }
  return false;
});

ensureAlarm();
