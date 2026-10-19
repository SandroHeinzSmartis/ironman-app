// Nährwerte pro 100 g (bei Getränken pro 100 ml). Richtwerte aus gängigen Nährwerttabellen.
// Felder: kcal, kh (Kohlenhydrate), zucker, ew (Eiweiss), fett, bst (Ballaststoffe), salz; alle in g ausser kcal.
// stueck: Gramm pro Stück, fluessig: zählt zur Trinkmenge
const NAEHRWERTE = ['kcal', 'kh', 'zucker', 'ew', 'fett', 'bst', 'salz'];
const NAEHRWERT_NAME = { kcal: 'Energie', kh: 'Kohlenhydrate', zucker: 'davon Zucker', ew: 'Eiweiss', fett: 'Fett', bst: 'Ballaststoffe', salz: 'Salz' };
const LEBENSMITTEL = [
  ['Haferflocken', 370, 59, 1, 13.5, 7, 10, 0],
  ['Müesli', 370, 62, 15, 10, 7, 8, 0.1],
  ['Vollkornbrot', 220, 38, 3, 8, 2, 7, 1.1],
  ['Zopf', 300, 47, 5, 9, 8, 2, 1.1],
  ['Reis, roh', 350, 78, 0.2, 7, 0.6, 1.4, 0],
  ['Reis, gekocht', 130, 28, 0.1, 2.7, 0.3, 0.4, 0],
  ['Teigwaren, roh', 355, 71, 3, 13, 1.5, 3, 0],
  ['Teigwaren, gekocht', 150, 30, 0.6, 5.5, 0.8, 1.8, 0],
  ['Kartoffeln', 75, 16, 0.8, 2, 0.1, 1.8, 0],
  ['Süsskartoffeln', 86, 20, 4.2, 1.6, 0.1, 3, 0.1],
  ['Quinoa, roh', 368, 64, 0, 14, 6, 7, 0],
  ['Banane', 95, 21, 17, 1.1, 0.3, 1.7, 0, { stueck: 120 }],
  ['Apfel', 54, 12, 10, 0.3, 0.2, 2.4, 0, { stueck: 150 }],
  ['Beeren, gemischt', 45, 7, 6, 1, 0.4, 4, 0],
  ['Datteln, getrocknet', 280, 65, 63, 2.5, 0.4, 7, 0, { stueck: 8 }],
  ['Honig', 305, 76, 76, 0.4, 0, 0, 0],
  ['Konfitüre', 250, 60, 50, 0.4, 0.1, 1, 0],
  ['Milch 3,5 %', 64, 4.8, 4.8, 3.3, 3.5, 0, 0.1, { fluessig: true }],
  ['Joghurt nature', 61, 4.7, 4.7, 3.5, 3, 0, 0.1],
  ['Skyr / Magerquark', 63, 4, 4, 11, 0.2, 0, 0.1],
  ['Hüttenkäse', 100, 3, 3, 12, 4.5, 0, 0.8],
  ['Hartkäse', 400, 0, 0, 27, 32, 0, 1.5],
  ['Ei', 140, 0.7, 0.7, 12.5, 9.5, 0, 0.4, { stueck: 60 }],
  ['Pouletbrust', 110, 0, 0, 23, 1.5, 0, 0.2],
  ['Rindshackfleisch', 220, 0, 0, 20, 15, 0, 0.2],
  ['Lachs', 200, 0, 0, 20, 13, 0, 0.1],
  ['Thunfisch in Wasser', 110, 0, 0, 25, 1, 0, 0.9],
  ['Tofu', 145, 2, 0.6, 15, 8, 1, 0],
  ['Linsen, roh', 340, 50, 2, 25, 1.5, 11, 0],
  ['Kichererbsen, gekocht', 140, 19, 0.8, 7.5, 2.5, 6.5, 0.2],
  ['Broccoli', 34, 4, 1.7, 3, 0.4, 2.6, 0],
  ['Spinat', 23, 1.4, 0.4, 2.9, 0.4, 2.2, 0.1],
  ['Tomaten', 18, 2.6, 2.6, 0.9, 0.2, 1.2, 0],
  ['Tomatensauce', 45, 7, 5, 1.5, 1, 1.5, 0.8],
  ['Peperoni', 30, 5, 4.5, 1, 0.3, 2, 0],
  ['Rüebli', 36, 7, 5, 0.8, 0.2, 2.8, 0.1],
  ['Zwiebel', 40, 8, 4, 1.2, 0.1, 1.8, 0],
  ['Salat, gemischt', 15, 2, 1.5, 1.3, 0.2, 1.5, 0],
  ['Avocado', 160, 1.9, 0.7, 2, 15, 6.7, 0],
  ['Olivenöl', 884, 0, 0, 0, 100, 0, 0],
  ['Butter', 740, 0.6, 0.6, 0.7, 82, 0, 0],
  ['Mandeln', 600, 6, 4, 21, 52, 12, 0],
  ['Erdnussbutter', 600, 13, 5, 25, 50, 6, 1],
  ['Dunkle Schokolade', 550, 35, 28, 8, 40, 10, 0],
  ['Proteinpulver (Whey)', 380, 6, 4, 78, 6, 0, 0.6],
  ['Orangensaft', 45, 10, 9, 0.7, 0.1, 0.3, 0, { fluessig: true }],
  ['Energiegel', 270, 67, 30, 0, 0, 0, 0.4, { stueck: 40, sport: true }],
  ['Energieriegel', 380, 66, 30, 6, 8, 4, 0.3, { stueck: 50, sport: true }],
  ['Isogetränk', 30, 7.5, 6, 0, 0, 0, 0.12, { fluessig: true, sport: true }],
  ['Cola', 42, 10.6, 10.6, 0, 0, 0, 0, { fluessig: true }],
  ['Bier alkoholfrei', 25, 5.5, 3, 0.4, 0, 0, 0, { fluessig: true }],
  ['Wasser', 0, 0, 0, 0, 0, 0, 0, { fluessig: true, sport: true }]
].map(([name, kcal, kh, zucker, ew, fett, bst, salz, extra]) => ({ name, kcal, kh, zucker, ew, fett, bst, salz, ...extra }));

// Beispielrezepte, damit der Essensplan nicht leer startet
const BEISPIEL_REZEPTE = [
  { id: 'r-oats', name: 'Overnight Oats mit Beeren', beispiel: true, zutaten: [['Haferflocken', 80], ['Milch 3,5 %', 200], ['Skyr / Magerquark', 150], ['Beeren, gemischt', 100], ['Honig', 10]] },
  { id: 'r-bowl', name: 'Poulet-Reis-Bowl', beispiel: true, zutaten: [['Reis, roh', 100], ['Pouletbrust', 180], ['Broccoli', 150], ['Peperoni', 80], ['Olivenöl', 10]] },
  { id: 'r-pasta', name: 'Pasta Bolognese', beispiel: true, zutaten: [['Teigwaren, roh', 130], ['Rindshackfleisch', 150], ['Tomatensauce', 200], ['Zwiebel', 50], ['Hartkäse', 15], ['Salat, gemischt', 100]] },
  { id: 'r-lachs', name: 'Lachs mit Süsskartoffeln', beispiel: true, zutaten: [['Lachs', 150], ['Süsskartoffeln', 300], ['Spinat', 150], ['Olivenöl', 10]] },
  { id: 'r-snack', name: 'Brot mit Erdnussbutter und Banane', beispiel: true, zutaten: [['Vollkornbrot', 100], ['Erdnussbutter', 20], ['Banane', 120]] },
  { id: 'r-recovery', name: 'Recovery-Shake', beispiel: true, zutaten: [['Milch 3,5 %', 300], ['Proteinpulver (Whey)', 30], ['Banane', 120], ['Haferflocken', 30]] }
];
