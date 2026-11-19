// Daily News – Schritt 1: Tagesdatei laden, 7 Tage offline speichern, Hinweise, nie leerer Bildschirm.
// Schritt 2: Wisch-Modus mit Ebene 1 (Meldung), Ebene 2 (Hintergrund, Quellen, Positionen, Benchmarks), Ebene 3 (Tiefer einsteigen).
// Schritt 3: Facts einzeln mit „Nächster Fact“ / „Noch einer“ (Extra-Facts), Begriff des Tages.
const VERSION = '0.3.0';
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
  const reihe = reihenfolge(d);
  const gruppen = BEREICHE.map(([key, name, icon]) => {
    const m = reihe.filter(x => x.bereich === key);
    if (!m.length) return '';
    return `<section class="bereich"><h2 class="bereich-titel">${svg(icon, 14)}${esc(name)}</h2><ul class="liste">${
      m.map(x => `<li><button class="zeile" data-wisch="${reihe.indexOf(x)}"><span class="schlagzeile">${esc(x.schlagzeile)}</span>${statusChip(x.status)}</button></li>`).join('')
    }</ul></section>`;
  }).join('');
  const facts = (Array.isArray(d.facts) ? d.facts : []).map((f, i) => `<button class="karte fact-teaser" data-fact="${i}">
      <span class="zeile-oben"><span class="label akzent">${esc(themaName(f.thema) || 'Fact')}</span>${statusChip(f.status)}</span>
      ${f.titel ? `<span class="teaser-titel">${esc(f.titel)}</span>` : ''}
      <span class="teaser-text">${esc(f.text)}</span>
    </button>`).join('');
  const extraAnzahl = Array.isArray(d.extra_facts) ? d.extra_facts.length : 0;
  const b = d.begriff;
  const begriffMeldung = b?.meldung_id && d.meldungen.find(m => m.id === b.meldung_id);
  $('inhalt').innerHTML = `
    <header class="kopf">
      <h1>Daily News</h1>
      <div class="meta">${esc(langDatum(d.datum))} · ${d.meldungen.length} Meldungen · ca. ${lesezeit(d)} Min.</div>
      ${d.beispiel ? '<span class="beispiel">Testdaten</span>' : ''}
      <button class="knopf haupt start-wisch" data-wisch="0">${svg(ICON_WISCHEN, 18)}Durchwischen starten</button>
    </header>
    ${gruppen}
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
  return BEREICHE.flatMap(([key]) => d.meldungen.filter(x => x.bereich === key));
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
    <button class="knopf haupt" data-ziel="ebene3">Tiefer einsteigen${svg(ICON_RUNTER, 18)}</button>
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
      <button class="knopf weiss" data-platzhalter="lernen" aria-disabled="true">${svg(ICON_CHAT, 18)}Mehr dazu lernen</button>
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
  const d = zustand.ausgabe;
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
  const fertig = '<button class="knopf text" data-aktion="schliessen">Fertig – zurück zur Startseite</button>';
  seite.querySelector('.fact-knoepfe').innerHTML = wisch.fact < haupt.length - 1
    ? '<button class="knopf" data-aktion="naechster-fact">Nächster Fact</button>'
    : uebrig > 0
      ? `<button class="knopf haupt" data-aktion="naechster-fact">${svg(ICON_PLUS, 18)}Noch einer <span class="uebrig">(${uebrig} übrig)</span></button>${fertig}`
      : `<p class="unterzeile mitte">Das waren alle Facts für heute.</p><button class="knopf haupt" data-aktion="schliessen">Fertig – zurück zur Startseite</button>`;
  if (wisch.fact >= haupt.length - 1) merkeFortschritt(d.datum, 'durchgewischt');
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

const wisch = { offen: false, reihe: [], index: 0, fact: 0 };

function wischOeffnen(start, factStart = 0) {
  const d = zustand.ausgabe;
  if (!d) return;
  wisch.reihe = reihenfolge(d);
  wisch.offen = true;
  const n = wisch.reihe.length;
  const el = $('wisch');
  el.innerHTML = `
    <div class="wisch-leiste">
      <div class="fortschritt" role="img" aria-label="Fortschritt">${'<span></span>'.repeat(n + 1)}</div>
      <div class="wisch-kopf">
        <button class="rund" data-aktion="schliessen" aria-label="Zurück zur Liste">${svg(ICON_X, 20)}</button>
        <span class="zaehler" aria-live="polite"></span>
        <span class="rund-platz" aria-hidden="true"></span>
      </div>
    </div>
    <div class="spur" tabindex="-1">${
      wisch.reihe.map((m, i) => `<article class="seite" aria-label="Meldung ${i + 1} von ${n}">${ebene1(m, d)}${ebene2(m, d, i + 1, n)}${ebene3(m)}</article>`).join('')
    }<article class="seite" aria-label="Facts">${factsSeite()}</article></div>`;
  el.hidden = false;
  zeigeFact(factStart);
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
  wisch.index = Math.max(0, Math.min(i, n));
  const el = $('wisch');
  if (!el.querySelector('.fortschritt')) return;
  el.querySelectorAll('.fortschritt span').forEach((s, k) => s.classList.toggle('an', k <= wisch.index));
  el.querySelector('.fortschritt').setAttribute('aria-label', wisch.index < n ? `Meldung ${wisch.index + 1} von ${n}` : 'Facts');
  el.querySelector('.zaehler').textContent = wisch.index < n ? `${wisch.index + 1} / ${n}` : 'Facts';
}

function wischGeheZu(i) {
  const spur = $('wisch').querySelector('.spur');
  spur.scrollTo({ left: Math.max(0, Math.min(i, wisch.reihe.length)) * spur.clientWidth, behavior: 'smooth' });
}

function wischSchliessen() {
  wisch.offen = false;
  const el = $('wisch');
  el.hidden = true;
  el.innerHTML = '';
  document.body.classList.remove('wisch-offen');
}

document.addEventListener('click', (e) => {
  const start = e.target.closest('[data-wisch]');
  if (start && !wisch.offen) return wischOeffnen(Number(start.dataset.wisch) || 0);
  const factStart = e.target.closest('[data-fact]');
  if (factStart && !wisch.offen) return wischOeffnen(reihenfolge(zustand.ausgabe).length, Number(factStart.dataset.fact) || 0);
  const begriff = e.target.closest('[data-begriff]');
  if (begriff && !wisch.offen) {
    merkeFortschritt(zustand.ausgabe.datum, 'begriff');
    const i = reihenfolge(zustand.ausgabe).findIndex(m => m.id === begriff.dataset.begriff);
    if (i >= 0) wischOeffnen(i);
    return;
  }
  if (!wisch.offen) return;
  if (e.target.closest('[data-aktion="schliessen"]')) return wischSchliessen();
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
  if (e.target.closest('[data-platzhalter="lernen"]')) toast('„Mehr dazu lernen“ kommt in einem späteren Schritt');
});
document.addEventListener('keydown', (e) => {
  if (!wisch.offen) return;
  if (e.key === 'Escape') wischSchliessen();
  else if (e.key === 'ArrowRight') wischGeheZu(wisch.index + 1);
  else if (e.key === 'ArrowLeft') wischGeheZu(wisch.index - 1);
});
window.addEventListener('resize', () => {
  if (!wisch.offen) return;
  const spur = $('wisch').querySelector('.spur');
  spur.scrollLeft = wisch.index * spur.clientWidth;
});

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
