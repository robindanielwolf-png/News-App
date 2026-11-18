#!/usr/bin/env node
// Automatischer Check der Tagesdatei (Format v1) – läuft vor jedem Commit der täglichen Aufgabe.
// Aufruf: node werkzeuge/pruefe-tagesdatei.mjs daten/JJJJ-MM-TT.json [--test]
// Exit 0 = ok, Exit 1 = durchgefallen (Datei NICHT committen).
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const args = process.argv.slice(2);
const testModus = args.includes('--test');
const pfad = args.find(a => !a.startsWith('--'));
if (!pfad) { console.error('Aufruf: node werkzeuge/pruefe-tagesdatei.mjs daten/JJJJ-MM-TT.json'); process.exit(2); }

const fehler = [];
const f = (m) => fehler.push(m);
const istText = (v) => typeof v === 'string' && v.trim().length > 0;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const STATUS = ['bestaetigt', 'eine_quelle', 'umstritten', 'unklar'];
const BEREICHE = ['de_eu', 'wirtschaft', 'ki_tech', 'welt', 'sport'];

let roh, d;
try { roh = readFileSync(pfad, 'utf8'); } catch { console.error(`Datei nicht lesbar: ${pfad}`); process.exit(1); }
try { d = JSON.parse(roh); } catch (e) { console.error(`Kein gültiges JSON: ${e.message}`); process.exit(1); }

function pruefeQuellen(q, wo, min = 1) {
  if (!Array.isArray(q) || q.length < min) { f(`${wo}: mind. ${min} Quelle(n) nötig`); return; }
  q.forEach((x, i) => {
    if (!istText(x?.url) || !x.url.startsWith('https://')) f(`${wo}: Quelle ${i + 1} ohne https://-Link`);
    if (!istText(x?.titel) && !istText(x?.medium)) f(`${wo}: Quelle ${i + 1} ohne Titel/Medium`);
  });
}

// Oberste Ebene
if (d.version !== 1) f('version muss 1 sein');
if (!DATUM.test(d.datum ?? '')) f('datum fehlt oder nicht JJJJ-MM-TT');
else if (basename(pfad) !== `${d.datum}.json`) f(`Dateiname passt nicht zum datum (${d.datum}.json erwartet)`);
if (!istText(d.erstellt_um) || isNaN(Date.parse(d.erstellt_um))) f('erstellt_um fehlt oder ist keine ISO-Zeit');
if (!istText(d.transparenz)) f('transparenz fehlt');
if (!Array.isArray(d.korrekturen)) f('korrekturen muss eine Liste sein (auch leer)');
if (d.beispiel === true && !testModus) f('beispiel: true ist im echten Datenordner nicht erlaubt');

// Meldungen
const m = Array.isArray(d.meldungen) ? d.meldungen : (f('meldungen fehlt'), []);
if (m.length < 6 || m.length > 8) f(`6–8 Meldungen nötig, gefunden: ${m.length}`);
const ids = new Set();
m.forEach((x, i) => {
  const wo = `Meldung ${i + 1}${x?.id ? ` (${x.id})` : ''}`;
  if (!istText(x?.id) || !x.id.startsWith(`${d.datum}-`)) f(`${wo}: id muss mit ${d.datum}- beginnen`);
  if (ids.has(x?.id)) f(`${wo}: id doppelt`); ids.add(x?.id);
  if (!BEREICHE.includes(x?.bereich)) f(`${wo}: unbekannter bereich`);
  for (const k of ['schlagzeile', 'kurz', 'hintergrund', 'warum_wichtig']) if (!istText(x?.[k])) f(`${wo}: ${k} fehlt`);
  if (!STATUS.includes(x?.status)) f(`${wo}: status fehlt/ungültig`);
  if (!DATUM.test(x?.ereignis_datum ?? '')) f(`${wo}: ereignis_datum fehlt`);
  pruefeQuellen(x?.quellen, wo, x?.status === 'bestaetigt' ? 2 : 1);
  if (!istText(x?.vertiefung?.text) || !Array.isArray(x?.vertiefung?.links) || !istText(x?.vertiefung?.chat_prompt)) f(`${wo}: vertiefung unvollständig`);
  if (x?.status === 'umstritten' && !(Array.isArray(x?.positionen) && x.positionen.length >= 2)) f(`${wo}: umstritten braucht mind. 2 positionen`);
  if (typeof x?.interessenkonflikt !== 'boolean') f(`${wo}: interessenkonflikt (true/false) fehlt`);
});
for (const b of ['de_eu', 'wirtschaft', 'ki_tech', 'welt']) if (!m.some(x => x?.bereich === b)) f(`Bereich ${b} fehlt`);
const sport = m.filter(x => x?.bereich === 'sport').length;
if (sport !== 1) f(`genau 1 Sport-Meldung nötig, gefunden: ${sport}`);

// Facts, Extra-Facts, Begriff
const facts = Array.isArray(d.facts) ? d.facts : [];
if (facts.length !== 3) f(`genau 3 facts nötig, gefunden: ${facts.length}`);
if (facts.filter(x => x?.art === 'aktuell').length !== 2 || facts.filter(x => x?.art === 'zeitlos').length !== 1) f('facts: 2 × aktuell + 1 × zeitlos nötig');
const extra = Array.isArray(d.extra_facts) ? d.extra_facts : [];
if (extra.length !== 5) f(`genau 5 extra_facts nötig, gefunden: ${extra.length}`);
[...facts.map((x, i) => [x, `Fact ${i + 1}`]), ...extra.map((x, i) => [x, `Extra-Fact ${i + 1}`])].forEach(([x, wo]) => {
  if (!istText(x?.id) || !istText(x?.text)) f(`${wo}: id/text fehlt`);
  if (!STATUS.includes(x?.status)) f(`${wo}: status fehlt/ungültig`);
  pruefeQuellen(x?.quellen, wo);
});
const b = d.begriff;
if (!istText(b?.wort) || !istText(b?.erklaerung)) f('begriff: wort/erklaerung fehlt');
else { if (!STATUS.includes(b.status)) f('begriff: status fehlt/ungültig'); pruefeQuellen(b.quellen, 'begriff'); }

// Alle Links https
(function alleUrls(o, weg) {
  if (Array.isArray(o)) o.forEach((v, i) => alleUrls(v, `${weg}[${i}]`));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
    if (k === 'url' && (typeof v !== 'string' || !v.startsWith('https://'))) f(`${weg}.url ist kein https://-Link`);
    else alleUrls(v, `${weg}.${k}`);
  }
})(d, 'datei');

// Datenschutz: keine Keys/Tokens, keine E-Mail-Adressen
const MUSTER = [
  [/ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/, 'GitHub-Token'],
  [/sk-[A-Za-z0-9_-]{20,}/, 'API-Key (sk-…)'],
  [/AKIA[0-9A-Z]{16}/, 'AWS-Key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'privater Schlüssel'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, 'E-Mail-Adresse'],
];
for (const [re, name] of MUSTER) if (re.test(roh)) f(`Datenschutz: ${name} gefunden`);

if (fehler.length) {
  console.error(`DURCHGEFALLEN (${fehler.length}):\n- ` + fehler.join('\n- '));
  process.exit(1);
}
console.log(`OK: ${pfad} – ${m.length} Meldungen, ${facts.length} Facts, ${extra.length} Extra-Facts`);
