#!/usr/bin/env node
// Baut daten/index.json neu aus allen Tagesdateien (neuester Tag zuerst).
// Je Tag: datum, datei, meldungen (Anzahl), schlagzeile (erste Meldung), korrigiert (Anzahl korrigierter Meldungen).
// Aufruf: node werkzeuge/index-aktualisieren.mjs [ordner]   (Standard: daten)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ordner = process.argv[2] || 'daten';
const tage = [];
for (const datei of readdirSync(ordner).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))) {
  try {
    const d = JSON.parse(readFileSync(join(ordner, datei), 'utf8'));
    const m = Array.isArray(d.meldungen) ? d.meldungen : [];
    // schlagzeile + korrigiert für die Archiv-Liste der App (spart 30 Einzel-Downloads)
    tage.push({ datum: d.datum, datei, meldungen: m.length, schlagzeile: m[0]?.schlagzeile ?? null,
                korrigiert: m.filter(x => x?.korrigiert).length });
  } catch { console.error(`übersprungen (kein gültiges JSON): ${datei}`); }
}
tage.sort((a, b) => b.datum.localeCompare(a.datum));
writeFileSync(join(ordner, 'index.json'), JSON.stringify({ version: 1, aktualisiert: new Date().toISOString(), tage }, null, 2) + '\n');
console.log(`index.json: ${tage.length} Tag(e), neuester: ${tage[0]?.datum ?? '–'}`);
