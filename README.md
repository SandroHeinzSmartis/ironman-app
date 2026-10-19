# Ironman Trainingsplan (Web-App)

Persönliche App für Sandros Ironman Switzerland 2027 (Thun, 4.7.2027). Läuft im Browser auf iPhone und Android und lässt sich zum Homescreen hinzufügen.

## Was die App kann
- **Heute:** Einheit(en) des Tages mit allen Infos aus dem Plan, Wochenphase und Wochenhinweis.
- **Ergebnisse:** kommen automatisch von Garmin über intervals.icu (⟳ oder beim Öffnen) oder per Hand („Wie geplant“ / „Ergebnis eintragen“). Zuordnung: gleicher Tag, gleiche Sportart. Nicht geplante Trainings erscheinen als „Zusätzlich“.
- **Automatische Anpassung** (gilt nur für heute und die Zukunft, Rennen werden nie verändert):
  - „Ich bin heute krank“: Einheiten fallen aus, danach n+1 Tage (max. 5) nur locker, 50–70 % Dauer, Kraft halbiert, Tests verschieben.
  - Form mehr als 15 unter Plan: harte Einheiten der nächsten 3 Tage werden Grundlage mit 80 % Dauer.
  - Letzte lockere Einheit mit Gefühl ≥ 8 oder Ø Puls über Z2: heute und morgen 85 % Dauer.
  - Verpasste Einheiten werden nicht nachgeholt.
- **Stand:** Fitness (42 Tage), Ermüdung (7 Tage), Form wie im Excel-Blatt „Trainingszustand“, Verlauf Plan gegen Ist.
- **Zielzeit:** aus den letzten 8 Wochen. Schwimmen: Median-Tempo × 38 × 0,95 (Neopren). Velo: Median-Tempo der Fahrten ≥ 60 min × 0,93 (2200 Hm). Lauf: bester Lauf ≥ 5 km per Riegel auf Marathon, × 1,25 nach dem Rad. Wechsel 12 min. Ohne Daten gelten die Plan-Ziele vom Renntag.

Einträge, Krankheitstage und Einstellungen liegen im Speicher des Handys (Sicherung unter ⚙).

- **Wettkämpfe:** Neujahrsmarathon, Halbmarathon-Test, Zürich Marathon, Spiezathlon, Ironman. Pro Wettkampf eigenes Ziel; die App rechnet die Zeit am Renntag hoch (heutige Schätzung × (Fitness heute / Fitness am Renntag)^0,15, Fitness am Renntag bei gleicher Planerfüllung wie in den letzten 4 Wochen) und gibt die Wahrscheinlichkeit an (Normalverteilung, Streuung 2,5–7,5 % je nach Abstand zum Rennen, +3 % ohne Trainingsdaten).
- **Grafik:** Wochenstunden, Trainingszustand, Stunden nach Sportart, Lauf-km, Velostunden, Schwimm-km, Gewicht (Eingabe 3× pro Woche auch auf „Heute“), Ø Puls.
- **Essen:** Tagebuch mit allen Nährwerten und Sollwerten (Grundbedarf kg × 24 × 1,3 plus Training nach MET; KH 4–8 g/kg je nach Trainingsdauer; Eiweiss 1,8 g/kg; Fett Rest, mind. 1 g/kg; Wasser 35 ml/kg + 600 ml pro Trainingsstunde), Verpflegung pro Einheit (ab 75 min 60 g KH/h, im Rennen 80 g, 600 ml/h), Wasserzähler, Essensplan pro Wochentag, Einkaufsliste, eigene Lebensmittel. Nährwerte in lebensmittel.js sind Richtwerte.

## Plan aktualisieren
Excel ändern, dann:
```
python3 tools/excel_zu_plan.py ../Trainingsplan_Ironman_2027.xlsx plan.json 2026-10-20
```
Das Datum am Ende lässt alles davor weg. Testversion als eine Datei bauen:
```
python3 tools/testversion.py ironman-test.html
```

## Lokal ansehen
`python3 -m http.server` im Ordner starten und `http://localhost:8000` öffnen.
