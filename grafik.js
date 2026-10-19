// Grafikseite: Wochenwerte aus Plan und Ergebnissen, gezeichnet als SVG
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function wochenWerte() {
  return (plan.wochen || []).map(w => {
    const x = { woche: w, vorbei: w.von <= today(), soll: 0, ist: 0, laufKm: [0, 0], veloH: [0, 0], schwimmKm: [0, 0], puls: [0, 0], kg: [], sport: {} };
    for (let d = parse(w.von); iso(d) <= w.bis; d = addDays(d, 1)) {
      const key = iso(d);
      const rs = (byDate[key] || []).map(u => ({ u, r: ergebnis(u) }));
      for (const { u, r } of rs) {
        x.soll += (u.dauer || 0) / 60;
        if (u.sport === 'lauf') x.laufKm[0] += u.distanz || 0;
        if (u.sport === 'rad') x.veloH[0] += (u.dauer || 0) / 60;
        if (u.sport === 'schwimmen') x.schwimmKm[0] += u.distanz || 0;
      }
      const ist = rs.filter(o => o.r).map(o => ({ ...o.r, sport: o.u.sport })).concat(extras[key] || []);
      for (const r of ist) {
        x.ist += (r.dauer || 0) / 60;
        if (r.sport === 'lauf') x.laufKm[1] += r.distanz || 0;
        if (r.sport === 'rad') x.veloH[1] += (r.dauer || 0) / 60;
        if (r.sport === 'schwimmen') x.schwimmKm[1] += r.distanz || 0;
        if (r.puls && (r.sport === 'lauf' || r.sport === 'rad')) { x.puls[0] += r.puls * r.dauer; x.puls[1] += r.dauer; }
      }
      x.kg.push(...gewicht.filter(g => g.datum === key).map(g => g.kg));
    }
    return x;
  });
}

function skala(max) {
  if (max <= 0) return { max: 1, step: 0.5 };
  const roh = max / 3, p = 10 ** Math.floor(Math.log10(roh));
  const step = [1, 2, 2.5, 5, 10].map(f => f * p).find(s => s >= roh);
  return { max: Math.ceil(max / step) * step, step };
}

function achsen(W, H, L, B, lo, hi, step, n, labelAt) {
  let g = '';
  for (let v = lo; v <= hi + 1e-9; v += step) {
    const y = 6 + (hi - v) * (H - B - 6) / (hi - lo || 1);
    g += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" class="grid"/><text x="${L - 4}" y="${y + 3}" class="ax" text-anchor="end">${zahl(v, 1)}</text>`;
  }
  for (let i = 0; i < n; i++) {
    const t = labelAt(i);
    if (t) g += `<text x="${L + (i + 0.5) * (W - L) / n}" y="${H - 4}" class="ax" text-anchor="middle">${t}</text>`;
  }
  return g;
}

function monatsLabel(werte) {
  return i => {
    // Label in der ersten vollen Woche eines Monats, damit sich nichts überlappt
    const d = parse(werte[i].woche.von);
    return d.getDate() <= 7 && (i > 0 || d.getDate() === 1) ? MONATE[d.getMonth()] : '';
  };
}

// Säulen pro Woche: Soll hell, Ist in Farbe
function wochenChart(werte, pick, farbe, einheit) {
  const W = 340, H = 150, L = 30, B = 16, n = werte.length;
  const { max, step } = skala(Math.max(...werte.map(w => Math.max(...pick(w)))));
  const y = v => 6 + (max - v) * (H - B - 6) / max, bw = (W - L) / n;
  let bars = '';
  werte.forEach((w, i) => {
    const [soll, ist] = pick(w), x = L + i * bw;
    if (soll) bars += `<rect x="${x + 1}" y="${y(soll)}" width="${bw - 2}" height="${y(0) - y(soll)}" class="soll"/>`;
    if (w.vorbei && ist) bars += `<rect x="${x + bw * 0.2}" y="${y(ist)}" width="${bw * 0.6}" height="${y(0) - y(ist)}" style="fill:${farbe}"/>`;
  });
  const ti = werte.findIndex(w => w.woche.von <= today() && today() <= w.woche.bis);
  const heute = ti >= 0 ? `<line x1="${L + (ti + 0.5) * bw}" x2="${L + (ti + 0.5) * bw}" y1="0" y2="${H - B}" class="heute"/>` : '';
  const akt = werte[ti] ? pick(werte[ti]) : null;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">${achsen(W, H, L, B, 0, max, step, n, monatsLabel(werte))}${bars}${heute}</svg>
    <div class="legend"><span class="l-soll">Soll</span><span style="--lc:${farbe}" class="l-farbe">Ist</span>${akt ? `<span>Diese Woche ${zahl(akt[1])} / ${zahl(akt[0])} ${einheit}</span>` : ''}</div>`;
}

// Linien über die Zeit; reihen: [{werte:[{x(0..1), v, gestrichelt}], farbe, name}]
function linienChart(reihen, xLabels, minNull) {
  const W = 340, H = 150, L = 30, B = 16;
  const alle = reihen.flatMap(r => r.punkte.map(p => p.v));
  if (!alle.length) return '<p class="meta">Noch keine Daten.</p>';
  let lo = Math.min(...alle), hi = Math.max(...alle);
  if (minNull) lo = Math.min(0, lo);
  const pad = (hi - lo) * 0.1 || 1; lo -= minNull && lo === 0 ? 0 : pad; hi += pad;
  const { step } = skala(hi - lo);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const x = f => L + f * (W - L), y = v => 6 + (hi - v) * (H - B - 6) / (hi - lo);
  let g = achsen(W, H, L, B, lo, hi, step, xLabels.length, i => xLabels[i]);
  for (const r of reihen) {
    const teile = [[]];
    r.punkte.forEach((p, i) => {
      if (i && p.gestrichelt !== r.punkte[i - 1].gestrichelt) teile.push([r.punkte[i - 1]]);
      teile.at(-1).push(p);
    });
    for (const t of teile) if (t.length > 1)
      g += `<polyline points="${t.map(p => `${x(p.x)},${y(p.v)}`).join(' ')}" style="stroke:${r.farbe}" class="${t.at(-1).gestrichelt ? 'dash' : ''} ${r.klasse || ''}"/>`;
    if (r.punktZeichnen) g += r.punkte.map(p => `<circle cx="${x(p.x)}" cy="${y(p.v)}" r="3" style="fill:${r.farbe}"/>`).join('');
  }
  if (lo < 0 && hi > 0) g += `<line x1="${L}" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="zero"/>`;
  const ti = zustand?.tage.findIndex(t => t.datum === today());
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">${g}</svg>
    <div class="legend">${reihen.filter(r => r.name).map(r => `<span style="--lc:${r.farbe}" class="l-farbe">${r.name}</span>`).join('')}</div>`;
}

function grafikView() {
  const werte = wochenWerte();
  if (!werte.length) return '<div class="empty">Kein Plan geladen</div>';
  const n = werte.length, labels = werte.map((_, i) => monatsLabel(werte)(i));
  const tage = zustand?.tage || [];
  const tx = i => (i + 0.5) / tage.length;
  const zustandChart = linienChart([
    { name: 'Fitness', farbe: 'var(--schwimmen)', punkte: tage.map((t, i) => ({ x: tx(i), v: t.fitness, gestrichelt: t.prognose })) },
    { name: 'Ermüdung', farbe: 'var(--lauf)', punkte: tage.map((t, i) => ({ x: tx(i), v: t.ermuedung, gestrichelt: t.prognose })) },
    { name: 'Form', farbe: 'var(--accent)', punkte: tage.map((t, i) => ({ x: tx(i), v: t.form, gestrichelt: t.prognose })) }
  ], tage.map(t => { const d = parse(t.datum); return d.getDate() === 1 ? MONATE[d.getMonth()] : ''; }), false);

  // Stunden nach Sportart bis heute
  const sp = {};
  for (const u of plan.einheiten) {
    if (u.datum > today() || !u.dauer) continue;
    const x = sp[u.sport] ||= { soll: 0, ist: 0 };
    x.soll += u.dauer / 60; x.ist += (ergebnis(u)?.dauer || 0) / 60;
  }
  for (const d in extras) if (d <= today()) for (const r of extras[d]) (sp[r.sport] ||= { soll: 0, ist: 0 }).ist += r.dauer / 60;
  const spMax = Math.max(1, ...Object.values(sp).flatMap(v => [v.soll, v.ist]));
  const sportBars = Object.keys(sp).length ? Object.entries(sp).map(([k, v]) => `<div class="hbar">
      <span>${SPORTS[k]?.icon || ''} ${SPORTS[k]?.name || k}</span>
      <div class="track"><i class="soll" style="width:${v.soll / spMax * 100}%"></i><i style="width:${v.ist / spMax * 100}%;background:var(--${k})"></i></div>
      <b>${zahl(v.ist)} / ${zahl(v.soll)} h</b></div>`).join('') : '<p class="meta">Ab dem ersten Plantag siehst du hier deine Stunden.</p>';

  // Gewicht: Messungen und Wochenziel
  const start = parse(werte[0].woche.von), ende = addDays(parse(werte.at(-1).woche.bis), 1), span = ende - start;
  const gx = datum => (parse(datum) - start) / span;
  const gewichtChart = linienChart([
    { name: 'Ziel', farbe: 'var(--muted)', klasse: 'dash', punkte: werte.filter(w => w.woche.gewichtSoll).map(w => ({ x: gx(w.woche.von), v: w.woche.gewichtSoll })) },
    { name: 'Gemessen', farbe: 'var(--accent)', punktZeichnen: true, punkte: gewicht.filter(g => g.datum >= iso(start)).map(g => ({ x: gx(g.datum), v: g.kg })) }
  ], labels, false);

  const pulsWerte = werte.map((w, i) => ({ x: (i + 0.5) / n, v: w.puls[1] ? w.puls[0] / w.puls[1] : null })).filter(p => p.v);
  const pulsChart = pulsWerte.length ? linienChart([{ name: 'Ø Puls Lauf und Velo', farbe: 'var(--lauf)', punktZeichnen: true, punkte: pulsWerte }], labels, false)
    : '<p class="meta">Sobald Läufe oder Velofahrten mit Puls da sind, erscheint hier dein Wochenschnitt.</p>';

  const box = (titel, inhalt, extra = '') => `<section class="card"><h3>${titel}</h3>${extra}${inhalt}</section>`;
  return box('Wochenstunden: Ist gegen Soll', wochenChart(werte, w => [w.soll, w.ist], 'var(--accent)', 'h'))
    + box('Trainingszustand', zustandChart, '<p class="meta small">Fitness (42 Tage), Ermüdung (7 Tage), Form = Fitness minus Ermüdung. Gestrichelt: Prognose, wenn du dem Plan folgst.</p>')
    + box('Stunden nach Sportart bis heute', sportBars)
    + box('Laufkilometer pro Woche', wochenChart(werte, w => w.laufKm, 'var(--lauf)', 'km'))
    + box('Velostunden pro Woche', wochenChart(werte, w => w.veloH, 'var(--rad)', 'h'))
    + box('Schwimmkilometer pro Woche', wochenChart(werte, w => w.schwimmKm, 'var(--schwimmen)', 'km'))
    + box('Körpergewicht', gewichtChart, gewichtCard().replace('class="card weight"', 'class="weight inner"'))
    + box('Durchschnittspuls pro Woche', pulsChart);
}
