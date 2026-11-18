// Daily News – Schritt 1: Tagesdatei laden, 7 Tage offline speichern, Hinweise, nie leerer Bildschirm.
const VERSION = '0.1.1';
const OFFLINE_TAGE = 7;

// Datenquelle: ?daten=test / ?daten=test-kaputt nur für die Vorschau; sonst echter Datenordner.
const param = new URLSearchParams(location.search).get('daten');
const DATEN = param === 'test' ? './testdaten/'
  : param === 'test-kaputt' ? './testdaten-kaputt/'
  : location.pathname.includes('/vorschau/') ? '../daten/' : './daten/';
const CACHE_TAGE = 'news-tage:' + new URL(DATEN, location.href).pathname;

const STATUS = {
  bestaetigt:  { text: 'bestätigt',      svg: '<path d="M3 8.5l3 3 7-7"/>' },
  eine_quelle: { text: 'nur eine Quelle', svg: '<path d="M8 2l6.5 11.5h-13z"/><path d="M8 6.5v3.2M8 11.6v.1"/>' },
  umstritten:  { text: 'umstritten',     svg: '<path d="M8 2.5v11M4.5 13.5h7M3 4.5h10M3 4.5L1.5 9h3zM13 4.5L11.5 9h3z"/>' },
  unklar:      { text: 'unklar',         svg: '<path d="M5.8 5.8a2.2 2.2 0 114 1.4c-.9.6-1.8 1-1.8 2.3"/><path d="M8 12.5v.1"/>' },
};
const BEREICHE = [
  ['de_eu', 'Deutschland & EU', '<path d="M2 6l6-3.5L14 6M3 6v6M6 6v6M10 6v6M13 6v6M2 13.5h12"/>'],
  ['wirtschaft', 'Wirtschaft & Finanzen', '<path d="M2 13.5h12M3 11l3.5-4 3 2.5L14 4"/>'],
  ['ki_tech', 'KI & Tech', '<rect x="4" y="4" width="8" height="8" rx="1.5"/><path d="M6 1.5v2.5M10 1.5v2.5M6 12v2.5M10 12v2.5M1.5 6h2.5M1.5 10h2.5M12 6h2.5M12 10h2.5"/>'],
  ['welt', 'Weltpolitik & Konflikte', '<circle cx="8" cy="8" r="6.5"/><path d="M1.5 8h13M8 1.5c2 2 2.8 4.2 2.8 6.5S10 12.5 8 14.5C6 12.5 5.2 10.3 5.2 8S6 3.5 8 1.5z"/>'],
  ['sport', 'Sport', '<circle cx="8" cy="8" r="6.5"/><path d="M8 4.5l3 2.2-1.1 3.5H6.1L5 6.7z"/>'],
];
const ICON_HINWEIS = '<path d="M8 2l6.5 11.5h-13z"/><path d="M8 6.5v3.2M8 11.6v.1"/>';
const ICON_OFFLINE = '<path d="M2 2l12 12M4.5 7.5a5 5 0 017 0M2 5a8.5 8.5 0 0112 0M6.5 10a2 2 0 013 0"/>';
const ICON_UHR = '<circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 1.5"/>';

const svg = (pfad, g = 16) => `<svg width="${g}" height="${g}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pfad}</svg>`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);

// ---------- Datum (immer Europe/Berlin) ----------
function berlinJetzt() {
  const t = Object.fromEntries(new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map(p => [p.type, p.value]));
  return { datum: `${t.year}-${t.month}-${t.day}`, minuten: Number(t.hour) * 60 + Number(t.minute) };
}
function vortag(datum) { const d = new Date(datum + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
const kurzDatum = (datum) => `${datum.slice(8, 10)}.${datum.slice(5, 7)}.`;
const langDatum = (datum) => new Date(datum + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

// ---------- Prüfung einer Tagesdatei (leicht; der strenge Check läuft vor dem Commit) ----------
function istGueltig(d) {
  return d && d.version === 1 && /^\d{4}-\d{2}-\d{2}$/.test(d.datum) && Array.isArray(d.meldungen) && d.meldungen.length > 0
    && d.meldungen.every(m => m && m.schlagzeile && STATUS[m.status] && Array.isArray(m.quellen) && m.quellen.length > 0);
}

// ---------- Offline-Speicher (Cache API, je Tag eine Datei) ----------
async function speicher() { return caches.open(CACHE_TAGE); }
async function gespeicherteTage() {
  const c = await speicher();
  const tage = [];
  for (const req of await c.keys()) {
    const m = new URL(req.url).pathname.match(/(\d{4}-\d{2}-\d{2})\.json$/);
    if (m) tage.push({ datum: m[1], req });
  }
  return tage.sort((a, b) => b.datum.localeCompare(a.datum));
}
async function ladeGespeichert(datum) {
  const c = await speicher();
  const r = await c.match(new URL(DATEN + datum + '.json', location.href));
  return r ? r.json() : null;
}
async function neuesteGespeicherte() {
  for (const t of await gespeicherteTage()) {
    try { const d = await ladeGespeichert(t.datum); if (istGueltig(d)) return d; } catch {}
  }
  return null;
}
async function aufraeumen() {
  const c = await speicher();
  const tage = await gespeicherteTage();
  for (const t of tage.slice(OFFLINE_TAGE)) await c.delete(t.req);
}

// ---------- Laden ----------
async function holeJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

let zustand = { ausgabe: null, offline: false, neuesteKaputt: null, indexLeer: false };
let letzterAbruf = 0;

async function aktualisieren() {
  letzterAbruf = Date.now();
  let index;
  try {
    index = await holeJSON(DATEN + 'index.json');
  } catch {
    zustand.offline = true;
    zustand.ausgabe = zustand.ausgabe || await neuesteGespeicherte();
    return zeichne();
  }
  zustand.offline = false;
  zustand.neuesteKaputt = null;
  const tage = Array.isArray(index?.tage) ? index.tage.slice(0, OFFLINE_TAGE) : [];
  zustand.indexLeer = tage.length === 0;
  const c = await speicher();
  const vorhanden = new Set((await gespeicherteTage()).map(t => t.datum));

  for (const [i, t] of tage.entries()) {
    if (!t?.datum || (vorhanden.has(t.datum) && i > 0)) continue; // neuesten Tag immer neu holen (Korrekturen)
    const url = new URL(DATEN + t.datum + '.json', location.href);
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const text = await r.text();
      const d = JSON.parse(text);
      if (!istGueltig(d) || d.datum !== t.datum) throw new Error('ungültig');
      await c.put(url, new Response(text, { headers: { 'Content-Type': 'application/json' } }));
    } catch {
      if (i === 0) zustand.neuesteKaputt = t.datum; // alter guter Stand bleibt
    }
  }
  await aufraeumen();
  zustand.ausgabe = await neuesteGespeicherte();
  zeichne();
}

// ---------- Anzeige ----------
function hinweise() {
  const h = [];
  const { ausgabe, offline, neuesteKaputt } = zustand;
  const jetzt = berlinJetzt();
  if (offline) h.push(['offline', ICON_OFFLINE, ausgabe ? `Offline – gespeicherte Ausgabe vom ${kurzDatum(ausgabe.datum)}` : 'Offline – keine Verbindung']);
  if (neuesteKaputt && ausgabe) h.push(['', ICON_HINWEIS, `Die Ausgabe vom ${kurzDatum(neuesteKaputt)} ist fehlerhaft – Stand vom ${kurzDatum(ausgabe.datum)}`]);
  if (ausgabe && ausgabe.datum !== jetzt.datum && !neuesteKaputt) {
    if (jetzt.minuten < 6 * 60 + 30 && ausgabe.datum === vortag(jetzt.datum)) {
      h.push(['info', ICON_UHR, `Die heutige Ausgabe kommt um 6:30 – bis dahin: Ausgabe vom ${kurzDatum(ausgabe.datum)}`]);
    } else {
      h.push(['', ICON_HINWEIS, `Heute keine neue Ausgabe – Stand vom ${kurzDatum(ausgabe.datum)}`]);
    }
  }
  $('hinweise').innerHTML = h.map(([art, icon, text]) => `<div class="hinweis ${art}">${svg(icon)}<span>${esc(text)}</span></div>`).join('');
}

function statusChip(s) {
  const st = STATUS[s] || STATUS.unklar;
  return `<span class="status ${esc(s)}">${svg(st.svg, 12)}${esc(st.text)}</span>`;
}

function lesezeit(d) {
  const text = d.meldungen.map(m => `${m.schlagzeile} ${m.kurz}`).join(' ') + (d.facts || []).map(f => f.text).join(' ');
  return Math.max(1, Math.round(text.split(/\s+/).length / 200));
}

function zeichne() {
  hinweise();
  const d = zustand.ausgabe;
  if (!d) {
    $('inhalt').innerHTML = zustand.offline
      ? `<div class="leer"><h2>Noch nichts gespeichert</h2><p>Öffne die App einmal mit Internet, dann sind die letzten ${OFFLINE_TAGE} Tage auch offline lesbar.</p></div>`
      : `<div class="leer"><h2>Noch keine Ausgabe</h2><p>${zustand.indexLeer ? 'Die erste Ausgabe erscheint morgen um 6:30.' : 'Die Ausgabe konnte nicht geladen werden. Versuch es gleich noch einmal.'}</p></div>`;
    return;
  }
  const gruppen = BEREICHE.map(([key, name, icon]) => {
    const m = d.meldungen.filter(x => x.bereich === key);
    if (!m.length) return '';
    return `<section class="bereich"><h2 class="bereich-titel">${svg(icon, 14)}${esc(name)}</h2><ul class="liste">${
      m.map(x => `<li><span class="schlagzeile">${esc(x.schlagzeile)}</span>${statusChip(x.status)}</li>`).join('')
    }</ul></section>`;
  }).join('');
  const facts = (d.facts || []).map(f => `<div class="karte"><h3>${esc(f.titel || '')}</h3><p>${esc(f.text)}</p></div>`).join('');
  const b = d.begriff;
  $('inhalt').innerHTML = `
    <header class="kopf">
      <h1>Daily News</h1>
      <div class="meta">${esc(langDatum(d.datum))} · ${d.meldungen.length} Meldungen · ca. ${lesezeit(d)} Min.</div>
      ${d.beispiel ? '<span class="beispiel">Testdaten</span>' : ''}
    </header>
    ${gruppen}
    ${facts ? `<h2 class="abschnitt">3 Facts</h2>${facts}` : ''}
    ${b?.wort ? `<div class="karte begriff"><div class="label">Begriff des Tages</div><h3>${esc(b.wort)}</h3><p>${esc(b.erklaerung)}</p></div>` : ''}
    <p class="transparenz">${esc(d.transparenz || '')}</p>`;
}

function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.add('sichtbar');
  setTimeout(() => t.classList.remove('sichtbar'), 3000);
}

// ---------- App-Updates: neue Version beim nächsten Öffnen ----------
function updates() {
  const alt = localStorage.getItem('app-version');
  if (alt && alt !== VERSION) toast(`App aktualisiert (Version ${VERSION})`);
  localStorage.setItem('app-version', VERSION);
  if (!('serviceWorker' in navigator)) return;
  const start = Date.now();
  let neuLaden = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (Date.now() - start < 3000) location.reload(); // direkt beim Öffnen: sofort neu
    else neuLaden = true;                             // sonst beim nächsten Öffnen
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (neuLaden) return location.reload();
    navigator.serviceWorker.getRegistration().then(r => r?.update()).catch(() => {});
    if (Date.now() - letzterAbruf > 10 * 60 * 1000) aktualisieren();
  });
}

// ---------- Start ----------
(async function start() {
  updates();
  try { zustand.ausgabe = await neuesteGespeicherte(); if (zustand.ausgabe) zeichne(); } catch {}
  await aktualisieren();
})();
window.addEventListener('online', aktualisieren);
