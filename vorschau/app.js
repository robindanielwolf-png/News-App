// Daily News – Schritt 1: Tagesdatei laden, 7 Tage offline speichern, Hinweise, nie leerer Bildschirm.
// Schritt 2: Wisch-Modus mit Ebene 1 (Meldung), Ebene 2 (Hintergrund, Quellen, Positionen, Benchmarks), Ebene 3 (Tiefer einsteigen).
// Schritt 3: Facts einzeln mit „Nächster Fact“ / „Noch einer“ (Extra-Facts), Begriff des Tages.
// Schritt 4: Archiv – mit Netz die letzten 30 Tage, offline die 7 gespeicherten.
// Schritt 5: Korrekturen – Kasten oben in der neuen Ausgabe, Banner über der korrigierten Meldung (Original bleibt).
// Schritt 6: Einstellungen – Bereiche an/aus, nur lokal auf dem Gerät.
// Schritt 7: Merken – Lesezeichen für Meldungen und Facts, mit Inhalt lokal gespeichert, Übersicht „Gemerkt“.
// 0.9.0: Schriften Newsreader + Inter lokal (Styleguide).
// Schritt 8: „Mehr dazu lernen“ – fertige Frage in die Zwischenablage, dann Claude öffnen (kein Prompt in der URL).
const VERSION = '0.9.0';
const OFFLINE_TAGE = 7;
const ARCHIV_TAGE = 30;

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
const BEREICHE = [ // Reihenfolge wie Design/Produkt: KI & Tech zuerst
  ['ki_tech', 'KI & Tech', '<rect x="4" y="4" width="8" height="8" rx="1.5"/><path d="M6 1.5v2.5M10 1.5v2.5M6 12v2.5M10 12v2.5M1.5 6h2.5M1.5 10h2.5M12 6h2.5M12 10h2.5"/>'],
  ['de_eu', 'Deutschland & EU', '<path d="M2 6l6-3.5L14 6M3 6v6M6 6v6M10 6v6M13 6v6M2 13.5h12"/>'],
  ['wirtschaft', 'Wirtschaft & Finanzen', '<path d="M2 13.5h12M3 11l3.5-4 3 2.5L14 4"/>'],
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

let zustand = { ausgabe: null, offline: false, neuesteKaputt: null, indexLeer: false, indexTage: null };
// Was gerade gezeigt wird: 'heute', 'archiv' (Liste) oder 'archivtag' (eine ältere Ausgabe).
const ansicht = { tab: 'heute', tag: null, archivScroll: 0 };
const archivSpeicher = new Map(); // ältere Tage nur im Arbeitsspeicher, offline bleiben die 7 neuesten
const gezeigteAusgabe = () => (ansicht.tab === 'archivtag' && ansicht.tag) ? ansicht.tag : zustand.ausgabe;
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
  const alleTage = Array.isArray(index?.tage) ? index.tage.filter(t => t && /^\d{4}-\d{2}-\d{2}$/.test(t.datum)) : [];
  zustand.indexTage = alleTage.slice(0, ARCHIV_TAGE + 1);
  const tage = alleTage.slice(0, OFFLINE_TAGE);
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
  const text = reihenfolge(d).map(m => `${m.schlagzeile} ${m.kurz}`).join(' ') + (d.facts || []).map(f => f.text).join(' ');
  return Math.max(1, Math.round(text.split(/\s+/).length / 200));
}

function zeichne() {
  hinweise();
  navi();
  if (ansicht.tab === 'archiv') return zeichneArchiv();
  if (ansicht.tab === 'einstellungen') return zeichneEinstellungen();
  if (ansicht.tab === 'gemerkt') return zeichneGemerkt();
  if (ansicht.tab === 'archivtag' && ansicht.tag) return zeichneAusgabe(ansicht.tag, true);
  const d = zustand.ausgabe;
  if (!d) {
    $('inhalt').innerHTML = zustand.offline
      ? `<div class="leer"><h2>Noch nichts gespeichert</h2><p>Öffne die App einmal mit Internet, dann sind die letzten ${OFFLINE_TAGE} Tage auch offline lesbar.</p></div>`
      : `<div class="leer"><h2>Noch keine Ausgabe</h2><p>${zustand.indexLeer ? 'Die erste Ausgabe erscheint morgen um 6:30.' : 'Die Ausgabe konnte nicht geladen werden. Versuch es gleich noch einmal.'}</p></div>`;
    return;
  }
  zeichneAusgabe(d, false);
}

function zeichneAusgabe(d, archiv) {
  const reihe = reihenfolge(d);
  const gruppen = BEREICHE.map(([key, name, icon]) => {
    const m = reihe.filter(x => x.bereich === key);
    if (!m.length) return '';
    return `<section class="bereich"><h2 class="bereich-titel">${svg(icon, 14)}${esc(name)}</h2><ul class="liste">${
      m.map(x => `<li>${x.korrigiert ? korrBanner(x.korrigiert, true) : ''}<button class="zeile${x.korrigiert ? ' ist-korrigiert' : ''}" data-wisch="${reihe.indexOf(x)}"><span class="schlagzeile">${esc(x.schlagzeile)}</span>${statusChip(x.status)}</button></li>`).join('')
    }</ul></section>`;
  }).join('');
  const facts = (Array.isArray(d.facts) ? d.facts : []).map((f, i) => `<button class="karte fact-teaser" data-fact="${i}">
      <span class="zeile-oben"><span class="label akzent">${esc(themaName(f.thema) || 'Fact')}</span>${statusChip(f.status)}</span>
      ${f.titel ? `<span class="teaser-titel">${esc(f.titel)}</span>` : ''}
      <span class="teaser-text">${esc(f.text)}</span>
    </button>`).join('');
  const extraAnzahl = Array.isArray(d.extra_facts) ? d.extra_facts.length : 0;
  const b = d.begriff;
  const begriffMeldung = b?.meldung_id && reihe.find(m => m.id === b.meldung_id); // ausgeblendeter Bereich → kein Sprung
  $('inhalt').innerHTML = `
    <header class="kopf">
      ${archiv ? `<button class="zurueck" data-tab="${ansicht.herkunft === 'heute' ? 'heute' : 'archiv'}">${svg(ICON_ZURUECK, 18)}${ansicht.herkunft === 'heute' ? 'Heute' : 'Archiv'}</button>` : ''}
      <h1${archiv ? ' class="archiv-titel"' : ''}>${archiv ? esc(langDatum(d.datum) + ' ' + d.datum.slice(0, 4)) : 'Daily News'}</h1>
      <div class="meta">${archiv ? 'Ausgabe aus dem Archiv · ' : esc(langDatum(d.datum)) + ' · '}${reihe.length} Meldungen${reihe.length < d.meldungen.length ? ` (${d.meldungen.length - reihe.length} ausgeblendet)` : ''} · ca. ${lesezeit(d)} Min.</div>
      ${d.beispiel ? '<span class="beispiel">Testdaten</span>' : ''}
      ${korrekturKasten(d)}
      <button class="knopf haupt start-wisch" data-wisch="0">${svg(ICON_WISCHEN, 18)}Durchwischen starten</button>
    </header>
    ${gruppen || (d.meldungen.length ? `<div class="leer klein-leer"><p>Alle Bereiche sind ausgeblendet.</p><button class="knopf" data-tab="einstellungen">Bereiche in den Einstellungen einschalten</button></div>` : '')}
    ${facts ? `<h2 class="abschnitt">${d.facts.length === 3 ? '3 Facts' : 'Facts'}</h2>${facts}
      ${extraAnzahl ? `<p class="unterzeile">+ ${extraAnzahl} weitere · „Noch einer“ am Ende des Durchwischens</p>` : ''}` : ''}
    ${b?.wort ? `<section class="begriff">
      <div class="zeile-oben"><span class="label akzent">Begriff des Tages</span>${b.status ? statusChip(b.status) : ''}</div>
      <h3 class="begriff-wort">${esc(b.wort)}</h3>
      <p class="begriff-text">${esc(b.erklaerung)}</p>
      ${quellenZeile(b.quellen)}
      ${begriffMeldung ? `<button class="knopf text links" data-begriff="${esc(begriffMeldung.id)}">Kommt vor in: ${esc(begriffMeldung.schlagzeile)}</button>` : ''}
    </section>` : ''}
    <p class="transparenz">${esc(d.transparenz || '')}</p>`;
}

// ---------- Wisch-Modus (Schritt 2) ----------
// Reihenfolge wie in der Liste (nach Bereichen), damit Wischen und Liste übereinstimmen.
function reihenfolge(d) {
  const aus = bereicheAus();
  return BEREICHE.filter(([key]) => !aus.has(key)).flatMap(([key]) => d.meldungen.filter(x => x.bereich === key));
}
const ICON_X = '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>';
const ICON_HOCH = '<path d="M8 13V3M4 7l4-4 4 4"/>';
const ICON_RUNTER = '<path d="M8 3v10M4 9l4 4 4-4"/>';
const ICON_EXTERN = '<path d="M6 3h7v7M13 3L4 12"/>';
const ICON_CHAT = '<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/>';
const ICON_WISCHEN = '<path d="M2 8h12M10 4l4 4-4 4"/>';

// Nur https-Links werden klickbar; alles andere bleibt Text.
const sicherUrl = (u) => (typeof u === 'string' && /^https:\/\//i.test(u)) ? esc(u) : null;
const link = (url, inhalt, klasse = '') => {
  const u = sicherUrl(url);
  return u ? `<a class="${klasse}" href="${u}" target="_blank" rel="noopener noreferrer">${inhalt}</a>` : `<span class="${klasse}">${inhalt}</span>`;
};
const tageZwischen = (von, bis) => Math.round((Date.parse(bis + 'T12:00:00Z') - Date.parse(von + 'T12:00:00Z')) / 864e5);
const vollDatum = (datum) => `${datum.slice(8, 10)}.${datum.slice(5, 7)}.${datum.slice(0, 4)}`;
function relativ(ereignis, ausgabe) {
  const n = tageZwischen(ereignis, ausgabe);
  return n <= 0 ? 'heute' : n === 1 ? 'gestern' : `vor ${n} Tagen`;
}
function standText(iso) {
  const t = Date.parse(iso);
  if (isNaN(t)) return '';
  const f = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return `${p.day}.${p.month}., ${p.hour}:${p.minute}`;
}
const label = (text, extra = '') => `<h2 class="label ${extra}">${esc(text)}</h2>`;

function statusGross(m) {
  const st = STATUS[m.status] || STATUS.unklar;
  const n = Array.isArray(m.quellen) ? m.quellen.length : 0;
  const zusatz = m.status === 'unklar' && m.laeuft_noch ? 'läuft noch' : `${n} ${n === 1 ? 'Quelle' : 'Quellen'}`;
  return `<span class="status gross ${esc(m.status)}">${svg(st.svg, 14)}${esc(st.text)} · ${esc(zusatz)}</span>`;
}

function ebene1(m, d) {
  const bereich = BEREICHE.find(b => b[0] === m.bereich) || ['', m.bereich, ''];
  const alt = m.ereignis_datum && tageZwischen(m.ereignis_datum, d.datum) > 1;
  const chips = [
    alt ? `<span class="chip info">${svg(ICON_UHR, 13)}Ereignis vom ${esc(kurzDatum(m.ereignis_datum))} – nicht von heute</span>` : '',
    m.interessenkonflikt ? '<span class="chip neutral">Meldung über Anthropic</span>' : '',
  ].join('');
  const einMedium = m.status === 'eine_quelle' ? (m.quellen?.[0]?.medium || m.quellen?.[0]?.titel || 'einem Medium') : '';
  return `<div class="ebene1">
    ${m.korrigiert ? korrBanner(m.korrigiert) : ''}
    <div class="zeile-oben">
      <span class="bereich-label">${bereich[2] ? svg(bereich[2]) : ''}${esc(bereich[1])}</span>
      ${statusGross(m)}
    </div>
    ${chips ? `<div class="chips">${chips}</div>` : ''}
    <h1 class="wisch-titel">${esc(m.schlagzeile)}</h1>
    <p class="kurz">${esc(m.kurz)}</p>
    ${einMedium ? `<p class="kasten warn">Bisher nur von ${esc(einMedium)} berichtet – noch nicht unabhängig bestätigt.</p>` : ''}
    ${m.status === 'unklar' && m.laeuft_noch ? '<p class="kasten grau">Läuft noch: Das Ergebnis steht aus und kommt in einer späteren Ausgabe.</p>' : ''}
    <div class="luft"></div>
    <button class="knopf" data-ziel="ebene2">${svg(ICON_HOCH, 18)}Hintergrund, Warum wichtig, Quellen</button>
    <p class="wisch-tipp">Seitlich wischen für die nächste Meldung</p>
  </div>`;
}

function quellenKarten(quellen) {
  return (quellen || []).map(q => link(q.url, `
      <span class="q-kopf"><span class="q-medium">${esc(q.medium || '')}</span>${q.primaer ? '<span class="primaer">Primärquelle</span>' : ''}</span>
      <span class="q-titel">${esc(q.titel || q.url || '')}</span>
      ${q.datum && /^\d{4}-\d{2}-\d{2}$/.test(q.datum) ? `<span class="q-datum">${esc(vollDatum(q.datum))}</span>` : ''}`, 'quelle')).join('');
}

function positionenBlock(m) {
  if (m.status !== 'umstritten' || !Array.isArray(m.positionen) || !m.positionen.length) return '';
  return `<section class="block">
    <div><h2 class="abschnitt-titel">Die Positionen</h2><p class="unterzeile">Gleich gewichtet, Reihenfolge ohne Wertung</p></div>
    ${m.positionen.map(p => `<article class="position">
      <span class="label streit">${esc(p.seite || '')}</span>
      <p>${esc(p.position || '')}</p>
      ${p.quelle || p.url ? link(p.url, esc(p.quelle || 'Quelle'), 'klein') : ''}
    </article>`).join('')}
  </section>`;
}

// Benchmarks: unabhängige Tests zuerst, Herstellerangaben getrennt darunter.
// Chips „vorn“ und „nur eine Quelle“ bewusst weggelassen (Vorgabe 18.11.) – Felder werden noch nicht angezeigt.
function benchmarkBlock(m) {
  const b = m.benchmarks;
  if (!b || typeof b !== 'object') return '';
  const unabh = Array.isArray(b.unabhaengig) ? b.unabhaengig : [];
  const herst = Array.isArray(b.hersteller) ? b.hersteller : [];
  const quelleZeile = (x) => x.quelle || x.url ? link(x.url, esc(x.quelle || 'Quelle'), 'klein') : '';
  const unabhHtml = unabh.length
    ? `<div class="tests">${unabh.map(x => `<div class="test">
        <span class="test-name">${esc(x.test || '')}</span>
        <span class="test-wert">${esc(x.wert || '')}</span>
        ${x.vergleich_mit ? `<span class="unterzeile">Verglichen mit Vorgänger ${esc(x.vergleich_mit)}</span>` : ''}
        ${quelleZeile(x)}
      </div>`).join('')}</div>`
    : `<div class="tests gestrichelt leer-test"><span class="test-name">Noch keine unabhängigen Tests</span><span class="unterzeile">${
        esc(String(b.hinweis || '').replace(/^\s*noch keine unabhängigen tests\.?\s*[–-]?\s*/i, '') || 'Bisher nur Herstellerangaben (siehe unten).')}</span></div>`;
  const herstHtml = herst.length ? `<section class="block">
      <div class="kopfzeile"><h2 class="abschnitt-titel">Herstellerangaben</h2><span class="status eine_quelle">${svg(STATUS.eine_quelle.svg, 12)}nicht unabhängig geprüft</span></div>
      <div class="tests gestrichelt">${herst.map(x => `<div class="test">
        <span class="test-name">${esc(x.test || '')}</span>
        <span class="test-wert">${x.modell ? esc(x.modell) + ': ' : ''}${esc(x.wert || '')}</span>
        ${quelleZeile(x)}
      </div>`).join('')}</div>
    </section>` : '';
  return `<section class="block">
      <div class="kopfzeile"><h2 class="abschnitt-titel">Unabhängige Tests</h2>${unabh.length ? `<span class="unterzeile">${unabh.length} ${unabh.length === 1 ? 'Test' : 'Tests'}</span>` : ''}</div>
      ${unabhHtml}
    </section>${herstHtml}`;
}

function ebene2(m, d, nr, gesamt) {
  const bereich = BEREICHE.find(b => b[0] === m.bereich)?.[1] || m.bereich;
  const meta = [
    m.ereignis_datum ? `Ereignis: ${vollDatum(m.ereignis_datum)} (${relativ(m.ereignis_datum, d.datum)})` : '',
    m.stand ? `Stand: ${standText(m.stand)}` : '',
  ].filter(Boolean).join(' · ');
  const umstritten = m.status === 'umstritten';
  return `<div class="ebene2" data-ebene="ebene2">
    ${m.korrigiert ? korrBanner(m.korrigiert) : ''}
    <div class="ebene-kopf">
      <span class="label akzent">${esc(bereich)} · ${nr} / ${gesamt}</span>
      <h2 class="ebene-titel">${esc(m.schlagzeile)}</h2>
      ${meta ? `<p class="unterzeile">${esc(meta)}</p>` : ''}
    </div>
    ${m.interessenkonflikt ? '<p class="kasten neutral"><strong>Meldung über Anthropic</strong>, den Hersteller von Claude. Geprüft nach denselben Regeln wie alle anderen.</p>' : ''}
    <section class="block">${label(umstritten ? 'Was feststeht' : 'Hintergrund')}<p>${esc(m.hintergrund)}</p></section>
    ${positionenBlock(m)}
    <section class="kasten akzent warum">${label('Warum wichtig', 'akzent')}<p>${esc(m.warum_wichtig)}</p></section>
    ${benchmarkBlock(m)}
    <section class="block">
      <div class="kopfzeile">${label('Quellen')}${statusChip(m.status)}</div>
      ${quellenKarten(m.quellen)}
    </section>
    ${m.hinweis_quellen ? `<section class="kasten akzent">${label('Hinweis zu den Quellen', 'akzent')}<p class="klein-text">${esc(m.hinweis_quellen)}</p></section>` : ''}
    <div class="knopf-reihe">
      <button class="knopf haupt" data-ziel="ebene3">Tiefer einsteigen${svg(ICON_RUNTER, 18)}</button>
      <button class="knopf quadrat" data-merken="meldung|${esc(m.id)}" aria-label="Merken" aria-pressed="false">${svg(ICON_LESEZEICHEN, 20)}</button>
    </div>
  </div>`;
}

function ebene3(m) {
  const v = m.vertiefung || {};
  const links = (v.links || []).map(l => link(l.url, `
      <span class="q-text"><span class="q-medium">${esc(l.medium || '')}</span><span class="q-titel">${esc(l.titel || '')}</span></span>${svg(ICON_EXTERN)}`, 'quelle quer')).join('');
  return `<div class="ebene3" data-ebene="ebene3">
    <div class="ebene-kopf dick">
      <span class="label akzent">Tiefer einsteigen</span>
      <h2 class="ebene-titel">${esc(m.schlagzeile)}</h2>
    </div>
    ${v.text ? `<section class="block">${label('Kontext')}<p class="serif-text">${esc(v.text)}</p></section>` : ''}
    ${links ? `<section class="block">${label('Weiterlesen')}${links}</section>` : ''}
    <section class="lernen">
      <span class="lernen-titel">Noch Fragen dazu?</span>
      <span class="lernen-text">Kopiert eine fertige Frage und öffnet Claude. Dort im Chat News &amp; Facts einfügen.</span>
      <button class="knopf weiss" data-lernen="${esc(m.id)}">${svg(ICON_CHAT, 18)}Mehr dazu lernen</button>
    </section>
    <p class="wisch-tipp">Seitlich wischen für die nächste Meldung</p>
  </div>`;
}

// ---------- Facts (Schritt 3): eine Karte nach der anderen, danach bis zu 5 Extra-Facts ----------
const THEMEN = { ki: 'KI', wirtschaft: 'Wirtschaft', sport: 'Sport', koerper: 'Körper', tech: 'Tech', welt: 'Welt', wissen: 'Wissen', natur: 'Natur', geschichte: 'Geschichte' };
const themaName = (t) => THEMEN[t] || (t ? String(t).charAt(0).toUpperCase() + String(t).slice(1) : '');
const ICON_PLUS = '<path d="M8 3v10M3 8h10"/>';

function quellenZeile(quellen) {
  const q = (quellen || []).map(x => link(x.url, esc(x.medium || x.titel || 'Quelle'))).filter(Boolean);
  return q.length ? `<p class="fact-quellen">Quellen: ${q.join(' · ')}</p>` : '';
}

function factKarte(f) {
  const kopf = [themaName(f.thema), f.art === 'zeitlos' ? 'zeitlos' : f.art === 'aktuell' ? 'aktuell' : ''].filter(Boolean).join(' · ');
  return `<article class="fact-karte">
    <div class="zeile-oben"><span class="label akzent">${esc(kopf || 'Fact')}</span>${statusChip(f.status)}</div>
    ${f.titel ? `<h2 class="fact-titel">${esc(f.titel)}</h2>` : ''}
    <p class="fact-text">${esc(f.text)}</p>
    ${f.interessenkonflikt ? '<p class="kasten neutral">Hinweis: Meldung über Anthropic, den Hersteller von Claude. Geprüft nach denselben Regeln wie alle anderen.</p>' : ''}
    ${quellenZeile(f.quellen)}
  </article>`;
}

// Alle Facts der Ausgabe: erst die 3 festen, dann der Vorrat.
function alleFacts(d) {
  return { haupt: Array.isArray(d.facts) ? d.facts : [], extra: Array.isArray(d.extra_facts) ? d.extra_facts : [] };
}

function factsSeite() {
  return `<div class="ebene1 facts-seite">
    <div class="facts-kopf"><h1 class="wisch-titel facts-ueberschrift">Facts</h1><span class="unterzeile fact-zaehler" aria-live="polite"></span></div>
    <div class="fact-platz"></div>
    <div class="fact-knoepfe"></div>
  </div>`;
}

function zeigeFact(i) {
  const d = wisch.ausgabe || gezeigteAusgabe();
  const seite = $('wisch').querySelector('.facts-seite');
  if (!d || !seite) return;
  const { haupt, extra } = alleFacts(d);
  const alle = [...haupt, ...extra];
  if (!alle.length) {
    seite.querySelector('.fact-platz').innerHTML = '<p class="unterzeile">Heute keine Facts.</p>';
    seite.querySelector('.fact-knoepfe').innerHTML = '<button class="knopf haupt" data-aktion="schliessen">Fertig – zurück zur Startseite</button>';
    return;
  }
  wisch.fact = Math.max(0, Math.min(i, alle.length - 1));
  const istExtra = wisch.fact >= haupt.length;
  const uebrig = alle.length - 1 - Math.max(wisch.fact, haupt.length - 1);
  seite.querySelector('.fact-zaehler').textContent = istExtra
    ? `Extra ${wisch.fact - haupt.length + 1} / ${extra.length}`
    : `${wisch.fact + 1} / ${haupt.length}`;
  seite.querySelector('.fact-platz').innerHTML = factKarte(alle[wisch.fact]);
  merkenKnoepfe();
  if (wisch.modus === 'fact') {
    seite.querySelector('.fact-zaehler').textContent = d.datum ? kurzDatum(d.datum) : '';
    seite.querySelector('.fact-knoepfe').innerHTML = '<button class="knopf haupt" data-aktion="schliessen">Fertig – zurück zu Gemerkt</button>';
    return;
  }
  const fertig = '<button class="knopf text" data-aktion="schliessen">Fertig – zurück zur Startseite</button>';
  seite.querySelector('.fact-knoepfe').innerHTML = wisch.fact < haupt.length - 1
    ? '<button class="knopf" data-aktion="naechster-fact">Nächster Fact</button>'
    : uebrig > 0
      ? `<button class="knopf haupt" data-aktion="naechster-fact">${svg(ICON_PLUS, 18)}Noch einer <span class="uebrig">(${uebrig} übrig)</span></button>${fertig}`
      : `<p class="unterzeile mitte">Das waren alle Facts für heute.</p><button class="knopf haupt" data-aktion="schliessen">Fertig – zurück zur Startseite</button>`;
  if (wisch.modus === 'ausgabe' && wisch.fact >= haupt.length - 1) merkeFortschritt(d.datum, 'durchgewischt');
}

// Für V2 „Fortschritt“ vorbereitet: pro Tag nur lokal festhalten, was gelesen wurde. Nie im Repo.
function merkeFortschritt(datum, was) {
  try {
    const f = JSON.parse(localStorage.getItem('fortschritt') || '{}');
    f[datum] = { ...(f[datum] || {}), [was]: true };
    const tage = Object.keys(f).sort().reverse();
    for (const t of tage.slice(400)) delete f[t];
    localStorage.setItem('fortschritt', JSON.stringify(f));
  } catch {}
}

// modus: 'ausgabe' (normal), 'meldung' / 'fact' (ein einzelner gemerkter Eintrag)
const wisch = { offen: false, reihe: [], index: 0, fact: 0, ausgabe: null, modus: 'ausgabe' };
const mitFactsSeite = () => wisch.modus !== 'meldung';

function wischOeffnen(start, factStart = 0, opt = {}) {
  const d = opt.ausgabe || gezeigteAusgabe();
  if (!d) return;
  wisch.ausgabe = d;
  wisch.modus = opt.modus || 'ausgabe';
  wisch.reihe = wisch.modus === 'meldung' ? d.meldungen : wisch.modus === 'fact' ? [] : reihenfolge(d);
  wisch.offen = true;
  const n = wisch.reihe.length;
  const segmente = n + (mitFactsSeite() ? 1 : 0);
  const el = $('wisch');
  el.innerHTML = `
    <div class="wisch-leiste">
      <div class="fortschritt" role="img" aria-label="Fortschritt">${'<span></span>'.repeat(segmente)}</div>
      <div class="wisch-kopf">
        <button class="rund" data-aktion="schliessen" aria-label="Zurück">${svg(ICON_X, 20)}</button>
        <span class="zaehler" aria-live="polite"></span>
        <button class="rund rechts" data-merken-aktuell aria-label="Merken" aria-pressed="false">${svg(ICON_LESEZEICHEN, 20)}</button>
      </div>
    </div>
    <div class="spur" tabindex="-1">${
      wisch.reihe.map((m, i) => `<article class="seite" aria-label="Meldung ${i + 1} von ${n}">${ebene1(m, d)}${ebene2(m, d, i + 1, n)}${ebene3(m)}</article>`).join('')
    }${mitFactsSeite() ? `<article class="seite" aria-label="Facts">${factsSeite()}</article>` : ''}</div>`;
  el.hidden = false;
  if (mitFactsSeite()) zeigeFact(factStart);
  document.body.classList.add('wisch-offen');
  const spur = el.querySelector('.spur');
  spur.scrollLeft = start * spur.clientWidth;
  wischStand(start);
  spur.addEventListener('scroll', () => {
    if (!wisch.offen || !spur.isConnected || !spur.clientWidth) return; // Nachzügler nach dem Schließen
    const i = Math.round(spur.scrollLeft / spur.clientWidth);
    if (i !== wisch.index) wischStand(i);
  }, { passive: true });
  spur.focus({ preventScroll: true });
}

function wischStand(i) {
  const n = wisch.reihe.length;
  wisch.index = Math.max(0, Math.min(i, mitFactsSeite() ? n : n - 1));
  const el = $('wisch');
  if (!el.querySelector('.fortschritt')) return;
  el.querySelectorAll('.fortschritt span').forEach((s, k) => s.classList.toggle('an', k <= wisch.index));
  el.querySelector('.fortschritt').setAttribute('aria-label', wisch.index < n ? `Meldung ${wisch.index + 1} von ${n}` : 'Facts');
  el.querySelector('.zaehler').textContent = wisch.modus !== 'ausgabe' ? 'Gemerkt' : wisch.index < n ? `${wisch.index + 1} / ${n}` : 'Facts';
  merkenKnoepfe();
}

function wischGeheZu(i) {
  const spur = $('wisch').querySelector('.spur');
  const max = mitFactsSeite() ? wisch.reihe.length : wisch.reihe.length - 1;
  spur.scrollTo({ left: Math.max(0, Math.min(i, max)) * spur.clientWidth, behavior: 'smooth' });
}

function wischSchliessen() {
  wisch.offen = false;
  const el = $('wisch');
  el.hidden = true;
  el.innerHTML = '';
  document.body.classList.remove('wisch-offen');
  if (ansicht.tab === 'gemerkt') zeichne(); // Liste kann sich durch Merken/Entfernen geändert haben
}

document.addEventListener('click', (e) => {
  const start = e.target.closest('[data-wisch]');
  if (start && !wisch.offen) return wischOeffnen(Number(start.dataset.wisch) || 0);
  const schalter = e.target.closest('[data-bereich-schalter]');
  if (schalter && !wisch.offen) return bereichUmschalten(schalter.dataset.bereichSchalter);
  const tab = e.target.closest('[data-tab]');
  if (tab && !wisch.offen) return zeigeTab(tab.dataset.tab);
  const korr = e.target.closest('[data-korrektur]');
  if (korr && !wisch.offen) return oeffneKorrigierteMeldung(korr.dataset.korrektur, korr.dataset.meldung);
  const archivTag = e.target.closest('[data-tag]');
  if (archivTag && !wisch.offen) return oeffneArchivTag(archivTag.dataset.tag);
  const factStart = e.target.closest('[data-fact]');
  if (factStart && !wisch.offen) return wischOeffnen(reihenfolge(gezeigteAusgabe()).length, Number(factStart.dataset.fact) || 0);
  const begriff = e.target.closest('[data-begriff]');
  if (begriff && !wisch.offen) {
    merkeFortschritt(gezeigteAusgabe().datum, 'begriff');
    const i = reihenfolge(gezeigteAusgabe()).findIndex(m => m.id === begriff.dataset.begriff);
    if (i >= 0) wischOeffnen(i);
    return;
  }
  const gOeffnen = e.target.closest('[data-gemerkt-oeffnen]');
  if (gOeffnen && !wisch.offen) return oeffneGemerkt(gOeffnen.dataset.gemerktOeffnen);
  const gWeg = e.target.closest('[data-gemerkt-weg]');
  if (gWeg && !wisch.offen) return entferneGemerkt(gWeg.dataset.gemerktWeg);
  if (!wisch.offen) return;
  if (e.target.closest('[data-aktion="schliessen"]')) return wischSchliessen();
  if (e.target.closest('[data-merken-aktuell]')) return merkenUmschalten(aktuellerEintrag());
  const merk = e.target.closest('[data-merken]');
  if (merk) {
    const id = merk.dataset.merken.split('|')[1];
    return merkenUmschalten({ art: 'meldung', objekt: wisch.reihe.find(m => m.id === id) });
  }
  if (e.target.closest('[data-aktion="naechster-fact"]')) {
    zeigeFact(wisch.fact + 1);
    $('wisch').querySelector('.facts-seite').closest('.seite').scrollTo({ top: 0 });
    return;
  }
  const ziel = e.target.closest('[data-ziel]');
  if (ziel) {
    const seite = ziel.closest('.seite');
    const block = seite.querySelector(`[data-ebene="${ziel.dataset.ziel}"]`);
    if (block) seite.scrollTo({ top: block.offsetTop - 8, behavior: 'smooth' });
    return;
  }
  const lernen = e.target.closest('[data-lernen]');
  if (lernen) return mehrDazuLernen(wisch.reihe.find(m => m.id === lernen.dataset.lernen));
  if (e.target.closest('[data-aktion="lernen-zu"]')) return lernFensterZu();
});
document.addEventListener('keydown', (e) => {
  if (!wisch.offen) return;
  if (e.key === 'Escape') return $('wisch').querySelector('.lern-fenster') ? lernFensterZu() : wischSchliessen();
  else if (e.key === 'ArrowRight') wischGeheZu(wisch.index + 1);
  else if (e.key === 'ArrowLeft') wischGeheZu(wisch.index - 1);
});
window.addEventListener('resize', () => {
  if (!wisch.offen) return;
  const spur = $('wisch').querySelector('.spur');
  spur.scrollLeft = wisch.index * spur.clientWidth;
});

// ---------- Archiv (Schritt 4) ----------
const ICON_ZURUECK = '<path d="M10 3L5 8l5 5"/>';
const ICON_WEITER = '<path d="M6 3l5 5-5 5"/>';
const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function navi() {
  const aktiv = ['einstellungen', 'gemerkt'].includes(ansicht.tab) ? ansicht.tab
    : ansicht.tab === 'heute' || (ansicht.tab === 'archivtag' && ansicht.herkunft === 'heute') ? 'heute' : 'archiv';
  document.querySelectorAll('.navi [data-tab]').forEach(b => {
    const an = b.dataset.tab === aktiv;
    b.classList.toggle('aktiv', an);
    if (an) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

function zeigeTab(tab) {
  if (ansicht.tab === 'archiv') ansicht.archivScroll = window.scrollY;
  if (tab === 'heute' && ansicht.tab === 'heute') return window.scrollTo({ top: 0, behavior: 'smooth' });
  ansicht.tab = ['archiv', 'einstellungen', 'gemerkt'].includes(tab) ? tab : 'heute';
  ansicht.tag = null;
  ansicht.scrollNachZeichnen = ansicht.tab === 'archiv' ? ansicht.archivScroll : 0;
  zeichne();
  if (ansicht.tab !== 'archiv') window.scrollTo(0, 0);
}

// Einträge fürs Archiv: mit Netz aus index.json (bis 30 Tage), offline nur die gespeicherten Tage.
async function archivEintraege() {
  const gespeichert = await gespeicherteTage();
  const offlineDa = new Set(gespeichert.map(t => t.datum));
  const heute = zustand.ausgabe?.datum;
  let liste = !zustand.offline && zustand.indexTage
    ? zustand.indexTage.map(t => ({ datum: t.datum, schlagzeile: t.schlagzeile, meldungen: t.meldungen, korrigiert: t.korrigiert }))
    : gespeichert.map(t => ({ datum: t.datum }));
  liste = liste.filter(t => t.datum !== heute).slice(0, ARCHIV_TAGE);
  for (const t of liste) {
    t.offline = offlineDa.has(t.datum);
    if (!t.schlagzeile && t.offline) { // Fallback: aus der gespeicherten Datei
      try {
        const d = await ladeGespeichert(t.datum);
        t.schlagzeile = d?.meldungen?.[0]?.schlagzeile; t.meldungen = d?.meldungen?.length;
        t.korrigiert = (d?.meldungen || []).filter(m => m?.korrigiert).length;
      } catch {}
    }
  }
  return liste;
}

let archivLauf = 0;
async function zeichneArchiv() {
  const lauf = ++archivLauf;
  const kopf = `<header class="kopf archiv-kopf"><h1>Archiv</h1>
    <div class="meta">${zustand.offline ? `Offline – nur die ${OFFLINE_TAGE} gespeicherten Tage` : `Letzte ${ARCHIV_TAGE} Tage · ${OFFLINE_TAGE} Tage offline gespeichert`}</div></header>`;
  let liste = [];
  try { liste = await archivEintraege(); } catch {}
  if (lauf !== archivLauf || ansicht.tab !== 'archiv') return; // inzwischen woanders hin gewechselt
  const scrollZiel = ansicht.scrollNachZeichnen; ansicht.scrollNachZeichnen = null;
  $('inhalt').innerHTML = kopf + (liste.length ? `<ul class="archiv-liste">${liste.map(t => {
    const tag = new Date(t.datum + 'T12:00:00Z');
    const nurOnline = zustand.offline && !t.offline;
    const zusatz = [
      Number.isFinite(t.meldungen) ? `${t.meldungen} Meldungen` : '',
      t.korrigiert ? `<span class="korr-chip">${t.korrigiert} korrigiert</span>` : '',
      nurOnline ? '<span>nur mit Internet</span>' : '',
    ].filter(Boolean).join('');
    return `<li><button class="archiv-zeile" data-tag="${esc(t.datum)}"${nurOnline ? ' aria-disabled="true"' : ''}>
      <span class="archiv-datum"><span class="archiv-tag">${tag.getUTCDate()}</span><span class="archiv-wt">${WOCHENTAG[tag.getUTCDay()]}</span></span>
      <span class="archiv-text"><span class="archiv-schlagzeile">${esc(t.schlagzeile || 'Ausgabe vom ' + kurzDatum(t.datum))}</span>
        <span class="archiv-meta">${zusatz}</span></span>
      ${svg(ICON_WEITER)}
    </button></li>`;
  }).join('')}</ul>` : `<div class="leer"><h2>Noch kein Archiv</h2><p>${zustand.offline ? 'Offline sind noch keine älteren Ausgaben gespeichert.' : 'Ältere Ausgaben erscheinen hier ab dem zweiten Tag.'}</p></div>`);
  if (scrollZiel != null) window.scrollTo(0, scrollZiel); // erst nach dem Zeichnen, sonst ist die Liste noch zu kurz
}

async function ladeArchivTag(datum) {
  if (archivSpeicher.has(datum)) return archivSpeicher.get(datum);
  try { const d = await ladeGespeichert(datum); if (istGueltig(d) && d.datum === datum) return d; } catch {}
  const d = await holeJSON(DATEN + datum + '.json');
  if (!istGueltig(d) || d.datum !== datum) throw new Error('ungültig');
  archivSpeicher.set(datum, d);
  return d;
}

async function oeffneArchivTag(datum, meldungId = null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return;
  const von = ansicht.tab;
  if (von === 'archiv') ansicht.archivScroll = window.scrollY;
  try {
    const d = await ladeArchivTag(datum);
    if (ansicht.tab !== von) return; // inzwischen woanders hin gewechselt
    if (meldungId && reihenfolge(d).every(m => m.id !== meldungId)) return toast('Diese Meldung gehört zu einem ausgeblendeten Bereich');
    ansicht.herkunft = von === 'heute' ? 'heute' : 'archiv';
    ansicht.tab = 'archivtag'; ansicht.tag = d;
    zeichne();
    window.scrollTo(0, 0);
    if (meldungId) {
      const i = reihenfolge(d).findIndex(m => m.id === meldungId);
      if (i >= 0) wischOeffnen(i);
    }
  } catch {
    toast(zustand.offline || !navigator.onLine
      ? `Die Ausgabe vom ${kurzDatum(datum)} gibt es nur mit Internet`
      : `Die Ausgabe vom ${kurzDatum(datum)} konnte nicht geladen werden`);
  }
}

// ---------- „Mehr dazu lernen“ (Schritt 8) ----------
// Kopiert die fertige Frage (vertiefung.chat_prompt) und öffnet Claude. Die Frage steht nie in der URL –
// es werden nur öffentliche News-Inhalte kopiert. Eingefügt wird sie im Chat „News & Facts“.
const CLAUDE_URL = 'https://claude.ai/new';

function lernFrage(m) {
  const p = typeof m?.vertiefung?.chat_prompt === 'string' ? m.vertiefung.chat_prompt.trim() : '';
  return p || `Erklär mir den Hintergrund zu dieser Meldung: „${m?.schlagzeile || ''}“`;
}

// Alter Weg ohne Clipboard-API (läuft synchron im Tipp, daher auch auf älterem iOS).
function kopiereAlt(text) {
  const t = document.createElement('textarea');
  t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t); t.select(); t.setSelectionRange(0, text.length);
  let ok = false; try { ok = document.execCommand('copy'); } catch {}
  t.remove();
  return ok;
}

function mehrDazuLernen(m) {
  if (!m) return;
  const frage = lernFrage(m);
  // Beides direkt im Tipp starten: iOS erlaubt Zwischenablage und neues Fenster nur während der Nutzer-Geste.
  const kopie = navigator.clipboard?.writeText ? navigator.clipboard.writeText(frage) : Promise.reject(new Error('keine API'));
  const fenster = window.open(CLAUDE_URL, '_blank'); // ohne 'noopener', sonst liefert open() immer null
  try { if (fenster) fenster.opener = null; } catch {}
  kopie.then(() => toast('Frage kopiert – in Claude im Chat „News & Facts“ einfügen'))
    .catch(() => (kopiereAlt(frage) ? toast('Frage kopiert – in Claude im Chat „News & Facts“ einfügen') : lernFensterAuf(frage)));
  if (fenster === null && !document.hidden) lernFensterAuf(frage); // Fenster blockiert → Frage + Link zeigen
}

// Rückfall: Frage zum selbst Kopieren + Link zu Claude.
function lernFensterAuf(frage) {
  const el = $('wisch');
  if (!el || el.querySelector('.lern-fenster')) return;
  el.insertAdjacentHTML('beforeend', `<div class="lern-fenster" role="dialog" aria-modal="true" aria-label="Frage für Claude">
    <div class="lern-karte">
      <span class="lernen-titel">Frage für Claude</span>
      <p class="unterzeile">Text gedrückt halten → „Alles auswählen“ → „Kopieren“. Dann in Claude im Chat „News &amp; Facts“ einfügen.</p>
      <textarea class="lern-text" readonly rows="5">${esc(frage)}</textarea>
      <a class="knopf haupt" href="${CLAUDE_URL}" target="_blank" rel="noopener noreferrer">${svg(ICON_CHAT, 18)}Claude öffnen</a>
      <button class="knopf text" data-aktion="lernen-zu">Schließen</button>
    </div>
  </div>`);
}
function lernFensterZu() { $('wisch')?.querySelector('.lern-fenster')?.remove(); }

// ---------- Merken (Schritt 7): nur lokal, mit Inhalt, bleibt dauerhaft ----------
const ICON_LESEZEICHEN = '<path d="M4 2h8v12l-4-3-4 3z"/>';
const SPEICHER_GEMERKT = 'gemerkt';
// Eintrag: { art: 'meldung'|'fact', id, datum, am (ISO), inhalt (komplette Meldung bzw. Fact) }

function gemerktListe() {
  try { const l = JSON.parse(localStorage.getItem(SPEICHER_GEMERKT) || '[]'); return Array.isArray(l) ? l.filter(x => x && x.id && x.inhalt) : []; }
  catch { return []; }
}
function speichereGemerkt(liste) {
  try { localStorage.setItem(SPEICHER_GEMERKT, JSON.stringify(liste)); return true; }
  catch { toast('Konnte nicht gemerkt werden – Speicher voll oder gesperrt'); return false; }
}
const schluessel = (art, id) => `${art}|${id}`;
const istGemerkt = (art, id) => gemerktListe().some(x => x.art === art && x.id === id);

function aktuellerEintrag() {
  if (wisch.index < wisch.reihe.length) return { art: 'meldung', objekt: wisch.reihe[wisch.index] };
  const { haupt, extra } = alleFacts(wisch.ausgabe || {});
  return { art: 'fact', objekt: [...haupt, ...extra][wisch.fact] };
}

function merkenUmschalten({ art, objekt } = {}) {
  if (!objekt?.id) return;
  const liste = gemerktListe();
  const i = liste.findIndex(x => x.art === art && x.id === objekt.id);
  if (i >= 0) {
    liste.splice(i, 1);
    if (speichereGemerkt(liste)) toast('Nicht mehr gemerkt');
  } else {
    const datum = wisch.ausgabe?.datum || String(objekt.id).slice(0, 10);
    liste.unshift({ art, id: objekt.id, datum, am: new Date().toISOString(), inhalt: objekt });
    if (speichereGemerkt(liste)) toast('Gemerkt – zu finden unter „Gemerkt“');
  }
  merkenKnoepfe();
}

// Alle Lesezeichen-Knöpfe im Wisch-Modus auf den gespeicherten Stand bringen.
function merkenKnoepfe() {
  const el = $('wisch');
  if (!el || el.hidden) return;
  const setze = (b, an) => { b.setAttribute('aria-pressed', String(an)); b.setAttribute('aria-label', an ? 'Nicht mehr merken' : 'Merken'); b.classList.toggle('voll', an); };
  el.querySelectorAll('[data-merken]').forEach(b => { const [art, id] = b.dataset.merken.split('|'); setze(b, istGemerkt(art, id)); });
  const oben = el.querySelector('[data-merken-aktuell]');
  const e = aktuellerEintrag();
  if (oben) { oben.hidden = !e.objekt?.id; if (e.objekt?.id) setze(oben, istGemerkt(e.art, e.objekt.id)); }
}

function zeichneGemerkt() {
  const liste = gemerktListe();
  $('inhalt').innerHTML = `
    <header class="kopf archiv-kopf"><h1>Gemerkt</h1>
      <div class="meta">${liste.length} ${liste.length === 1 ? 'Eintrag' : 'Einträge'} · nur auf diesem iPhone · bleiben dauerhaft</div></header>
    ${liste.length ? `<ul class="gemerkt-liste">${liste.map(x => {
      const bereich = x.art === 'fact' ? 'Fact' : (BEREICHE.find(b => b[0] === x.inhalt.bereich)?.[1] || 'Meldung');
      const titel = x.art === 'fact' ? (x.inhalt.titel || x.inhalt.text) : x.inhalt.schlagzeile;
      const k = esc(schluessel(x.art, x.id));
      return `<li class="gemerkt-zeile">
        <button class="gemerkt-oeffnen" data-gemerkt-oeffnen="${k}">
          <span class="label akzent">${esc(bereich)}${/^\d{4}-\d{2}-\d{2}$/.test(x.datum || '') ? ' · ' + esc(kurzDatum(x.datum)) : ''}</span>
          <span class="gemerkt-titel">${esc(titel || '')}</span>
        </button>
        <button class="rund gemerkt-weg voll" data-gemerkt-weg="${k}" aria-label="Nicht mehr merken">${svg(ICON_LESEZEICHEN, 20)}</button>
      </li>`;
    }).join('')}</ul>` : '<div class="leer"><h2>Noch nichts gemerkt</h2><p>Tippe in einer Meldung oder bei einem Fact auf das Lesezeichen.</p></div>'}`;
}

function entferneGemerkt(k) {
  const liste = gemerktListe();
  const i = liste.findIndex(x => schluessel(x.art, x.id) === k);
  if (i < 0) return;
  liste.splice(i, 1);
  if (speichereGemerkt(liste)) { toast('Nicht mehr gemerkt'); zeichne(); }
}

// Öffnet einen gemerkten Eintrag. Ist die Ausgabe noch erreichbar, wird die aktuelle Fassung genommen
// (z. B. mit Korrektur-Banner) und die gespeicherte Kopie aufgefrischt; sonst die gespeicherte Kopie.
async function oeffneGemerkt(k) {
  const liste = gemerktListe();
  const x = liste.find(y => schluessel(y.art, y.id) === k);
  if (!x) return;
  let inhalt = x.inhalt;
  try {
    const d = zustand.ausgabe?.datum === x.datum ? zustand.ausgabe : await ladeArchivTag(x.datum);
    const pool = x.art === 'fact' ? [...(d.facts || []), ...(d.extra_facts || [])] : d.meldungen;
    const frisch = pool.find(y => y?.id === x.id);
    if (frisch) { inhalt = frisch; x.inhalt = frisch; speichereGemerkt(liste); }
  } catch {} // offline oder Datei weg: gespeicherte Kopie reicht
  if (ansicht.tab !== 'gemerkt') return;
  const ausgabe = x.art === 'fact'
    ? { datum: x.datum, meldungen: [], facts: [inhalt], extra_facts: [] }
    : { datum: x.datum, meldungen: [inhalt] };
  wischOeffnen(0, 0, { ausgabe, modus: x.art });
}

// ---------- Einstellungen (Schritt 6): Bereiche an/aus, nur lokal ----------
const SPEICHER_BEREICHE = 'bereiche-aus';
let bereicheCache = null;
function bereicheAus() {
  if (bereicheCache) return bereicheCache;
  let liste = [];
  try { liste = JSON.parse(localStorage.getItem(SPEICHER_BEREICHE) || '[]'); } catch {}
  bereicheCache = new Set(Array.isArray(liste) ? liste.filter(k => BEREICHE.some(b => b[0] === k)) : []);
  return bereicheCache;
}
function bereichUmschalten(key) {
  if (!BEREICHE.some(b => b[0] === key)) return;
  const aus = new Set(bereicheAus());
  if (aus.has(key)) aus.delete(key); else aus.add(key);
  bereicheCache = aus;
  try { localStorage.setItem(SPEICHER_BEREICHE, JSON.stringify([...aus])); }
  catch { toast('Konnte nicht gespeichert werden – gilt nur bis zum Schließen'); }
  const knopf = document.querySelector(`[data-bereich-schalter="${key}"]`);
  if (knopf) knopf.setAttribute('aria-checked', String(!aus.has(key)));
}

function zeichneEinstellungen() {
  const aus = bereicheAus();
  $('inhalt').innerHTML = `
    <header class="kopf archiv-kopf"><h1>Einstellungen</h1></header>
    <section class="einst-block">
      <h2 class="label">Bereiche anzeigen</h2>
      <div class="einst-liste">${BEREICHE.map(([key, name, icon]) => `
        <div class="einst-zeile">
          <span class="einst-name">${svg(icon)}${esc(name)}</span>
          <button class="schalter" role="switch" aria-checked="${!aus.has(key)}" aria-label="${esc(name.replace('&', 'und'))}" data-bereich-schalter="${key}"><span></span></button>
        </div>`).join('')}
      </div>
      <p class="unterzeile">Nur auf diesem iPhone gespeichert. Ausgeblendete Bereiche fehlen in der Liste und beim Durchwischen – Facts und Begriff bleiben.</p>
    </section>
    <section class="einst-block">
      <h2 class="label">Darstellung</h2>
      <p class="einst-text">Immer hell – der Dunkelmodus ist vorerst aus.</p>
      <p class="unterzeile">Schriftgröße folgt der iPhone-Einstellung.</p>
    </section>
    <section class="einst-block">
      <h2 class="label">Über</h2>
      <p class="einst-text">Recherchiert und geschrieben mit Claude, einem KI-Modell von Anthropic. Jede Meldung mit Status und Quellen.</p>
      <p class="unterzeile">Version ${esc(VERSION)}${DATEN.includes('testdaten') ? ' · Testdaten' : ''}</p>
    </section>`;
}

// ---------- Korrekturen (Schritt 5) ----------
const ICON_STIFT = '<path d="M10.5 2.5l3 3L6 13H3v-3z"/><path d="M9 4l3 3"/>';

// Banner über einer korrigierten Meldung: { am, text }. Der Originaltext darunter bleibt unverändert.
function korrBanner(k, klein = false) {
  const am = typeof k?.am === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k.am) ? ` am ${kurzDatum(k.am)}` : '';
  return `<p class="korr-banner${klein ? ' klein-banner' : ''}">${svg(ICON_STIFT, 14)}<span><strong>Korrigiert${esc(am)}:</strong> ${esc(k?.text || 'Diese Meldung wurde nachträglich korrigiert.')}</span></p>`;
}

// Kasten oben in der Ausgabe: eine Zeile je Eintrag in `korrekturen`.
function korrekturKasten(d) {
  const liste = (Array.isArray(d.korrekturen) ? d.korrekturen : []).filter(k => k && (k.was_falsch || k.richtig));
  if (!liste.length) return '';
  return liste.map(k => {
    const datum = typeof k.datum_meldung === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k.datum_meldung) ? k.datum_meldung : null;
    const abstand = datum ? tageZwischen(datum, d.datum) : null;
    const titel = abstand === 1 ? 'Korrektur zu gestern' : datum ? `Korrektur zur Ausgabe vom ${kurzDatum(datum)}` : 'Korrektur';
    const text = [k.was_falsch, k.richtig].filter(Boolean).map(esc).join(' → ');
    return `<section class="korr-kasten" aria-label="Korrektur">
      <span class="korr-titel">${svg(ICON_STIFT, 14)}${esc(titel)}</span>
      <span class="korr-text">${text}</span>
      ${quellenZeile(k.quellen)}
      ${datum && k.meldung_id ? `<button class="korr-link" data-korrektur="${esc(datum)}" data-meldung="${esc(k.meldung_id)}">Zur Meldung vom ${esc(kurzDatum(datum))}</button>` : ''}
    </section>`;
  }).join('');
}

// Öffnet die ursprüngliche (korrigierte) Meldung: ältere Ausgabe laden, dann direkt im Wisch-Modus.
function oeffneKorrigierteMeldung(datum, meldungId) {
  const aktuell = gezeigteAusgabe();
  if (aktuell && aktuell.datum === datum) {
    const i = reihenfolge(aktuell).findIndex(m => m.id === meldungId);
    return i >= 0 ? wischOeffnen(i) : toast('Diese Meldung gehört zu einem ausgeblendeten Bereich');
  }
  return oeffneArchivTag(datum, meldungId);
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
