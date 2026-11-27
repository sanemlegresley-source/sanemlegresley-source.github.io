// KidSafe shared helpers. This file is identical in /extension and /parent.
// It talks to Cloud Firestore over plain REST (no SDK), so it works in a
// Manifest V3 service worker as well as on a normal web page.

export const CATEGORIES = [
  { id: 'school',   label: 'Email & School', emoji: '📚', color: '#257de0' },
  { id: 'learning', label: 'Learning',       emoji: '🧠', color: '#00b894' },
  { id: 'games',    label: 'Games',          emoji: '🎮', color: '#f47230' },
  { id: 'videos',   label: 'Videos & Music', emoji: '🎬', color: '#ee7fac' },
  { id: 'creative', label: 'Create',         emoji: '🎨', color: '#6a4ce2' },
  { id: 'other',    label: 'More',           emoji: '⭐', color: '#f2a600' },
];

export const NEW_DAYS = 7; // a site shows in "New" for this many days after you add it

export const DEFAULT_SITES = [
  { name: 'Gmail', url: 'https://mail.google.com', category: 'school', icon: '',
    domains: ['accounts.google.com'] },
  { name: 'Google Classroom', url: 'https://classroom.google.com', category: 'school', icon: '',
    domains: ['accounts.google.com', 'docs.google.com', 'drive.google.com'] },
  { name: 'Google Docs', url: 'https://docs.google.com', category: 'school', icon: '',
    domains: ['accounts.google.com'] },
  { name: 'Khan Academy', url: 'https://www.khanacademy.org', category: 'learning', icon: '',
    domains: [] },
  { name: 'PBS Kids Games', url: 'https://pbskids.org/games', category: 'games', icon: '',
    domains: [] },
];

// ---------- small utilities ----------

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { return new URL(s).href.replace(/\/$/, ''); } catch { return ''; }
}

export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function randomId(len = 24) {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

export function formatDuration(sec) {
  sec = Math.round(sec || 0);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function faviconUrl(url) {
  const h = hostOf(url);
  return h ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=128` : '';
}

// Every domain the kid may open: each site's own host plus its extra domains.
export function allowedDomains(family) {
  const set = new Set();
  for (const s of family?.sites || []) {
    const h = hostOf(s.url);
    if (h) set.add(h);
    for (const d of s.domains || []) {
      const x = String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
      if (x) set.add(x);
    }
  }
  return [...set];
}

// Setup code = base64 of {p: projectId, k: apiKey, f: familyId}
export function makeSetupCode(cfg) {
  return 'KS1.' + btoa(JSON.stringify({ p: cfg.projectId, k: cfg.apiKey, f: cfg.familyId }));
}

export function parseSetupCode(code) {
  const s = String(code || '').trim();
  if (!s.startsWith('KS1.')) throw new Error('That does not look like a KidSafe setup code.');
  const o = JSON.parse(atob(s.slice(4)));
  if (!o.p || !o.k || !o.f) throw new Error('Setup code is incomplete.');
  return { projectId: o.p, apiKey: o.k, familyId: o.f };
}

// ---------- Firestore value encoding ----------

export function encode(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) fields[k] = encode(x);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

export function decode(v) {
  if (!v) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  return null;
}

function decodeFields(fields) {
  const o = {};
  for (const [k, x] of Object.entries(fields)) o[k] = decode(x);
  return o;
}

// ---------- Store ----------

export class FamilyStore {
  constructor({ projectId, apiKey, familyId }) {
    this.apiKey = apiKey;
    this.familyId = familyId;
    this.base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
  }

  async _req(method, path, body, query = '') {
    const sep = query ? '&' : '';
    const res = await fetch(`${this.base}/${path}?${query}${sep}key=${encodeURIComponent(this.apiKey)}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      let msg = `${res.status}`;
      try { msg += ' ' + ((await res.json()).error?.message || ''); } catch {}
      throw new Error(`Firestore ${method} failed: ${msg}`);
    }
    return res.json();
  }

  async getDoc(path) {
    const doc = await this._req('GET', path);
    return doc ? decodeFields(doc.fields || {}) : null;
  }

  // Writes only the given top-level fields (others on the document are left alone).
  async setFields(path, data) {
    const fields = {};
    const mask = [];
    for (const [k, v] of Object.entries(data)) {
      fields[k] = encode(v);
      mask.push(`updateMask.fieldPaths=${encodeURIComponent(k)}`);
    }
    return this._req('PATCH', path, { fields }, mask.join('&'));
  }

  familyPath() { return `families/${this.familyId}`; }
  usagePath(day) { return `families/${this.familyId}/usage/${day}`; }

  getFamily() { return this.getDoc(this.familyPath()); }
  saveFamily(data) { return this.setFields(this.familyPath(), { ...data, updatedAt: Date.now() }); }
  getUsage(day) { return this.getDoc(this.usagePath(day)); }
  saveUsage(day, data) { return this.setFields(this.usagePath(day), data); }
}
