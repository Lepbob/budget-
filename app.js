(function () {
'use strict';

/* ---------- Utilitaires ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur = (c) => { c = Math.round(c); return (c % 100 === 0 ? nf0 : nf2).format(c / 100); };
const pct = (v) => Math.round(v * 100) + ' %';
const parseMoney = (s) => { const n = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? Math.round(n * 100) : NaN; };
const toInput = (c) => String(c / 100).replace('.', ',');
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parse = (s) => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const weekStartOf = (s, dow) => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() - dow + 7) % 7)); return ymd(d); };
const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
const fmtDay = (s) => parse(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = (s) => parse(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const median = (a) => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const CTX = [['prevu', 'Prévu'], ['impulsif', 'Impulsif'], ['stress', 'Stress'], ['ennui', 'Ennui'], ['social', 'Social']];
const ctxName = (k) => (CTX.find((c) => c[0] === k) || [0, ''])[1];
const PALETTE = ['#3B6FE0', '#E07B39', '#2FA37A', '#B04FC9', '#D9A11C', '#D1495B', '#5B8DA6', '#8A7A5C'];
const PERIODS = { weekly: 'Chaque semaine', monthly: 'Chaque mois', quarterly: 'Chaque trimestre', yearly: 'Chaque année' };

/* ---------- Données ---------- */
const DEF_CATS = [
  { id: 'courses', name: 'Courses', budget: 0 }, { id: 'resto', name: 'Restaurants et sorties', budget: 0 },
  { id: 'transport', name: 'Transport', budget: 0 }, { id: 'sante', name: 'Santé', budget: 0 },
  { id: 'loisirs', name: 'Loisirs', budget: 0 }, { id: 'maison', name: 'Maison', budget: 0 },
  { id: 'autres', name: 'Autres', budget: 0 }
];
const DEF_S = { t: 's', setupDone: false, income: 0, savings: 0, mode: 'auto', manual: 0, weekStart: 1, carry: true, startDate: '', cats: DEF_CATS };
let DOCS = {}, S = { ...DEF_S }, EXP = [], REC = [], GOALS = [];
let LOADING = true, tab = 'week', weekSel = null, pendingRender = false;
let X = {}; // cache de calcul

/* ---------- Données locales + synchronisation GitHub ---------- */
const CFG_KEY = 'budget-hebdo-gh', CACHE_KEY = 'budget-hebdo-cache', NOSYNC_KEY = 'budget-hebdo-nosync', SYNC_TS_KEY = 'budget-hebdo-lastsync';
let cfg = null, noSync = false, lastSync = 0, syncing = false, syncAgain = false, syncTimer = null, syncState = 'load', syncErr = '';
const TOMB_DAYS = 180;

const liveDocs = () => { const o = {}; for (const k of Object.keys(DOCS)) if (!DOCS[k].deleted) o[k] = DOCS[k]; return o; };
function ingest() {
  const live = liveDocs();
  const st = live.settings ? { ...live.settings } : {};
  delete st.id; delete st.updatedAt;
  S = { ...DEF_S, ...st };
  if (!Array.isArray(S.cats) || !S.cats.length) S.cats = DEF_CATS;
  const all = Object.values(live);
  EXP = all.filter((d) => d.t === 'e');
  REC = all.filter((d) => d.t === 'r');
  GOALS = all.filter((d) => d.t === 'g').sort((a, b) => (a.ts || 0) - (b.ts || 0));
  X = {};
}
function saveLocal() { try { localStorage.setItem(CACHE_KEY, JSON.stringify(DOCS)); } catch (e) {} }
function loadLocal() { try { const r = localStorage.getItem(CACHE_KEY); DOCS = r ? JSON.parse(r) || {} : {}; } catch (e) { DOCS = {}; } }
function loadCfg() {
  try { cfg = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch (e) { cfg = null; }
  try { noSync = localStorage.getItem(NOSYNC_KEY) === '1'; lastSync = +localStorage.getItem(SYNC_TS_KEY) || 0; } catch (e) {}
}

const store = {
  async set(id, data) {
    const body = { ...data }; delete body.id; delete body.deleted;
    DOCS[id] = { ...body, id, updatedAt: Date.now() };
    saveLocal(); ingest(); renderSoon(); scheduleSync();
  },
  async del(id) {
    DOCS[id] = { id, deleted: true, updatedAt: Date.now() };
    saveLocal(); ingest(); renderSoon(); scheduleSync();
  }
};
async function write(fn) {
  try { await fn(); return true; }
  catch (e) { toast('Enregistrement impossible pour le moment. Réessayez.'); return false; }
}
const saveSettings = (patch) => { S = { ...S, ...patch }; return write(() => store.set('settings', S)); };

/* --- GitHub : un fichier JSON dans un dépôt privé, lu et écrit avec l'API Contents --- */
const b64e = (str) => { const b = new TextEncoder().encode(str); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); };
const b64d = (str) => { const bin = atob(str.replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };
class GhError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const ghHeaders = (token, extra) => Object.assign({ Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, extra || {});
async function ghFetch(url, opt) { try { return await fetch(url, Object.assign({ cache: 'no-store' }, opt)); } catch (e) { throw new GhError(0, 'Impossible de joindre GitHub.'); } }
const fileUrl = () => 'https://api.github.com/repos/' + cfg.repo + '/contents/' + cfg.path.split('/').map(encodeURIComponent).join('/');

async function testRepo(repo, token) {
  const r = await ghFetch('https://api.github.com/repos/' + repo, { headers: ghHeaders(token) });
  if (r.status === 401) throw new GhError(401, 'Token refusé ou expiré.');
  if (r.status === 404) throw new GhError(404, 'Dépôt introuvable, ou token sans accès à ce dépôt.');
  if (!r.ok) throw new GhError(r.status, 'GitHub a répondu ' + r.status + '.');
  const j = await r.json();
  if (j.private === false) throw new GhError(0, 'Ce dépôt est public : vos dépenses seraient visibles de tous. Utilisez un dépôt privé.');
  if (j.permissions && j.permissions.push === false) throw new GhError(403, 'Ce token ne peut pas écrire. Donnez-lui la permission Contents : Read and write.');
  return j;
}
async function pull() {
  const q = '?ref=' + encodeURIComponent(cfg.branch);
  const r = await ghFetch(fileUrl() + q, { headers: ghHeaders(cfg.token) });
  if (r.status === 404) return { docs: {}, sha: null };
  if (!r.ok) throw new GhError(r.status, 'GitHub a répondu ' + r.status + '.');
  const j = await r.json(); let text;
  if (j.content && j.encoding === 'base64') text = b64d(j.content);
  else { // fichier de plus de 1 Mo : lecture brute
    const r2 = await ghFetch(fileUrl() + q, { headers: ghHeaders(cfg.token, { Accept: 'application/vnd.github.raw+json' }) });
    if (!r2.ok) throw new GhError(r2.status, 'GitHub a répondu ' + r2.status + '.');
    text = await r2.text();
  }
  let data; try { data = JSON.parse(text); } catch (e) { throw new GhError(0, 'Le fichier de données sur GitHub est illisible.'); }
  return { docs: (data && data.docs) || {}, sha: j.sha };
}
async function pushRemote(docs, sha) {
  const body = { message: 'Budget hebdo : mise à jour', content: b64e(JSON.stringify({ version: 1, docs })), branch: cfg.branch };
  if (sha) body.sha = sha;
  const r = await ghFetch(fileUrl(), { method: 'PUT', headers: ghHeaders(cfg.token, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) throw new GhError(409, 'Conflit d\'écriture.');
  if (!r.ok) throw new GhError(r.status, 'GitHub a répondu ' + r.status + '.');
}
const bare = (docs) => { const o = {}; for (const k of Object.keys(docs)) { const d = { ...docs[k] }; delete d.id; o[k] = d; } return o; };
const withIds = (docs) => { const o = {}; for (const k of Object.keys(docs)) o[k] = { ...docs[k], id: k }; return o; };
function mergeDocs(a, b) { // le plus récent gagne, document par document
  const o = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const x = a[k], y = b[k]; o[k] = !x ? y : !y ? x : ((y.updatedAt || 0) > (x.updatedAt || 0) ? y : x); }
  return o;
}
function sameDocs(a, b) { const ka = Object.keys(a); return ka.length === Object.keys(b).length && ka.every((k) => b[k] && (b[k].updatedAt || 0) === (a[k].updatedAt || 0)); }
function prune(docs) { const lim = Date.now() - TOMB_DAYS * 864e5, o = {}; for (const k of Object.keys(docs)) if (!(docs[k].deleted && (docs[k].updatedAt || 0) < lim)) o[k] = docs[k]; return o; }

function scheduleSync(ms) { if (!cfg) return; clearTimeout(syncTimer); syncTimer = setTimeout(sync, ms == null ? 1500 : ms); }
async function sync() {
  if (!cfg) return;
  if (!navigator.onLine) { setSync('offline'); return; }
  if (syncing) { syncAgain = true; return; }
  syncing = true; setSync('pending');
  try {
    for (let i = 0; i < 4; i++) {
      const r = await pull(), remote = withIds(r.docs);
      const merged = prune(mergeDocs(DOCS, remote));
      const localChanged = !sameDocs(merged, DOCS), needPush = !sameDocs(merged, remote);
      if (localChanged) { DOCS = merged; saveLocal(); ingest(); renderSoon(); }
      if (needPush) { try { await pushRemote(bare(merged), r.sha); } catch (e) { if (e.status === 409 && i < 3) continue; throw e; } }
      lastSync = Date.now(); try { localStorage.setItem(SYNC_TS_KEY, String(lastSync)); } catch (e) {}
      syncErr = ''; setSync('ok'); break;
    }
  } catch (e) {
    if (e.status === 401 || e.status === 403) setSync('auth');
    else if (e.status === 0 && !navigator.onLine) setSync('offline');
    else { syncErr = e.message || 'Erreur inconnue'; setSync('error'); }
  } finally { syncing = false; if (syncAgain) { syncAgain = false; scheduleSync(300); } }
}

/* ---------- Calculs ---------- */
const catById = (id) => S.cats.find((c) => c.id === id);
const catName = (id) => (catById(id) || { name: 'Catégorie supprimée' }).name;
const catColor = (id) => { const i = S.cats.findIndex((c) => c.id === id); return i < 0 ? '#8A7A5C' : PALETTE[i % PALETTE.length]; };
const curWeek = () => weekStartOf(today(), S.weekStart);
function monthlyEq(r) { const a = r.amount; return { weekly: a * 52 / 12, monthly: a, quarterly: a / 3, yearly: a / 12 }[r.period] || 0; }
const fixedMonthly = () => REC.reduce((s, r) => s + monthlyEq(r), 0);
function freeMonthly() { return S.income - S.savings - fixedMonthly(); }
function baseWeekly() { return S.mode === 'manual' ? S.manual : Math.max(0, Math.round(freeMonthly() * 12 / 52)); }
function weekMap() {
  if (X.wm) return X.wm;
  const m = {}, c = {};
  for (const e of EXP) { const w = weekStartOf(e.date, S.weekStart); m[w] = (m[w] || 0) + e.amount; (c[w] = c[w] || {})[e.cat] = ((c[w] || {})[e.cat] || 0) + e.amount; }
  X.wm = m; X.wc = c; return m;
}
const weekSpent = (w) => weekMap()[w] || 0;
const weekCat = (w, cat) => ((X.wc || (weekMap(), X.wc))[w] || {})[cat] || 0;
function carryFor(w) {
  if (!S.carry) return 0;
  const start = weekStartOf(S.startDate || today(), S.weekStart);
  if (w <= start) return 0;
  const base = baseWeekly(); let c = 0, i = 0;
  // Un dépassement se reporte en entier ; un excédent est plafonné à un budget hebdo.
  for (let k = start; k < w && i < 520; k = addDays(k, 7), i++) c = Math.min(base, c + base - weekSpent(k));
  return c;
}
function weekInfo(w) {
  const base = baseWeekly(), carry = carryFor(w), avail = base + carry, spent = weekSpent(w);
  const ratio = avail > 0 ? spent / avail : (spent > 0 ? 2 : 0);
  return { base, carry, avail, spent, left: avail - spent, ratio, st: ratio > 1 ? 'bad' : ratio >= 0.8 ? 'warn' : 'ok' };
}
function alertsFor(w) {
  const out = [], inf = weekInfo(w);
  if (inf.avail > 0 || inf.spent > 0) {
    if (inf.ratio > 1) out.push({ lvl: 'bad', html: '<b>Budget de la semaine dépassé</b> de ' + eur(-inf.left) + '.' });
    else if (inf.ratio >= 0.8) out.push({ lvl: 'warn', html: 'Vous avez utilisé <b>' + pct(inf.ratio) + '</b> du budget de la semaine. Il reste ' + eur(inf.left) + '.' });
  }
  for (const c of S.cats) {
    if (!c.budget) continue;
    const r = weekCat(w, c.id) / c.budget;
    if (r > 1) out.push({ lvl: 'bad', html: '<b>' + esc(c.name) + '</b> : budget dépassé de ' + eur(weekCat(w, c.id) - c.budget) + '.' });
    else if (r >= 0.8) out.push({ lvl: 'warn', html: '<b>' + esc(c.name) + '</b> : ' + pct(r) + ' du budget consommé.' });
  }
  return out;
}
function detectSubs() {
  const g = {};
  for (const e of EXP) { const k = (e.note || '').trim().toLowerCase(); if (k) (g[k] = g[k] || []).push(e); }
  const out = [];
  for (const k of Object.keys(g)) {
    const l = g[k].sort((a, b) => (a.date < b.date ? -1 : 1));
    if (l.length < 3 || REC.some((r) => r.name.trim().toLowerCase() === k)) continue;
    const med = median(l.map((e) => e.amount));
    if (l.some((e) => Math.abs(e.amount - med) > med * 0.1)) continue;
    const gaps = []; for (let i = 1; i < l.length; i++) gaps.push(diffDays(l[i].date, l[i - 1].date));
    const gm = median(gaps);
    const period = gm >= 26 && gm <= 35 ? 'monthly' : gm >= 6 && gm <= 8 ? 'weekly' : null;
    if (period) out.push({ name: l[l.length - 1].note.trim(), amount: Math.round(med), period, count: l.length });
  }
  return out;
}

/* ---------- Rendu ---------- */
const ICONS = {
  week: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  stats: '<path d="M5 20V11M12 20V5M19 20v-6"/>',
  fixed: '<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5"/>',
  save: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
  gear: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'
};
const TABS = [['week', 'Semaine'], ['stats', 'Stats'], ['fixed', 'Fixes'], ['save', 'Épargne'], ['gear', 'Réglages']];
function renderTabs() {
  $('#tabs').innerHTML = TABS.map((t) => '<button class="tab" data-act="tab" data-tab="' + t[0] + '"' + (tab === t[0] ? ' aria-current="page"' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[t[0]] + '</svg>' + t[1] + '</button>').join('');
}
function render() {
  pendingRender = false;
  if (!weekSel) weekSel = curWeek();
  renderTabs();
  const v = $('#view');
  if (LOADING) { v.innerHTML = '<div class="skeleton"></div><div class="skeleton" style="height:90px"></div>'; return; }
  const connecting = !cfg && !noSync;
  $('#tabbar').hidden = connecting;
  if (connecting) { v.innerHTML = viewConnect(); $('#fab').hidden = true; return; }
  v.innerHTML = ({ week: viewWeek, stats: viewStats, fixed: viewFixed, save: viewSave, gear: viewSettings }[tab])();
  $('#fab').hidden = tab === 'gear';
}
function renderSoon() {
  const a = document.activeElement;
  if (a && a.closest && a.closest('#view') && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { pendingRender = true; return; }
  render();
}
document.addEventListener('focusout', () => { if (pendingRender) setTimeout(render, 0); });

function setSync(state) {
  syncState = state;
  const m = { ok: ['ok', 'Synchronisé'], pending: ['warn', 'Synchronisation…'], offline: ['warn', 'Hors ligne'], auth: ['bad', 'Token refusé'], error: ['bad', 'Erreur de synchro'], local: ['warn', 'Sans synchronisation'], load: ['', 'Chargement…'] }[state];
  const b = $('#sync'); b.className = 'badge ' + m[0]; b.lastElementChild.textContent = m[1];
  if (tab === 'gear' && !LOADING && state !== 'pending') renderSoon();
}
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3800); }

/* --- Semaine --- */
function viewWeek() {
  const w = weekSel, cur = w === curWeek();
  const nav = '<div class="weeknav"><button class="icon-btn" data-act="wk" data-d="-7" aria-label="Semaine précédente"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>' +
    '<div class="label">' + (cur ? 'Cette semaine' : fmtShort(w) + ' – ' + fmtShort(addDays(w, 6))) +
    '<div class="small muted" style="font-family:var(--font-body);font-weight:500">' +
    (cur ? fmtShort(w) + ' – ' + fmtShort(addDays(w, 6)) : '<button class="link" data-act="wkNow">Revenir à cette semaine</button>') + '</div></div>' +
    '<button class="icon-btn" data-act="wk" data-d="7" aria-label="Semaine suivante"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button></div>';
  if (!S.setupDone) return nav + onboarding();
  const inf = weekInfo(w);
  const stText = { ok: 'Dans le budget', warn: 'Attention', bad: 'Dépassé' }[inf.st];
  let sub = '';
  if (cur && inf.left > 0) { const days = 7 - diffDays(today(), w); if (days > 0) sub = '<span>≈ <strong>' + eur(inf.left / days) + '</strong> par jour, pour ' + days + ' jour' + (days > 1 ? 's' : '') + '</span>'; }
  const hero = '<section class="card hero ' + inf.st + '"><div class="row"><div class="lbl">' + (inf.left < 0 ? 'Dépassement' : 'Reste à dépenser') + '</div><span class="pill ' + inf.st + '">' + stText + '</span></div>' +
    '<div class="big num">' + eur(Math.abs(inf.left)) + '</div>' +
    '<div class="gauge" role="img" aria-label="' + pct(Math.min(inf.ratio, 1)) + ' du budget utilisé"><b style="width:' + Math.min(100, Math.round(inf.ratio * 100)) + '%"></b></div>' +
    '<div class="meta num"><span><strong>' + eur(inf.spent) + '</strong> dépensés</span><span>Budget <strong>' + eur(inf.base) + '</strong></span>' +
    (inf.carry ? '<span>' + (inf.carry > 0 ? 'Report <strong>+' : 'Report <strong>−') + eur(Math.abs(inf.carry)) + '</strong></span>' : '') + sub + '</div></section>';
  let reminder = '';
  const hasToday = EXP.some((e) => e.date === today());
  if (cur && !hasToday && new Date().getHours() >= 18) reminder = '<div class="alert info">Aucune dépense saisie aujourd\'hui. Ajoutez-les maintenant, ou passez si vous n\'avez rien dépensé.</div>';
  const al = alertsFor(w).map((a) => '<div class="alert ' + (a.lvl === 'bad' ? 'bad' : '') + '">' + a.html + '</div>').join('');
  const rows = S.cats.filter((c) => c.budget || weekCat(w, c.id)).concat(
    EXP.some((e) => !catById(e.cat) && weekStartOf(e.date, S.weekStart) === w) ? [{ id: '__x', name: 'Catégorie supprimée', budget: 0 }] : []);
  let cats = '';
  if (rows.length) {
    cats = '<section class="card"><div class="sect-title"><h3>Par catégorie</h3></div>' + rows.map((c) => {
      const sp = c.id === '__x' ? EXP.filter((e) => !catById(e.cat) && weekStartOf(e.date, S.weekStart) === w).reduce((s, e) => s + e.amount, 0) : weekCat(w, c.id);
      const r = c.budget ? sp / c.budget : 0;
      const col = c.budget ? (r > 1 ? 'var(--bad)' : r >= 0.8 ? 'var(--warn)' : catColor(c.id)) : catColor(c.id);
      const w100 = c.budget ? Math.min(100, Math.round(r * 100)) : 100;
      return '<div class="catrow"><div class="catname"><span class="dot" style="background:' + catColor(c.id) + '"></span><span>' + esc(c.name) + '</span></div><div class="num small"><strong>' + eur(sp) + '</strong>' + (c.budget ? ' <span class="muted">/ ' + eur(c.budget) + '</span>' : '') + '</div>' +
        '<div class="minibar"><b style="width:' + w100 + '%;background:' + col + ';' + (c.budget ? '' : 'opacity:.35') + '"></b></div></div>';
    }).join('') + '</section>';
  }
  const list = EXP.filter((e) => weekStartOf(e.date, S.weekStart) === w).sort((a, b) => (a.date === b.date ? (b.ts || 0) - (a.ts || 0) : a.date < b.date ? 1 : -1));
  let lh = '';
  if (!list.length) lh = '<div class="card empty"><b>Aucune dépense cette semaine</b>Touchez le bouton + pour saisir la première.</div>';
  else {
    let last = '';
    lh = '<section class="card">' + list.map((e) => {
      let h = '';
      if (e.date !== last) { last = e.date; const tot = list.filter((x) => x.date === e.date).reduce((s, x) => s + x.amount, 0); h = '<div class="day"><span>' + fmtDay(e.date) + '</span><span class="num">' + eur(tot) + '</span></div>'; }
      return h + '<button class="exp" data-act="editExp" data-id="' + esc(e.id) + '"><span class="dot" style="background:' + catColor(e.cat) + '"></span><span class="t"><div>' + esc(e.note || catName(e.cat)) + (e.ctx && e.ctx !== 'prevu' ? '<span class="tag ' + (e.ctx === 'impulsif' ? 'imp' : '') + '">' + ctxName(e.ctx) + '</span>' : '') + '</div>' + (e.note ? '<div class="small muted">' + esc(catName(e.cat)) + '</div>' : '') + '</span><span class="amt num">' + eur(e.amount) + '</span></button>';
    }).join('') + '</section>';
  }
  const warnFree = S.mode === 'auto' && freeMonthly() < 0 ? '<div class="alert bad">Vos charges fixes et votre épargne dépassent vos revenus. Le budget hebdo automatique est à 0. Vérifiez vos montants dans Réglages et Fixes.</div>' : '';
  return nav + hero + warnFree + reminder + al + cats + lh;
}
function onboarding() {
  return '<section class="card stack"><h2>Fixons votre budget</h2><p class="muted">Indiquez vos revenus et ce que vous voulez mettre de côté. L\'appli retire vos charges fixes (onglet Fixes) et divise le reste par semaine.</p>' +
    '<label class="f">Revenus nets par mois<input id="obIncome" inputmode="decimal" placeholder="2 000"></label>' +
    '<label class="f">Épargne visée par mois<input id="obSave" inputmode="decimal" placeholder="150"></label>' +
    '<div class="actions"><button class="btn primary" data-act="obSave">Calculer mon budget</button></div>' +
    '<p class="small muted">Vous préférez fixer vous-même un montant par semaine ? Vous pourrez le faire dans Réglages.</p></section>';
}

/* --- Stats --- */
function niceMax(v) { const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; }
function weeksChart() {
  const cw = curWeek(), n = 8, rows = [];
  for (let i = n - 1; i >= 0; i--) { const w = addDays(cw, -7 * i); rows.push({ w, s: weekSpent(w) }); }
  const base = baseWeekly(), max = niceMax(Math.max(base, ...rows.map((r) => r.s), 1000) * 1.05);
  const W = 340, H = 180, L = 44, R = 8, T = 10, B = 26, iw = W - L - R, ih = H - T - B, bw = iw / n;
  const y = (v) => T + ih - (v / max) * ih;
  let g = '';
  [0, max / 2, max].forEach((t) => { g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t) + '" y2="' + y(t) + '"/><text class="tick" x="' + (L - 6) + '" y="' + (y(t) + 3.5) + '" text-anchor="end">' + Math.round(t / 100) + ' €</text>'; });
  rows.forEach((r, i) => {
    const x = L + i * bw + bw * 0.18, h = Math.max(0, (r.s / max) * ih), over = base > 0 && r.s > base;
    g += '<rect class="bar ' + (over ? 'over ' : '') + (i === n - 1 ? 'cur' : 'past') + '" x="' + x.toFixed(1) + '" y="' + (T + ih - h).toFixed(1) + '" width="' + (bw * 0.64).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3"><title>' + fmtShort(r.w) + ' : ' + eur(r.s) + '</title></rect>';
    if (i % 2 === (n - 1) % 2) g += '<text class="tick" x="' + (x + bw * 0.32).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + fmtShort(r.w) + '</text>';
  });
  if (base > 0) g += '<line class="budget" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(base) + '" y2="' + y(base) + '"/>';
  const avg = rows.slice(0, -1).reduce((s, r) => s + r.s, 0) / (n - 1);
  return { svg: '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Dépenses des 8 dernières semaines">' + g + '</svg>', avg };
}
function monthData() {
  const t = today(), d = parse(t), dn = d.getDate();
  const cs = ymd(new Date(d.getFullYear(), d.getMonth(), 1, 12));
  const pm = new Date(d.getFullYear(), d.getMonth() - 1, 1, 12), ps = ymd(pm);
  const pDays = new Date(pm.getFullYear(), pm.getMonth() + 1, 0).getDate();
  const pe = ymd(new Date(pm.getFullYear(), pm.getMonth(), Math.min(dn, pDays), 12));
  const sum = (a, b) => { const o = { total: 0, cat: {} }; for (const e of EXP) if (e.date >= a && e.date <= b) { o.total += e.amount; o.cat[e.cat] = (o.cat[e.cat] || 0) + e.amount; } return o; };
  return { cur: sum(cs, t), prev: sum(ps, pe), name: d.toLocaleDateString('fr-FR', { month: 'long' }), pname: pm.toLocaleDateString('fr-FR', { month: 'long' }), dn };
}
function viewStats() {
  if (!EXP.length) return '<div class="card empty"><b>Pas encore de statistiques</b>Elles apparaissent dès les premières dépenses saisies.</div>';
  const ch = weeksChart(), m = monthData();
  const dl = (a, b) => { const d = a - b; if (!b && !a) return '<span class="muted">—</span>'; return '<span class="delta ' + (d > 0 ? 'up' : 'down') + ' num">' + (d > 0 ? '+' : '−') + eur(Math.abs(d)) + '</span>'; };
  const ids = [...new Set([...Object.keys(m.cur.cat), ...Object.keys(m.prev.cat)])].sort((a, b) => (m.cur.cat[b] || 0) - (m.cur.cat[a] || 0));
  const tot = m.cur.total || 1;
  const t30 = addDays(today(), -29), trig = {};
  for (const e of EXP) if (e.date >= t30 && e.ctx && e.ctx !== 'prevu') trig[e.ctx] = (trig[e.ctx] || 0) + e.amount;
  const tk = Object.keys(trig).sort((a, b) => trig[b] - trig[a]), tmax = tk.length ? trig[tk[0]] : 1;
  return '<section class="card"><div class="sect-title"><h2>8 dernières semaines</h2></div>' + ch.svg +
    '<div class="legend"><span><i style="background:var(--accent)"></i>Dépenses</span><span><i style="background:var(--bad)"></i>Au-dessus du budget</span><span><i style="background:var(--ink);height:2px"></i>Budget hebdo</span></div>' +
    '<p class="small muted" style="margin-top:8px">Moyenne des 7 semaines précédentes : <strong class="num" style="color:var(--ink)">' + eur(ch.avg) + '</strong></p></section>' +
    '<section class="card"><div class="sect-title"><h2>Ce mois-ci et le mois dernier</h2></div><p class="small muted" style="margin-bottom:10px">Comparaison sur les ' + m.dn + ' premiers jours de chaque mois.</p>' +
    '<table class="t"><thead><tr><th></th><th style="text-transform:capitalize">' + m.name + '</th><th style="text-transform:capitalize">' + m.pname + '</th><th>Écart</th></tr></thead><tbody>' +
    '<tr><td><strong>Total</strong></td><td class="num"><strong>' + eur(m.cur.total) + '</strong></td><td class="num">' + eur(m.prev.total) + '</td><td>' + dl(m.cur.total, m.prev.total) + '</td></tr>' +
    ids.map((id) => '<tr><td>' + esc(catName(id)) + '</td><td class="num">' + eur(m.cur.cat[id] || 0) + '</td><td class="num">' + eur(m.prev.cat[id] || 0) + '</td><td>' + dl(m.cur.cat[id] || 0, m.prev.cat[id] || 0) + '</td></tr>').join('') + '</tbody></table></section>' +
    '<section class="card"><div class="sect-title"><h2>Répartition du mois</h2></div>' + (ids.filter((id) => m.cur.cat[id]).length ? ids.filter((id) => m.cur.cat[id]).map((id) => '<div class="hbar"><span class="nm">' + esc(catName(id)) + '</span><span class="track"><b style="width:' + Math.max(2, Math.round(m.cur.cat[id] / tot * 100)) + '%;background:' + catColor(id) + '"></b></span><span class="num small">' + pct(m.cur.cat[id] / tot) + '</span></div>').join('') : '<p class="muted">Aucune dépense ce mois-ci.</p>') + '</section>' +
    '<section class="card"><div class="sect-title"><h2>Achats hors prévu</h2><span class="small muted">30 derniers jours</span></div>' + (tk.length ? tk.map((k) => '<div class="hbar"><span class="nm">' + ctxName(k) + '</span><span class="track"><b style="width:' + Math.max(4, Math.round(trig[k] / tmax * 100)) + '%;background:var(--bad)"></b></span><span class="num small">' + eur(trig[k]) + '</span></div>').join('') + '<p class="small muted" style="margin-top:12px">Votre premier déclencheur est « ' + ctxName(tk[0]).toLowerCase() + ' ». Notez le contexte en saisissant une dépense pour affiner ce tableau.</p>' : '<p class="muted">Aucune donnée. Dans « Plus de détails » à la saisie, choisissez un contexte (impulsif, stress, ennui…) pour repérer vos déclencheurs.</p>') + '</section>';
}

/* --- Fixes --- */
function viewFixed() {
  const list = [...REC].sort((a, b) => monthlyEq(b) - monthlyEq(a));
  const tm = fixedMonthly(), subs = detectSubs();
  let h = '<section class="card"><div class="row"><div><h3>Total par mois</h3><div class="kpi"><div class="v num">' + eur(tm) + '</div></div></div><div style="text-align:right"><h3>Par an</h3><div class="kpi"><div class="v num">' + eur(tm * 12) + '</div></div></div></div>' +
    '<p class="small muted" style="margin-top:8px">Ces charges sont déjà retirées de votre budget hebdo : inutile de les saisir comme dépenses.</p></section>';
  h += '<section class="card"><div class="sect-title"><h2>Charges et abonnements</h2><button class="btn sm primary" data-act="addRec">Ajouter</button></div>';
  if (!list.length) h += '<div class="empty"><b>Aucune charge fixe</b>Ajoutez le loyer, l\'assurance, les abonnements. Le budget hebdo s\'ajuste tout seul.</div>';
  else h += list.map((r, i) => '<button class="exp" data-act="editRec" data-id="' + esc(r.id) + '"><span class="t"><div>' + esc(r.name) + (i < 3 && list.length > 3 ? '<span class="tag">Plus gros poste</span>' : '') + '</div><div class="small muted">' + PERIODS[r.period] + (r.day ? ' · le ' + r.day : '') + ' · ' + eur(monthlyEq(r) * 12) + ' par an</div></span><span class="amt num">' + eur(r.amount) + '</span></button>').join('');
  h += '</section>';
  if (subs.length) h += '<section class="card stack"><div><h2>Abonnements possibles</h2><p class="small muted">Ces dépenses reviennent à intervalle régulier. Ajoutez-les en charge fixe, ou vérifiez s\'ils servent encore.</p></div>' + subs.map((s, i) => '<div class="row"><div><strong>' + esc(s.name) + '</strong><div class="small muted num">' + eur(s.amount) + ' · ' + (s.period === 'monthly' ? 'chaque mois' : 'chaque semaine') + ' · vu ' + s.count + ' fois</div></div><button class="btn sm" data-act="subAdd" data-i="' + i + '">Ajouter</button></div>').join('') + '</section>';
  return h;
}

/* --- Épargne --- */
function viewSave() {
  let h = '<section class="card"><h3>Épargne prévue</h3><div class="kpi"><div class="v num">' + eur(S.savings) + ' <span class="small muted" style="font-family:var(--font-body);font-weight:500">par mois</span></div></div><p class="small muted" style="margin-top:6px">Ce montant est déjà retiré de votre budget hebdo. Modifiez-le dans Réglages.</p></section>';
  h += '<section class="card"><div class="sect-title"><h2>Objectifs</h2><button class="btn sm primary" data-act="addGoal">Nouvel objectif</button></div>';
  if (!GOALS.length) h += '<div class="empty"><b>Aucun objectif</b>Vacances, fonds d\'urgence, projet : ajoutez un montant à atteindre.</div>';
  h += GOALS.map((g) => {
    const saved = (g.contrib || []).reduce((s, c) => s + c.a, 0) + (g.start || 0), p = g.target ? Math.min(1, saved / g.target) : 0;
    let need = '';
    if (g.deadline && saved < g.target) { const d = parse(g.deadline), n = new Date(); const mo = Math.max(1, (d.getFullYear() - n.getFullYear()) * 12 + d.getMonth() - n.getMonth()); need = '<div class="small muted">Pour tenir le ' + parse(g.deadline).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' : <strong class="num" style="color:var(--ink)">' + eur((g.target - saved) / mo) + '</strong> par mois.</div>'; }
    return '<div class="goal" style="border-top:1px solid var(--line);padding:14px 0 6px"><div class="row"><strong>' + esc(g.name) + '</strong><button class="link small" data-act="editGoal" data-id="' + esc(g.id) + '">Modifier</button></div>' +
      '<div class="bar" role="img" aria-label="' + pct(p) + ' atteint"><b style="width:' + Math.round(p * 100) + '%"></b></div>' +
      '<div class="row small"><span class="num"><strong>' + eur(saved) + '</strong> sur ' + eur(g.target) + '</span><span class="muted num">' + pct(p) + '</span></div>' + need +
      '<div class="inline"><input id="gv_' + esc(g.id) + '" inputmode="decimal" placeholder="Montant versé" aria-label="Montant à verser"><button class="btn" data-act="goalAdd" data-id="' + esc(g.id) + '">Verser</button></div></div>';
  }).join('') + '</section>';
  return h;
}

/* --- Connexion GitHub --- */
function connectCard(inSettings) {
  return '<section class="card stack ' + (inSettings ? '' : 'hello') + '"><h2>' + (inSettings ? 'Synchronisation GitHub' : 'Connectez votre espace GitHub') + '</h2>' +
    '<p class="muted">Vos données restent dans <strong>votre</strong> dépôt GitHub privé, sous forme d\'un fichier JSON. Aucun autre serveur n\'est utilisé.</p>' +
    '<ol class="steps"><li>Créez un dépôt <strong>privé</strong> vide sur GitHub (par exemple <em>budget-data</em>).</li>' +
    '<li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Créez un token</a> « fine-grained », limité à ce seul dépôt, avec la permission <strong>Contents : Read and write</strong>.</li>' +
    '<li>Collez le nom du dépôt et le token ci-dessous.</li></ol>' +
    '<label class="f">Dépôt<input id="ghRepo" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="pseudo/budget-data"></label>' +
    '<label class="f">Token GitHub<input id="ghToken" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…"></label>' +
    '<details><summary>Options</summary><div class="stack" style="margin-top:10px"><label class="f">Branche (vide : branche par défaut)<input id="ghBranch" autocomplete="off" autocapitalize="off" placeholder="main"></label><label class="f">Fichier de données<input id="ghPath" autocomplete="off" autocapitalize="off" value="budget-hebdo.json"></label></div></details>' +
    '<div class="actions"><button class="btn primary" data-act="connect">Tester et connecter</button>' + (inSettings ? '' : '<button class="btn" data-act="skipSync">Continuer sans synchroniser</button>') + '</div>' +
    '<p class="small muted">Le token est gardé uniquement dans ce navigateur, sur cet appareil. Refaites la même opération sur chaque appareil à synchroniser.</p></section>';
}
const viewConnect = () => connectCard(false);

/* --- Réglages --- */
function viewSettings() {
  const free = freeMonthly(), base = baseWeekly();
  const stMsg = { ok: 'À jour', pending: 'Synchronisation en cours…', offline: 'Hors ligne : les changements partiront dès le retour du réseau.', auth: 'GitHub refuse le token (expiré, révoqué ou sans droit d\'écriture). Déconnectez puis reconnectez-vous avec un nouveau token.', error: 'Échec : ' + esc(syncErr), local: '', load: '' }[syncState] || '';
  const sy = cfg
    ? '<section class="card stack"><h2>Synchronisation GitHub</h2><p class="small">Dépôt <strong>' + esc(cfg.repo) + '</strong>, fichier <strong>' + esc(cfg.path) + '</strong></p>' +
      '<p class="small muted">' + (lastSync ? 'Dernière synchronisation : ' + new Date(lastSync).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) + '. ' : 'Pas encore synchronisé. ') + stMsg + '</p>' +
      '<div class="actions"><button class="btn" data-act="syncNow">Synchroniser maintenant</button><button class="btn danger" data-act="disconnect">Déconnecter</button></div></section>'
    : connectCard(true);
  return sy +
    '<section class="card stack"><h2>Revenus et épargne</h2>' +
    '<label class="f">Revenus nets par mois<input data-money="income" inputmode="decimal" value="' + (S.income ? toInput(S.income) : '') + '" placeholder="0"></label>' +
    '<label class="f">Épargne par mois<input data-money="savings" inputmode="decimal" value="' + (S.savings ? toInput(S.savings) : '') + '" placeholder="0"></label>' +
    '<div class="small muted num">Charges fixes : ' + eur(fixedMonthly()) + ' par mois · Reste : ' + eur(free) + ' par mois</div></section>' +
    '<section class="card stack"><h2>Budget hebdomadaire</h2>' +
    '<label class="f">Calcul<select data-set="mode"><option value="auto"' + (S.mode === 'auto' ? ' selected' : '') + '>Automatique (revenus − charges − épargne)</option><option value="manual"' + (S.mode === 'manual' ? ' selected' : '') + '>Je fixe le montant</option></select></label>' +
    (S.mode === 'manual' ? '<label class="f">Budget par semaine<input data-money="manual" inputmode="decimal" value="' + (S.manual ? toInput(S.manual) : '') + '" placeholder="0"></label>' : '') +
    '<div class="small muted num">Budget actuel : <strong style="color:var(--ink)">' + eur(base) + '</strong> par semaine</div>' +
    '<label class="f">La semaine commence le<select data-set="weekStart">' + [1, 2, 3, 4, 5, 6, 0].map((d) => '<option value="' + d + '"' + (S.weekStart === d ? ' selected' : '') + '>' + DAYS[d] + '</option>').join('') + '</select></label>' +
    '<label class="sw"><span><strong>Reporter l\'excédent et le dépassement</strong><div class="small muted">Un dépassement réduit la semaine suivante. Un excédent s\'y ajoute, dans la limite d\'un budget hebdo.</div></span><input type="checkbox" data-set="carry"' + (S.carry ? ' checked' : '') + '></label></section>' +
    '<section class="card"><div class="sect-title"><h2>Catégories</h2></div><p class="small muted" style="margin-bottom:12px">Budget par semaine. Laissez vide pour ne pas fixer de plafond.</p>' +
    S.cats.map((c) => '<div class="setrow"><input data-cname="' + esc(c.id) + '" value="' + esc(c.name) + '" aria-label="Nom de la catégorie"><input data-cbudget="' + esc(c.id) + '" inputmode="decimal" value="' + (c.budget ? toInput(c.budget) : '') + '" placeholder="Sans plafond" aria-label="Budget hebdo"><button class="icon-btn" data-act="delCat" data-id="' + esc(c.id) + '" aria-label="Supprimer ' + esc(c.name) + '"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>').join('') +
    '<div class="actions" style="margin-top:12px"><button class="btn" data-act="addCat">Ajouter une catégorie</button></div></section>' +
    '<section class="card stack"><h2>Données</h2><div class="actions"><button class="btn" data-act="expJson">Exporter (JSON)</button><button class="btn" data-act="expCsv">Dépenses (CSV)</button><button class="btn" data-act="impPick">Importer</button></div><input type="file" id="impFile" accept="application/json,.json" hidden>' +
    '<p class="small muted">L\'import accepte un fichier JSON exporté depuis cette appli ou depuis sa version en page Claude.</p>' +
    '<div class="actions"><button class="btn danger" id="resetBtn" data-act="reset">Tout effacer</button></div></section>';
}

/* ---------- Feuilles ---------- */
function openSheet(html) {
  const s = $('#sheet'); s.innerHTML = html; $('#sheetWrap').hidden = false; document.body.style.overflow = 'hidden';
  const f = s.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 30);
}
function closeSheet() { $('#sheetWrap').hidden = true; $('#sheet').innerHTML = ''; document.body.style.overflow = ''; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheetWrap').hidden) closeSheet(); });

function expenseSheet(e) {
  const edit = !!e;
  const last = [...EXP].sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  const sel = e ? e.cat : (last && catById(last.cat) ? last.cat : S.cats[0].id);
  openSheet('<form id="expForm" class="stack" data-id="' + (edit ? esc(e.id) : '') + '" data-ts="' + (edit ? e.ts || '' : '') + '" novalidate>' +
    '<h2>' + (edit ? 'Modifier la dépense' : 'Nouvelle dépense') + '</h2>' +
    '<label class="bigamt"><input id="fAmt" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Montant en euros" autofocus value="' + (edit ? toInput(e.amount) : '') + '"><span>€</span></label>' +
    '<div class="chips" id="fCats" role="group" aria-label="Catégorie">' + S.cats.map((c) => '<button type="button" class="chip" data-cat="' + esc(c.id) + '" aria-pressed="' + (c.id === sel) + '"><span class="dot" style="background:' + catColor(c.id) + '"></span>' + esc(c.name) + '</button>').join('') + '</div>' +
    '<div class="grid2 stackable"><label class="f">Date<input type="date" id="fDate" value="' + (edit ? e.date : today()) + '"></label><label class="f">Note (facultatif)<input id="fNote" autocomplete="off" maxlength="80" placeholder="Ex. Boulangerie" value="' + (edit ? esc(e.note || '') : '') + '"></label></div>' +
    '<div class="chips"><button type="button" class="chip" data-day="0">Aujourd\'hui</button><button type="button" class="chip" data-day="-1">Hier</button></div>' +
    '<details' + (edit && e.ctx ? ' open' : '') + '><summary>Plus de détails</summary><p class="small muted" style="margin:6px 0 10px">Le contexte aide à repérer les achats impulsifs dans les statistiques.</p><div class="chips" id="fCtx" role="group" aria-label="Contexte">' + CTX.map((c) => '<button type="button" class="chip" data-ctx="' + c[0] + '" aria-pressed="' + (edit && e.ctx === c[0]) + '">' + c[1] + '</button>').join('') + '</div></details>' +
    '<div class="actions"><button type="submit" class="btn primary">Enregistrer</button>' + (edit ? '<button type="button" class="btn danger" data-act="delExp" data-id="' + esc(e.id) + '">Supprimer</button>' : '') + '<button type="button" class="btn" data-act="closeSheet">Annuler</button></div></form>');
}
function recSheet(r) {
  openSheet('<form id="recForm" class="stack" data-id="' + (r ? esc(r.id) : '') + '" data-ts="' + (r ? r.ts || '' : '') + '" novalidate><h2>' + (r ? 'Modifier la charge' : 'Nouvelle charge fixe') + '</h2>' +
    '<label class="f">Nom<input id="rName" autofocus autocomplete="off" maxlength="60" placeholder="Ex. Loyer, Netflix" value="' + (r ? esc(r.name) : '') + '"></label>' +
    '<div class="grid2 stackable"><label class="f">Montant<input id="rAmt" inputmode="decimal" placeholder="0" value="' + (r ? toInput(r.amount) : '') + '"></label>' +
    '<label class="f">Fréquence<select id="rPer">' + Object.keys(PERIODS).map((k) => '<option value="' + k + '"' + ((r ? r.period : 'monthly') === k ? ' selected' : '') + '>' + PERIODS[k] + '</option>').join('') + '</select></label></div>' +
    '<label class="f">Jour de prélèvement (facultatif)<input id="rDay" inputmode="numeric" placeholder="Ex. 5" value="' + (r && r.day ? r.day : '') + '"></label>' +
    '<div class="actions"><button type="submit" class="btn primary">Enregistrer</button>' + (r ? '<button type="button" class="btn danger" data-act="delRec" data-id="' + esc(r.id) + '">Supprimer</button>' : '') + '<button type="button" class="btn" data-act="closeSheet">Annuler</button></div></form>');
}
function goalSheet(g) {
  openSheet('<form id="goalForm" class="stack" data-id="' + (g ? esc(g.id) : '') + '" novalidate><h2>' + (g ? 'Modifier l\'objectif' : 'Nouvel objectif') + '</h2>' +
    '<label class="f">Nom<input id="gName" autofocus autocomplete="off" maxlength="60" placeholder="Ex. Vacances d\'été" value="' + (g ? esc(g.name) : '') + '"></label>' +
    '<div class="grid2 stackable"><label class="f">Montant à atteindre<input id="gTarget" inputmode="decimal" placeholder="0" value="' + (g ? toInput(g.target) : '') + '"></label>' +
    '<label class="f">Déjà épargné<input id="gStart" inputmode="decimal" placeholder="0" value="' + (g && g.start ? toInput(g.start) : '') + '"></label></div>' +
    '<label class="f">Date visée (facultatif)<input type="date" id="gDeadline" value="' + (g && g.deadline ? g.deadline : '') + '"></label>' +
    '<div class="actions"><button type="submit" class="btn primary">Enregistrer</button>' + (g ? '<button type="button" class="btn danger" data-act="delGoal" data-id="' + esc(g.id) + '">Supprimer</button>' : '') + '<button type="button" class="btn" data-act="closeSheet">Annuler</button></div></form>');
}

/* ---------- Soumissions ---------- */
document.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  if (f.id === 'expForm') {
    const amount = parseMoney($('#fAmt').value), cat = (f.querySelector('#fCats [aria-pressed="true"]') || {}).dataset;
    const date = $('#fDate').value, ctxEl = f.querySelector('#fCtx [aria-pressed="true"]');
    if (!(amount > 0)) { toast('Saisissez un montant supérieur à 0.'); $('#fAmt').focus(); return; }
    if (!cat) { toast('Choisissez une catégorie.'); return; }
    if (!date) { toast('Choisissez une date.'); return; }
    const id = f.dataset.id || 'e_' + uid(), old = DOCS[id];
    const doc = { t: 'e', amount, cat: cat.cat, date, note: $('#fNote').value.trim(), ctx: ctxEl ? ctxEl.dataset.ctx : '', ts: old ? old.ts : Date.now() };
    const w = weekStartOf(date, S.weekStart);
    const beforeAll = weekSpent(w), beforeCat = weekCat(w, doc.cat);
    const oldAmt = old ? old.amount : 0, oldSameCat = old && old.cat === doc.cat && weekStartOf(old.date, S.weekStart) === w ? old.amount : 0;
    const wasInWeek = old && weekStartOf(old.date, S.weekStart) === w ? old.amount : 0;
    if (await write(() => store.set(id, doc))) {
      closeSheet();
      const c = catById(doc.cat), ca = beforeCat - oldSameCat + amount, ta = beforeAll - wasInWeek + amount, inf = weekInfo(w);
      let msg = 'Enregistré';
      if (c && c.budget && ca / c.budget >= 1) msg = c.name + ' : budget dépassé';
      else if (c && c.budget && ca / c.budget >= 0.8) msg = c.name + ' à ' + pct(ca / c.budget);
      else if (inf.avail > 0 && ta / inf.avail >= 1) msg = 'Budget de la semaine dépassé';
      else if (inf.avail > 0 && ta / inf.avail >= 0.8) msg = 'Budget de la semaine à ' + pct(ta / inf.avail);
      toast(msg);
    }
  } else if (f.id === 'recForm') {
    const name = $('#rName').value.trim(), amount = parseMoney($('#rAmt').value);
    if (!name) { toast('Donnez un nom à cette charge.'); return; }
    if (!(amount > 0)) { toast('Saisissez un montant supérieur à 0.'); return; }
    const day = parseInt($('#rDay').value, 10), id = f.dataset.id || 'r_' + uid();
    if (await write(() => store.set(id, { t: 'r', name, amount, period: $('#rPer').value, day: day >= 1 && day <= 31 ? day : 0, ts: f.dataset.ts ? +f.dataset.ts : Date.now() }))) { closeSheet(); toast('Charge enregistrée'); }
  } else if (f.id === 'goalForm') {
    const name = $('#gName').value.trim(), target = parseMoney($('#gTarget').value), start = parseMoney($('#gStart').value);
    if (!name) { toast('Donnez un nom à cet objectif.'); return; }
    if (!(target > 0)) { toast('Saisissez le montant à atteindre.'); return; }
    const id = f.dataset.id || 'g_' + uid(), old = DOCS[id] || {};
    if (await write(() => store.set(id, { t: 'g', name, target, start: start > 0 ? start : 0, deadline: $('#gDeadline').value || '', contrib: old.contrib || [], ts: old.ts || Date.now() }))) { closeSheet(); toast('Objectif enregistré'); }
  }
});

/* ---------- Actions ---------- */
let resetArmed = false;
document.addEventListener('click', async (ev) => {
  const chip = ev.target.closest('.chip');
  if (chip && chip.closest('#sheet')) {
    if (chip.dataset.cat) { chip.parentNode.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', c === chip)); return; }
    if (chip.dataset.ctx) { const on = chip.getAttribute('aria-pressed') === 'true'; chip.parentNode.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false')); chip.setAttribute('aria-pressed', String(!on)); return; }
    if (chip.dataset.day) { $('#fDate').value = addDays(today(), +chip.dataset.day); return; }
  }
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  switch (act) {
    case 'connect': await doConnect(el); break;
    case 'skipSync': try { localStorage.setItem(NOSYNC_KEY, '1'); } catch (e) {} noSync = true; setSync('local'); render(); break;
    case 'syncNow': if (cfg) { await sync(); if (syncState === 'ok') toast('Synchronisé'); } break;
    case 'disconnect':
      if (el.dataset.armed) { try { localStorage.removeItem(CFG_KEY); localStorage.setItem(NOSYNC_KEY, '1'); } catch (e) {} cfg = null; noSync = true; setSync('local'); render(); toast('Déconnecté. Les données restent sur cet appareil.'); }
      else { el.dataset.armed = '1'; el.textContent = 'Confirmer la déconnexion'; }
      break;
    case 'tab': tab = el.dataset.tab; render(); window.scrollTo(0, 0); break;
    case 'wk': weekSel = addDays(weekSel, +el.dataset.d); render(); break;
    case 'wkNow': weekSel = curWeek(); render(); break;
    case 'addExp': expenseSheet(); break;
    case 'editExp': expenseSheet(DOCS[id]); break;
    case 'closeSheet': closeSheet(); break;
    case 'delExp': if (el.dataset.armed) { if (await write(() => store.del(id))) { closeSheet(); toast('Dépense supprimée'); } } else { el.dataset.armed = '1'; el.textContent = 'Confirmer la suppression'; } break;
    case 'addRec': recSheet(); break;
    case 'editRec': recSheet(DOCS[id]); break;
    case 'delRec': if (el.dataset.armed) { if (await write(() => store.del(id))) { closeSheet(); toast('Charge supprimée'); } } else { el.dataset.armed = '1'; el.textContent = 'Confirmer la suppression'; } break;
    case 'subAdd': { const s = detectSubs()[+el.dataset.i]; if (s && await write(() => store.set('r_' + uid(), { t: 'r', name: s.name, amount: s.amount, period: s.period, day: 0, ts: Date.now() }))) toast('Ajouté aux charges fixes'); break; }
    case 'addGoal': goalSheet(); break;
    case 'editGoal': goalSheet(DOCS[id]); break;
    case 'delGoal': if (el.dataset.armed) { if (await write(() => store.del(id))) { closeSheet(); toast('Objectif supprimé'); } } else { el.dataset.armed = '1'; el.textContent = 'Confirmer la suppression'; } break;
    case 'goalAdd': {
      const inp = $('#gv_' + id), a = parseMoney(inp ? inp.value : ''), g = DOCS[id];
      if (!g || !isFinite(a) || a === 0) { toast('Saisissez un montant.'); break; }
      if (await write(() => store.set(id, { ...g, contrib: [...(g.contrib || []), { d: today(), a }] }))) toast('Versement ajouté');
      break;
    }
    case 'obSave': {
      const inc = parseMoney($('#obIncome').value), sv = parseMoney($('#obSave').value || '0');
      if (!(inc > 0)) { toast('Indiquez vos revenus mensuels.'); break; }
      if (await saveSettings({ setupDone: true, income: inc, savings: isFinite(sv) ? sv : 0, startDate: today() })) { tab = 'fixed'; render(); toast('Ajoutez maintenant vos charges fixes'); }
      break;
    }
    case 'addCat': await saveSettings({ cats: [...S.cats, { id: 'c' + uid(), name: 'Nouvelle catégorie', budget: 0 }] }); render(); break;
    case 'delCat': if (S.cats.length > 1) { await saveSettings({ cats: S.cats.filter((c) => c.id !== id) }); render(); } else toast('Gardez au moins une catégorie.'); break;
    case 'expJson': doDownload('budget-hebdo.json', JSON.stringify({ version: 1, docs: bare(liveDocs()) }, null, 1), 'application/json'); break;
    case 'expCsv': {
      const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
      const rows = ['Date;Catégorie;Montant;Note;Contexte', ...[...EXP].sort((a, b) => (a.date < b.date ? -1 : 1)).map((e) => [e.date, q(catName(e.cat)), (e.amount / 100).toFixed(2).replace('.', ','), q(e.note || ''), ctxName(e.ctx || '')].join(';'))];
      doDownload('depenses.csv', '﻿' + rows.join('\n')); break;
    }
    case 'impPick': $('#impFile').click(); break;
    case 'reset':
      if (!resetArmed) { resetArmed = true; el.textContent = 'Confirmer : tout effacer'; setTimeout(() => { resetArmed = false; const b = $('#resetBtn'); if (b) b.textContent = 'Tout effacer'; }, 5000); break; }
      resetArmed = false;
      for (const k of Object.keys(liveDocs())) await write(() => store.del(k));
      toast('Données effacées'); break;
  }
});
function doDownload(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type: type || 'text/plain' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000); toast('Fichier téléchargé');
}
async function doConnect(btn) {
  const repo = $('#ghRepo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
  const token = $('#ghToken').value.trim(), branch = $('#ghBranch').value.trim(), path = ($('#ghPath').value.trim() || 'budget-hebdo.json').replace(/^\/+/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { toast('Format attendu : pseudo/nom-du-depot'); return; }
  if (!token) { toast('Collez votre token GitHub.'); return; }
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Vérification…';
  try {
    const info = await testRepo(repo, token);
    cfg = { repo, token, path, branch: branch || info.default_branch || 'main' };
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); localStorage.removeItem(NOSYNC_KEY); } catch (e) {}
    noSync = false; setSync('pending'); render();
    await sync();
    toast(syncState === 'ok' ? 'Synchronisation activée' : 'Connecté, mais la première synchro a échoué');
  } catch (e) { toast(e.message || 'Connexion impossible.'); btn.disabled = false; btn.textContent = label; }
}
document.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t.id === 'impFile' && t.files[0]) {
    try {
      const j = JSON.parse(await t.files[0].text()), docs = j.docs || {}, ids = Object.keys(docs).filter((k) => docs[k] && docs[k].t);
      if (!ids.length) { toast('Fichier non reconnu.'); return; }
      for (const k of ids) await store.set(k, docs[k]);
      toast(ids.length + ' éléments importés');
    } catch (e) { toast('Import impossible : fichier invalide.'); }
    t.value = ''; return;
  }
  if (t.dataset.money) { const v = parseMoney(t.value || '0'); if (isFinite(v) && v >= 0) await saveSettings({ [t.dataset.money]: v }); render(); }
  else if (t.dataset.set) {
    const k = t.dataset.set; let v = t.type === 'checkbox' ? t.checked : t.value;
    if (k === 'weekStart') { v = +v; await saveSettings({ weekStart: v }); weekSel = null; } else await saveSettings({ [k]: v });
    render();
  } else if (t.dataset.cname) { await saveSettings({ cats: S.cats.map((c) => c.id === t.dataset.cname ? { ...c, name: t.value.trim() || c.name } : c) }); render(); }
  else if (t.dataset.cbudget) { const v = t.value.trim() ? parseMoney(t.value) : 0; if (isFinite(v) && v >= 0) await saveSettings({ cats: S.cats.map((c) => c.id === t.dataset.cbudget ? { ...c, budget: v } : c) }); render(); }
});

/* ---------- Démarrage ---------- */
function start() {
  loadCfg(); loadLocal(); ingest(); LOADING = false; weekSel = null;
  setSync(cfg ? (navigator.onLine ? 'pending' : 'offline') : 'local');
  render();
  if (cfg) sync();
  window.addEventListener('online', () => { if (cfg) scheduleSync(300); });
  window.addEventListener('offline', () => { if (cfg) setSync('offline'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (cfg) scheduleSync(200); if (!$('#view').querySelector('input:focus')) renderSoon(); } });
  setInterval(() => { if (cfg && document.visibilityState === 'visible') sync(); }, 90000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
start();
})();
