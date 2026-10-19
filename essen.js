// Essensseite: Tagebuch mit Sollwerten, Wasser, Verpflegung im Training, Essensplan, Einkaufsliste, Lebensmittel
const SLOTS = ['Frühstück', 'Mittagessen', 'Abendessen', 'Snacks'];
const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
// Energieverbrauch pro Stunde = MET × kg, MET je Sportart, Faktor je Intensität
const MET = { schwimmen: 7, rad: 7, lauf: 9, kraft: 5 };
const MET_FAKTOR = { Locker: 0.8, Grundlage: 1, Gemischt: 1.15, Hart: 1.3, Wettkampf: 1.25, Kraft: 1 };

let essenTab = 'tagebuch';
let essenOffen = null; // Slot, für den das Hinzufügen-Formular offen ist
let essenFrei = false; // freie Eingabe aller Nährwerte
let rezeptOffen = null;
let einkaufWoche = 0;
let essenTage = load('essen', {});
let eigene = load('eigeneLebensmittel', []);
let rezepte = load('rezepte', null) || BEISPIEL_REZEPTE.map(r => ({ ...r, zutaten: r.zutaten.map(z => [...z]) }));
let essensplan = load('essensplan', {});
let einkauf = load('einkauf', { haken: {}, extra: {} });

function essenSicherung() { return { tage: essenTage, eigene, rezepte, plan: essensplan, einkauf }; }
function essenLaden(d) {
  essenTage = d.tage || {}; eigene = d.eigene || []; rezepte = d.rezepte || rezepte; essensplan = d.plan || {}; einkauf = d.einkauf || { haken: {}, extra: {} };
  essenSpeichern();
}
function essenSpeichern() {
  save('essen', essenTage); save('eigeneLebensmittel', eigene); save('rezepte', rezepte); save('essensplan', essensplan); save('einkauf', einkauf);
}

function alleLebensmittel() { return [...eigene, ...LEBENSMITTEL]; }
function findeLebensmittel(name) { return alleLebensmittel().find(l => l.name.toLowerCase() === String(name).trim().toLowerCase()); }
function leer() { return Object.fromEntries(NAEHRWERTE.map(k => [k, 0])); }
function addiere(a, b, f = 1) { for (const k of NAEHRWERTE) a[k] += (b[k] || 0) * f; return a; }

function rezeptWerte(r) {
  const n = leer(); let ml = 0;
  for (const [name, g] of r.zutaten) { const l = findeLebensmittel(name); if (l) { addiere(n, l, g / 100); if (l.fluessig) ml += g; } }
  return { n, ml };
}

function tag(datum) { return essenTage[datum] ||= { wasser: 0, eintraege: [] }; }
function wochentag(datum) { return WOCHENTAGE[(parse(datum).getDay() + 6) % 7]; }

// ---------- Sollwerte ----------

function kgAm(datum) {
  const g = gewicht.filter(x => x.datum <= datum).at(-1);
  return g?.kg ?? (plan.wochen || []).find(w => w.von <= datum && datum <= w.bis)?.gewichtSoll ?? plan.wochen?.[0]?.gewichtSoll ?? 80;
}

function trainingAm(datum) {
  return (byDate[datum] || []).filter(u => u.sport !== 'ruhetag' && !anp[u.id]?.ausgefallen).map(u => {
    const r = ergebnis(u), a = anp[u.id];
    return { u, dauer: r?.dauer ?? a?.dauer ?? u.dauer ?? 0, intensitaet: a?.intensitaet ?? u.intensitaet };
  });
}

function verpflegungSoll(t) {
  const h = t.dauer / 60;
  if (t.u.sport === 'kraft' || t.dauer < 45) return null;
  if (t.dauer < 75) return { kh: 0, ml: Math.round(400 * h / 50) * 50, salz: 0 };
  const khH = t.intensitaet === 'Wettkampf' ? 80 : 60;
  return { kh: Math.round(khH * h / 5) * 5, ml: Math.round(600 * h / 50) * 50, salz: Math.round(h * 10) / 10 };
}

function sollAm(datum) {
  const kg = kgAm(datum), tr = trainingAm(datum);
  const h = tr.reduce((s, t) => s + t.dauer, 0) / 60;
  const training = tr.reduce((s, t) => s + (MET[t.u.sport] || 6) * (MET_FAKTOR[t.intensitaet] || 1) * kg * t.dauer / 60, 0);
  const kcal = Math.round((kg * 24 * 1.3 + training) / 10) * 10;
  const kh = Math.round(kg * (h < 0.75 ? 4 : h < 1.5 ? 5.5 : h < 2.5 ? 7 : 8));
  const ew = Math.round(kg * 1.8);
  return { kg, h, kcal, kh, ew, fett: Math.round(Math.max(kg, (kcal - 4 * kh - 4 * ew) / 9)), bst: 30, salz: Math.round((6 + h) * 10) / 10,
    zucker: null, wasser: Math.round((35 * kg + 600 * h) / 50) * 50 };
}

function istAm(datum) {
  const t = tag(datum), n = leer(); let ml = t.wasser || 0;
  for (const e of t.eintraege) { addiere(n, e.n); ml += e.ml || 0; }
  return { ...n, wasser: ml };
}

// ---------- Darstellung ----------

function balken(label, ist, soll, einheit, n = 0) {
  const pct = soll ? Math.min(100, ist / soll * 100) : 0;
  const zustand = !soll ? '' : ist > soll * 1.1 ? 'ueber' : ist >= soll * 0.9 ? 'ok' : '';
  return `<div class="nbar ${zustand}"><span>${label}</span><b>${zahl(ist, n)}${soll ? ` / ${zahl(soll, n)}` : ''} ${einheit}</b>
    ${soll ? `<div class="track"><i style="width:${pct}%"></i></div>` : ''}</div>`;
}

function eintragHtml(e, datum) {
  return `<div class="food"><div><b>${esc(e.name)}</b> <span class="meta small">${e.menge ? `${zahl(e.menge, 0)} ${e.einheit}` : ''}</span>
    <div class="meta small">${Math.round(e.n.kcal)} kcal · KH ${zahl(e.n.kh)} g · EW ${zahl(e.n.ew)} g · Fett ${zahl(e.n.fett)} g${e.ml ? ` · ${e.ml} ml` : ''}</div></div>
    <button class="x" data-ea="loeschen" data-datum="${datum}" data-id="${e.id}" aria-label="Löschen">×</button></div>`;
}

function hinzufuegenForm(datum, slot) {
  const geplant = essensplan[wochentag(datum)]?.[slot];
  const r = rezepte.find(x => x.id === geplant);
  const vorschlag = r ? `<button type="button" data-ea="ausplan" data-datum="${datum}" data-slot="${slot}" class="primary">Aus Plan: ${esc(r.name)}</button>` : '';
  if (essenFrei) return `<form class="entry" data-essen="frei" data-datum="${datum}" data-slot="${slot}">
    <label class="wide">Bezeichnung<input name="name" required></label>
    ${NAEHRWERTE.map(k => `<label>${NAEHRWERT_NAME[k]} ${k === 'kcal' ? '(kcal)' : '(g)'}<input name="${k}" inputmode="decimal"></label>`).join('')}
    <label>Getrunken (ml)<input name="ml" inputmode="numeric"></label>
    <div class="actions wide"><button class="primary">Hinzufügen</button><button type="button" data-ea="modus">Aus Liste wählen</button><button type="button" data-ea="zu">Abbrechen</button></div></form>`;
  return `<form class="entry" data-essen="liste" data-datum="${datum}" data-slot="${slot}">
    ${vorschlag ? `<div class="actions wide">${vorschlag}</div>` : ''}
    <label class="wide">Lebensmittel oder Rezept<input name="name" list="essen-liste" required autocomplete="off" placeholder="z.B. Haferflocken"></label>
    <label class="wide">Menge (g oder ml, bei Rezepten Portionen, z.B. „2 Stück“)<input name="menge" placeholder="100" autocomplete="off"></label>
    <div class="actions wide"><button class="primary">Hinzufügen</button><button type="button" data-ea="modus">Nährwerte selbst eingeben</button><button type="button" data-ea="zu">Abbrechen</button></div>
    <datalist id="essen-liste">${rezepte.map(r => `<option value="Rezept: ${esc(r.name)}">`).join('')}${alleLebensmittel().map(l => `<option value="${esc(l.name)}">`).join('')}</datalist>
  </form>`;
}

function tagebuchView() {
  const datum = iso(cursor), soll = sollAm(datum), ist = istAm(datum), t = tag(datum);
  const tr = trainingAm(datum);
  const ziel = `<section class="card"><div class="row"><h3>Tagesziel</h3><span class="meta small">${tr.length ? `Trainingstag, ${hm(soll.h * 60)}` : 'Ruhetag'} · ${zahl(soll.kg)} kg</span></div>
    ${balken('Energie', ist.kcal, soll.kcal, 'kcal')}${balken('Kohlenhydrate', ist.kh, soll.kh, 'g')}${balken('Eiweiss', ist.ew, soll.ew, 'g')}
    ${balken('Fett', ist.fett, soll.fett, 'g')}${balken('Ballaststoffe', ist.bst, soll.bst, 'g')}${balken('Salz', ist.salz, soll.salz, 'g', 1)}
    ${balken('davon Zucker', ist.zucker, null, 'g')}
    <p class="meta small">Soll aus Gewicht und Training des Tages: Grundbedarf plus Trainingsverbrauch, Kohlenhydrate 4–8 g/kg je nach Trainingsdauer, Eiweiss 1,8 g/kg.</p></section>`;
  const wasser = `<section class="card water"><div class="row"><h3>💧 Wasser</h3><b>${zahl(ist.wasser / 1000, 2)} / ${zahl(soll.wasser / 1000, 2)} l</b></div>
    <div class="track big"><i style="width:${Math.min(100, ist.wasser / soll.wasser * 100)}%"></i></div>
    <div class="actions"><button data-ea="wasser" data-ml="250" data-datum="${datum}">+ 250 ml</button><button data-ea="wasser" data-ml="500" data-datum="${datum}">+ 500 ml</button>
    <button data-ea="wasser" data-ml="750" data-datum="${datum}">+ 750 ml</button><button data-ea="wasser" data-ml="-250" data-datum="${datum}">− 250 ml</button></div>
    <p class="meta small">Soll: 35 ml pro kg plus 600 ml pro Trainingsstunde. Getränke aus dem Tagebuch zählen mit.</p></section>`;

  const training = tr.map(x => {
    const s = verpflegungSoll(x), slot = 'training:' + x.u.id, es = t.eintraege.filter(e => e.slot === slot);
    const i = es.reduce((a, e) => ({ kh: a.kh + e.n.kh, ml: a.ml + (e.ml || 0), salz: a.salz + e.n.salz }), { kh: 0, ml: 0, salz: 0 });
    return `<section class="card slot"><div class="row"><h3>${SPORTS[x.u.sport]?.icon || ''} ${esc(x.u.titel)}</h3><span class="meta small">${hm(x.dauer)}</span></div>
      ${s ? `${s.kh ? balken('Kohlenhydrate', i.kh, s.kh, 'g') : ''}${balken('Trinken', i.ml, s.ml, 'ml')}${s.salz ? balken('Salz', i.salz, s.salz, 'g', 1) : ''}
        <p class="meta small">${s.kh ? `${x.intensitaet === 'Wettkampf' ? 80 : 60} g Kohlenhydrate und 600 ml pro Stunde, ab Minute 15.` : 'Unter 75 Minuten reicht Wasser.'}</p>`
      : '<p class="meta small">Keine Verpflegung nötig.</p>'}
      ${es.map(e => eintragHtml(e, datum)).join('')}
      <div class="actions"><button data-ea="schnell" data-name="Energiegel" data-menge="40" data-slot="${slot}" data-datum="${datum}">+ Gel</button>
      <button data-ea="schnell" data-name="Isogetränk" data-menge="500" data-slot="${slot}" data-datum="${datum}">+ Iso 500 ml</button>
      <button data-ea="schnell" data-name="Energieriegel" data-menge="50" data-slot="${slot}" data-datum="${datum}">+ Riegel</button>
      <button data-ea="schnell" data-name="Wasser" data-menge="500" data-slot="${slot}" data-datum="${datum}">+ Wasser 500 ml</button>
      <button data-ea="auf" data-slot="${slot}">Anderes</button></div>
      ${essenOffen === slot ? hinzufuegenForm(datum, slot) : ''}</section>`;
  }).join('');

  const slots = SLOTS.map(slot => {
    const es = t.eintraege.filter(e => e.slot === slot);
    const kcal = es.reduce((s, e) => s + e.n.kcal, 0);
    return `<section class="card slot"><div class="row"><h3>${slot}</h3><span class="meta small">${Math.round(kcal)} kcal</span></div>
      ${es.map(e => eintragHtml(e, datum)).join('')}
      ${essenOffen === slot ? hinzufuegenForm(datum, slot) : `<div class="actions"><button data-ea="auf" data-slot="${slot}">+ Hinzufügen</button>
      ${essensplan[wochentag(datum)]?.[slot] && !es.length ? `<button data-ea="ausplan" data-datum="${datum}" data-slot="${slot}">Aus Plan übernehmen</button>` : ''}</div>`}</section>`;
  }).join('');
  return ziel + wasser + slots + (tr.length ? `<h3 class="section">Verpflegung im Training</h3>${training}` : '');
}

function planView() {
  // Die nächsten 7 Tage ab heute, damit die Sollwerte zum jeweiligen Trainingstag passen
  const tage = [...Array(7)].map((_, k) => {
    const datum = iso(addDays(new Date(), k)), wt = wochentag(datum), soll = sollAm(datum), summe = leer();
    for (const slot of SLOTS) { const r = rezepte.find(x => x.id === essensplan[wt]?.[slot]); if (r) addiere(summe, rezeptWerte(r).n); }
    const diff = summe.kcal - soll.kcal;
    return `<section class="card"><div class="row"><h3>${fmt(parse(datum))}${k ? '' : ' · Heute'}</h3>
      <span class="meta small">${Math.round(summe.kcal)} / ${soll.kcal} kcal${summe.kcal ? ` · KH ${Math.round(summe.kh)}/${soll.kh} g · EW ${Math.round(summe.ew)}/${soll.ew} g` : ''}</span></div>
      ${SLOTS.map(slot => `<label class="planrow" for="plan-${wt}-${slot}"><span>${slot}</span>
        <select id="plan-${wt}-${slot}" data-ea-change="plan" data-wt="${wt}" data-slot="${slot}"><option value="">–</option>
        ${rezepte.map(r => `<option value="${r.id}" ${essensplan[wt]?.[slot] === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>`).join('')}
      ${summe.kcal ? `<p class="meta small">${Math.abs(diff) < soll.kcal * 0.1 ? 'Passt zum Soll.' : diff < 0 ? `Rund ${Math.round(-diff)} kcal unter dem Soll, Snacks einplanen.` : `Rund ${Math.round(diff)} kcal über dem Soll.`}</p>` : ''}
    </section>`;
  }).join('');

  const liste = rezepte.map(r => {
    const { n } = rezeptWerte(r);
    if (rezeptOffen === r.id) return `<form class="card entry" data-essen="rezept" data-id="${r.id}">
      <label class="wide">Name<input name="name" value="${esc(r.name)}" required></label>
      ${r.zutaten.map(([name, g], i) => `<label>Zutat<input name="z${i}" list="lm-liste" value="${esc(name)}"></label><label>Gramm / ml<input name="g${i}" inputmode="numeric" value="${g}"></label>`).join('')}
      <label>Neue Zutat<input name="zneu" list="lm-liste"></label><label>Gramm / ml<input name="gneu" inputmode="numeric"></label>
      <datalist id="lm-liste">${alleLebensmittel().map(l => `<option value="${esc(l.name)}">`).join('')}</datalist>
      <p class="meta small wide">Zutat leeren, um sie zu entfernen.</p>
      <div class="actions wide"><button class="primary">Speichern</button><button type="button" data-ea="rezeptloeschen" data-id="${r.id}">Rezept löschen</button><button type="button" data-ea="rezeptzu">Schliessen</button></div></form>`;
    return `<div class="food card"><div><b>${esc(r.name)}</b>${r.beispiel ? ' <span class="badge">Beispiel</span>' : ''}
      <div class="meta small">${Math.round(n.kcal)} kcal · KH ${Math.round(n.kh)} g · EW ${Math.round(n.ew)} g · Fett ${Math.round(n.fett)} g</div>
      <div class="meta small">${r.zutaten.map(([z, g]) => `${esc(z)} ${g} g`).join(', ')}</div></div>
      <button data-ea="rezeptauf" data-id="${r.id}" class="x" aria-label="Bearbeiten">✎</button></div>`;
  }).join('');
  return `<p class="meta">Wähle für jeden Wochentag deine Rezepte. Der Plan gilt jede Woche, bis du ihn änderst. Im Tagebuch kannst du geplante Mahlzeiten mit einem Tipp übernehmen.</p>
    ${tage}<h3 class="section">Rezepte (pro Portion)</h3>${liste}
    <div class="actions"><button class="primary" data-ea="rezeptneu">+ Neues Rezept</button></div>`;
}

function einkaufView() {
  const start = addDays(monday(new Date()), 7 * einkaufWoche), key = iso(start);
  const menge = {};
  WOCHENTAGE.forEach(wt => SLOTS.forEach(slot => {
    const r = rezepte.find(x => x.id === essensplan[wt]?.[slot]);
    if (r) for (const [name, g] of r.zutaten) menge[name] = (menge[name] || 0) + g;
  }));
  const haken = einkauf.haken[key] ||= {}, extra = einkauf.extra[key] ||= [];
  const item = (name, text) => `<label class="shop ${haken[name] ? 'done' : ''}" for="ek-${esc(name)}"><input type="checkbox" id="ek-${esc(name)}" data-ea-change="haken" data-key="${key}" data-name="${esc(name)}" ${haken[name] ? 'checked' : ''}><span>${text}</span></label>`;
  const posten = Object.entries(menge).sort((a, b) => a[0].localeCompare(b[0])).map(([name, g]) => {
    const l = findeLebensmittel(name), einheit = l?.fluessig ? 'ml' : 'g';
    const txt = l?.stueck ? `${esc(name)} <b>${Math.ceil(g / l.stueck)} Stück</b> <span class="meta small">(${Math.round(g)} ${einheit})</span>` : `${esc(name)} <b>${g >= 1000 ? zahl(g / 1000, 2) + (einheit === 'ml' ? ' l' : ' kg') : Math.round(g) + ' ' + einheit}</b>`;
    return item(name, txt);
  }).join('');
  return `<div class="tabs sub"><button data-ea="woche" data-w="0" class="${einkaufWoche === 0 ? 'active' : ''}">Diese Woche</button><button data-ea="woche" data-w="1" class="${einkaufWoche === 1 ? 'active' : ''}">Nächste Woche</button></div>
    <section class="card"><h3>Einkaufsliste ${start.getDate()}.${start.getMonth() + 1}.–${addDays(start, 6).getDate()}.${addDays(start, 6).getMonth() + 1}.</h3>
    ${posten || '<p class="meta">Noch leer. Lege im Essensplan Rezepte fest, dann erscheinen die Zutaten hier.</p>'}
    ${extra.map(x => item(x, esc(x))).join('')}
    <form class="goal" data-essen="extra" data-key="${key}"><label for="ek-neu">Weiteres</label><input id="ek-neu" name="text" placeholder="z.B. Duschmittel"><button class="primary">Hinzufügen</button></form>
    <div class="actions"><button data-ea="hakenreset" data-key="${key}">Alle Haken entfernen</button></div></section>`;
}

function lebensmittelView() {
  return `<form class="card entry" data-essen="eigenes"><h3 class="wide">Eigenes Lebensmittel</h3>
    <label class="wide">Name<input name="name" required></label>
    ${NAEHRWERTE.map(k => `<label>${NAEHRWERT_NAME[k]} ${k === 'kcal' ? '(kcal/100 g)' : '(g/100 g)'}<input name="${k}" inputmode="decimal"></label>`).join('')}
    <label>Gewicht pro Stück (g)<input name="stueck" inputmode="numeric"></label>
    <label class="check"><input type="checkbox" name="fluessig"> Getränk (zählt als Trinkmenge)</label>
    <div class="actions wide"><button class="primary">Speichern</button></div></form>
    <h3 class="section">Alle Lebensmittel (pro 100 g / 100 ml)</h3>
    ${alleLebensmittel().map(l => `<div class="food"><div><b>${esc(l.name)}</b>${eigene.includes(l) ? ' <span class="badge">Eigenes</span>' : ''}
      <div class="meta small">${l.kcal} kcal · KH ${zahl(l.kh)} · Zucker ${zahl(l.zucker)} · EW ${zahl(l.ew)} · Fett ${zahl(l.fett)} · Bst ${zahl(l.bst)} · Salz ${zahl(l.salz, 2)}${l.stueck ? ` · 1 Stück ${l.stueck} g` : ''}</div></div>
      ${eigene.includes(l) ? `<button class="x" data-ea="lmloeschen" data-name="${esc(l.name)}" aria-label="Löschen">×</button>` : ''}</div>`).join('')}
    <p class="meta small">Richtwerte aus gängigen Nährwerttabellen. Für genaue Werte die Verpackung nehmen und als eigenes Lebensmittel speichern.</p>`;
}

function essenView() {
  document.getElementById('pager').hidden = essenTab !== 'tagebuch';
  const tabs = [['tagebuch', 'Tagebuch'], ['plan', 'Essensplan'], ['einkauf', 'Einkauf'], ['lebensmittel', 'Lebensmittel']];
  return `<div class="tabs sub">${tabs.map(([k, n]) => `<button data-ea="tab" data-tab="${k}" class="${essenTab === k ? 'active' : ''}">${n}</button>`).join('')}</div>`
    + { tagebuch: tagebuchView, plan: planView, einkauf: einkaufView, lebensmittel: lebensmittelView }[essenTab]();
}

// ---------- Ereignisse ----------

function eintragAus(name, mengeText, slot) {
  const rName = name.replace(/^Rezept:\s*/, '');
  const r = name.startsWith('Rezept:') ? rezepte.find(x => x.name === rName) : null;
  const zahlTeil = Number(String(mengeText || '').replace(',', '.').match(/[\d.]+/)?.[0]);
  if (r) {
    const portionen = zahlTeil || 1, { n, ml } = rezeptWerte(r);
    return { slot, name: r.name, menge: portionen, einheit: portionen === 1 ? 'Portion' : 'Portionen', n: addiere(leer(), n, portionen), ml: Math.round(ml * portionen) };
  }
  const l = findeLebensmittel(name);
  if (!l) return null;
  const g = /st/i.test(mengeText || '') && l.stueck ? (zahlTeil || 1) * l.stueck : zahlTeil || l.stueck || 100;
  return { slot, name: l.name, menge: g, einheit: l.fluessig ? 'ml' : 'g', n: addiere(leer(), l, g / 100), ml: l.fluessig ? Math.round(g) : 0 };
}

function hinzu(datum, e) {
  tag(datum).eintraege.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ...e });
  essenSpeichern();
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-ea]');
  if (!b) return;
  const d = b.dataset;
  switch (d.ea) {
    case 'tab': essenTab = d.tab; essenOffen = null; break;
    case 'auf': essenOffen = d.slot; essenFrei = false; break;
    case 'zu': essenOffen = null; break;
    case 'modus': essenFrei = !essenFrei; break;
    case 'wasser': { const t = tag(d.datum); t.wasser = Math.max(0, (t.wasser || 0) + Number(d.ml)); essenSpeichern(); break; }
    case 'loeschen': { const t = tag(d.datum); t.eintraege = t.eintraege.filter(x => x.id !== d.id); essenSpeichern(); break; }
    case 'schnell': hinzu(d.datum, eintragAus(d.name, d.menge, d.slot)); toast(`${d.name} eingetragen.`); break;
    case 'ausplan': {
      const r = rezepte.find(x => x.id === essensplan[wochentag(d.datum)]?.[d.slot]);
      if (r) { hinzu(d.datum, eintragAus('Rezept: ' + r.name, '1', d.slot)); essenOffen = null; toast(`${r.name} eingetragen.`); }
      break;
    }
    case 'rezeptauf': rezeptOffen = d.id; break;
    case 'rezeptzu': rezeptOffen = null; break;
    case 'rezeptneu': { const r = { id: 'r-' + Date.now().toString(36), name: 'Neues Rezept', zutaten: [] }; rezepte.push(r); rezeptOffen = r.id; essenSpeichern(); break; }
    case 'rezeptloeschen':
      rezepte = rezepte.filter(r => r.id !== d.id);
      for (const wt in essensplan) for (const s in essensplan[wt]) if (essensplan[wt][s] === d.id) delete essensplan[wt][s];
      rezeptOffen = null; essenSpeichern(); break;
    case 'woche': einkaufWoche = Number(d.w); break;
    case 'hakenreset': einkauf.haken[d.key] = {}; essenSpeichern(); break;
    case 'lmloeschen': eigene = eigene.filter(l => l.name !== d.name); essenSpeichern(); break;
    default: return;
  }
  render();
});

document.addEventListener('change', e => {
  const d = e.target.dataset;
  if (d.eaChange === 'plan') {
    (essensplan[d.wt] ||= {})[d.slot] = e.target.value || undefined;
    if (!e.target.value) delete essensplan[d.wt][d.slot];
    essenSpeichern(); render();
  } else if (d.eaChange === 'haken') {
    (einkauf.haken[d.key] ||= {})[d.name] = e.target.checked;
    essenSpeichern(); e.target.closest('label').classList.toggle('done', e.target.checked);
  }
});

document.addEventListener('submit', e => {
  const f = e.target, art = f.dataset.essen;
  if (!art) return;
  e.preventDefault();
  const v = Object.fromEntries(new FormData(f));
  const num = k => Number(String(v[k] || '').replace(',', '.')) || 0;
  if (art === 'liste') {
    const eintrag = eintragAus(v.name, v.menge, f.dataset.slot);
    if (!eintrag) return toast('Dieses Lebensmittel kenne ich nicht. Wähle aus der Liste oder gib die Nährwerte selbst ein.');
    hinzu(f.dataset.datum, eintrag); essenOffen = null;
  } else if (art === 'frei') {
    const n = Object.fromEntries(NAEHRWERTE.map(k => [k, num(k)]));
    hinzu(f.dataset.datum, { slot: f.dataset.slot, name: v.name, menge: 0, einheit: '', n, ml: num('ml') }); essenOffen = null; essenFrei = false;
  } else if (art === 'rezept') {
    const r = rezepte.find(x => x.id === f.dataset.id);
    r.name = v.name.trim() || r.name; delete r.beispiel;
    const z = [];
    for (let i = 0; v['z' + i] !== undefined; i++) if (v['z' + i].trim()) z.push([v['z' + i].trim(), num('g' + i) || 100]);
    if (v.zneu?.trim()) z.push([v.zneu.trim(), num('gneu') || 100]);
    const unbekannt = z.filter(([n]) => !findeLebensmittel(n)).map(([n]) => n);
    r.zutaten = z.map(([n, g]) => [findeLebensmittel(n)?.name || n, g]);
    if (unbekannt.length) toast(`Ohne Nährwerte: ${unbekannt.join(', ')}. Unter Lebensmittel anlegen.`);
  } else if (art === 'extra') {
    if (v.text.trim()) (einkauf.extra[f.dataset.key] ||= []).push(v.text.trim());
  } else if (art === 'eigenes') {
    if (findeLebensmittel(v.name)) return toast('Ein Lebensmittel mit diesem Namen gibt es schon.');
    const l = { name: v.name.trim(), ...Object.fromEntries(NAEHRWERTE.map(k => [k, num(k)])) };
    if (num('stueck')) l.stueck = num('stueck');
    if (v.fluessig) l.fluessig = true;
    eigene.push(l); toast(`${l.name} gespeichert.`);
  }
  essenSpeichern(); render();
});
