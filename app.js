const SPORTS = {
  schwimmen: { name: 'Schwimmen', icon: '🏊', unit: 'km' },
  rad:       { name: 'Velo',      icon: '🚴', unit: 'km' },
  lauf:      { name: 'Lauf',      icon: '🏃', unit: 'km' },
  kraft:     { name: 'Kraft',     icon: '🏋️', unit: '' },
  ruhetag:   { name: 'Ruhetag',   icon: '😴', unit: '' }
};
// Belastung pro Minute je Intensität, wie im Excel (Blatt Anleitung)
const FAKTOR = { Locker: 1, Grundlage: 1.45, Gemischt: 1.8, Hart: 2.1, Wettkampf: 2.5, Kraft: 1, Ruhe: 0 };
const STUFE = ['Ruhe', 'Kraft', 'Locker', 'Grundlage', 'Gemischt', 'Hart', 'Wettkampf'];
const INTERVALS_TYP = {
  Swim: 'schwimmen', OpenWaterSwim: 'schwimmen',
  Ride: 'rad', VirtualRide: 'rad', GravelRide: 'rad', MountainBikeRide: 'rad',
  Run: 'lauf', VirtualRun: 'lauf', TrailRun: 'lauf',
  WeightTraining: 'kraft', Workout: 'kraft'
};
const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

let plan = { einheiten: [], wochen: [] };
let view = 'tag';
let cursor = startOfDay(new Date());
let offen = null; // id der Einheit, deren Eingabeformular offen ist
let ergebnisse = load('ergebnisse', {});
let aktivitaeten = load('aktivitaeten', []);
let krank = new Set(load('krank', []));
let lokal = load('einstellungen', {});
let gewicht = load('gewicht', []); // [{datum, kg}]
let ziele = load('ziele', {}); // Wettkampfdatum -> Zielzeit in Minuten
let byDate = {}, garmin = {}, extras = {}, anp = {}, zustand = null;

function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function monday(d) { return addDays(d, -((d.getDay() + 6) % 7)); }
function fmt(d) { return `${DAYS[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.`; }
function today() { return iso(new Date()); }
function kw(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}
function hm(min) { if (!min) return ''; min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? `${h}:${String(m).padStart(2, '0')} h` : `${m} Min`; }
function hms(min) { const s = Math.round(min * 60); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function mmss(sec) { sec = Math.round(sec); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
function zahl(v, n = 1) { return (Math.round(v * 10 ** n) / 10 ** n).toString().replace('.', ','); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function setting(k) { return lokal[k] ?? plan.einstellungen?.[k]; }

function toast(text) {
  const t = document.getElementById('toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.hidden = true, 3500);
}

// ---------- Ergebnisse ----------

function tempo(sport, dauer, distanz) {
  if (!dauer || !distanz) return '';
  if (sport === 'lauf') return `${mmss(dauer * 60 / distanz)} /km`;
  if (sport === 'schwimmen') return `${mmss(dauer * 60 / (distanz * 10))} /100 m`;
  if (sport === 'rad') return `${zahl(distanz / (dauer / 60))} km/h`;
  return '';
}

function vonAktivitaet(a) {
  return {
    dauer: (a.moving_time || a.elapsed_time || 0) / 60, distanz: a.distance ? a.distance / 1000 : null,
    puls: a.average_heartrate, maxPuls: a.max_heartrate, watt: a.icu_average_watts || a.average_watts,
    hoehenmeter: a.total_elevation_gain, name: a.name, quelle: 'garmin', sport: INTERVALS_TYP[a.type], datum: a.start_date_local.slice(0, 10)
  };
}

// Garmin-Aktivitäten den geplanten Einheiten zuordnen: gleicher Tag, gleiche Sportart
function zuordnen() {
  garmin = {}; extras = {};
  const sorted = [...aktivitaeten].sort((a, b) => a.start_date_local.localeCompare(b.start_date_local));
  for (const a of sorted) {
    const r = vonAktivitaet(a);
    if (!r.sport) continue;
    const u = (byDate[r.datum] || []).find(u => u.sport === r.sport && !garmin[u.id] && !ergebnisse[u.id]);
    if (u) garmin[u.id] = r;
    else (extras[r.datum] ||= []).push(r);
  }
}

function ergebnis(u) { return ergebnisse[u.id] || garmin[u.id] || null; }

function trimp(dauer, puls) {
  const max = setting('hfMax'), rest = setting('ruhepuls');
  const r = Math.min(1, Math.max(0, (puls - rest) / (max - rest)));
  return dauer * r * 0.64 * Math.exp(1.92 * r);
}

function belastungIst(r, intensitaet) {
  if (!r?.dauer) return 0;
  if (r.puls && (r.sport === 'lauf' || r.sport === 'rad')) return trimp(r.dauer, r.puls);
  const i = intensitaet || (r.sport === 'kraft' ? 'Kraft' : 'Grundlage');
  return r.dauer * (FAKTOR[i] ?? 1.45);
}

function belastungSoll(u, a = anp[u.id]) {
  if (a?.ausgefallen) return 0;
  const dauer = a?.dauer ?? u.dauer ?? 0;
  return dauer * (FAKTOR[a?.intensitaet ?? u.intensitaet] ?? 0);
}

function status(u) {
  if (ergebnis(u)) return 'erledigt';
  if (krank.has(u.datum)) return 'krank';
  if (u.sport === 'ruhetag') return 'ruhe';
  if (u.datum < today()) return 'verpasst';
  return 'offen';
}

// ---------- Fitness, Ermüdung, Form (wie Blatt Trainingszustand) ----------

function berechneZustand(mitAnpassung) {
  const start = plan.planstart || plan.wochen[0]?.von || plan.einheiten[0]?.datum;
  const ende = plan.wettkampf?.datum || plan.einheiten.at(-1)?.datum;
  if (!start || !ende) return null;
  let letzter = '';
  for (const id in ergebnisse) letzter = ergebnisse[id].datum > letzter ? ergebnisse[id].datum : letzter;
  for (const id in garmin) letzter = garmin[id].datum > letzter ? garmin[id].datum : letzter;
  for (const d in extras) letzter = d > letzter ? d : letzter;
  for (const d of krank) letzter = d > letzter ? d : letzter;
  if (letzter > today()) letzter = today();

  const tage = [];
  let fit = setting('startFitness') ?? 85, fat = fit, fitP = fit, fatP = fit;
  for (let d = parse(start); iso(d) <= ende; d = addDays(d, 1)) {
    const key = iso(d), units = byDate[key] || [];
    const soll = units.reduce((s, u) => s + belastungSoll(u, null), 0);
    const sollAngepasst = units.reduce((s, u) => s + (mitAnpassung ? belastungSoll(u) : belastungSoll(u, null)), 0);
    const ist = units.reduce((s, u) => s + belastungIst(ergebnis(u) && { ...ergebnis(u), sport: u.sport }, u.intensitaet), 0)
      + (extras[key] || []).reduce((s, r) => s + belastungIst(r), 0);
    const wirksam = key <= letzter ? ist : sollAngepasst;
    const form = fit - fat, formPlan = fitP - fatP;
    fit += (wirksam - fit) / 42; fat += (wirksam - fat) / 7;
    fitP += (soll - fitP) / 42; fatP += (soll - fatP) / 7;
    tage.push({ datum: key, soll, ist, fitness: fit, ermuedung: fat, form, formPlan, fitnessPlan: fitP, prognose: key > letzter });
  }
  return { tage, letzter };
}

// ---------- Automatische Anpassung ----------

function merge(id, a) {
  const alt = anp[id];
  if (!alt) { anp[id] = a; return; }
  anp[id] = {
    ausgefallen: alt.ausgefallen || a.ausgefallen,
    faktor: Math.min(alt.faktor ?? 1, a.faktor ?? 1),
    intensitaet: [alt.intensitaet, a.intensitaet].filter(Boolean).sort((x, y) => STUFE.indexOf(x) - STUFE.indexOf(y))[0],
    hinweis: [alt.hinweis, a.hinweis].filter(Boolean).join(' ')
  };
}

function berechneAnpassungen() {
  anp = {};
  const heute = today();
  const runter = (u, faktor, intensitaet, hinweis) => {
    if (u.sport === 'ruhetag' || u.intensitaet === 'Wettkampf' || ergebnis(u)) return;
    const neu = intensitaet && STUFE.indexOf(intensitaet) < STUFE.indexOf(u.intensitaet) ? intensitaet : null;
    merge(u.id, { faktor, intensitaet: u.sport === 'kraft' ? null : neu, hinweis });
  };

  // 1. Krank: Einheiten fallen aus, danach sanfter Wiedereinstieg
  for (const d of krank) for (const u of byDate[d] || []) if (!ergebnis(u) && u.sport !== 'ruhetag') merge(u.id, { ausgefallen: true, hinweis: 'Krank, Einheit fällt aus.' });
  const krankTage = [...krank].sort();
  for (let i = 0; i < krankTage.length; i++) {
    const tag = parse(krankTage[i]);
    if (krank.has(iso(addDays(tag, 1)))) continue; // nur am Ende eines Krankheitsblocks
    let n = 1; while (krank.has(iso(addDays(tag, -n)))) n++;
    const erholung = Math.min(n + 1, 5);
    for (let k = 1; k <= erholung; k++) {
      for (const u of byDate[iso(addDays(tag, k))] || []) {
        const f = u.sport === 'kraft' ? 0.5 : k <= Math.ceil(erholung / 2) ? 0.5 : 0.7;
        runter(u, f, 'Locker', `Nach ${n} ${n === 1 ? 'Krankheitstag' : 'Krankheitstagen'}: nur locker und kürzer.${/test/i.test(u.titel) ? ' Den Test um ein paar Tage verschieben.' : ''}`);
      }
    }
  }

  // 2. Müder als geplant: harte Einheiten der nächsten 3 Tage entschärfen
  const z = berechneZustand(false);
  const jetzt = z?.tage.find(t => t.datum === heute);
  if (jetzt && z.letzter && jetzt.form < jetzt.formPlan - 15) {
    for (let k = 0; k < 3; k++) for (const u of byDate[iso(addDays(new Date(), k))] || [])
      if (['Hart', 'Gemischt'].includes(u.intensitaet))
        runter(u, 0.8, 'Grundlage', `Du bist müder als geplant (Form ${Math.round(jetzt.form)} statt ${Math.round(jetzt.formPlan)}), deshalb ruhiger.`);
  }

  // 3. Letzte Einheit härter als vorgesehen (Gefühl oder Puls zu hoch)
  const z2 = 0.8 * setting('hfMax');
  for (let k = 1; k <= 2; k++) {
    const d = iso(addDays(new Date(), -k));
    for (const u of byDate[d] || []) {
      const r = ergebnis(u);
      if (!r || ['Hart', 'Gemischt', 'Wettkampf'].includes(u.intensitaet)) continue;
      const zuHart = r.gefuehl >= 8 ? `Gefühl ${r.gefuehl} bei ${u.titel}` :
        (r.puls > z2 && ['lauf', 'rad'].includes(u.sport) && u.intensitaet === 'Grundlage') ? `Ø Puls ${Math.round(r.puls)} über Z2 bei ${u.titel}` : null;
      if (!zuHart) continue;
      for (let j = 0; j <= 1; j++) for (const v of byDate[iso(addDays(new Date(), j))] || [])
        runter(v, 0.85, null, `Letzte Einheit war härter als geplant (${zuHart}), heute etwas kürzer.`);
    }
  }

  for (const id in anp) {
    const u = plan.einheiten.find(e => e.id === id);
    if (u?.dauer && anp[id].faktor) anp[id].dauer = Math.round(u.dauer * anp[id].faktor / 5) * 5;
    if (u?.distanz && anp[id].faktor) anp[id].distanz = Math.round(u.distanz * anp[id].faktor * 10) / 10;
  }
}

// ---------- Zielzeit und Wettkämpfe ----------

function leistung() {
  const von = iso(addDays(new Date(), -56));
  const rs = { schwimmen: [], rad: [], lauf: [] };
  const add = r => { if (rs[r.sport] && r.datum >= von && r.dauer && r.distanz) rs[r.sport].push(r); };
  for (const u of plan.einheiten) { const r = ergebnis(u); if (r) add({ ...r, sport: u.sport, datum: u.datum }); }
  for (const d in extras) extras[d].forEach(add);
  const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const swims = rs.schwimmen.filter(r => r.distanz >= 0.8);
  const rides = rs.rad.filter(r => r.dauer >= 60);
  const runs = rs.lauf.filter(r => r.distanz >= 5);
  return {
    swimPace: median(swims.map(r => r.dauer * 60 / (r.distanz * 10))), // s pro 100 m
    speed: median(rides.map(r => r.distanz / (r.dauer / 60))),
    // Riegel-Formel: beste Hochrechnung aus allen Läufen ab 5 km
    lauf: km => runs.length ? Math.min(...runs.map(r => r.dauer * (km / r.distanz) ** 1.06)) : null,
    n: { schwimmen: swims.length, rad: rides.length, lauf: runs.length }
  };
}

function ziel(sport) { return plan.einheiten.find(u => u.datum === plan.wettkampf?.datum && u.sport === sport)?.dauer; }

function prognose() {
  const L = leistung(), marathon = L.lauf(42.2);
  const teile = [
    { sport: 'schwimmen', name: 'Schwimmen 3,8 km', n: L.n.schwimmen,
      min: L.swimPace ? L.swimPace * 38 * 0.95 / 60 : ziel('schwimmen'),
      detail: L.swimPace ? `aus Ø ${mmss(L.swimPace)} /100 m im Training (Garmin zählt Pausen nicht mit, eigene Einträge schon), mit Neopren` : 'Plan-Ziel, noch keine Schwimmdaten' },
    { sport: 'wechsel', name: 'Wechsel 1 und 2', min: 12, detail: 'Annahme' },
    { sport: 'rad', name: 'Velo 180 km', n: L.n.rad,
      min: L.speed ? 180.2 / (L.speed * 0.93) * 60 : ziel('rad'),
      detail: L.speed ? `aus Ø ${zahl(L.speed)} km/h im Training, minus 7 % für 2200 Hm` : 'Plan-Ziel, noch keine Velodaten' },
    { sport: 'lauf', name: 'Marathon', n: L.n.lauf,
      min: marathon ? marathon * 1.25 : ziel('lauf'),
      detail: marathon ? `aus deinem besten Lauf (Marathon solo ${hm(marathon)}), plus 25 % nach Rad` : 'Plan-Ziel, noch keine Laufdaten' }
  ];
  return { teile, total: teile.reduce((s, t) => s + (t.min || 0), 0), ausDaten: L.n.schwimmen + L.n.rad + L.n.lauf > 0 };
}

// Heutige Schätzung für einen Wettkampf, null wenn Daten fehlen
function schaetzungJetzt(w) {
  const L = leistung();
  if (w.art === 'ironman') { const p = prognose(); return p.ausDaten ? p.total : null; }
  if (w.art === 'marathon') return L.lauf(42.2);
  if (w.art === 'halbmarathon') return L.lauf(21.1);
  if (w.art === 'olympisch') {
    const z = L.lauf(10);
    return L.swimPace && L.speed && z ? L.swimPace * 15 * 0.95 / 60 + 40 / L.speed * 60 + z * 1.05 + 5 : null;
  }
  return null;
}

function phi(x) { // Normalverteilung
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

// Wie gut hältst du den Plan ein? Belastung Ist durch Soll der letzten 28 Tage
function planTreue() {
  if (!zustand?.letzter) return 1;
  const von = iso(addDays(new Date(), -28));
  const tage = zustand.tage.filter(t => t.datum >= von && t.datum < today());
  const soll = tage.reduce((s, t) => s + t.soll, 0), ist = tage.reduce((s, t) => s + t.ist, 0);
  return soll ? Math.min(1.1, Math.max(0.3, ist / soll)) : 1;
}

function hochrechnung(w) {
  const tage = zustand?.tage || [];
  const heute = tage.findIndex(t => t.datum >= today());
  const ziel = tage.find(t => t.datum === w.datum);
  if (!ziel) return null;
  const treue = planTreue();
  const fitJetzt = heute > 0 ? tage[heute - 1].fitness : (setting('startFitness') ?? 85);
  let fit = fitJetzt;
  for (let i = Math.max(heute, 0); i < tage.length && tage[i].datum < w.datum; i++) fit += (tage[i].soll * treue - fit) / 42;
  const jetzt = schaetzungJetzt(w);
  const zeit = jetzt ? jetzt * (fitJetzt / fit) ** 0.15 : w.zielMin * (ziel.fitnessPlan / fit) ** 0.15;
  const tageBis = Math.round((parse(w.datum) - startOfDay(new Date())) / 864e5);
  const streuung = zeit * (0.025 + 0.05 * Math.min(tageBis, 280) / 280 + (jetzt ? 0 : 0.03));
  const mein = ziele[w.datum];
  return { zeit, treue, ausDaten: !!jetzt, tageBis, chance: mein ? phi((mein - zeit) / streuung) : null };
}

function parseZeit(s) {
  const t = String(s).trim().split(':').map(Number);
  if (t.some(isNaN) || !t.length) return null;
  return t.length === 3 ? t[0] * 60 + t[1] + t[2] / 60 : t.length === 2 ? t[0] * 60 + t[1] : t[0];
}

// ---------- Darstellung ----------

function weekOf(d) { return (plan.wochen || []).find(w => w.von <= iso(d) && iso(d) <= w.bis); }
function weekInfo(d) {
  const w = weekOf(d);
  if (!w) return '';
  return `<div class="weekinfo">Woche ${w.woche} · Phase ${esc(w.phase)}${w.besonderes ? `<br><strong>${esc(w.besonderes)}</strong>` : ''}</div>`;
}

function ergebnisHtml(u, r) {
  const s = SPORTS[u.sport] || {};
  const teile = [hm(r.dauer), r.distanz ? `${zahl(r.distanz, 2)} ${s.unit}` : '', tempo(u.sport, r.dauer, r.distanz),
    r.puls ? `Ø ${Math.round(r.puls)} bpm` : '', r.watt ? `${Math.round(r.watt)} W` : '', r.gefuehl ? `Gefühl ${r.gefuehl}/10` : ''].filter(Boolean);
  const soll = anp[u.id]?.dauer ?? u.dauer;
  const quote = soll && r.dauer ? Math.round(r.dauer / soll * 100) : null;
  return `<div class="result"><div class="rhead">${r.quelle === 'garmin' ? '⌚ Garmin' : '✍️ Eingetragen'}${quote ? ` · ${quote} % der Soll-Dauer` : ''} · Belastung ${Math.round(belastungIst({ ...r, sport: u.sport }, u.intensitaet))}</div>
    <div>${teile.join(' · ')}</div>${r.notiz ? `<div class="desc">${esc(r.notiz)}</div>` : ''}</div>`;
}

function formHtml(u) {
  const r = ergebnisse[u.id] || garmin[u.id] || {};
  const a = anp[u.id] || {};
  const f = (name, label, value, attrs = '') => `<label>${label}<input name="${name}" inputmode="decimal" value="${value ?? ''}" ${attrs}></label>`;
  return `<form class="entry" data-id="${u.id}">
    ${f('dauer', 'Dauer (min)', r.dauer ? Math.round(r.dauer) : a.dauer ?? u.dauer)}
    ${u.sport !== 'kraft' ? f('distanz', 'Distanz (km)', r.distanz ? zahl(r.distanz, 2) : a.distanz ?? u.distanz) : ''}
    ${f('puls', 'Ø Puls', r.puls && Math.round(r.puls))}
    ${f('maxPuls', 'Max Puls', r.maxPuls && Math.round(r.maxPuls))}
    ${f('gefuehl', 'Gefühl 1–10', r.gefuehl)}
    <label class="wide">Notiz<input name="notiz" value="${esc(r.notiz)}"></label>
    <div class="actions wide">
      <button type="submit" class="primary">Speichern</button>
      ${ergebnisse[u.id] ? '<button type="button" data-action="loeschen">Eintrag löschen</button>' : ''}
      <button type="button" data-action="schliessen">Abbrechen</button>
    </div></form>`;
}

const BADGE = { erledigt: '✓ Erledigt', verpasst: 'Verpasst', krank: 'Krank', offen: '', ruhe: '' };

function unitHtml(u, kurz) {
  const s = SPORTS[u.sport] || { name: u.sport, icon: '•', unit: '' };
  const a = anp[u.id], r = ergebnis(u), st = status(u);
  const dauer = a?.dauer ?? u.dauer, distanz = a?.distanz ?? u.distanz, intens = a?.intensitaet ?? u.intensitaet;
  const meta = [s.name, hm(dauer), distanz ? `${zahl(distanz, 2)} ${s.unit}` : '', intens !== s.name ? intens : ''].filter(Boolean).join(' · ');
  const original = a && !a.ausgefallen && (a.dauer !== u.dauer || a.intensitaet) ? `<span class="orig">Plan: ${hm(u.dauer)} ${u.intensitaet}</span>` : '';
  return `<div class="unit ${st}" style="--c: var(--${u.sport})">
    <div class="icon">${s.icon}</div>
    <div class="body">
      <div class="title">${esc(u.titel || s.name)}${BADGE[st] ? ` <span class="badge">${BADGE[st]}</span>` : ''}</div>
      <div class="meta">${meta} ${original}</div>
      ${a?.hinweis && !r ? `<div class="hint">↻ ${esc(a.hinweis)}</div>` : ''}
      ${u.beschreibung && !(kurz && (r || u.datum < today())) ? `<div class="desc">${esc(u.beschreibung)}</div>` : ''}
      ${r ? ergebnisHtml(u, r) : ''}
      ${offen === u.id ? formHtml(u) : u.sport !== 'ruhetag' && !krank.has(u.datum) && u.datum <= today() ? `<div class="actions">
        ${!r ? `<button data-action="geplant" data-id="${u.id}">✓ Wie geplant</button>` : ''}
        <button data-action="eintragen" data-id="${u.id}">${r ? 'Bearbeiten' : 'Ergebnis eintragen'}</button></div>` : ''}
    </div></div>`;
}

function extraHtml(r) {
  const s = SPORTS[r.sport] || { name: r.sport, icon: '•' };
  return `<div class="unit erledigt" style="--c: var(--${r.sport})"><div class="icon">${s.icon}</div><div class="body">
    <div class="title">${esc(r.name || s.name)} <span class="badge">Zusätzlich</span></div>
    ${ergebnisHtml({ sport: r.sport, id: '' }, r)}</div></div>`;
}

function dayUnits(d, kurz) {
  const key = iso(d);
  return (byDate[key] || []).map(u => unitHtml(u, kurz)).join('') + (extras[key] || []).map(extraHtml).join('');
}

function tagView() {
  const key = iso(cursor);
  const verpasst = plan.einheiten.filter(u => u.datum < today() && u.datum >= iso(addDays(new Date(), -7)) && status(u) === 'verpasst').length;
  const banner = key === today() && verpasst ? `<div class="weekinfo">${verpasst} verpasste ${verpasst === 1 ? 'Einheit' : 'Einheiten'} in den letzten 7 Tagen. Nicht nachholen, der Plan läuft normal weiter.</div>` : '';
  const inhalt = dayUnits(cursor) || '<div class="empty">Keine Einheit an diesem Tag</div>';
  const krankBtn = key <= iso(addDays(new Date(), 1)) ? `<button class="sick ${krank.has(key) ? 'on' : ''}" data-action="krank" data-datum="${key}">
    ${krank.has(key) ? '🤒 Als krank markiert, antippen zum Aufheben' : '🤒 Ich bin heute krank'}</button>` : '';
  const vorStart = key < plan.planstart ? `<div class="weekinfo">Dein Plan startet am <strong>${fmt(parse(plan.planstart))}</strong>.</div>` : '';
  return weekInfo(cursor) + vorStart + banner + inhalt + krankBtn + (key === today() ? gewichtCard() : '');
}

function wocheView() {
  const start = monday(cursor);
  const days = [...Array(7)].map((_, i) => addDays(start, i));
  const sum = {};
  for (const d of days) {
    for (const u of byDate[iso(d)] || []) {
      if (!u.dauer) continue;
      const x = sum[u.sport] ||= { soll: 0, ist: 0 };
      x.soll += u.dauer; x.ist += ergebnis(u)?.dauer || 0;
    }
    for (const r of extras[iso(d)] || []) (sum[r.sport] ||= { soll: 0, ist: 0 }).ist += r.dauer;
  }
  const summary = Object.entries(sum).map(([k, v]) => `<span class="pill" style="--c: var(--${k})">${SPORTS[k]?.icon || ''} ${hm(v.ist) || '0'} / ${hm(v.soll)}</span>`).join('');
  return weekInfo(start) + `<div class="summary">${summary}</div>` + days.map(d => {
    const t = iso(d) === today();
    return `<section class="day ${t ? 'today' : ''}"><h2>${fmt(d)}${t ? ' · Heute' : ''}${krank.has(iso(d)) ? ' · krank' : ''}</h2>
      ${dayUnits(d, true) || '<div class="meta">Keine Einheit</div>'}</section>`;
  }).join('');
}

function chart(alle) {
  const tage = [];
  for (let i = 0; i < alle.length; i += 7) {
    const w = alle.slice(i, i + 7), m = k => w.reduce((s, t) => s + t[k], 0) / w.length;
    tage.push({ datum: w[0].datum, bis: w.at(-1).datum, form: m('form'), formPlan: m('formPlan'), prognose: w.some(t => t.prognose) && w[0].prognose });
  }
  const W = 340, H = 140, P = 4;
  const vals = tage.flatMap(t => [t.form, t.formPlan]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = i => P + i * (W - 2 * P) / (tage.length - 1), y = v => P + (hi - v) * (H - 2 * P) / (hi - lo || 1);
  const line = (k, filter) => tage.map((t, i) => filter(t, i) ? `${x(i)},${y(t[k])}` : null).filter(Boolean).join(' ');
  const ti = tage.findIndex(t => t.datum <= today() && today() <= t.bis);
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Form im Verlauf">
    <line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="zero"/>
    <polyline points="${line('formPlan', () => true)}" class="plan"/>
    <polyline points="${line('form', t => !t.prognose)}" class="ist"/>
    <polyline points="${line('form', (t, i) => t.prognose || (tage[i + 1]?.prognose ?? false))}" class="prog"/>
    ${ti >= 0 ? `<line x1="${x(ti)}" x2="${x(ti)}" y1="0" y2="${H}" class="heute"/>` : ''}
  </svg><div class="meta small">Form im Wochenschnitt bis zum Renntag</div><div class="legend"><span class="l-plan">Plan</span><span class="l-ist">Du</span><span class="l-prog">Prognose</span></div>`;
}

function standView() {
  const z = zustand;
  const t = z?.tage.find(t => t.datum === today()) || z?.tage[0];
  const p = prognose();
  const diff = t ? Math.round(t.form - t.formPlan) : 0;
  const lage = !z?.letzter ? 'Noch keine Ergebnisse eingetragen, die Werte zeigen den Plan.'
    : diff < -15 ? 'Du bist müder als geplant. Die App entschärft die nächsten harten Einheiten.'
    : diff > 15 ? 'Du bist frischer als geplant, vermutlich durch ausgefallene Einheiten.'
    : 'Du liegst im Plan.';
  return `<section class="card"><h3>Trainingszustand heute</h3>
      <div class="kpis">
        <div><b>${Math.round(t?.fitness ?? 0)}</b><span>Fitness</span></div>
        <div><b>${Math.round(t?.ermuedung ?? 0)}</b><span>Ermüdung</span></div>
        <div><b>${Math.round(t?.form ?? 0)}</b><span>Form (Plan ${Math.round(t?.formPlan ?? 0)})</span></div>
      </div><p class="meta">${lage}</p>${z ? chart(z.tage) : ''}</section>
    <section class="card"><h3>Geschätzte Ironman-Zeit</h3>
      <div class="total">${hms(p.total)}</div>
      ${p.teile.map(t => `<div class="row"><span>${SPORTS[t.sport]?.icon || '⏱'} ${t.name}</span><b>${t.min ? hms(t.min) : '–'}</b></div>
        <div class="meta small">${t.detail}${t.n ? `, ${t.n} Einheiten der letzten 8 Wochen` : ''}</div>`).join('')}
      <p class="meta">${p.ausDaten ? 'Grobe Schätzung aus deinen heutigen Trainingsdaten, wird mit jedem Training genauer.' : 'Sobald Ergebnisse da sind, rechnet die App mit deinen echten Tempos.'}</p>
    </section>
    <h3 class="section">Wettkämpfe und deine Ziele</h3>
    ${(plan.wettkaempfe || []).filter(w => w.datum >= today()).map(wettkampfHtml).join('')}`;
}

function wettkampfHtml(w) {
  const h = hochrechnung(w);
  const mein = ziele[w.datum];
  const pct = h?.chance != null ? Math.round(h.chance * 100) : null;
  const farbe = pct == null ? '' : pct >= 65 ? 'gut' : pct >= 35 ? 'mittel' : 'schlecht';
  const d = parse(w.datum);
  return `<section class="card race">
    <div class="row"><b>${esc(w.name)}</b><span class="meta">${fmt(d)}${d.getFullYear()} · in ${h?.tageBis ?? '–'} Tagen</span></div>
    <div class="meta small">Plan-Ziel: ${esc(w.ziel)}</div>
    ${h ? `<div class="row"><span>Hochrechnung am Renntag</span><b>${hms(h.zeit)}</b></div>
    <div class="meta small">${h.ausDaten ? 'Aus deinen heutigen Tempos' : 'Noch ohne Trainingsdaten, ausgehend vom Plan-Ziel'}, wenn du weiter ${Math.round(h.treue * 100)} % des Plans schaffst${zustand?.letzter ? ' (wie in den letzten 4 Wochen)' : ''}.</div>` : ''}
    <form class="goal" data-datum="${w.datum}">
      <label for="ziel-${w.datum}">Mein Ziel</label>
      <input id="ziel-${w.datum}" name="ziel" placeholder="z.B. ${hms(w.zielMin).replace(/:00$/, '')}" value="${mein ? hms(mein) : ''}" inputmode="numeric">
      <button class="primary" type="submit">Speichern</button>
    </form>
    ${pct != null ? `<div class="chance ${farbe}"><div class="bar"><span style="width:${pct}%"></span></div>
      <b>${pct} %</b><span>Wahrscheinlichkeit, dass du ${hms(mein)} schaffst</span></div>` : ''}
  </section>`;
}

function gewichtCard() {
  const woche = monday(new Date()), n = gewicht.filter(g => g.datum >= iso(woche)).length;
  const heute = gewicht.find(g => g.datum === today());
  const soll = weekOf(new Date())?.gewichtSoll;
  return `<form class="card weight" id="gewicht-form">
    <div class="row"><b>⚖️ Gewicht</b><span class="meta">${n}/3 Messungen diese Woche${soll ? ` · Ziel ${zahl(soll)} kg` : ''}</span></div>
    <div class="goal"><label for="gewicht-kg">Heute (kg)</label>
    <input id="gewicht-kg" name="kg" inputmode="decimal" value="${heute ? zahl(heute.kg) : ''}" placeholder="83,0">
    <button class="primary" type="submit">Speichern</button></div>
  </form>`;
}

function einstellungenView() {
  const f = (k, label, type = 'text', hint = '') => `<label class="wide">${label}<input name="${k}" type="${type}" value="${esc(lokal[k] ?? plan.einstellungen?.[k] ?? '')}">${hint ? `<small>${hint}</small>` : ''}</label>`;
  return `<form class="card settings" id="settings">
    <h3>Garmin über intervals.icu</h3>
    <p class="meta small">1. Auf intervals.icu ein Konto anlegen und unter Settings Garmin Connect verbinden.<br>
    2. Unter Settings, Developer Settings einen API Key erzeugen. Dort steht auch deine Athlete ID (z.B. i123456).<br>
    3. Beides hier eintragen. Die App holt dann deine Trainings bei jedem Öffnen und mit ⟳.</p>
    ${f('athleteId', 'Athlete ID')}
    ${f('apiKey', 'API Key', 'password', 'Bleibt nur auf diesem Handy gespeichert.')}
    <h3>Werte für die Berechnung</h3>
    ${f('hfMax', 'Maximalpuls', 'number')}
    ${f('ruhepuls', 'Ruhepuls', 'number')}
    ${f('ftp', 'FTP Velo (Watt)', 'number')}
    ${f('startFitness', 'Startwert Fitness', 'number')}
    <div class="actions wide"><button type="submit" class="primary">Speichern</button></div>
    <h3>Sicherung</h3>
    <p class="meta small">Deine Einträge liegen auf diesem Handy. Mit der Sicherung kannst du sie auf ein anderes Gerät mitnehmen.</p>
    <div class="actions wide"><button type="button" data-action="export">Sicherung herunterladen</button>
    <label class="button">Sicherung laden<input type="file" accept="application/json" id="import" hidden></label></div>
  </form>`;
}

function render() {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.getElementById('pager').hidden = !['tag', 'woche', 'essen'].includes(view);
  const label = document.getElementById('label');
  if (view === 'tag') label.textContent = iso(cursor) === today() ? `Heute, ${fmt(cursor)}` : fmt(cursor);
  if (view === 'woche') {
    const s = monday(cursor), e = addDays(s, 6);
    label.textContent = `KW ${kw(s)} · ${s.getDate()}.${s.getMonth() + 1}.–${e.getDate()}.${e.getMonth() + 1}.`;
  }
  if (view === 'essen') label.textContent = iso(cursor) === today() ? `Heute, ${fmt(cursor)}` : fmt(cursor);
  document.getElementById('content').innerHTML =
    { tag: tagView, woche: wocheView, stand: standView, grafik: grafikView, essen: essenView, einstellungen: einstellungenView }[view]();
}

function neuRechnen() {
  zuordnen();
  berechneAnpassungen();
  zustand = berechneZustand(true);
  render();
}

function renderHeader() {
  const w = plan.wettkampf;
  if (!w) return;
  document.getElementById('race').textContent = w.name;
  const tage = Math.round((parse(w.datum) - startOfDay(new Date())) / 864e5);
  document.getElementById('countdown').textContent = tage > 0 ? `Noch ${tage} Tage` : tage === 0 ? 'Heute ist Renntag!' : '';
}

// ---------- Garmin-Sync ----------

async function sync(still) {
  const id = setting('athleteId'), key = setting('apiKey');
  if (!id || !key) { if (!still) { view = 'einstellungen'; render(); toast('Bitte zuerst intervals.icu verbinden.'); } return; }
  const btn = document.getElementById('sync');
  btn.classList.add('spin');
  try {
    const oldest = plan.wochen[0]?.von || iso(addDays(new Date(), -90));
    const url = `https://intervals.icu/api/v1/athlete/${encodeURIComponent(id)}/activities?oldest=${oldest}&newest=${today()}`;
    const res = await fetch(url, { headers: { Authorization: 'Basic ' + btoa('API_KEY:' + key) } });
    if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Athlete ID oder API Key stimmt nicht.' : `Fehler ${res.status}`);
    const data = await res.json();
    aktivitaeten = data.map(a => ({
      id: a.id, start_date_local: a.start_date_local, type: a.type, name: a.name, moving_time: a.moving_time,
      elapsed_time: a.elapsed_time, distance: a.distance, average_heartrate: a.average_heartrate, max_heartrate: a.max_heartrate,
      icu_average_watts: a.icu_average_watts, average_watts: a.average_watts, total_elevation_gain: a.total_elevation_gain
    })).filter(a => a.start_date_local);
    save('aktivitaeten', aktivitaeten);
    save('letzterSync', Date.now());
    neuRechnen();
    if (!still) toast(`${aktivitaeten.length} Trainings von Garmin geladen.`);
  } catch (e) {
    if (!still) toast(e.message.startsWith('Failed') ? 'Keine Verbindung zu intervals.icu.' : e.message);
  } finally { btn.classList.remove('spin'); }
}

// ---------- Ereignisse ----------

function speichern(form) {
  const v = Object.fromEntries(new FormData(form));
  const n = k => v[k] ? Number(String(v[k]).replace(',', '.')) || null : null;
  const u = plan.einheiten.find(e => e.id === form.dataset.id);
  ergebnisse[u.id] = { datum: u.datum, sport: u.sport, dauer: n('dauer'), distanz: n('distanz'), puls: n('puls'),
    maxPuls: n('maxPuls'), gefuehl: n('gefuehl'), notiz: v.notiz || '', quelle: 'manuell', watt: garmin[u.id]?.watt };
  save('ergebnisse', ergebnisse);
  offen = null;
  neuRechnen();
}

document.querySelector('.tabs').addEventListener('click', e => {
  const v = e.target.closest('button')?.dataset.view;
  if (v) { view = v; offen = null; if (v === 'tag' || v === 'essen') cursor = startOfDay(new Date()); render(); scrollTo(0, 0); }
});
document.getElementById('prev').onclick = () => { cursor = addDays(cursor, view === 'woche' ? -7 : -1); offen = null; render(); };
document.getElementById('next').onclick = () => { cursor = addDays(cursor, view === 'woche' ? 7 : 1); offen = null; render(); };
document.getElementById('label').onclick = () => { cursor = startOfDay(new Date()); render(); };
document.getElementById('sync').onclick = () => sync(false);

const content = document.getElementById('content');
content.addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const id = b.dataset.id || b.closest('form')?.dataset.id;
  const u = plan.einheiten.find(x => x.id === id);
  switch (b.dataset.action) {
    case 'eintragen': offen = id; render(); break;
    case 'schliessen': offen = null; render(); break;
    case 'geplant': {
      const a = anp[id];
      ergebnisse[id] = { datum: u.datum, sport: u.sport, dauer: a?.dauer ?? u.dauer, distanz: a?.distanz ?? u.distanz, quelle: 'manuell' };
      save('ergebnisse', ergebnisse); neuRechnen(); break;
    }
    case 'loeschen': delete ergebnisse[id]; save('ergebnisse', ergebnisse); offen = null; neuRechnen(); break;
    case 'krank': {
      const d = b.dataset.datum;
      krank.has(d) ? krank.delete(d) : krank.add(d);
      save('krank', [...krank]); neuRechnen();
      if (krank.has(d)) toast('Gute Besserung! Die nächsten Tage werden automatisch angepasst.');
      break;
    }
    case 'export': {
      const blob = new Blob([JSON.stringify({ ergebnisse, krank: [...krank], gewicht, ziele, essen: essenSicherung(), einstellungen: { ...lokal, apiKey: undefined } }, null, 1)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `ironman-sicherung-${today()}.json` });
      a.click(); break;
    }
  }
});
content.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.classList.contains('goal') && e.target.dataset.datum) {
    const v = e.target.ziel.value.trim(), d = e.target.dataset.datum;
    if (!v) delete ziele[d];
    else { const m = parseZeit(v); if (!m) return toast('Bitte als Stunden:Minuten eingeben, z.B. 12:30.'); ziele[d] = m; }
    save('ziele', ziele); render(); return;
  }
  if (e.target.id === 'gewicht-form') {
    const kg = Number(e.target.kg.value.replace(',', '.'));
    if (!(kg > 30 && kg < 250)) return toast('Bitte ein Gewicht in kg eingeben.');
    gewicht = gewicht.filter(g => g.datum !== today()).concat({ datum: today(), kg }).sort((a, b) => a.datum.localeCompare(b.datum));
    save('gewicht', gewicht); toast('Gewicht gespeichert.'); render(); return;
  }
  if (e.target.dataset.essen) return; // Essen hat eigene Formulare
  if (e.target.id === 'settings') {
    const v = Object.fromEntries(new FormData(e.target));
    for (const k in v) {
      const s = v[k].trim();
      if (!s) delete lokal[k]; else lokal[k] = ['athleteId', 'apiKey'].includes(k) ? s : Number(s);
    }
    save('einstellungen', lokal); toast('Gespeichert.'); neuRechnen();
    if (lokal.athleteId && lokal.apiKey) sync(false);
  } else speichern(e.target);
});
content.addEventListener('change', async e => {
  if (e.target.id !== 'import' || !e.target.files[0]) return;
  try {
    const d = JSON.parse(await e.target.files[0].text());
    ergebnisse = d.ergebnisse || {}; krank = new Set(d.krank || []);
    gewicht = d.gewicht || []; ziele = d.ziele || {}; save('gewicht', gewicht); save('ziele', ziele);
    if (d.essen) essenLaden(d.essen);
    lokal = { ...d.einstellungen, apiKey: lokal.apiKey };
    save('ergebnisse', ergebnisse); save('krank', [...krank]); save('einstellungen', lokal);
    toast('Sicherung geladen.'); neuRechnen();
  } catch { toast('Diese Datei ist keine gültige Sicherung.'); }
});

fetch('plan.json').then(r => r.json()).then(p => {
  plan = p;
  const zaehler = {};
  for (const u of plan.einheiten) {
    const k = `${u.datum}-${u.sport}`;
    zaehler[k] = (zaehler[k] || 0) + 1;
    u.id = `${k}-${zaehler[k]}`;
    (byDate[u.datum] ||= []).push(u);
  }
  renderHeader();
  neuRechnen();
  if (Date.now() - load('letzterSync', 0) > 15 * 60e3) sync(true);
}).catch(() => { content.innerHTML = '<div class="empty">Plan konnte nicht geladen werden</div>'; });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
