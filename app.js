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
const PALETTE = ['#3B6FE0', '#C9611F', '#1E8C63', '#A93FC2', '#B07F00', '#D1495B', '#4F7F99', '#7A6B4A'];
const PERIODS = { weekly: 'Chaque semaine', monthly: 'Chaque mois', quarterly: 'Chaque trimestre', yearly: 'Chaque année' };

/* ---------- Données ---------- */
const DEF_CATS = [
  { id: 'courses', name: 'Courses', budget: 0 }, { id: 'resto', name: 'Restaurants et sorties', budget: 0 },
  { id: 'transport', name: 'Transport', budget: 0 }, { id: 'sante', name: 'Santé', budget: 0 },
  { id: 'loisirs', name: 'Loisirs', budget: 0 }, { id: 'maison', name: 'Maison', budget: 0 },
  { id: 'autres', name: 'Autres', budget: 0 }
];
const DEF_S = { t: 's', setupDone: false, income: 0, savings: 0, mode: 'auto', manual: 0, weekStart: 1, monthStart: 5, carry: true, refill: true, smooth: true, startDate: '', acctBalance: null, acctDate: '', savingsDay: 0, alertBelow: 0, efBalance: null, efDate: '', efMonths: 3, cats: DEF_CATS };
let DOCS = {}, S = { ...DEF_S }, EXP = [], REC = [], GOALS = [], INC = [], REM = [], FAV = [], PROV = [], EXPB = [];
let swiped = false, locked = false, lock = null, lockKey = null, hiddenAt = 0, pendingAdd = false, LOADING = true, tab = 'week', weekSel = null, monthSel = null, pendingRender = false;
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
  INC = all.filter((d) => d.t === 'i');
  REM = all.filter((d) => d.t === 'x');
  FAV = all.filter((d) => d.t === 'f').sort((a, b) => (a.ts || 0) - (b.ts || 0));
  PROV = all.filter((d) => d.t === 'p').sort((a, b) => (a.ts || 0) - (b.ts || 0));
  EXPB = EXP.filter((e) => !e.prov);
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

function scheduleSync(ms) { if (!cfg || !cfg.token) return; clearTimeout(syncTimer); syncTimer = setTimeout(sync, ms == null ? 1500 : ms); }
async function sync() {
  if (!cfg || !cfg.token) return;
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

/* Mois « de paie » : du jour S.monthStart d'un mois à la veille du même jour du mois suivant */
const pstart = (d) => { const x = parse(d); let m = x.getMonth(); if (x.getDate() < S.monthStart) m--; return ymd(new Date(x.getFullYear(), m, S.monthStart, 12)); };
const nextP = (ps) => { const x = parse(ps); return ymd(new Date(x.getFullYear(), x.getMonth() + 1, S.monthStart, 12)); };
const prevP = (ps) => { const x = parse(ps); return ymd(new Date(x.getFullYear(), x.getMonth() - 1, S.monthStart, 12)); };
const pend = (ps) => addDays(nextP(ps), -1);
const curP = () => pstart(today());
const fmtRange = (a, b) => fmtShort(a) + ' → ' + fmtShort(b);
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/* Dates de prélèvement d'une charge entre a et b (inclus) */
function occurrences(r, a, b) {
  const out = [];
  if (r.period === 'weekly') { for (let d = a; d <= b; d = addDays(d, 1)) if (parse(d).getDay() === (r.dow || 0)) out.push(d); return out; }
  const da = parse(a), db = parse(b);
  for (let n = da.getFullYear() * 12 + da.getMonth(); n <= db.getFullYear() * 12 + db.getMonth(); n++) {
    const y = Math.floor(n / 12), m = n % 12, mm = m + 1, anchor = r.month || 1;
    if (r.period === 'quarterly' && ((mm - anchor) % 3 + 3) % 3 !== 0) continue;
    if (r.period === 'yearly' && mm !== anchor) continue;
    const ds = ymd(new Date(y, m, Math.min(r.day || 1, new Date(y, m + 1, 0).getDate()), 12));
    if (ds >= a && ds <= b) out.push(ds);
  }
  return out;
}
function recDateText(r) {
  switch (r.period) {
    case 'weekly': return 'chaque ' + DAYS[r.dow || 0].toLowerCase();
    case 'monthly': return 'le ' + ((r.day || 1) === 1 ? '1er' : (r.day || 1)) + ' de chaque mois';
    case 'quarterly': { const m = r.month || 1; return 'le ' + (r.day || 1) + ' en ' + [0, 1, 2, 3].map((i) => MONTHS[(m - 1 + 3 * i) % 12]).join(', '); }
    case 'yearly': return 'le ' + (r.day || 1) + ' ' + MONTHS[(r.month || 1) - 1];
  }
  return '';
}
const nextDue = (r) => { const t = today(); return occurrences(r, t, addDays(t, 400))[0] || ''; };

const effP = (i) => { const b = pstart(i.date); return i.shift > 0 ? nextP(b) : i.shift < 0 ? prevP(b) : b; };
function incomeOf(ps) {
  const lines = INC.filter((i) => effP(i) === ps).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (lines.length) return { total: lines.reduce((t, i) => t + i.amount, 0), lines, fallback: false };
  return { total: S.income, lines: [], fallback: true };
}
function fixedOf(ps) {
  const end = pend(ps); let t = 0;
  for (const r of REC) t += r.period === 'monthly' ? r.amount : S.smooth ? monthlyEq(r) : occurrences(r, ps, end).length * r.amount;
  return Math.round(t);
}
function periodInfo(ps) {
  X.pi = X.pi || {};
  if (X.pi[ps]) return X.pi[ps];
  const pe = pend(ps), days = diffDays(nextP(ps), ps), inc = incomeOf(ps), fixed = fixedOf(ps), sav = S.savings;
  const refill = S.mode === 'auto' && S.refill && ps > pstart(S.startDate || today()) ? periodInfo(prevP(ps)).over : 0;
  const free = inc.total - fixed - sav;
  const provM = PROV.filter((q) => q.from <= ps).reduce((t, q) => t + q.monthly, 0);
  const budget = S.mode === 'manual' ? Math.round(S.manual * days / 7) : free - refill - provM;
  let spent = 0; const cat = {};
  for (const e of EXPB) if (e.date >= ps && e.date <= pe) { spent += e.amount; cat[e.cat] = (cat[e.cat] || 0) + e.amount; }
  const eff = Math.max(0, budget);
  return (X.pi[ps] = { ps, pe, days, inc, fixed, sav, refill, provM, free, budget, spent, cat, left: budget - spent, over: Math.max(0, spent - eff), ratio: eff > 0 ? spent / eff : (spent > 0 ? 2 : 0) });
}
function weekBase(w) { // budget d'une semaine = somme des budgets journaliers de ses 7 jours (une semaine peut chevaucher deux mois)
  X.wb = X.wb || {};
  if (X.wb[w] == null) { let t = 0; for (let k = 0; k < 7; k++) { const pi = periodInfo(pstart(addDays(w, k))); t += Math.max(0, pi.budget) / pi.days; } X.wb[w] = Math.round(t); }
  return X.wb[w];
}
function weekMap() {
  if (X.wm) return X.wm;
  const m = {}, c = {};
  for (const e of EXPB) { const w = weekStartOf(e.date, S.weekStart); m[w] = (m[w] || 0) + e.amount; (c[w] = c[w] || {})[e.cat] = ((c[w] || {})[e.cat] || 0) + e.amount; }
  X.wm = m; X.wc = c; return m;
}
const weekSpent = (w) => weekMap()[w] || 0;
const weekCat = (w, cat) => ((X.wc || (weekMap(), X.wc))[w] || {})[cat] || 0;
function carryFor(w) {
  if (!S.carry) return 0;
  const start = weekStartOf(S.startDate || today(), S.weekStart);
  if (w <= start) return 0;
  let c = 0, i = 0;
  // Un dépassement se reporte en entier ; un excédent est plafonné à un budget hebdo.
  for (let k = start; k < w && i < 520; k = addDays(k, 7), i++) { const b = weekBase(k); c = Math.min(b, c + b - weekSpent(k)); }
  return c;
}
function weekInfo(w) {
  const base = weekBase(w), carry = carryFor(w), avail = base + carry, spent = weekSpent(w);
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
    if (period) out.push({ name: l[l.length - 1].note.trim(), amount: Math.round(med), period, count: l.length, day: parse(l[l.length - 1].date).getDate(), dow: parse(l[l.length - 1].date).getDay() });
  }
  return out;
}

/* ---------- Rendu ---------- */
/* ---------- Affichage (propre à chaque appareil) ---------- */
const UI_KEY = 'budget-hebdo-ui';
let UI = { theme: 'auto', ts: 1.1, dens: 'aere', anim: true };
function applyUI() {
  const r = document.documentElement;
  if (UI.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', UI.theme);
  r.style.setProperty('--ts', String(UI.ts)); r.setAttribute('data-dens', UI.dens); r.setAttribute('data-anim', UI.anim ? 'on' : 'off');
}
function loadUI() { try { Object.assign(UI, JSON.parse(localStorage.getItem(UI_KEY) || '{}')); } catch (e) { /* valeurs par défaut */ } applyUI(); }
function saveUI(p) { Object.assign(UI, p); try { localStorage.setItem(UI_KEY, JSON.stringify(UI)); } catch (e) { /* ignoré */ } applyUI(); }
const CAT_ICONS = [
  [/cours|alim|march|super|nourr/i, 'M5 9h14l-1.5 9a2 2 0 0 1-2 1.7H8.5a2 2 0 0 1-2-1.7L5 9zM9 9l3-5 3 5'],
  [/transport|voiture|essence|carbur|train|bus|auto/i, 'M4 15v-3l2-5h12l2 5v3zM4 15v3M20 15v3M7 12h10'],
  [/resto|restau|caf[ée]|sortie|bar|repas/i, 'M8 3v8M5 3v5a3 3 0 0 0 6 0V3M8 11v10M17 3c-2 1-3 4-3 7h3v11'],
  [/loisir|cin[ée]|jeu|culture|sport|abonn/i, 'M3 9V7h18v2a3 3 0 0 0 0 6v2H3v-2a3 3 0 0 0 0-6zM13 7v10'],
  [/sant[ée]|pharm|m[ée]dec|soin/i, 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
  [/maison|logement|loyer|habit/i, 'M4 11l8-7 8 7v9h-5v-6H9v6H4z'],
  [/v[êe]tement|habill|shopping/i, 'M8 4l4 2 4-2 4 4-3 2v10H7V10L4 8z']
];
const TAG_ICON = 'M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01';
function catIconPath(id) { const n = catName(id) || ''; const m = CAT_ICONS.find((x) => x[0].test(n)); return m ? m[1] : TAG_ICON; }
const catIco = (id) => '<span class="ibox" style="color:' + catColor(id) + ';border-color:' + catColor(id) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + catIconPath(id) + '"/></svg></span>';
const ST_ICON = { ok: 'M5 12.5l4.5 4.5L19 7', warn: 'M12 3l10 18H2zM12 10v5M12 18v.5', bad: 'M6 6l12 12M18 6L6 18' };
const ICONS = {
  week: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  month: '<path d="M5 20V11M12 20V5M19 20v-6"/>',
  fixed: '<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5"/>',
  save: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
  gear: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'
};
const TABS = [['week', 'Semaine'], ['month', 'Mois'], ['fixed', 'Fixes'], ['save', 'Épargne'], ['gear', 'Réglages']];
function renderTabs() {
  $('#tabs').innerHTML = TABS.map((t) => '<button class="tab" data-act="tab" data-tab="' + t[0] + '"' + (tab === t[0] ? ' aria-current="page"' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[t[0]] + '</svg>' + t[1] + '</button>').join('');
}
function render() {
  pendingRender = false;
  if (!weekSel) weekSel = curWeek();
  if (!monthSel) monthSel = curP();
  renderTabs();
  const v = $('#view');
  if (LOADING) { v.innerHTML = '<div class="skeleton"></div><div class="skeleton" style="height:90px"></div>'; return; }
  const connecting = !cfg && !noSync;
  $('#tabbar').hidden = connecting;
  if (connecting) { v.innerHTML = viewConnect(); $('#fab').hidden = true; return; }
  v.innerHTML = ({ week: viewWeek, month: viewMonth, fixed: viewFixed, save: viewSave, gear: viewSettings, search: viewSearch }[tab])();
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
  const m = { ok: ['ok', 'Synchronisé'], pending: ['warn', 'Synchronisation…'], offline: ['warn', 'Hors ligne'], auth: ['bad', 'Token refusé'], error: ['bad', 'Erreur de synchro'], locked: ['warn', 'Verrouillé'], local: ['warn', 'Local'], load: ['', 'Chargement…'] }[state];
  const b = $('#sync'); b.className = 'badge ' + m[0]; b.lastElementChild.textContent = m[1];
  if (tab === 'gear' && !LOADING && state !== 'pending') renderSoon();
}
let toastT;
function toast(msg, undo) {
  const t = $('#toast'); t.textContent = msg;
  if (undo) { const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-undo'; b.textContent = 'Annuler'; b.onclick = async () => { t.hidden = true; clearTimeout(toastT); try { await undo(); toast('Annulé'); } catch (e) {} }; t.appendChild(b); }
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, undo ? 7000 : 3800);
}

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
  const stLong = { ok: 'Dans le budget', warn: 'Attention : budget presque atteint', bad: 'Budget dépassé' }[inf.st];
  const days = cur ? 7 - diffDays(today(), w) : 0, elapsed = cur ? 8 - days : 7;
  const dash = (Math.min(inf.ratio, 1) * Math.PI * 90).toFixed(1);
  const hero = '<section class="card hero ' + inf.st + '"><div class="hg"><svg viewBox="0 0 200 112" role="img" aria-label="' + eur(inf.spent) + ' dépensés sur ' + eur(inf.avail) + ' : ' + stLong + '"><path class="trk" d="M 10 100 A 90 90 0 0 1 190 100"/><path class="val" d="M 10 100 A 90 90 0 0 1 190 100" stroke-dasharray="' + dash + ' 400"/></svg>' +
    '<div class="hgt"><div class="big num">' + eur(Math.abs(inf.left)) + '</div><div class="lbl">' + (inf.left < 0 ? 'de dépassement' : 'restants sur ' + eur(inf.avail)) + '</div></div></div>' +
    '<div class="stline"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ST_ICON[inf.st] + '"/></svg>' + stLong + '</div>' +
    '<div class="meta num"><span><strong>' + eur(inf.spent) + '</strong> dépensés</span><span>Budget <strong>' + eur(inf.base) + '</strong></span>' +
    (inf.carry ? '<span>' + (inf.carry > 0 ? 'Report <strong>+' : 'Report <strong>−') + eur(Math.abs(inf.carry)) + '</strong></span>' : '') + '</div></section>';
  let stats = '';
  if (cur && inf.avail > 0) {
    const ideal = inf.avail * elapsed / 7, diff = Math.round(inf.spent - ideal);
    stats = '<div class="grid2 stats"><div class="card"><div class="lbl2">Par jour</div><div class="v num">' + eur(days > 0 ? Math.max(0, inf.left) / days : 0) + '</div><div class="small muted">' + (days > 1 ? 'pour les ' + days + ' jours restants' : days === 1 ? 'pour aujourd\'hui' : '') + '</div></div>' +
      '<div class="card"><div class="lbl2">Rythme</div><div class="v num ' + (diff <= 0 ? 'good' : 'badv') + '">' + (diff <= 0 ? '−' : '+') + eur(Math.abs(diff)) + '</div><div class="small muted">' + (diff <= 0 ? 'sous la trajectoire' : 'au-dessus de la trajectoire') + '</div></div></div>';
  }
  const addBtn = '<button class="btn primary bigbtn" data-act="addExp" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Nouvelle dépense</button>';
  let reminder = '';
  const hasToday = EXP.some((e) => e.date === today());
  if (cur && !hasToday && new Date().getHours() >= 18) reminder = '<div class="alert info">Aucune dépense saisie aujourd\'hui. Ajoutez-les maintenant, ou passez si vous n\'avez rien dépensé.</div>';
  const al = alertsFor(w).map((a) => '<div class="alert ' + (a.lvl === 'bad' ? 'bad' : '') + '">' + a.html + '</div>').join('');
  const rows = S.cats.filter((c) => c.budget || weekCat(w, c.id)).concat(
    EXPB.some((e) => !catById(e.cat) && weekStartOf(e.date, S.weekStart) === w) ? [{ id: '__x', name: 'Catégorie supprimée', budget: 0 }] : []);
  let cats = '';
  if (rows.length) {
    cats = '<section class="card"><div class="sect-title"><h3>Par catégorie</h3></div>' + rows.map((c) => {
      const sp = c.id === '__x' ? EXPB.filter((e) => !catById(e.cat) && weekStartOf(e.date, S.weekStart) === w).reduce((s, e) => s + e.amount, 0) : weekCat(w, c.id);
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
      return h + '<div class="swr"><button class="exp" data-act="editExp" data-id="' + esc(e.id) + '">' + catIco(e.cat) + '<span class="t"><div>' + esc(e.note || catName(e.cat)) + (e.prov ? '<span class="tag">Provision</span>' : '') + (e.items && e.items.some((i) => i.s) ? '<span class="tag imp">Superflu ' + eur(e.items.filter((i) => i.s).reduce((t, i) => t + i.a, 0)) + '</span>' : '') + (e.ctx && e.ctx !== 'prevu' ? '<span class="tag ' + (e.ctx === 'impulsif' ? 'imp' : '') + '">' + ctxName(e.ctx) + '</span>' : '') + '</div>' + (e.note ? '<div class="small muted">' + esc(catName(e.cat)) + '</div>' : '') + '</span><span class="amt num">' + eur(e.amount) + '</span></button><div class="swa"><button type="button" class="dup" data-act="dupExp" data-id="' + esc(e.id) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9h10v10H9zM5 15V5h10"/></svg>Dupliquer</button><button type="button" class="del" data-act="swDel" data-id="' + esc(e.id) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/></svg>Supprimer</button></div></div>';
    }).join('') + '</section>';
  }
  const warnFree = S.mode === 'auto' && periodInfo(pstart(cur ? today() : w)).budget <= 0 ? '<div class="alert bad">Le budget de ce mois est à 0 : revenus, charges fixes, épargne et remboursement de l\'épargne de secours absorbent tout. Vérifiez l\'onglet Mois.</div>' : '';
  return nav + (cur ? addBtn : '') + hero + stats + quickRow(cur) + monthCard(cur ? today() : w) + warnFree + reminder + al + balAlert(cur) + cats + lh;
}
/* ---------- Projection, solde prévisionnel, conseils, provisions ---------- */
function paceInfo(ps) {
  if (ps !== curP()) return null;
  const pi = periodInfo(ps), el = diffDays(today(), ps) + 1, left = pi.days - el, eff = Math.max(0, pi.budget);
  const pace = el >= 5 ? pi.spent / el : eff / pi.days, proj = Math.round(pi.spent + pace * left);
  let cross = null;
  if (el >= 5 && pace > 0 && pi.spent <= eff && proj > eff) cross = addDays(ps, Math.min(pi.days - 1, Math.max(el - 1, Math.ceil(eff / pace) - 1)));
  return { el, left, pace, proj, eff, over: Math.max(0, proj - eff), cross, reliable: el >= 5, allowed: left > 0 ? Math.max(0, pi.left) / left : 0 };
}
function projectBalance() {
  if (S.acctBalance == null || !S.acctDate) return null;
  const t = today(), ps = curP(), pe = pend(ps), pi = periodInfo(ps), el = diffDays(t, ps) + 1;
  const pace = el >= 5 ? pi.spent / el : Math.max(0, pi.budget) / pi.days, provM = PROV.reduce((a, q) => a + q.monthly, 0);
  const horizon = pe > t ? pe : t, pts = []; let bal = S.acctBalance;
  for (let d = addDays(S.acctDate, 1), n = 0; d <= horizon && n < 400; d = addDays(d, 1), n++) {
    let delta = 0;
    for (const r of REC) if (occurrences(r, d, d).length) delta -= r.amount;
    for (const i of INC) if (i.date === d) delta += i.amount;
    if (S.savingsDay && parse(d).getDate() === S.savingsDay) delta -= S.savings + provM;
    if (d <= t) { for (const e of EXPB) if (e.date === d) delta -= e.amount; } else delta -= pace;
    bal += delta; pts.push({ d, bal });
  }
  const upto = pts.filter((q) => q.d <= t), now = upto.length ? upto[upto.length - 1].bal : S.acctBalance;
  const fut = [{ d: t, bal: now }, ...pts.filter((q) => q.d > t)];
  let min = fut[0]; for (const q of fut) if (q.bal < min.bal) min = q;
  return { fut, now, min, end: fut[fut.length - 1], pace, thr: S.alertBelow || 0, low: min.bal < (S.alertBelow || 0) };
}
function adviceList() {
  const first = pstart(S.startDate || today()), closed = [];
  for (let q = prevP(curP()), n = 0; q >= first && n < 3; q = prevP(q), n++) closed.push(periodInfo(q));
  if (closed.length < 2) return [];
  const out = [];
  for (const c of S.cats) {
    if (!c.budget) continue;
    const diffs = closed.map((pi) => (pi.cat[c.id] || 0) - Math.round(c.budget * pi.days / 7)), overN = diffs.filter((d) => d > 0).length, avgOver = diffs.reduce((a, d) => a + d, 0) / diffs.length;
    if (overN >= 2 && avgOver > 500) {
      const avgSpent = closed.reduce((a, pi) => a + (pi.cat[c.id] || 0), 0) / closed.length, avgDays = closed.reduce((a, pi) => a + pi.days, 0) / closed.length;
      out.push({ kind: 'cat', id: c.id, name: c.name, avgOver, n: closed.length, overN, weekly: Math.ceil(avgSpent * 7 / avgDays / 500) * 500 });
    }
  }
  const overs = closed.filter((pi) => pi.over > 0);
  if (overs.length >= 2) {
    const tot = {}; closed.forEach((pi) => { for (const k of Object.keys(pi.cat)) tot[k] = (tot[k] || 0) + pi.cat[k]; });
    out.push({ kind: 'total', n: closed.length, overN: overs.length, avg: overs.reduce((a, pi) => a + pi.over, 0) / overs.length, top: Object.keys(tot).sort((a, b) => tot[b] - tot[a]).slice(0, 2).map(catName) });
  }
  return out;
}
function provBalance(q) {
  let n = 0; const cur = curP();
  for (let k = q.from; k <= cur && n < 600; k = nextP(k)) n++;
  return n * q.monthly - EXP.filter((e) => e.prov === q.id).reduce((a, e) => a + e.amount, 0);
}
function noteIndex() {
  if (X.ni) return X.ni;
  const m = {};
  for (const e of [...EXP].sort((a, b) => (a.ts || 0) - (b.ts || 0))) { const k = (e.note || '').trim().toLowerCase(); if (!k) continue; const o = m[k] || (m[k] = { note: e.note.trim(), count: 0 }); o.count++; o.cat = e.cat; o.amount = e.amount; }
  return (X.ni = m);
}
const topNotes = () => Object.values(noteIndex()).sort((a, b) => b.count - a.count).slice(0, 40).map((o) => o.note);

function paceCard(ps) {
  const pc = paceInfo(ps); if (!pc || !pc.reliable) return '';
  const pi = periodInfo(ps), margin = pc.eff - pc.proj;
  return '<section class="card"><div class="sect-title"><h2>Au rythme actuel</h2></div>' +
    brow('Dépense moyenne', eur(pc.pace) + ' par jour') + brow('Dépenses prévues en fin de mois', eur(pc.proj)) + brow(margin >= 0 ? 'Marge prévue' : 'Dépassement prévu', eur(Math.abs(margin)), 'total') +
    (pc.over > 0 ? '<p class="small" style="margin-top:10px">' + (pc.cross ? 'À ce rythme, le budget sera épuisé vers le <strong>' + fmtShort(pc.cross) + '</strong> ' : '') + (pi.left > 0 && pc.left > 0 ? 'Pour tenir jusqu\'au ' + fmtShort(pi.pe) + ' : <strong class="num">' + eur(pc.allowed) + '</strong> par jour au plus.' : '') + '</p>' : '<p class="small muted" style="margin-top:10px">Vous êtes dans les clous si le rythme se maintient.</p>') + '</section>';
}
function balanceChart(b) {
  const L = b.fut; if (L.length < 2) return '';
  const W = 340, H = 150, Lm = 46, Rm = 10, T = 12, B = 22, iw = W - Lm - Rm, ih = H - T - B;
  const vals = L.map((q) => q.bal).concat([0, b.thr]), lo = Math.min(...vals), hi = Math.max(...vals), span = (hi - lo) || 1;
  const x = (i) => Lm + (i / (L.length - 1)) * iw, y = (v) => T + ih - ((v - lo) / span) * ih;
  let g = '';
  [lo, (lo + hi) / 2, hi].forEach((v) => { g += '<line class="grid" x1="' + Lm + '" x2="' + (W - Rm) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/><text class="tick" x="' + (Lm - 6) + '" y="' + (y(v) + 3.5).toFixed(1) + '" text-anchor="end">' + new Intl.NumberFormat('fr-FR').format(Math.round(v / 100)) + ' €</text>'; });
  if (lo < 0 && hi > 0) g += '<line class="budget" x1="' + Lm + '" x2="' + (W - Rm) + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '"/>';
  if (b.thr > 0) g += '<line class="thr" x1="' + Lm + '" x2="' + (W - Rm) + '" y1="' + y(b.thr).toFixed(1) + '" y2="' + y(b.thr).toFixed(1) + '"/>';
  g += '<polyline class="bline" points="' + L.map((q, i) => x(i).toFixed(1) + ',' + y(q.bal).toFixed(1)).join(' ') + '"/>';
  const mi = L.indexOf(b.min); g += '<circle class="bdot ' + (b.low ? 'low' : '') + '" cx="' + x(mi).toFixed(1) + '" cy="' + y(b.min.bal).toFixed(1) + '" r="4.5"/>';
  g += '<text class="tick" x="' + Lm + '" y="' + (H - 6) + '">' + fmtShort(L[0].d) + '</text><text class="tick" x="' + (W - Rm) + '" y="' + (H - 6) + '" text-anchor="end">' + fmtShort(L[L.length - 1].d) + '</text>';
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Solde prévisionnel du compte">' + g + '</svg>';
}
function balanceCard() {
  const b = projectBalance();
  if (!b) return '<section class="card stack"><h2>Compte courant</h2><p class="muted small">Saisissez le solde de votre compte : l\'appli ajoute les revenus attendus, les charges fixes à leur date et les dépenses au rythme actuel, pour voir si le compte tient jusqu\'au prochain revenu.</p><div class="actions"><button class="btn primary" data-act="editBal">Saisir le solde</button></div></section>';
  const pi = periodInfo(curP());
  return '<section class="card stack"><div class="sect-title" style="margin:0"><h2>Prévision du compte</h2><button class="btn sm" data-act="editBal">Mettre à jour</button></div>' +
    (b.low ? '<div class="alert bad">' + (b.min.bal < 0 ? 'Le compte pourrait passer à <b>découvert</b>' : 'Le compte pourrait descendre sous <b>' + eur(b.thr) + '</b>') + ' vers le <b>' + fmtShort(b.min.d) + '</b> (point bas : ' + eur(b.min.bal) + ').</div>' : '') +
    '<div class="kpis"><div class="kpi"><div class="l">Aujourd\'hui (estimé)</div><div class="v num">' + eur(b.now) + '</div></div><div class="kpi"><div class="l">Point bas · ' + fmtShort(b.min.d) + '</div><div class="v num" style="color:var(--' + (b.low ? 'bad' : 'ink') + ')">' + eur(b.min.bal) + '</div></div></div>' +
    balanceChart(b) +
    '<p class="small muted">Solde saisi le ' + fmtShort(S.acctDate) + ' Hypothèses : dépenses courantes à ' + eur(b.pace) + ' par jour, charges fixes à leur date, revenus saisis avec une date à venir' + (S.savingsDay ? ', virement d\'épargne le ' + S.savingsDay + '.' : '.') + (!S.savingsDay && (S.savings > 0 || PROV.length) ? ' Indiquez le jour de votre virement d\'épargne dans Réglages pour l\'inclure.' : '') + '</p></section>';
}
function adviceCard() {
  const a = adviceList(); if (!a.length) return '';
  return '<section class="card stack"><h2>Conseils</h2>' + a.map((x) => x.kind === 'cat'
    ? '<div class="row" style="align-items:flex-start"><p class="small"><strong>' + esc(x.name) + '</strong> dépasse son budget ' + x.overN + ' mois sur ' + x.n + ', de <strong class="num">' + eur(x.avgOver) + '</strong> en moyenne par mois. Budget conseillé : <strong class="num">' + eur(x.weekly) + '</strong> par semaine.</p><button class="btn sm" data-act="applyAdv" data-id="' + esc(x.id) + '" data-w="' + x.weekly + '">Appliquer</button></div>'
    : '<p class="small">Le budget du mois a été dépassé ' + x.overN + ' mois sur ' + x.n + ' (' + eur(x.avg) + ' en moyenne).' + (x.top.length ? ' Postes les plus lourds : ' + x.top.map(esc).join(', ') + '.' : '') + ' Revoyez ces budgets, ou vos revenus habituels et votre épargne, plutôt que de compenser avec l\'épargne de secours.</p>').join('') + '</section>';
}
function quickRow(cur) {
  if (!FAV.length || !cur) return '';
  return '<section class="stack" aria-label="Ajout rapide"><h3>Ajout rapide</h3><div class="chips">' + FAV.map((f) => '<button type="button" class="chip" data-act="favAdd" data-id="' + esc(f.id) + '"><span class="dot" style="background:' + catColor(f.cat) + '"></span>' + esc(f.note || catName(f.cat)) + ' · ' + eur(f.amount) + '</button>').join('') + '</div></section>';
}
function balAlert(cur) {
  if (!cur) return ''; const b = projectBalance(); if (!b || !b.low) return '';
  return '<div class="alert bad">' + (b.min.bal < 0 ? 'Le compte pourrait passer à <b>découvert</b>' : 'Le compte pourrait descendre sous <b>' + eur(b.thr) + '</b>') + ' vers le <b>' + fmtShort(b.min.d) + '</b> <button class="link" data-act="tab" data-tab="month">Voir la prévision</button></div>';
}

function monthCard(ref) {
  const pi = periodInfo(pstart(ref)), st = pi.ratio > 1 ? 'bad' : pi.ratio >= 0.8 ? 'warn' : 'ok', eff = Math.max(0, pi.budget);
  return '<button class="card monthcard" data-act="tab" data-tab="month"><div class="row"><h3>Mois · ' + fmtRange(pi.ps, pi.pe) + '</h3><span class="pill ' + st + '">' + (pi.left < 0 ? 'Dépassé' : 'Voir le bilan') + '</span></div>' +
    '<div class="num" style="margin:8px 0"><strong style="font-size:18px">' + eur(Math.abs(pi.left)) + '</strong> <span class="muted">' + (pi.left < 0 ? 'au-dessus' : 'restants') + ' sur ' + eur(eff) + '</span></div>' +
    '<div class="gauge" style="height:8px"><b style="width:' + Math.min(100, Math.round(pi.ratio * 100)) + '%;background:var(--' + st + ')"></b></div>' +
    (pi.over > 0 ? '<div class="small" style="margin-top:10px">À prévoir depuis l\'épargne de secours : <strong class="num">' + eur(pi.over) + '</strong></div>' : (function () { const pc = paceInfo(pi.ps); return pc && pc.reliable && pc.over > 0 ? '<div class="small" style="margin-top:10px">Au rythme actuel, le budget sera épuisé vers le <strong>' + fmtShort(pc.cross || pi.pe) + '</strong> (dépassement prévu : ' + eur(pc.over) + ').</div>' : ''; })()) + '</button>';
}
function onboarding() {
  return '<section class="card stack"><h2>Fixons votre budget</h2><p class="muted">Indiquez vos revenus habituels et ce que vous voulez mettre de côté. L\'appli retire vos charges fixes (onglet Fixes) et répartit le reste sur les semaines du mois.</p>' +
    '<label class="f">Revenus nets habituels par mois<input id="obIncome" inputmode="decimal" placeholder="2 000"></label>' +
    '<label class="f">Épargne visée par mois<input id="obSave" inputmode="decimal" placeholder="150"></label>' +
    '<label class="f">Mon mois commence le (jour de la paie)<input id="obStart" inputmode="numeric" value="5"></label>' +
    '<div class="actions"><button class="btn primary" data-act="obSave">Calculer mon budget</button></div>' +
    '<p class="small muted">Vos revenus réels, qui varient d\'un mois à l\'autre, se saisissent ensuite dans l\'onglet Mois.</p></section>';
}

/* --- Mois --- */
function niceMax(v) { const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; }
function weeksChart() {
  const cw = curWeek(), n = 8, rows = [];
  for (let i = n - 1; i >= 0; i--) { const w = addDays(cw, -7 * i); rows.push({ w, s: weekSpent(w), b: weekBase(w) }); }
  const max = niceMax(Math.max(...rows.map((r) => r.b), ...rows.map((r) => r.s), 1000) * 1.05);
  const W = 340, H = 180, L = 44, R = 8, T = 10, B = 26, iw = W - L - R, ih = H - T - B, bw = iw / n;
  const y = (v) => T + ih - (v / max) * ih;
  let g = '';
  [0, max / 2, max].forEach((t) => { g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t) + '" y2="' + y(t) + '"/><text class="tick" x="' + (L - 6) + '" y="' + (y(t) + 3.5) + '" text-anchor="end">' + Math.round(t / 100) + ' €</text>'; });
  rows.forEach((r, i) => {
    const x = L + i * bw + bw * 0.18, h = Math.max(0, (r.s / max) * ih), over = r.b > 0 && r.s > r.b;
    g += '<rect class="bar ' + (over ? 'over ' : '') + (i === n - 1 ? 'cur' : 'past') + '" x="' + x.toFixed(1) + '" y="' + (T + ih - h).toFixed(1) + '" width="' + (bw * 0.64).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3"><title>' + fmtShort(r.w) + ' : ' + eur(r.s) + ' sur ' + eur(r.b) + '</title></rect>';
    if (r.b > 0) g += '<line class="budget" x1="' + (x - 3).toFixed(1) + '" x2="' + (x + bw * 0.64 + 3).toFixed(1) + '" y1="' + y(r.b).toFixed(1) + '" y2="' + y(r.b).toFixed(1) + '"/>';
    if (i % 2 === (n - 1) % 2) g += '<text class="tick" x="' + (x + bw * 0.32).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + fmtShort(r.w) + '</text>';
  });
  const avg = rows.slice(0, -1).reduce((s, r) => s + r.s, 0) / (n - 1);
  return { svg: '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Dépenses des 8 dernières semaines">' + g + '</svg>', avg };
}
function periodCompare(ps) {
  const pe = pend(ps), t = today(), upto = t < pe ? t : pe, el = Math.max(0, diffDays(upto, ps));
  const pp = prevP(ps), cap = pend(pp), pu = addDays(pp, el), pe2 = pu > cap ? cap : pu;
  const sum = (a, b) => { const o = { total: 0, cat: {} }; for (const e of EXPB) if (e.date >= a && e.date <= b) { o.total += e.amount; o.cat[e.cat] = (o.cat[e.cat] || 0) + e.amount; } return o; };
  return { cur: sum(ps, upto), prev: sum(pp, pe2), days: el + 1, pp };
}
const brow = (l, v, cls) => '<div class="brow ' + (cls || '') + '"><span>' + l + '</span><span class="num">' + v + '</span></div>';
/* ---------- Mois : courbe cumulée et calendrier ---------- */
function curveCard(ps, pi) {
  const eff = Math.max(0, pi.budget), t = today(), cur = ps === curP();
  if (eff <= 0 && pi.spent <= 0) return '';
  const el = cur ? Math.min(pi.days, diffDays(t, ps) + 1) : pi.days;
  const per = Array(pi.days).fill(0);
  for (const e of EXPB) if (e.date >= ps && e.date <= pi.pe) per[diffDays(e.date, ps)] += e.amount;
  const W = 320, H = 120, ymax = Math.max(eff, pi.spent, 1), Y = (v) => (H - (v / ymax) * (H - 12)).toFixed(1), X = (i) => ((i / Math.max(1, pi.days - 1)) * W).toFixed(1);
  let cum = 0; const pts = [];
  for (let i = 0; i < el; i++) { cum += per[i]; pts.push(X(i) + ',' + Y(cum)); }
  const lastP = pts[pts.length - 1].split(','), st = pi.ratio > 1 ? 'bad' : pi.ratio >= 0.8 ? 'warn' : 'ok';
  const ideal = eff * el / pi.days, diff = Math.round(pi.spent - ideal);
  const word = { ok: 'Dans la trajectoire', warn: 'Un peu au-dessus', bad: 'Budget dépassé' }[diff > 0 && st === 'ok' ? 'warn' : st];
  const txt = cur ? 'Trajectoire : ' + eur(Math.round(ideal)) + ' au jour ' + el + ' sur ' + pi.days + '. Vous êtes ' + eur(Math.abs(diff)) + (diff > 0 ? ' au-dessus.' : ' en dessous.') : 'Dépensé : ' + eur(pi.spent) + ' pour un budget de ' + eur(eff) + '.';
  return '<section class="card curve ' + st + '"><div class="sect-title"><h2>Dépenses cumulées</h2></div>' +
    '<svg class="chart" viewBox="0 0 320 130" role="img" aria-label="Courbe des dépenses cumulées du mois comparée à la trajectoire du budget"><line class="axis" x1="0" y1="' + H + '" x2="' + W + '" y2="' + H + '"/>' +
    '<line class="ideal" x1="0" y1="' + H + '" x2="' + W + '" y2="' + Y(eff) + '"/>' +
    '<polygon class="area" points="' + pts.join(' ') + ' ' + lastP[0] + ',' + H + ' 0,' + H + '"/><polyline class="ln" points="' + pts.join(' ') + '"/><circle class="end" cx="' + lastP[0] + '" cy="' + lastP[1] + '" r="6"/></svg>' +
    '<div class="legend"><span>' + fmtShort(ps) + '</span><span>Pointillé : trajectoire du budget</span><span>' + fmtShort(pi.pe) + '</span></div>' +
    '<div class="stline" style="margin-top:10px"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ST_ICON[st] + '"/></svg>' + word + '</div><p class="small" style="margin-top:8px;text-align:center">' + txt + '</p></section>';
}
function calendarCard(ps, pi) {
  const t = today(), lead = (parse(ps).getDay() + 6) % 7, total = Math.ceil((lead + pi.days) / 7) * 7;
  const out = {}, inc = {}, list = [];
  for (const r of REC) for (const d of occurrences(r, ps, pi.pe)) { out[d] = (out[d] || 0) + r.amount; list.push({ d, n: r.name, a: -r.amount }); }
  for (const i of INC) if (i.date >= ps && i.date <= pi.pe) { inc[i.date] = (inc[i.date] || 0) + i.amount; list.push({ d: i.date, n: i.label || 'Revenu', a: i.amount }); }
  let cells = '';
  for (let k = 0; k < total; k++) {
    const d = addDays(ps, k - lead), inP = d >= ps && d <= pi.pe;
    const lab = fmtDay(d) + (out[d] ? ', prélèvement ' + eur(out[d]) : '') + (inc[d] ? ', revenu ' + eur(inc[d]) : '');
    cells += '<div class="cc' + (inP ? '' : ' off') + (d === t ? ' today' : '') + (inP && d < t ? ' past' : '') + '"' + (inP ? ' role="img" aria-label="' + esc(lab) + '"' : ' aria-hidden="true"') + '><b>' + parse(d).getDate() + '</b>' + (inP && out[d] ? '<i class="mi">−</i>' : '') + (inP && inc[d] ? '<i class="pl">+</i>' : '') + '</div>';
  }
  const up = list.filter((x) => x.d >= t).sort((a, b) => (a.d < b.d ? -1 : 1)).slice(0, 4);
  return '<section class="card"><div class="sect-title"><h2>Calendrier</h2></div><div class="cal"><div class="cw">' + ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x) => '<span aria-hidden="true">' + x + '</span>').join('') + '</div><div class="cg">' + cells + '</div></div>' +
    '<div class="legend"><span><b class="mi">−</b> prélèvement</span><span><b class="pl">+</b> revenu</span><span><i class="tdy"></i> aujourd\'hui</span></div>' +
    (up.length ? '<h3 style="margin:14px 0 4px">À venir</h3>' + up.map((x) => '<div class="brow"><span><strong>' + esc(x.n) + '</strong><div class="small muted">' + fmtDay(x.d) + '</div></span><span class="num" style="font-weight:700;' + (x.a > 0 ? 'color:var(--ok)' : '') + '">' + (x.a > 0 ? '+' : '−') + eur(Math.abs(x.a)) + '</span></div>').join('') : '') + '</section>';
}
/* ---------- Recherche ---------- */
const Q = { q: '', cats: [] };
function searchList() {
  const q = Q.q.trim().toLowerCase();
  const l = EXP.filter((e) => (!Q.cats.length || Q.cats.includes(e.cat)) && (!q || ((e.note || '') + ' ' + catName(e.cat)).toLowerCase().includes(q))).sort((a, b) => (a.date === b.date ? (b.ts || 0) - (a.ts || 0) : a.date < b.date ? 1 : -1));
  const tot = l.reduce((t, e) => t + e.amount, 0);
  return '<div class="row" style="margin-bottom:8px"><span class="small" style="font-weight:700">' + l.length + ' dépense' + (l.length > 1 ? 's' : '') + '</span><span class="num" style="font-weight:700;font-size:20px">' + eur(tot) + '</span></div>' +
    (l.length ? l.slice(0, 200).map((e) => '<button class="exp" data-act="editExp" data-id="' + esc(e.id) + '">' + catIco(e.cat) + '<span class="t"><div>' + esc(e.note || catName(e.cat)) + '</div><div class="small muted">' + esc(catName(e.cat)) + ' · ' + fmtShort(e.date) + '</div></span><span class="amt num">' + eur(e.amount) + '</span></button>').join('') + (l.length > 200 ? '<p class="small muted">200 premiers résultats affichés : affinez la recherche.</p>' : '') : '<p class="muted" style="padding:16px 0;text-align:center">Aucune dépense ne correspond.</p>');
}
function viewSearch() {
  return '<div class="weeknav"><button class="icon-btn" data-act="tab" data-tab="week" aria-label="Retour à la semaine"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><div class="label">Rechercher</div><span style="width:48px"></span></div>' +
    '<label class="f">Mot, magasin ou catégorie<input id="sQ" type="search" autocomplete="off" placeholder="Ex. Carrefour" value="' + esc(Q.q) + '"></label>' +
    '<div><h3>Filtrer par catégorie</h3><div class="chips" style="margin-top:8px">' + S.cats.map((c) => '<button type="button" class="chip" data-act="sCat" data-id="' + esc(c.id) + '" aria-pressed="' + Q.cats.includes(c.id) + '"><svg class="ci" viewBox="0 0 24 24" aria-hidden="true" style="color:' + catColor(c.id) + '"><path d="' + catIconPath(c.id) + '"/></svg>' + esc(c.name) + '</button>').join('') + '</div></div>' +
    '<section class="card" id="sRes">' + searchList() + '</section>';
}
function viewMonth() {
  const ps = monthSel, pi = periodInfo(ps), cur = ps === curP(), past = ps < curP();
  const st = pi.ratio > 1 ? 'bad' : pi.ratio >= 0.8 ? 'warn' : 'ok', eff = Math.max(0, pi.budget);
  let h = '<div class="weeknav"><button class="icon-btn" data-act="mo" data-d="-1" aria-label="Mois précédent"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>' +
    '<div class="label">' + (cur ? 'Ce mois' : fmtRange(ps, pi.pe)) + '<div class="small muted" style="font-family:var(--font-body);font-weight:500">' + (cur ? fmtRange(ps, pi.pe) : '<button class="link" data-act="moNow">Revenir à ce mois</button>') + '</div></div>' +
    '<button class="icon-btn" data-act="mo" data-d="1" aria-label="Mois suivant"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button></div>';
  if (!S.setupDone) return h + onboarding();
  h += '<section class="card"><div class="sect-title"><h2>Bilan du mois</h2><span class="pill ' + st + '">' + { ok: 'Dans le budget', warn: 'Attention', bad: 'Dépassé' }[st] + '</span></div>' +
    '<div class="brow"><span>Revenus' + (pi.inc.fallback ? ' habituels' : '') + ' <button class="link small" data-act="editIncTotal">Modifier</button></span><span class="num">' + eur(pi.inc.total) + '</span></div>' +
    (S.mode === 'auto' ? brow('Charges fixes', (pi.fixed ? '−' : '') + eur(pi.fixed), 'neg') + (pi.sav ? brow('Épargne mensuelle', '−' + eur(pi.sav), 'neg') : '') + (pi.refill > 0 ? brow('Remboursement de l\'épargne de secours (mois précédent)', '−' + eur(pi.refill), 'neg') : '') + (pi.provM > 0 ? brow('Provisions', '−' + eur(pi.provM), 'neg') : '') + brow('Budget du mois', eur(pi.budget), 'total') : brow('Budget fixé à la semaine', eur(pi.budget), 'total')) +
    '<div class="gauge" style="height:10px;margin:14px 0 10px"><b style="width:' + Math.min(100, Math.round(pi.ratio * 100)) + '%;background:var(--' + st + ')"></b></div>' +
    brow('Dépensé', eur(pi.spent)) + brow(pi.left < 0 ? 'Dépassement' : 'Reste', eur(Math.abs(pi.left)), 'total') + '</section>';
  if (pi.over > 0) h += '<div class="alert bad">' + (cur ? 'Budget du mois dépassé de <b>' + eur(pi.over) + '</b>. Prévoyez ce montant depuis l\'épargne de secours' + (S.refill && S.mode === 'auto' ? ' : il sera retenu sur le budget du mois suivant.' : '.') : 'Ce mois a dépassé son budget de <b>' + eur(pi.over) + '</b>, à remettre dans l\'épargne de secours.') + ' <button class="link" data-act="tab" data-tab="save">Voir l\'épargne de secours</button></div>';
  if (pi.inc.fallback && S.setupDone) h += '<div class="alert info">Aucun revenu saisi pour ce mois : le budget utilise vos revenus habituels (' + eur(S.income) + '). Ajoutez vos revenus réels ci-dessous. <button class="link" data-act="editIncTotal">Corriger le montant</button></div>';
  h += curveCard(ps, pi) + calendarCard(ps, pi);
  if (cur) h += paceCard(ps) + balanceCard() + adviceCard();
  const prevHas = INC.some((i) => effP(i) === prevP(ps));
  h += '<section class="card"><div class="sect-title"><h2>Revenus du mois</h2><button class="btn sm primary" data-act="addInc">Ajouter</button></div>' +
    (pi.inc.lines.length ? pi.inc.lines.map((i) => '<button class="exp" data-act="editInc" data-id="' + esc(i.id) + '"><span class="t"><div>' + esc(i.label || 'Revenu') + '</div><div class="small muted">' + fmtDay(i.date) + (i.shift ? ' · rattaché à ce mois' : '') + '</div></span><span class="amt num">' + eur(i.amount) + '</span></button>').join('') + '<div class="brow total" style="margin-top:6px"><span>Total</span><span class="num">' + eur(pi.inc.total) + '</span></div>'
      : '<p class="muted small">Salaire, primes, aides… Ajoutez chaque revenu reçu entre le ' + fmtShort(ps) + ' et le ' + fmtShort(pi.pe) + ' Le total remplace vos revenus habituels.</p>') +
    (!pi.inc.lines.length && prevHas ? '<div class="actions" style="margin-top:12px"><button class="btn" data-act="copyInc">Copier les revenus du mois précédent</button></div>' : '') + '</section>';
  if (!EXP.length) return h + '<div class="card empty"><b>Pas encore de statistiques</b>Elles apparaissent dès les premières dépenses saisies.</div>';
  const ch = weeksChart(), m = periodCompare(ps);
  const dl = (a, b) => { const d = a - b; if (!b && !a) return '<span class="muted">—</span>'; return '<span class="delta ' + (d > 0 ? 'up' : 'down') + ' num">' + (d > 0 ? '+' : '−') + eur(Math.abs(d)) + '</span>'; };
  const ids = [...new Set([...Object.keys(m.cur.cat), ...Object.keys(m.prev.cat)])].sort((a, b) => (m.cur.cat[b] || 0) - (m.cur.cat[a] || 0));
  const tot = pi.spent || 1, ck = Object.keys(pi.cat).sort((a, b) => pi.cat[b] - pi.cat[a]);
  const t30 = addDays(today(), -29), trig = {};
  for (const e of EXP) if (e.date >= t30 && e.ctx && e.ctx !== 'prevu') trig[e.ctx] = (trig[e.ctx] || 0) + e.amount;
  const tk = Object.keys(trig).sort((a, b) => trig[b] - trig[a]), tmax = tk.length ? trig[tk[0]] : 1;
  return h + '<section class="card"><div class="sect-title"><h2>8 dernières semaines</h2></div>' + ch.svg +
    '<div class="legend"><span><i style="background:var(--accent)"></i>Dépenses</span><span><i style="background:var(--bad)"></i>Au-dessus du budget</span><span><i style="background:var(--ink);height:2px"></i>Budget de la semaine</span></div>' +
    '<p class="small muted" style="margin-top:8px">Moyenne des 7 semaines précédentes : <strong class="num" style="color:var(--ink)">' + eur(ch.avg) + '</strong></p></section>' +
    '<section class="card"><div class="sect-title"><h2>Comparé au mois précédent</h2></div><p class="small muted" style="margin-bottom:10px">' + (m.days > 1 ? 'Sur les ' + m.days + ' premiers jours de chaque mois.' : 'Sur le premier jour de chaque mois.') + '</p>' +
    '<table class="t"><thead><tr><th></th><th>' + fmtShort(ps) + '</th><th>' + fmtShort(m.pp) + '</th><th>Écart</th></tr></thead><tbody>' +
    '<tr><td><strong>Total</strong></td><td class="num"><strong>' + eur(m.cur.total) + '</strong></td><td class="num">' + eur(m.prev.total) + '</td><td>' + dl(m.cur.total, m.prev.total) + '</td></tr>' +
    ids.map((id) => '<tr><td>' + esc(catName(id)) + '</td><td class="num">' + eur(m.cur.cat[id] || 0) + '</td><td class="num">' + eur(m.prev.cat[id] || 0) + '</td><td>' + dl(m.cur.cat[id] || 0, m.prev.cat[id] || 0) + '</td></tr>').join('') + '</tbody></table></section>' +
    '<section class="card"><div class="sect-title"><h2>Répartition du mois</h2></div>' + (ck.length ? ck.map((id) => '<div class="hbar"><span class="nm">' + esc(catName(id)) + '</span><span class="track"><b style="width:' + Math.max(2, Math.round(pi.cat[id] / tot * 100)) + '%;background:' + catColor(id) + '"></b></span><span class="num small">' + pct(pi.cat[id] / tot) + '</span></div>').join('') : '<p class="muted">Aucune dépense ce mois-ci.</p>') + '</section>' +
    ticketCard(ps) + '<section class="card"><div class="sect-title"><h2>Achats hors prévu</h2><span class="small muted">30 derniers jours</span></div>' + (tk.length ? tk.map((k) => '<div class="hbar"><span class="nm">' + ctxName(k) + '</span><span class="track"><b style="width:' + Math.max(4, Math.round(trig[k] / tmax * 100)) + '%;background:var(--bad)"></b></span><span class="num small">' + eur(trig[k]) + '</span></div>').join('') + '<p class="small muted" style="margin-top:12px">Votre premier déclencheur est « ' + ctxName(tk[0]).toLowerCase() + ' ». Notez le contexte en saisissant une dépense pour affiner ce tableau.</p>' : '<p class="muted">Aucune donnée. Dans « Plus de détails » à la saisie, choisissez un contexte (impulsif, stress, ennui…) pour repérer vos déclencheurs.</p>') + '</section>';
}

/* --- Fixes --- */
function viewFixed() {
  const tm = fixedMonthly(), subs = detectSubs(), ps = curP(), pe = pend(ps), t = today();
  const due = []; for (const r of REC) for (const d of occurrences(r, ps, pe)) due.push({ d, r });
  due.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const dueTotal = due.reduce((s, x) => s + x.r.amount, 0);
  const list = [...REC].sort((a, b) => { const x = nextDue(a), y = nextDue(b); return x < y ? -1 : x > y ? 1 : 0; });
  const top = [...REC].sort((a, b) => monthlyEq(b) - monthlyEq(a))[0];
  let h = '<section class="card"><div class="row"><div><h3>Total par mois</h3><div class="kpi"><div class="v num">' + eur(tm) + '</div></div></div><div style="text-align:right"><h3>Par an</h3><div class="kpi"><div class="v num">' + eur(tm * 12) + '</div></div></div></div>' +
    '<p class="small muted" style="margin-top:8px">Ces charges sont déjà retirées de votre budget : inutile de les saisir comme dépenses.' + (S.smooth && REC.some((r) => r.period !== 'monthly') ? ' Les charges non mensuelles sont lissées sur 12 mois (voir Réglages).' : '') + '</p></section>';
  if (due.length) h += '<section class="card"><div class="sect-title"><h2>Prélèvements du mois</h2><span class="small muted">' + fmtRange(ps, pe) + '</span></div>' +
    due.map((x) => '<div class="brow ' + (x.d < t ? 'neg' : '') + '"><span><strong class="num" style="display:inline-block;min-width:72px">' + fmtShort(x.d) + '</strong> ' + esc(x.r.name) + (x.d < t ? ' <span class="tag past">Passé</span>' : x.d === t ? ' <span class="tag">Aujourd\'hui</span>' : '') + '</span><span class="num">' + eur(x.r.amount) + '</span></div>').join('') +
    '<div class="brow total"><span>Total prévu</span><span class="num">' + eur(dueTotal) + '</span></div></section>';
  h += '<section class="card"><div class="sect-title"><h2>Charges et abonnements</h2><button class="btn sm primary" data-act="addRec">Ajouter</button></div>';
  if (!list.length) h += '<div class="empty"><b>Aucune charge fixe</b>Ajoutez le loyer, l\'assurance, les abonnements, avec leur date de prélèvement.</div>';
  else h += list.map((r, i) => { const nd = nextDue(r); return '<button class="exp" data-act="editRec" data-id="' + esc(r.id) + '"><span class="t"><div>' + esc(r.name) + (list.length >= 3 && r === top ? '<span class="tag">Plus gros poste</span>' : '') + '</div><div class="small muted">' + recDateText(r) + (nd ? ' · prochain : ' + fmtShort(nd) : '') + '</div></span><span class="amt num">' + eur(r.amount) + '</span></button>'; }).join('');
  h += '</section>';
  if (subs.length) h += '<section class="card stack"><div><h2>Abonnements possibles</h2><p class="small muted">Ces dépenses reviennent à intervalle régulier. Ajoutez-les en charge fixe, ou vérifiez s\'ils servent encore.</p></div>' + subs.map((s, i) => '<div class="row"><div><strong>' + esc(s.name) + '</strong><div class="small muted num">' + eur(s.amount) + ' · ' + (s.period === 'monthly' ? 'chaque mois, vers le ' + s.day : 'chaque ' + DAYS[s.dow].toLowerCase()) + ' · vu ' + s.count + ' fois</div></div><button class="btn sm" data-act="subAdd" data-i="' + i + '">Ajouter</button></div>').join('') + '</section>';
  return h;
}

/* --- Épargne --- */
function viewSave() {
  const cur = curP(), first = pstart(S.startDate || today()), closed = [];
  for (let p = first; p < cur && closed.length < 240; p = nextP(p)) closed.push(periodInfo(p));
  const totalOver = closed.reduce((s, p) => s + p.over, 0), remis = REM.reduce((s, x) => s + x.amount, 0), due = totalOver - remis, pc = periodInfo(cur);
  const rems = [...REM].sort((a, b) => (a.date < b.date ? 1 : -1));
  const last3 = closed.slice(-3), avgSpent = last3.length ? last3.reduce((a, q) => a + q.spent, 0) / last3.length : Math.max(pc.spent, Math.max(0, pc.budget)), need = avgSpent + fixedMonthly(), target = S.efMonths * need;
  let ef = '<section class="card stack"><div class="sect-title" style="margin:0"><h2>Matelas de sécurité</h2><button class="btn sm" data-act="editEf">' + (S.efBalance == null ? 'Saisir le solde' : 'Mettre à jour') + '</button></div>';
  if (S.efBalance == null) ef += '<p class="small muted">Saisissez le solde de votre épargne de secours pour suivre votre objectif : ' + S.efMonths + ' mois de dépenses.</p>';
  else { const pr = target > 0 ? Math.min(1, S.efBalance / target) : 0; ef += '<div class="kpis"><div class="kpi"><div class="l">Solde</div><div class="v num">' + eur(S.efBalance) + '</div></div><div class="kpi"><div class="l">Objectif · ' + S.efMonths + ' mois</div><div class="v num">' + eur(target) + '</div></div></div>' +
    '<div class="goal"><div class="bar" role="img" aria-label="' + pct(pr) + ' de l\'objectif"><b style="width:' + Math.round(pr * 100) + '%"></b></div><div class="row small"><span class="muted">Couvre <strong class="num" style="color:var(--ink)">' + (need > 0 ? (S.efBalance / need).toFixed(1).replace('.', ',') : '0') + '</strong> mois de dépenses (' + eur(need) + ' par mois)</span><span class="num muted">' + pct(pr) + '</span></div></div>' +
    (due > 0 ? '<p class="small muted">Après remise des ' + eur(due) + ' à remettre : <strong class="num" style="color:var(--ink)">' + eur(S.efBalance + due) + '</strong>.</p>' : '') + '<p class="small muted">Solde saisi le ' + fmtShort(S.efDate) + ' Mettez-le à jour après chaque virement.</p>'; }
  ef += '</section>';
  let pv = '<section class="card"><div class="sect-title"><h2>Provisions</h2><button class="btn sm primary" data-act="addProv">Ajouter</button></div>';
  if (!PROV.length) pv += '<p class="small muted">Cadeaux, réparations, vacances : mettez un peu de côté chaque mois pour que ces dépenses ne tombent plus par surprise. Le montant mensuel est retiré de votre budget.</p>';
  pv += PROV.map((q) => { const bl = provBalance(q), pr = q.target ? Math.max(0, Math.min(1, bl / q.target)) : 0; return '<button class="exp" data-act="editProv" data-id="' + esc(q.id) + '" style="flex-wrap:wrap"><span class="t"><div>' + esc(q.name) + '</div><div class="small muted">' + eur(q.monthly) + ' par mois · disponible : <strong class="num" style="color:var(--ink)">' + eur(bl) + '</strong>' + (q.target ? ' sur ' + eur(q.target) : '') + '</div></span><span class="amt num">' + eur(bl) + '</span>' + (q.target ? '<span class="minibar" style="flex-basis:100%"><b style="width:' + Math.round(pr * 100) + '%;background:var(--accent)"></b></span>' : '') + '</button>'; }).join('') + '</section>';
  let h = '<section class="card"><div class="sect-title"><h2>Épargne de secours</h2><button class="btn sm primary" data-act="addRem">Noter une remise</button></div>' +
    '<p class="small muted" style="margin-bottom:10px">Un dépassement est ce que vous avez dû prendre sur l\'épargne de secours en fin de mois. L\'appli le calcule : dépenses du mois moins budget du mois.' + (S.refill && S.mode === 'auto' ? ' Il est ensuite retenu sur le budget du mois suivant.' : '') + '</p>' +
    brow('Dépassement du mois en cours' + (pc.over > 0 ? ' (provisoire)' : ''), eur(pc.over)) + brow('Dépassements des mois passés', eur(totalOver)) + brow('Déjà remis', '−' + eur(remis), 'neg') +
    brow(due < 0 ? 'Remis en avance' : 'Reste à remettre', eur(Math.abs(due)), 'total');
  const lastOver = closed.filter((p) => p.over > 0).slice(-6).reverse();
  if (lastOver.length) h += '<h3 style="margin:16px 0 4px">Mois dépassés</h3>' + lastOver.map((p) => brow(fmtRange(p.ps, p.pe), eur(p.over))).join('');
  if (rems.length) h += '<h3 style="margin:16px 0 4px">Remises notées</h3>' + rems.map((x) => '<button class="exp" data-act="editRem" data-id="' + esc(x.id) + '"><span class="t"><div>' + fmtDay(x.date) + '</div>' + (x.note ? '<div class="small muted">' + esc(x.note) + '</div>' : '') + '</span><span class="amt num">' + eur(x.amount) + '</span></button>').join('');
  h += '</section>';
  h = ef + h + pv;
  h += '<section class="card"><h3>Épargne mensuelle prévue</h3><div class="kpi"><div class="v num">' + eur(S.savings) + ' <span class="small muted" style="font-family:var(--font-body);font-weight:500">par mois</span></div></div><p class="small muted" style="margin-top:6px">Ce montant est déjà retiré de votre budget. Modifiez-le dans Réglages.</p></section>';
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
function displayCard() {
  const ch = (act, v, label, on) => '<button type="button" class="chip" data-act="' + act + '" data-v="' + v + '" aria-pressed="' + on + '">' + label + '</button>';
  return '<section class="card stack"><h2>Affichage</h2><p class="small muted">Ces réglages sont propres à cet appareil.</p>' +
    '<div><h3>Thème</h3><div class="chips" style="margin-top:8px">' + [['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map((x) => ch('uiTheme', x[0], x[1], UI.theme === x[0])).join('') + '</div></div>' +
    '<div><h3>Taille du texte</h3><div class="chips" style="margin-top:8px">' + [[1, 'Normale'], [1.1, 'Grande'], [1.25, 'Très grande'], [1.4, 'Maximale']].map((x) => ch('uiTs', x[0], x[1], UI.ts === x[0])).join('') + '</div></div>' +
    '<div><h3>Densité</h3><div class="chips" style="margin-top:8px">' + [['aere', 'Aérée'], ['compact', 'Compacte']].map((x) => ch('uiDens', x[0], x[1], UI.dens === x[0])).join('') + '</div></div>' +
    '<label class="sw"><span>Animations</span><input type="checkbox" data-act="uiAnim"' + (UI.anim ? ' checked' : '') + '></label></section>';
}
function viewSettings() {
  const pc = periodInfo(curP());
  const stMsg = { ok: 'À jour', pending: 'Synchronisation en cours…', offline: 'Hors ligne : les changements partiront dès le retour du réseau.', auth: 'GitHub refuse le token (expiré, révoqué ou sans droit d\'écriture). Déconnectez puis reconnectez-vous avec un nouveau token.', error: 'Échec : ' + esc(syncErr), local: '', load: '' }[syncState] || '';
  const sy = cfg
    ? '<section class="card stack"><h2>Synchronisation GitHub</h2><p class="small">Dépôt <strong>' + esc(cfg.repo) + '</strong>, fichier <strong>' + esc(cfg.path) + '</strong></p>' +
      '<p class="small muted">' + (lastSync ? 'Dernière synchronisation : ' + new Date(lastSync).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) + '. ' : 'Pas encore synchronisé. ') + stMsg + '</p>' +
      '<div class="actions"><button class="btn" data-act="syncNow">Synchroniser maintenant</button><button class="btn danger" data-act="disconnect">Déconnecter</button></div></section>'
    : connectCard(true);
  return sy +
    '<section class="card stack"><h2>Revenus et épargne</h2>' +
    '<label class="f">Revenus nets habituels par mois<input data-money="income" inputmode="decimal" value="' + (S.income ? toInput(S.income) : '') + '" placeholder="0"></label>' +
    '<p class="small muted">Utilisés tant qu\'aucun revenu n\'est saisi pour un mois. Vos revenus réels se saisissent dans l\'onglet Mois.</p>' +
    '<label class="f">Épargne par mois<input data-money="savings" inputmode="decimal" value="' + (S.savings ? toInput(S.savings) : '') + '" placeholder="0"></label>' +
    '<label class="f">Jour du virement d\'épargne et des provisions (facultatif)<select data-set="savingsDay"><option value="0">Aucun</option>' + Array.from({ length: 28 }, (_, i) => i + 1).map((d) => '<option value="' + d + '"' + (S.savingsDay === d ? ' selected' : '') + '>Le ' + d + '</option>').join('') + '</select></label>' +
    '<label class="f">Alerte si le compte courant descend sous<input data-money="alertBelow" inputmode="decimal" value="' + (S.alertBelow ? toInput(S.alertBelow) : '') + '" placeholder="0"></label>' +
    '<div class="small muted num">Mois en cours : revenus ' + eur(pc.inc.total) + ' − charges ' + eur(pc.fixed) + ' − épargne ' + eur(pc.sav) + (pc.refill ? ' − remboursement ' + eur(pc.refill) : '') + ' = <strong style="color:var(--ink)">' + eur(pc.budget) + '</strong></div></section>' +
    '<section class="card stack"><h2>Budget hebdomadaire</h2>' +
    '<label class="f">Calcul<select data-set="mode"><option value="auto"' + (S.mode === 'auto' ? ' selected' : '') + '>Automatique (revenus − charges − épargne)</option><option value="manual"' + (S.mode === 'manual' ? ' selected' : '') + '>Je fixe le montant</option></select></label>' +
    (S.mode === 'manual' ? '<label class="f">Budget par semaine<input data-money="manual" inputmode="decimal" value="' + (S.manual ? toInput(S.manual) : '') + '" placeholder="0"></label>' : '') +
    '<div class="small muted num">Budget actuel : <strong style="color:var(--ink)">' + eur(weekBase(curWeek())) + '</strong> par semaine</div>' +
    '<label class="f">La semaine commence le<select data-set="weekStart">' + [1, 2, 3, 4, 5, 6, 0].map((d) => '<option value="' + d + '"' + (S.weekStart === d ? ' selected' : '') + '>' + DAYS[d] + '</option>').join('') + '</select></label>' +
    '<label class="f">Le mois commence le<select data-set="monthStart">' + Array.from({ length: 28 }, (_, i) => i + 1).map((d) => '<option value="' + d + '"' + (S.monthStart === d ? ' selected' : '') + '>' + d + '</option>').join('') + '</select></label>' +
    '<label class="sw"><span><strong>Réserver le remboursement de l\'épargne de secours</strong><div class="small muted">Le dépassement d\'un mois est retenu sur le budget du mois suivant.</div></span><input type="checkbox" data-set="refill"' + (S.refill ? ' checked' : '') + '></label>' +
    '<label class="sw"><span><strong>Lisser les charges non mensuelles</strong><div class="small muted">Annuelles, trimestrielles, hebdomadaires : réparties sur 12 mois au lieu d\'un seul prélèvement.</div></span><input type="checkbox" data-set="smooth"' + (S.smooth ? ' checked' : '') + '></label>' +
    '<label class="sw"><span><strong>Reporter l\'excédent et le dépassement</strong><div class="small muted">Un dépassement réduit la semaine suivante. Un excédent s\'y ajoute, dans la limite d\'un budget hebdo.</div></span><input type="checkbox" data-set="carry"' + (S.carry ? ' checked' : '') + '></label></section>' +
    '<section class="card"><div class="sect-title"><h2>Catégories</h2></div><p class="small muted" style="margin-bottom:12px">Budget par semaine. Laissez vide pour ne pas fixer de plafond.</p>' +
    S.cats.map((c) => '<div class="setrow"><input data-cname="' + esc(c.id) + '" value="' + esc(c.name) + '" aria-label="Nom de la catégorie"><input data-cbudget="' + esc(c.id) + '" inputmode="decimal" value="' + (c.budget ? toInput(c.budget) : '') + '" placeholder="Sans plafond" aria-label="Budget hebdo"><button class="icon-btn" data-act="delCat" data-id="' + esc(c.id) + '" aria-label="Supprimer ' + esc(c.name) + '"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>').join('') +
    '<div class="actions" style="margin-top:12px"><button class="btn" data-act="addCat">Ajouter une catégorie</button></div></section>' +
    (FAV.length ? '<section class="card"><div class="sect-title"><h2>Favoris</h2></div><p class="small muted" style="margin-bottom:8px">Affichés en « Ajout rapide » sur l\'écran Semaine. Pour en créer un, cochez « Ajouter aux favoris » en saisissant une dépense.</p>' + FAV.map((f) => '<div class="brow"><span>' + esc(f.note || catName(f.cat)) + ' <span class="muted">· ' + eur(f.amount) + '</span></span><button class="link small" data-act="delFav" data-id="' + esc(f.id) + '">Retirer</button></div>').join('') + '</section>' : '') +
    displayCard() +
    lockCard() +
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

function itemRow(it) {
  it = it || {};
  return '<div class="itrow"><input class="itn" data-itn placeholder="Article" maxlength="60" autocomplete="off" value="' + esc(it.n || '') + '"><input class="ita" data-ita inputmode="decimal" placeholder="0" aria-label="Prix" value="' + (it.a ? toInput(it.a) : '') + '">' +
    '<button type="button" class="chip itt" data-act="itemTog" aria-pressed="' + (it.s ? 'true' : 'false') + '">' + (it.s ? 'Superflu' : 'Essentiel') + '</button>' +
    '<button type="button" class="icon-btn" data-act="itemDel" aria-label="Retirer l\'article"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
}
function readItems(f) {
  return [...f.querySelectorAll('.itrow')].map((r) => ({ n: r.querySelector('[data-itn]').value.trim(), a: Math.round(parseMoney(r.querySelector('[data-ita]').value) || 0), s: r.querySelector('.itt').getAttribute('aria-pressed') === 'true' ? 1 : 0 })).filter((i) => i.a > 0);
}
function ticketSum() {
  const f = $('#expForm'), box = $('#tkSum'); if (!f || !box) return;
  const it = readItems(f), amount = Math.round(parseMoney($('#fAmt').value) || 0);
  const ess = it.filter((i) => !i.s).reduce((t, i) => t + i.a, 0), sup = it.filter((i) => i.s).reduce((t, i) => t + i.a, 0), rest = amount - ess - sup;
  box.innerHTML = it.length ? 'Essentiel <b class="num">' + eur(ess) + '</b> · Superflu <b class="num" style="color:var(--bad)">' + eur(sup) + '</b>' + (amount > 0 ? (rest > 0 ? ' · Non détaillé <b class="num">' + eur(rest) + '</b>' : rest < 0 ? ' · <span style="color:var(--bad)">Les articles dépassent le total de ' + eur(-rest) + '</span>' : ' · Ticket complet') : '') : '';
}
function ticketCard(ps) {
  const end = pend(ps), list = EXPB.filter((e) => e.date >= ps && e.date <= end && e.items && e.items.length);
  if (!list.length) return '';
  let ess = 0, sup = 0, tot = 0; const byName = {};
  for (const e of list) {
    tot += e.amount; let d = 0;
    for (const i of e.items) { d += i.a; if (i.s) { sup += i.a; const k = (i.n || 'Sans nom').toLowerCase(); byName[k] = (byName[k] || { n: i.n || 'Sans nom', a: 0 }); byName[k].a += i.a; } else ess += i.a; }
  }
  const rest = Math.max(0, tot - ess - sup), top = Object.values(byName).sort((a, b) => b.a - a.a).slice(0, 5), det = ess + sup;
  return '<section class="card"><div class="sect-title"><h2>Essentiel et superflu</h2><span class="small muted">' + list.length + ' ticket' + (list.length > 1 ? 's' : '') + ' détaillé' + (list.length > 1 ? 's' : '') + '</span></div>' +
    '<div class="stackbar"><b style="width:' + (tot ? ess / tot * 100 : 0) + '%;background:var(--accent)"></b><b style="width:' + (tot ? sup / tot * 100 : 0) + '%;background:var(--bad)"></b></div>' +
    '<div class="brow"><span>Essentiel</span><span class="num">' + eur(ess) + '</span></div><div class="brow"><span>Superflu</span><span class="num" style="color:var(--bad)">' + eur(sup) + (det ? ' · ' + pct(sup / det) + ' du détaillé' : '') + '</span></div>' +
    (rest > 0 ? '<div class="brow"><span class="muted">Non détaillé</span><span class="num muted">' + eur(rest) + '</span></div>' : '') +
    (top.length ? '<p class="small muted" style="margin:10px 0 4px">Principaux achats superflus</p>' + top.map((k) => '<div class="brow"><span>' + esc(k.n) + '</span><span class="num">' + eur(k.a) + '</span></div>').join('') : '') + '</section>';
}
function expenseSheet(e) {
  const edit = !!e;
  const last = [...EXP].sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  const sel = e ? e.cat : (last && catById(last.cat) ? last.cat : S.cats[0].id);
  openSheet('<form id="expForm" class="stack" data-id="' + (edit ? esc(e.id) : '') + '" data-ts="' + (edit ? e.ts || '' : '') + '" novalidate>' +
    '<h2>' + (edit ? 'Modifier la dépense' : 'Nouvelle dépense') + '</h2>' +
    '<label class="bigamt"><input id="fAmt" inputmode="none" autocomplete="off" placeholder="0" aria-label="Montant en euros" autofocus value="' + (edit ? toInput(e.amount) : '') + '"><span>€</span></label>' +
    '<div class="chips" id="fCats" role="group" aria-label="Catégorie">' + S.cats.map((c) => '<button type="button" class="chip" data-cat="' + esc(c.id) + '" aria-pressed="' + (c.id === sel) + '"><svg class="ci" viewBox="0 0 24 24" aria-hidden="true" style="color:' + catColor(c.id) + '"><path d="' + catIconPath(c.id) + '"/></svg>' + esc(c.name) + '</button>').join('') + '</div>' +
    '<div class="grid2 stackable"><label class="f">Date<input type="date" id="fDate" value="' + (edit ? e.date : today()) + '"></label><label class="f">Note (facultatif)<input id="fNote" list="noteList" autocomplete="off" maxlength="80" placeholder="Ex. Boulangerie" value="' + (edit ? esc(e.note || '') : '') + '"></label></div>' +
    '<p class="small sug" id="fSug" aria-live="polite"></p>' +
    '<div class="chips"><button type="button" class="chip" data-day="0">Aujourd\'hui</button><button type="button" class="chip" data-day="-1">Hier</button></div>' +
    '<div class="keypad" role="group" aria-label="Pavé numérique">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'].map((k) => '<button type="button" class="key" data-act="key" data-k="' + k + '"' + (k === 'del' ? ' aria-label="Effacer"' : k === ',' ? ' aria-label="Virgule"' : '') + '>' + (k === 'del' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12V5zM12 9l5 6M17 9l-5 6"/></svg>' : k) + '</button>').join('') + '</div>' +
    '<details' + (edit && e.ctx ? ' open' : '') + '><summary>Plus de détails</summary><p class="small muted" style="margin:6px 0 10px">Le contexte aide à repérer les achats impulsifs dans les statistiques.</p><div class="chips" id="fCtx" role="group" aria-label="Contexte">' + CTX.map((c) => '<button type="button" class="chip" data-ctx="' + c[0] + '" aria-pressed="' + (edit && e.ctx === c[0]) + '">' + c[1] + '</button>').join('') + '</div></details>' +
    '<details id="fTk"' + (edit && e.items && e.items.length ? ' open' : '') + '><summary>Ticket de caisse (essentiel / superflu)</summary><p class="small muted" style="margin:6px 0 10px">Listez les articles du ticket et marquez ceux qui sont superflus : cela affine l\'analyse du mois.</p><div id="tkRows">' + (edit && e.items ? e.items.map(itemRow).join('') : '') + '</div><div class="actions"><button type="button" class="btn" data-act="itemAdd">Ajouter un article</button></div><p class="small" id="tkSum" style="margin-top:8px"></p></details>' +
    (PROV.length ? '<label class="f">Payer avec une provision<select id="fProv"><option value="">Non, budget normal</option>' + PROV.map((q) => '<option value="' + esc(q.id) + '"' + (edit && e.prov === q.id ? ' selected' : '') + '>' + esc(q.name) + ' (' + eur(provBalance(q)) + ')</option>').join('') + '</select></label>' : '') +
    (edit ? '' : '<label class="sw"><span>Ajouter aux favoris (ajout en un toucher)</span><input type="checkbox" id="fFav"></label>') +
    '<datalist id="noteList">' + topNotes().map((n) => '<option value="' + esc(n) + '">').join('') + '</datalist>' +
    '<div class="actions"><button type="submit" class="btn primary">Enregistrer</button>' + (edit ? '<button type="button" class="btn danger" data-act="delExp" data-id="' + esc(e.id) + '">Supprimer</button>' : '') + '<button type="button" class="btn" data-act="closeSheet">Annuler</button></div></form>');
  ticketSum();
}
function recFields(per, r) {
  const d = r && r.day ? r.day : '', m = (r && r.month) || 1, dow = r && r.dow != null ? r.dow : 1;
  if (per === 'weekly') return '<label class="f">Jour de la semaine<select id="rDow">' + [1, 2, 3, 4, 5, 6, 0].map((i) => '<option value="' + i + '"' + (dow === i ? ' selected' : '') + '>' + DAYS[i] + '</option>').join('') + '</select></label>';
  const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  return '<div class="grid2 stackable">' + (per === 'monthly' ? '' : '<label class="f">' + (per === 'quarterly' ? 'Premier mois' : 'Mois') + '<select id="rMonth">' + months.map((n, i) => '<option value="' + (i + 1) + '"' + (m === i + 1 ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>') +
    '<label class="f">Jour du mois<input id="rDay" inputmode="numeric" placeholder="Ex. 5" value="' + d + '"></label></div>';
}
function recSheet(r) {
  const per = r ? r.period : 'monthly';
  openSheet('<form id="recForm" class="stack" data-id="' + (r ? esc(r.id) : '') + '" data-ts="' + (r ? r.ts || '' : '') + '" novalidate><h2>' + (r ? 'Modifier la charge' : 'Nouvelle charge fixe') + '</h2>' +
    '<label class="f">Nom<input id="rName" autofocus autocomplete="off" maxlength="60" placeholder="Ex. Loyer, Netflix" value="' + (r ? esc(r.name) : '') + '"></label>' +
    '<div class="grid2 stackable"><label class="f">Montant<input id="rAmt" inputmode="decimal" placeholder="0" value="' + (r ? toInput(r.amount) : '') + '"></label>' +
    '<label class="f">Fréquence<select id="rPer">' + Object.keys(PERIODS).map((k) => '<option value="' + k + '"' + (per === k ? ' selected' : '') + '>' + PERIODS[k] + '</option>').join('') + '</select></label></div>' +
    '<div id="rDate" class="stack">' + recFields(per, r) + '</div>' +
    '<p class="small muted">La date de prélèvement est obligatoire : elle sert à afficher le calendrier du mois.</p>' +
    '<div class="actions"><button type="submit" class="btn primary">Enregistrer</button>' + (r ? '<button type="button" class="btn danger" data-act="delRec" data-id="' + esc(r.id) + '">Supprimer</button>' : '') + '<button type="button" class="btn" data-act="closeSheet">Annuler</button></div></form>');
}
function incSheet(i) {
  const ps = monthSel || curP(), def = today() >= ps && today() <= pend(ps) ? today() : ps;
  openSheet('<form id="incForm" class="stack" data-id="' + (i ? esc(i.id) : '') + '" novalidate><h2>' + (i ? 'Modifier le revenu' : 'Nouveau revenu') + '</h2>' +
    '<label class="f">Intitulé<input id="iLabel" autofocus autocomplete="off" maxlength="60" placeholder="Ex. Salaire, prime, CAF" value="' + (i ? esc(i.label || '') : '') + '"></label>' +
    '<div class="grid2 stackable"><label class="f">Montant<input id="iAmt" inputmode="decimal" placeholder="0" value="' + (i ? toInput(i.amount) : '') + '"></label><label class="f">Date de réception<input type="date" id="iDate" value="' + (i ? i.date : def) + '"></label></div>' +
    '<label class="f">Compter pour le mois<select id="iShift"><option value="0"' + (!i || !i.shift ? ' selected' : '') + '>Selon la date</option><option value="-1"' + (i && i.shift < 0 ? ' selected' : '') + '>Mois précédent</option><option value="1"' + (i && i.shift > 0 ? ' selected' : '') + '>Mois suivant</option></select></label>' +
    '<p class="small muted">Paie arrivée avant le ' + S.monthStart + ' ou en retard : choisissez le mois auquel elle correspond. Le revenu compte sinon pour le mois où tombe sa date (mois du ' + S.monthStart + ' au ' + (S.monthStart === 1 ? 'dernier jour' : S.monthStart - 1) + ').</p>' +
    '<div class="actions"><button type="submit" class="btn primary">Enregistrer</button>' + (i ? '<button type="button" class="btn danger" data-act="delInc" data-id="' + esc(i.id) + '">Supprimer</button>' : '') + '<button type="button" class="btn" data-act="closeSheet">Annuler</button></div></form>');
}
function remSheet(x) {
  const due = x ? '' : '';
  openSheet('<form id="remForm" class="stack" data-id="' + (x ? esc(x.id) : '') + '" novalidate><h2>' + (x ? 'Modifier la remise' : 'Remise dans l\'épargne de secours') + '</h2>' +
    '<div class="grid2 stackable"><label class="f">Montant remis<input id="xAmt" autofocus inputmode="decimal" placeholder="0" value="' + (x ? toInput(x.amount) : '') + '"></label><label class="f">Date<input type="date" id="xDate" value="' + (x ? x.date : today()) + '"></label></div>' +
    '<label class="f">Note (facultatif)<input id="xNote" autocomplete="off" maxlength="80" placeholder="Ex. Virement du 5" value="' + (x ? esc(x.note || '') : '') + '"></label>' +
    '<div class="actions"><button type="submit" class="btn primary">Enregistrer</button>' + (x ? '<button type="button" class="btn danger" data-act="delRem" data-id="' + esc(x.id) + '">Supprimer</button>' : '') + '<button type="button" class="btn" data-act="closeSheet">Annuler</button></div></form>');
}
function incTotalSheet() {
  const ps = monthSel || curP(), pi = periodInfo(ps), fb = pi.inc.fallback, n = pi.inc.lines.length;
  openSheet('<form id="incTotalForm" class="stack" novalidate><h2>Revenus du mois</h2>' +
    '<p class="small muted">Du ' + fmtShort(ps) + ' au ' + fmtShort(pi.pe) + '. Actuellement : <strong class="num" style="color:var(--ink)">' + eur(pi.inc.total) + '</strong> ' + (fb ? '(revenu habituel)' : '(' + n + ' ligne' + (n > 1 ? 's' : '') + ')') + '.</p>' +
    '<label class="f">Total réellement reçu ce mois<input id="itAmt" autofocus inputmode="decimal" value="' + toInput(pi.inc.total) + '"></label>' +
    (fb ? '<label class="sw"><span><strong>Ce mois uniquement</strong><div class="small muted">Les autres mois ne changent pas.</div></span><input type="radio" name="itMode" value="month" checked></label>' +
      '<label class="sw"><span><strong>Mon revenu habituel</strong><div class="small muted">Utilisé pour tous les mois sans revenu saisi, y compris les mois passés : leur budget sera recalculé.</div></span><input type="radio" name="itMode" value="usual"></label>'
      : '<p class="small muted">' + (n === 1 ? 'Le montant de la ligne « ' + esc(pi.inc.lines[0].label || 'Revenu') + ' » sera corrigé.' : 'Une ligne « Ajustement » sera ajoutée pour obtenir ce total. Vous pouvez aussi modifier chaque ligne plus bas.') + '</p>') +
    '<div class="actions"><button type="submit" class="btn primary">Enregistrer</button><button type="button" class="btn" data-act="closeSheet">Annuler</button></div></form>');
}
function balSheet() {
  openSheet('<form id="balForm" class="stack" novalidate><h2>Solde du compte courant</h2>' +
    '<div class="grid2 stackable"><label class="f">Solde constaté<input id="bBal" autofocus inputmode="decimal" placeholder="0" value="' + (S.acctBalance != null ? toInput(S.acctBalance) : '') + '"></label><label class="f">Le<input type="date" id="bDate" value="' + today() + '"></label></div>' +
    '<p class="small muted">L\'appli compte à partir de cette date : dépenses saisies, charges fixes, revenus datés. Mettez le solde à jour de temps en temps pour garder une prévision juste.</p>' +
    '<div class="actions"><button type="submit" class="btn primary">Enregistrer</button><button type="button" class="btn" data-act="closeSheet">Annuler</button></div></form>');
}
function efSheet() {
  openSheet('<form id="efForm" class="stack" novalidate><h2>Épargne de secours</h2>' +
    '<div class="grid2 stackable"><label class="f">Solde actuel<input id="eBal" autofocus inputmode="decimal" placeholder="0" value="' + (S.efBalance != null ? toInput(S.efBalance) : '') + '"></label><label class="f">Le<input type="date" id="eDate" value="' + today() + '"></label></div>' +
    '<label class="f">Objectif en mois de dépenses<select id="eMonths">' + Array.from({ length: 12 }, (_, i) => i + 1).map((m) => '<option value="' + m + '"' + (S.efMonths === m ? ' selected' : '') + '>' + m + ' mois</option>').join('') + '</select></label>' +
    '<div class="actions"><button type="submit" class="btn primary">Enregistrer</button><button type="button" class="btn" data-act="closeSheet">Annuler</button></div></form>');
}
function provSheet(q) {
  openSheet('<form id="provForm" class="stack" data-id="' + (q ? esc(q.id) : '') + '" novalidate><h2>' + (q ? 'Modifier la provision' : 'Nouvelle provision') + '</h2>' +
    '<label class="f">Nom<input id="pName" autofocus autocomplete="off" maxlength="60" placeholder="Ex. Cadeaux, Voiture, Vacances" value="' + (q ? esc(q.name) : '') + '"></label>' +
    '<div class="grid2 stackable"><label class="f">Mis de côté par mois<input id="pMonthly" inputmode="decimal" placeholder="0" value="' + (q ? toInput(q.monthly) : '') + '"></label><label class="f">Objectif (facultatif)<input id="pTarget" inputmode="decimal" placeholder="0" value="' + (q && q.target ? toInput(q.target) : '') + '"></label></div>' +
    '<p class="small muted">Le montant mensuel est retiré de votre budget. Quand la dépense arrive, choisissez cette provision en la saisissant : elle ne pèse plus sur le budget.</p>' +
    '<div class="actions"><button type="submit" class="btn primary">Enregistrer</button>' + (q ? '<button type="button" class="btn danger" data-act="delProv" data-id="' + esc(q.id) + '">Supprimer</button>' : '') + '<button type="button" class="btn" data-act="closeSheet">Annuler</button></div></form>');
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
  if (f.id === 'lockForm') { await doUnlock(); return; }
  if (f.id === 'expForm') {
    const amount = parseMoney($('#fAmt').value), cat = (f.querySelector('#fCats [aria-pressed="true"]') || {}).dataset;
    const date = $('#fDate').value, ctxEl = f.querySelector('#fCtx [aria-pressed="true"]');
    if (!(amount > 0)) { toast('Saisissez un montant supérieur à 0.'); $('#fAmt').focus(); return; }
    if (!cat) { toast('Choisissez une catégorie.'); return; }
    if (!date) { toast('Choisissez une date.'); return; }
    const id = f.dataset.id || 'e_' + uid(), old = DOCS[id];
    const doc = { t: 'e', amount, cat: cat.cat, date, note: $('#fNote').value.trim(), ctx: ctxEl ? ctxEl.dataset.ctx : '', ts: old ? old.ts : Date.now() };
    const provVal = $('#fProv') ? $('#fProv').value : ''; if (provVal) doc.prov = provVal;
    const items = readItems(f);
    if (items.length) {
      if (items.reduce((t, i) => t + i.a, 0) > amount) { toast('Les articles dépassent le total du ticket.'); return; }
      doc.items = items;
    }
    const wantFav = !old && $('#fFav') && $('#fFav').checked;
    const w = weekStartOf(date, S.weekStart);
    const beforeAll = weekSpent(w), beforeCat = weekCat(w, doc.cat);
    const oldAmt = old ? old.amount : 0, oldSameCat = old && !old.prov && old.cat === doc.cat && weekStartOf(old.date, S.weekStart) === w ? old.amount : 0;
    const wasInWeek = old && !old.prov && weekStartOf(old.date, S.weekStart) === w ? old.amount : 0;
    if (await write(() => store.set(id, doc))) {
      closeSheet();
      if (wantFav && !FAV.some((x) => x.note === doc.note && x.amount === amount && x.cat === doc.cat)) await write(() => store.set('f_' + uid(), { t: 'f', note: doc.note, amount, cat: doc.cat, ts: Date.now() }));
      const cnt = doc.prov ? 0 : amount, c = catById(doc.cat), ca = beforeCat - oldSameCat + cnt, ta = beforeAll - wasInWeek + cnt, inf = weekInfo(w);
      let msg = 'Enregistré';
      if (c && c.budget && ca / c.budget >= 1) msg = c.name + ' : budget dépassé';
      else if (c && c.budget && ca / c.budget >= 0.8) msg = c.name + ' à ' + pct(ca / c.budget);
      else if (inf.avail > 0 && ta / inf.avail >= 1) msg = 'Budget de la semaine dépassé';
      else if (inf.avail > 0 && ta / inf.avail >= 0.8) msg = 'Budget de la semaine à ' + pct(ta / inf.avail);
      toast(msg, old ? () => store.set(id, old) : () => store.del(id));
    }
  } else if (f.id === 'recForm') {
    const name = $('#rName').value.trim(), amount = parseMoney($('#rAmt').value);
    if (!name) { toast('Donnez un nom à cette charge.'); return; }
    if (!(amount > 0)) { toast('Saisissez un montant supérieur à 0.'); return; }
    const per = $('#rPer').value; let day = 0, month = 0, dow = 0;
    if (per === 'weekly') dow = +$('#rDow').value;
    else {
      day = parseInt($('#rDay').value, 10);
      if (!(day >= 1 && day <= 31)) { toast('Indiquez le jour du prélèvement (de 1 à 31).'); $('#rDay').focus(); return; }
      if (per !== 'monthly') month = +$('#rMonth').value;
    }
    const id = f.dataset.id || 'r_' + uid();
    if (await write(() => store.set(id, { t: 'r', name, amount, period: per, day, month, dow, ts: f.dataset.ts ? +f.dataset.ts : Date.now() }))) { closeSheet(); toast('Charge enregistrée'); }
  } else if (f.id === 'incForm') {
    const amount = parseMoney($('#iAmt').value), date = $('#iDate').value;
    if (!isFinite(amount) || amount === 0) { toast('Saisissez un montant (un montant négatif corrige un revenu trop élevé).'); return; }
    if (!date) { toast('Choisissez la date de réception.'); return; }
    const id = f.dataset.id || 'i_' + uid(), old = DOCS[id];
    if (await write(() => store.set(id, { t: 'i', label: $('#iLabel').value.trim(), amount, date, shift: +$('#iShift').value || 0, ts: old ? old.ts : Date.now() }))) { closeSheet(); toast('Revenu enregistré'); }
  } else if (f.id === 'remForm') {
    const amount = parseMoney($('#xAmt').value), date = $('#xDate').value;
    if (!(amount > 0)) { toast('Saisissez un montant supérieur à 0.'); return; }
    if (!date) { toast('Choisissez une date.'); return; }
    const id = f.dataset.id || 'x_' + uid();
    if (await write(() => store.set(id, { t: 'x', amount, date, note: $('#xNote').value.trim(), ts: Date.now() }))) { closeSheet(); toast('Remise enregistrée'); }
  } else if (f.id === 'incTotalForm') {
    const val = parseMoney($('#itAmt').value);
    if (!isFinite(val) || val < 0) { toast('Saisissez un total (zéro ou plus).'); return; }
    const ps = monthSel || curP(), pi = periodInfo(ps), mode = (f.querySelector('input[name=itMode]:checked') || {}).value;
    let ok = true;
    if (pi.inc.fallback) {
      ok = mode === 'usual' ? await saveSettings({ income: val })
        : await write(() => store.set('i_' + uid(), { t: 'i', label: 'Revenu du mois', amount: val, date: today() >= ps && today() <= pi.pe ? today() : ps, ts: Date.now() }));
    } else if (val !== pi.inc.total) {
      const lines = pi.inc.lines, diff = val - pi.inc.total;
      ok = lines.length === 1 ? await write(() => store.set(lines[0].id, { ...lines[0], amount: val }))
        : await write(() => store.set('i_' + uid(), { t: 'i', label: 'Ajustement', amount: diff, date: today() >= ps && today() <= pi.pe ? today() : ps, ts: Date.now() }));
    }
    if (ok) { closeSheet(); toast('Revenus du mois mis à jour'); }
  } else if (f.id === 'balForm') {
    const bal = parseMoney($('#bBal').value);
    if (!isFinite(bal)) { toast('Saisissez le solde (un nombre).'); return; }
    if (await saveSettings({ acctBalance: bal, acctDate: $('#bDate').value || today() })) { closeSheet(); toast('Solde enregistré'); }
  } else if (f.id === 'efForm') {
    const bal = parseMoney($('#eBal').value);
    if (!isFinite(bal) || bal < 0) { toast('Saisissez le solde (un nombre positif).'); return; }
    if (await saveSettings({ efBalance: bal, efDate: $('#eDate').value || today(), efMonths: +$('#eMonths').value })) { closeSheet(); toast('Matelas mis à jour'); }
  } else if (f.id === 'provForm') {
    const name = $('#pName').value.trim(), monthly = parseMoney($('#pMonthly').value), target = parseMoney($('#pTarget').value || '0');
    if (!name) { toast('Donnez un nom à cette provision.'); return; }
    if (!(monthly > 0)) { toast('Saisissez le montant mensuel.'); return; }
    const id = f.dataset.id || 'p_' + uid(), old = DOCS[id];
    if (await write(() => store.set(id, { t: 'p', name, monthly, target: target > 0 ? target : 0, from: old ? old.from : curP(), ts: old ? old.ts : Date.now() }))) { closeSheet(); toast('Provision enregistrée'); }
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
  if (swiped) return;
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
    case 'mo': monthSel = el.dataset.d === '1' ? nextP(monthSel) : prevP(monthSel); render(); break;
    case 'moNow': monthSel = curP(); render(); break;
    case 'addInc': incSheet(); break;
    case 'editInc': incSheet(DOCS[id]); break;
    case 'delInc': if (el.dataset.armed) { if (await write(() => store.del(id))) { closeSheet(); toast('Revenu supprimé'); } } else { el.dataset.armed = '1'; el.textContent = 'Confirmer la suppression'; } break;
    case 'copyInc': {
      const pp = prevP(monthSel), shift = diffDays(monthSel, pp), end = pend(monthSel);
      const src = INC.filter((i) => effP(i) === pp);
      for (const i of src) { const d = addDays(i.date, shift); await write(() => store.set('i_' + uid(), { t: 'i', label: i.label, amount: i.amount, date: d > end ? end : d, shift: 0, ts: Date.now() })); }
      toast('Revenus copiés : ajustez les montants si besoin'); break;
    }
    case 'addRem': remSheet(); break;
    case 'editRem': remSheet(DOCS[id]); break;
    case 'delRem': if (el.dataset.armed) { if (await write(() => store.del(id))) { closeSheet(); toast('Remise supprimée'); } } else { el.dataset.armed = '1'; el.textContent = 'Confirmer la suppression'; } break;
    case 'editIncTotal': incTotalSheet(); break;
    case 'editBal': balSheet(); break;
    case 'editEf': efSheet(); break;
    case 'addProv': provSheet(); break;
    case 'editProv': provSheet(DOCS[id]); break;
    case 'delProv': if (el.dataset.armed) { if (await write(() => store.del(id))) { closeSheet(); toast('Provision supprimée'); } } else { el.dataset.armed = '1'; el.textContent = 'Confirmer la suppression'; } break;
    case 'favAdd': {
      const f = DOCS[id]; if (!f) break;
      const nid = 'e_' + uid(), doc = { t: 'e', amount: f.amount, cat: catById(f.cat) ? f.cat : S.cats[0].id, date: today(), note: f.note || '', ctx: '', ts: Date.now() };
      if (await write(() => store.set(nid, doc))) toast('Ajouté : ' + (f.note || catName(f.cat)) + ' · ' + eur(f.amount), () => store.del(nid));
      break;
    }
    case 'delFav': { const f = DOCS[id]; if (f && await write(() => store.del(id))) toast('Favori retiré', () => store.set(id, f)); break; }
    case 'applyAdv': await saveSettings({ cats: S.cats.map((c) => c.id === id ? { ...c, budget: +el.dataset.w } : c) }); toast('Budget mis à jour'); render(); break;
    case 'pinOn': {
      const a = $('#pinA').value.trim(), b2 = $('#pinB').value.trim();
      if (!/^\d{4,8}$/.test(a)) { toast('Le code doit contenir de 4 à 8 chiffres.'); break; }
      if (a !== b2) { toast('Les deux codes ne correspondent pas.'); break; }
      el.disabled = true; try { await setPin(a, +$('#pinAfter').value); toast('Code activé'); } catch (e) { toast('Impossible d\'activer le code sur cet appareil.'); }
      render(); break;
    }
    case 'pinOff':
      if (el.dataset.armed) { await removePin(); toast('Code désactivé'); render(); } else { el.dataset.armed = '1'; el.textContent = 'Confirmer la désactivation'; }
      break;
    case 'tab': tab = el.dataset.tab; render(); window.scrollTo(0, 0); break;
    case 'wk': weekSel = addDays(weekSel, +el.dataset.d); render(); break;
    case 'wkNow': weekSel = curWeek(); render(); break;
    case 'addExp': expenseSheet(); break;
    case 'editExp': { const sw = el.closest('.swr'); if (sw && sw.classList.contains('open')) { sw.classList.remove('open'); el.style.transform = ''; break; } expenseSheet(DOCS[id]); break; }
    case 'openSearch': tab = 'search'; render(); window.scrollTo(0, 0); { const q = $('#sQ'); if (q) q.focus(); } break;
    case 'sCat': Q.cats = Q.cats.includes(id) ? Q.cats.filter((k) => k !== id) : [...Q.cats, id]; render(); break;
    case 'key': {
      const a = $('#fAmt'); if (!a) break; let d = a.value.replace('.', ','); const k = el.dataset.k;
      if (k === 'del') d = d.slice(0, -1);
      else if (k === ',') { if (!d.includes(',')) d = (d || '0') + ','; }
      else { const i = d.indexOf(','); if (i >= 0 && d.length - i > 2) break; if (d.replace(',', '').length >= 7) break; d = d === '0' ? k : d + k; }
      a.value = d; a.dispatchEvent(new Event('input', { bubbles: true })); break;
    }
    case 'dupExp': { const o = DOCS[id]; if (!o) break; const nid = 'e_' + uid(); if (await write(() => store.set(nid, { ...o, date: today(), ts: Date.now() }))) toast('Dépense dupliquée à aujourd\'hui', () => store.del(nid)); break; }
    case 'swDel': { const o = DOCS[id]; if (o && await write(() => store.del(id))) toast('Dépense supprimée', () => store.set(id, o)); break; }
    case 'uiTheme': saveUI({ theme: el.dataset.v }); render(); break;
    case 'uiTs': saveUI({ ts: +el.dataset.v }); render(); break;
    case 'uiDens': saveUI({ dens: el.dataset.v }); render(); break;
    case 'uiAnim': saveUI({ anim: !UI.anim }); render(); break;
    case 'itemAdd': { $('#tkRows').insertAdjacentHTML('beforeend', itemRow()); const r = $('#tkRows').lastElementChild.querySelector('[data-itn]'); r.focus(); break; }
    case 'itemDel': el.closest('.itrow').remove(); ticketSum(); break;
    case 'itemTog': { const on = el.getAttribute('aria-pressed') !== 'true'; el.setAttribute('aria-pressed', on); el.textContent = on ? 'Superflu' : 'Essentiel'; ticketSum(); break; }
    case 'closeSheet': closeSheet(); break;
    case 'delExp': if (el.dataset.armed) { const oldE = DOCS[id]; if (await write(() => store.del(id))) { closeSheet(); toast('Dépense supprimée', () => store.set(id, oldE)); } } else { el.dataset.armed = '1'; el.textContent = 'Confirmer la suppression'; } break;
    case 'addRec': recSheet(); break;
    case 'editRec': recSheet(DOCS[id]); break;
    case 'delRec': if (el.dataset.armed) { if (await write(() => store.del(id))) { closeSheet(); toast('Charge supprimée'); } } else { el.dataset.armed = '1'; el.textContent = 'Confirmer la suppression'; } break;
    case 'subAdd': { const s = detectSubs()[+el.dataset.i]; if (s && await write(() => store.set('r_' + uid(), { t: 'r', name: s.name, amount: s.amount, period: s.period, day: s.period === 'monthly' ? s.day : 0, month: 0, dow: s.dow, ts: Date.now() }))) toast('Ajouté aux charges fixes'); break; }
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
      const inc = parseMoney($('#obIncome').value), sv = parseMoney($('#obSave').value || '0'), ms = Math.min(28, Math.max(1, parseInt($('#obStart').value, 10) || 5));
      if (!(inc > 0)) { toast('Indiquez vos revenus mensuels.'); break; }
      if (await saveSettings({ setupDone: true, income: inc, savings: isFinite(sv) ? sv : 0, monthStart: ms, startDate: today() })) { tab = 'fixed'; render(); toast('Ajoutez maintenant vos charges fixes'); }
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
    try { await saveCfg(); localStorage.removeItem(NOSYNC_KEY); } catch (e) {}
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
  if (t.id === 'rPer') { const old = $('#rDay') ? $('#rDay').value : ''; $('#rDate').innerHTML = recFields(t.value, old ? { day: old } : null); return; }
  if (t.dataset.money) { const v = parseMoney(t.value || '0'); if (isFinite(v) && v >= 0) await saveSettings({ [t.dataset.money]: v }); render(); }
  else if (t.dataset.set) {
    const k = t.dataset.set; let v = t.type === 'checkbox' ? t.checked : t.value;
    if (k === 'weekStart') { v = +v; await saveSettings({ weekStart: v }); weekSel = null; } else if (k === 'monthStart') { v = +v; await saveSettings({ monthStart: v }); monthSel = null; } else if (k === 'savingsDay') { await saveSettings({ savingsDay: +v }); } else await saveSettings({ [k]: v });
    render();
  } else if (t.dataset.cname) { await saveSettings({ cats: S.cats.map((c) => c.id === t.dataset.cname ? { ...c, name: t.value.trim() || c.name } : c) }); render(); }
  else if (t.dataset.cbudget) { const v = t.value.trim() ? parseMoney(t.value) : 0; if (isFinite(v) && v >= 0) await saveSettings({ cats: S.cats.map((c) => c.id === t.dataset.cbudget ? { ...c, budget: v } : c) }); render(); }
});

/* ---------- Verrouillage par code (chiffre le token GitHub) ---------- */
const LOCK_KEY = 'budget-hebdo-lock';
const b2s = (u) => { let r = ''; for (let i = 0; i < u.length; i++) r += String.fromCharCode(u[i]); return btoa(r); };
const s2b = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
async function deriveKey(pin, saltB64) {
  const mat = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: s2b(saltB64), iterations: 250000, hash: 'SHA-256' }, mat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encStr(key, str) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(str)); return { iv: b2s(iv), ct: b2s(new Uint8Array(ct)) }; }
async function decStr(key, o) { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: s2b(o.iv) }, key, s2b(o.ct))); }
async function saveCfg() {
  if (!cfg || !cfg.token) return;
  const o = { repo: cfg.repo, branch: cfg.branch, path: cfg.path };
  if (lock && lockKey) o.enc = await encStr(lockKey, cfg.token); else o.token = cfg.token;
  localStorage.setItem(CFG_KEY, JSON.stringify(o));
}
async function setPin(pin, after) {
  const salt = b2s(crypto.getRandomValues(new Uint8Array(16))), key = await deriveKey(pin, salt);
  lock = { salt, check: await encStr(key, 'ok'), after: after == null ? 60 : after }; lockKey = key;
  localStorage.setItem(LOCK_KEY, JSON.stringify(lock)); await saveCfg();
}
async function removePin() { lock = null; lockKey = null; localStorage.removeItem(LOCK_KEY); await saveCfg(); }
async function tryUnlock(pin) {
  const key = await deriveKey(pin, lock.salt);
  try { if ((await decStr(key, lock.check)) !== 'ok') return false; } catch (e) { return false; }
  lockKey = key;
  let raw = null; try { raw = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch (e) {}
  if (raw && raw.enc) { try { cfg = { repo: raw.repo, branch: raw.branch, path: raw.path, token: await decStr(key, raw.enc) }; } catch (e) { return false; } }
  return true;
}
function showLock() { locked = true; document.body.classList.add('locked'); const o = $('#lockScreen'); o.hidden = false; $('#lockErr').textContent = ''; $('#lockPin').value = ''; setSync('locked'); setTimeout(() => $('#lockPin').focus(), 50); }
function lockNow() { if (!lock || locked) return; lockKey = null; if (cfg) cfg.token = null; closeSheet(); showLock(); }
let lockFails = 0, lockBlockedUntil = 0;
async function doUnlock() {
  const err = $('#lockErr');
  if (Date.now() < lockBlockedUntil) { err.textContent = 'Trop d\'essais. Patientez quelques secondes.'; return; }
  const btn = $('#lockForm button[type=submit]'); btn.disabled = true;
  const ok = await tryUnlock($('#lockPin').value.trim()); btn.disabled = false;
  if (!ok) { lockFails++; $('#lockPin').value = ''; err.textContent = 'Code incorrect.'; if (lockFails >= 5) { lockBlockedUntil = Date.now() + 30000; lockFails = 0; } return; }
  lockFails = 0; locked = false; document.body.classList.remove('locked'); $('#lockScreen').hidden = true;
  setSync(cfg && cfg.token ? 'pending' : 'local'); render();
  if (cfg && cfg.token) sync();
  if (pendingAdd) { pendingAdd = false; expenseSheet(); }
}
function lockCard() {
  const opts = [[0, 'Immédiatement'], [60, 'Après 1 minute'], [300, 'Après 5 minutes'], [900, 'Après 15 minutes']];
  return '<section class="card stack"><h2>Verrouillage</h2><p class="small muted">' + (lock ? 'Un code est demandé à l\'ouverture. Il chiffre aussi le token GitHub enregistré sur cet appareil.' : 'Demandez un code à l\'ouverture. Il chiffre aussi le token GitHub enregistré sur cet appareil. Cela protège contre un regard ou un accès rapide au téléphone, pas contre quelqu\'un qui maîtrise le navigateur : les données du budget restent lisibles dans le stockage de l\'appareil.') + '</p>' +
    '<label class="f">' + (lock ? 'Nouveau code' : 'Code') + ' (4 à 8 chiffres)<input id="pinA" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8"></label>' +
    '<label class="f">Confirmer le code<input id="pinB" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8"></label>' +
    '<label class="f">Verrouiller<select id="pinAfter" data-lockafter>' + opts.map((o) => '<option value="' + o[0] + '"' + ((lock ? lock.after : 60) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>' +
    '<div class="actions"><button class="btn primary" data-act="pinOn">' + (lock ? 'Changer le code' : 'Activer le code') + '</button>' + (lock ? '<button class="btn danger" data-act="pinOff">Désactiver</button>' : '') + '</div></section>';
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hiddenAt = Date.now();
  else if (lock && !locked && Date.now() - hiddenAt >= (lock.after || 0) * 1000) lockNow();
});
$('#lockForgot').addEventListener('click', (ev) => {
  const b = ev.currentTarget;
  if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Confirmer : retirer le code et déconnecter GitHub'; return; }
  try { localStorage.removeItem(LOCK_KEY); localStorage.removeItem(CFG_KEY); } catch (e) {}
  lock = null; lockKey = null; cfg = null; locked = false; b.dataset.armed = ''; b.textContent = 'Code oublié';
  document.body.classList.remove('locked'); $('#lockScreen').hidden = true; setSync('local'); render();
});
document.addEventListener('change', (ev) => { const t = ev.target; if (t.dataset && t.dataset.lockafter !== undefined && lock) { lock.after = +t.value; try { localStorage.setItem(LOCK_KEY, JSON.stringify(lock)); } catch (e) {} toast('Délai enregistré'); } });

/* ---------- Saisie : autocomplétion et glisser pour supprimer ---------- */
const NOTE_KW = [
  [/boulang|carrefour|lidl|leclerc|auchan|intermarch|monoprix|picard|primeur|boucher|march[ée]|super|courses/i, 0],
  [/essence|carbur|p[ée]age|parking|train|sncf|navigo|uber|taxi|bus|garage/i, 1],
  [/caf[ée]|resto|restau|pizz|burger|sushi|kebab|brasserie|mcdo|bar\b/i, 2],
  [/cin[ée]|concert|mus[ée]e|netflix|spotify|livre|sport|jeu/i, 3],
  [/pharma|m[ée]decin|dentiste|opticien|docteur|mutuelle/i, 4]
];
function suggestCat(note) {
  const k = NOTE_KW.find((x) => x[0].test(note)); if (!k) return null;
  return S.cats.find((c) => CAT_ICONS[k[1]][0].test(c.name)) || null;
}
function pickCat(f, id) { const chip = f.querySelector('#fCats [data-cat="' + id + '"]'); if (chip) chip.parentNode.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', c === chip)); }
document.addEventListener('input', (ev) => {
  const t = ev.target; if (t.id === 'sQ') { Q.q = t.value; const r = $('#sRes'); if (r) r.innerHTML = searchList(); return; }
  if (t.id === 'fAmt' || t.matches('[data-ita]')) ticketSum();
  if (t.id !== 'fNote') return;
  const f = $('#expForm'); if (!f) return; const sug = $('#fSug'); if (sug) sug.textContent = '';
  const v = t.value.trim(); if (!v) return;
  const m = f.dataset.id ? null : noteIndex()[v.toLowerCase()];
  if (m) { if (!$('#fAmt').value.trim()) $('#fAmt').value = toInput(m.amount); pickCat(f, m.cat); if (sug) sug.textContent = 'Catégorie suggérée : ' + catName(m.cat) + ' (déjà utilisée pour cette note)'; ticketSum(); return; }
  const c = suggestCat(v); if (c) { pickCat(f, c.id); if (sug) sug.textContent = 'Catégorie suggérée : ' + c.name; }
});
(function () {
  let sx = 0, sy = 0, el = null, dx = 0, horiz = null, base = 0; const view = $('#view'), W = 160;
  const closeAll = (except) => view.querySelectorAll('.swr.open').forEach((r) => { if (r !== except) { r.classList.remove('open'); r.firstElementChild.style.transform = ''; } });
  view.addEventListener('touchstart', (e) => {
    const b = e.target.closest('.swr > .exp'); if (!b || e.touches.length !== 1) { el = null; closeAll(); return; }
    closeAll(b.parentNode); el = b; base = b.parentNode.classList.contains('open') ? -W : 0; sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = base; horiz = null;
  }, { passive: true });
  view.addEventListener('touchmove', (e) => {
    if (!el) return; const x = e.touches[0].clientX - sx, y = e.touches[0].clientY - sy;
    if (horiz === null && (Math.abs(x) > 8 || Math.abs(y) > 8)) horiz = Math.abs(x) > Math.abs(y) * 1.5;
    if (horiz) { dx = Math.max(-W - 24, Math.min(0, base + x)); el.style.transition = 'none'; el.style.transform = 'translateX(' + dx + 'px)'; }
  }, { passive: true });
  view.addEventListener('touchend', () => {
    if (!el) return; const b = el; el = null; b.style.transition = '';
    if (horiz) { const open = dx < -W / 2; b.parentNode.classList.toggle('open', open); b.style.transform = open ? 'translateX(-' + W + 'px)' : ''; swiped = true; setTimeout(() => { swiped = false; }, 400); }
  });
})();

/* ---------- Démarrage ---------- */
function start() {
  loadUI(); loadCfg(); loadLocal(); ingest(); LOADING = false; weekSel = null;
  try { lock = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null'); } catch (e) { lock = null; }
  setSync(cfg ? (navigator.onLine ? 'pending' : 'offline') : 'local');
  render();
  const wantAdd = /[?&]add=1/.test(location.search);
  if (wantAdd) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  if (lock) { showLock(); if (wantAdd) pendingAdd = true; }
  else { if (cfg && cfg.token) sync(); if (wantAdd) expenseSheet(); }
  window.addEventListener('online', () => { if (cfg && cfg.token) scheduleSync(300); });
  window.addEventListener('offline', () => { if (cfg) setSync('offline'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (cfg) scheduleSync(200); if (!$('#view').querySelector('input:focus')) renderSoon(); } });
  setInterval(() => { if (cfg && document.visibilityState === 'visible') sync(); }, 90000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
start();
})();
