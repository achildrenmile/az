const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = '/var/www/arbeitszeit/arbeitszeit.db';
const db = new Database(dbPath);

console.log('Demo-Daten-Generator gestartet...\n');

// Foreign Keys temporär deaktivieren
db.pragma('foreign_keys = OFF');

// Hilfsfunktion für zufällige Auswahl
const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// ============================================
// 1. ALTE DATEN LÖSCHEN
// ============================================
console.log('=== Lösche alte Daten ===');

// Zeiteinträge löschen
const deletedZeiteintraege = db.prepare('DELETE FROM zeiteintraege').run();
console.log(`Zeiteinträge gelöscht: ${deletedZeiteintraege.changes}`);

// Kunden löschen
const deletedKunden = db.prepare('DELETE FROM kunden').run();
console.log(`Kunden gelöscht: ${deletedKunden.changes}`);

// Baustellen löschen
const deletedBaustellen = db.prepare('DELETE FROM baustellen').run();
console.log(`Baustellen gelöscht: ${deletedBaustellen.changes}`);

// Alte Mitarbeiter löschen (außer admin)
const deletedMitarbeiter = db.prepare('DELETE FROM mitarbeiter WHERE mitarbeiter_nr != ?').run('admin');
console.log(`Mitarbeiter gelöscht: ${deletedMitarbeiter.changes}`);

// Audit-Log leeren
const deletedAudit = db.prepare('DELETE FROM audit_log').run();
console.log(`Audit-Log gelöscht: ${deletedAudit.changes}`);

console.log('');

// ============================================
// 2. NEUE MITARBEITER ERSTELLEN
// ============================================
console.log('=== Erstelle 10 neue Mitarbeiter ===');

const mitarbeiterNamen = [
  { nr: '001', name: 'Thomas Huber' },
  { nr: '002', name: 'Michael Gruber' },
  { nr: '003', name: 'Stefan Bauer' },
  { nr: '004', name: 'Andreas Pichler' },
  { nr: '005', name: 'Markus Wagner' },
  { nr: '006', name: 'Christian Müller' },
  { nr: '007', name: 'Wolfgang Schmidt' },
  { nr: '008', name: 'Martin Hofer' },
  { nr: '009', name: 'Peter Steiner' },
  { nr: '010', name: 'Josef Maier' }
];

const pinHash = bcrypt.hashSync('1234', 10);
const insertMitarbeiter = db.prepare(`
  INSERT INTO mitarbeiter (mitarbeiter_nr, name, pin_hash, ist_admin, aktiv)
  VALUES (?, ?, ?, 0, 1)
`);

mitarbeiterNamen.forEach(m => {
  insertMitarbeiter.run(m.nr, m.name, pinHash);
  console.log(`Mitarbeiter erstellt: ${m.nr} - ${m.name}`);
});

console.log('');

// ============================================
// 3. NEUE KUNDEN ERSTELLEN (40 + "-" für Regie)
// ============================================
console.log('=== Erstelle 40 neue Kunden + Regiekunde ===');

const kundenDaten = [
  { name: '-', ort: '', notizen: 'Platzhalter für Regiearbeiten' },
  { name: 'Gemeinde Innsbruck', ort: 'Innsbruck', notizen: 'Öffentlicher Auftraggeber' },
  { name: 'Stadt Salzburg', ort: 'Salzburg', notizen: 'Öffentlicher Auftraggeber' },
  { name: 'Wohnbau GmbH', ort: 'Wien', notizen: 'Wohnbauprojekte' },
  { name: 'Tiroler Landesregierung', ort: 'Innsbruck', notizen: 'Behörde' },
  { name: 'ASFINAG', ort: 'Wien', notizen: 'Autobahnprojekte' },
  { name: 'ÖBB Infrastruktur', ort: 'Wien', notizen: 'Bahnprojekte' },
  { name: 'Baumeister Schneider GmbH', ort: 'Linz', notizen: 'Generalunternehmer' },
  { name: 'Immobilien Huber KG', ort: 'Graz', notizen: 'Privatinvestor' },
  { name: 'Hotel Alpenblick', ort: 'Kitzbühel', notizen: 'Hotelrenovierung' },
  { name: 'Sparkasse Tirol', ort: 'Innsbruck', notizen: 'Filialen-Umbau' },
  { name: 'Raiffeisen Bank', ort: 'Schwaz', notizen: 'Neubau Filiale' },
  { name: 'SPAR Österreich', ort: 'Salzburg', notizen: 'Markt-Renovierungen' },
  { name: 'Hofer KG', ort: 'Sattledt', notizen: 'Filialneubau' },
  { name: 'Elektro Müller GmbH', ort: 'Wörgl', notizen: 'Industriekunde' },
  { name: 'Metallbau Stadler', ort: 'Hall in Tirol', notizen: 'Gewerbebau' },
  { name: 'Zimmerei Berger', ort: 'Schwaz', notizen: 'Kooperationspartner' },
  { name: 'Architekt DI Moser', ort: 'Innsbruck', notizen: 'Planungsbüro' },
  { name: 'Ing. Planungsbüro Wolf', ort: 'Kufstein', notizen: 'Statik & Planung' },
  { name: 'Wohnanlage Sonnenhof', ort: 'Innsbruck', notizen: 'Wohnbauprojekt' },
  { name: 'Autohaus Mayr', ort: 'Telfs', notizen: 'Werkstatterweiterung' },
  { name: 'Gasthof Goldener Adler', ort: 'Innsbruck', notizen: 'Renovierung' },
  { name: 'Tischlerei Holzmann', ort: 'Rum', notizen: 'Werkstattneubau' },
  { name: 'Bäckerei Ruetz', ort: 'Kematen', notizen: 'Filialerweiterung' },
  { name: 'Metzgerei Kröll', ort: 'Fulpmes', notizen: 'Umbau' },
  { name: 'Privatstiftung Maier', ort: 'Innsbruck', notizen: 'Villa-Sanierung' },
  { name: 'Familie Oberhofer', ort: 'Axams', notizen: 'EFH Neubau' },
  { name: 'Familie Kirchmair', ort: 'Völs', notizen: 'EFH Sanierung' },
  { name: 'Familie Egger', ort: 'Natters', notizen: 'EFH Umbau' },
  { name: 'Familie Winkler', ort: 'Patsch', notizen: 'EFH Neubau' },
  { name: 'Sporthotel Igls', ort: 'Igls', notizen: 'Wellness-Erweiterung' },
  { name: 'Bergbahnen Stubai', ort: 'Neustift', notizen: 'Stationsgebäude' },
  { name: 'Schigebiet Axamer Lizum', ort: 'Axams', notizen: 'Infrastruktur' },
  { name: 'Tennishalle West', ort: 'Innsbruck', notizen: 'Hallensanierung' },
  { name: 'Fußballverein FC Tirol', ort: 'Innsbruck', notizen: 'Vereinsheim' },
  { name: 'Pfarre St. Jakob', ort: 'Innsbruck', notizen: 'Kirchensanierung' },
  { name: 'Pfarre Wilten', ort: 'Innsbruck', notizen: 'Pfarrheim-Umbau' },
  { name: 'Volksschule Pradl', ort: 'Innsbruck', notizen: 'Schulsanierung' },
  { name: 'Gymnasium Sillgasse', ort: 'Innsbruck', notizen: 'Turnhalle' },
  { name: 'Universität Innsbruck', ort: 'Innsbruck', notizen: 'Campus-Erweiterung' },
  { name: 'MCI Innsbruck', ort: 'Innsbruck', notizen: 'Laborausbau' }
];

const insertKunde = db.prepare(`
  INSERT INTO kunden (name, ansprechpartner, strasse, plz, ort, telefon, email, notizen, aktiv)
  VALUES (?, '', '', '', ?, '', '', ?, 1)
`);

kundenDaten.forEach(k => {
  insertKunde.run(k.name, k.ort, k.notizen);
  console.log(`Kunde erstellt: ${k.name}`);
});

console.log('');

// ============================================
// 4. NEUE BAUSTELLEN ERSTELLEN (40)
// ============================================
console.log('=== Erstelle 40 neue Baustellen ===');

const baustellenDaten = [
  { name: 'Regiearbeiten allgemein', kunde: '-', adresse: 'Diverse' },
  { name: 'Rathausplatz Sanierung', kunde: 'Gemeinde Innsbruck', adresse: 'Rathausplatz 1, Innsbruck' },
  { name: 'Mozartplatz Umbau', kunde: 'Stadt Salzburg', adresse: 'Mozartplatz, Salzburg' },
  { name: 'Wohnpark Sonnental', kunde: 'Wohnbau GmbH', adresse: 'Sonnental 15-25, Wien' },
  { name: 'Landhausplatz Erweiterung', kunde: 'Tiroler Landesregierung', adresse: 'Landhausplatz 1, Innsbruck' },
  { name: 'A13 Brückensanierung', kunde: 'ASFINAG', adresse: 'A13 km 45, Brenner' },
  { name: 'Bahnhof Innsbruck Umbau', kunde: 'ÖBB Infrastruktur', adresse: 'Südtiroler Platz 7, Innsbruck' },
  { name: 'Bürogebäude Schneider', kunde: 'Baumeister Schneider GmbH', adresse: 'Industriestraße 12, Linz' },
  { name: 'Wohnanlage Graz-Ost', kunde: 'Immobilien Huber KG', adresse: 'Ostgasse 45, Graz' },
  { name: 'Hotel Alpenblick Wellness', kunde: 'Hotel Alpenblick', adresse: 'Vorderstadt 22, Kitzbühel' },
  { name: 'Filiale Innsbruck Zentrum', kunde: 'Sparkasse Tirol', adresse: 'Maria-Theresien-Str. 36, Innsbruck' },
  { name: 'Raiffeisen Neubau Schwaz', kunde: 'Raiffeisen Bank', adresse: 'Franz-Josef-Str. 18, Schwaz' },
  { name: 'SPAR Markt Höttinger Au', kunde: 'SPAR Österreich', adresse: 'Höttinger Au 73, Innsbruck' },
  { name: 'Hofer Filiale Wörgl', kunde: 'Hofer KG', adresse: 'Gewerbepark 5, Wörgl' },
  { name: 'Elektro Müller Halle 2', kunde: 'Elektro Müller GmbH', adresse: 'Industriezone 8, Wörgl' },
  { name: 'Metallbau Stadler Werkstatt', kunde: 'Metallbau Stadler', adresse: 'Gewerbestraße 22, Hall' },
  { name: 'Zimmerei Lagerhalle', kunde: 'Zimmerei Berger', adresse: 'Handwerkerzone 5, Schwaz' },
  { name: 'Büro DI Moser Umbau', kunde: 'Architekt DI Moser', adresse: 'Museumstraße 8, Innsbruck' },
  { name: 'Planungsbüro Wolf Erweiterung', kunde: 'Ing. Planungsbüro Wolf', adresse: 'Unterer Stadtplatz 3, Kufstein' },
  { name: 'Sonnenhof Bau A', kunde: 'Wohnanlage Sonnenhof', adresse: 'Sonnenstraße 10, Innsbruck' },
  { name: 'Sonnenhof Bau B', kunde: 'Wohnanlage Sonnenhof', adresse: 'Sonnenstraße 12, Innsbruck' },
  { name: 'Autohaus Mayr Erweiterung', kunde: 'Autohaus Mayr', adresse: 'Bundesstraße 45, Telfs' },
  { name: 'Goldener Adler Restaurant', kunde: 'Gasthof Goldener Adler', adresse: 'Herzog-Friedrich-Str. 6, Innsbruck' },
  { name: 'Tischlerei Holzmann Neubau', kunde: 'Tischlerei Holzmann', adresse: 'Serlesweg 18, Rum' },
  { name: 'Bäckerei Ruetz Filiale', kunde: 'Bäckerei Ruetz', adresse: 'Dorfstraße 42, Kematen' },
  { name: 'Metzgerei Kröll Umbau', kunde: 'Metzgerei Kröll', adresse: 'Hauptstraße 15, Fulpmes' },
  { name: 'Villa Maier Sanierung', kunde: 'Privatstiftung Maier', adresse: 'Höhenstraße 88, Innsbruck' },
  { name: 'EFH Oberhofer', kunde: 'Familie Oberhofer', adresse: 'Bergweg 12, Axams' },
  { name: 'EFH Kirchmair', kunde: 'Familie Kirchmair', adresse: 'Dorfstraße 28, Völs' },
  { name: 'EFH Egger', kunde: 'Familie Egger', adresse: 'Waldweg 5, Natters' },
  { name: 'EFH Winkler', kunde: 'Familie Winkler', adresse: 'Sonnhang 9, Patsch' },
  { name: 'Sporthotel Wellness', kunde: 'Sporthotel Igls', adresse: 'Hilberstraße 17, Igls' },
  { name: 'Bergstation Stubai', kunde: 'Bergbahnen Stubai', adresse: 'Stubaier Gletscher, Neustift' },
  { name: 'Talstation Axamer Lizum', kunde: 'Schigebiet Axamer Lizum', adresse: 'Lizum 4, Axams' },
  { name: 'Tennishalle Sanierung', kunde: 'Tennishalle West', adresse: 'Sportplatzweg 12, Innsbruck' },
  { name: 'FC Tirol Vereinsheim', kunde: 'Fußballverein FC Tirol', adresse: 'Tivoli-Stadion, Innsbruck' },
  { name: 'St. Jakob Kirchendach', kunde: 'Pfarre St. Jakob', adresse: 'Pfarrgasse 1, Innsbruck' },
  { name: 'Pfarrheim Wilten', kunde: 'Pfarre Wilten', adresse: 'Wiltener Platz 3, Innsbruck' },
  { name: 'VS Pradl Pausenhof', kunde: 'Volksschule Pradl', adresse: 'Pradler Platz 8, Innsbruck' },
  { name: 'Gymnasium Turnhalle', kunde: 'Gymnasium Sillgasse', adresse: 'Sillgasse 10, Innsbruck' }
];

const insertBaustelle = db.prepare(`
  INSERT INTO baustellen (name, kunde, adresse, notizen, aktiv)
  VALUES (?, ?, ?, '', 1)
`);

baustellenDaten.forEach(b => {
  insertBaustelle.run(b.name, b.kunde, b.adresse);
  console.log(`Baustelle erstellt: ${b.name}`);
});

console.log('');

// ============================================
// 5. ZEITEINTRÄGE FÜR 6 MONATE ERSTELLEN
// ============================================
console.log('=== Erstelle Zeiteinträge für 6 Monate ===');

// Hole alle Mitarbeiter-IDs
const mitarbeiter = db.prepare('SELECT id, name FROM mitarbeiter WHERE mitarbeiter_nr != ?').all('admin');
console.log(`Gefundene Mitarbeiter: ${mitarbeiter.length}`);

// Hole alle Kunden-Namen
const kunden = db.prepare('SELECT name FROM kunden').all().map(k => k.name);
console.log(`Gefundene Kunden: ${kunden.length}`);

// Hole alle Baustellen-Namen
const baustellen = db.prepare('SELECT name FROM baustellen').all().map(b => b.name);
console.log(`Gefundene Baustellen: ${baustellen.length}`);

// Zeitraum: 1. Juli 2025 bis 29. Dezember 2025 (ca. 6 Monate)
const startDatum = new Date('2025-07-01');
const endDatum = new Date('2025-12-29');

// Mögliche Arbeitszeiten
const arbeitsbeginnOptionen = ['06:00', '06:30', '07:00', '07:30', '08:00'];
const arbeitsdauerMinuten = [480, 510, 540, 570, 600]; // 8h, 8.5h, 9h, 9.5h, 10h
const pausenOptionen = [30, 30, 30, 45, 60];

// Mögliche Anfahrten
const anfahrten = ['', '15 min', '20 min', '30 min', '45 min', '1 h', 'Innsbruck', 'Wattens', 'Hall', 'Schwaz', 'Wörgl'];

// Mögliche Notizen
const notizenOptionen = [
  '',
  '',
  '',
  'Rohbau',
  'Innenausbau',
  'Elektroinstallation',
  'Sanitärinstallation',
  'Malerarbeiten',
  'Bodenverlegung',
  'Fassadenarbeiten',
  'Dacharbeiten',
  'Gerüstbau',
  'Betonarbeiten',
  'Maurerarbeiten',
  'Abbrucharbeiten',
  'Aufräumarbeiten',
  'Material geholt',
  'Nachbesserung',
  'Abnahme',
  'Regiearbeit für Kunde'
];

const insertZeiteintrag = db.prepare(`
  INSERT INTO zeiteintraege (mitarbeiter_id, datum, arbeitsbeginn, arbeitsende, pause_minuten, baustelle, kunde, anfahrt, notizen)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let eintraegeCount = 0;

// Für jeden Tag im Zeitraum
let currentDate = new Date(startDatum);
while (currentDate <= endDatum) {
  const dayOfWeek = currentDate.getDay();

  // Nur Werktage (Montag bis Freitag)
  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    // Für jeden Mitarbeiter (zufällig ob er an diesem Tag arbeitet)
    mitarbeiter.forEach(m => {
      // 85% Chance, dass der Mitarbeiter an diesem Tag arbeitet
      if (Math.random() < 0.85) {
        const datum = currentDate.toISOString().split('T')[0];
        const arbeitsbeginn = randomChoice(arbeitsbeginnOptionen);
        const dauer = randomChoice(arbeitsdauerMinuten);
        const pause = randomChoice(pausenOptionen);

        // Arbeitsende berechnen
        const [startH, startM] = arbeitsbeginn.split(':').map(Number);
        const endMinuten = startH * 60 + startM + dauer + pause;
        const endH = Math.floor(endMinuten / 60);
        const endM = endMinuten % 60;
        const arbeitsende = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

        // Zufällige Baustelle und Kunde
        const baustelle = randomChoice(baustellen);
        // Kunde passend zur Baustelle finden oder zufällig
        const baustellenObj = baustellenDaten.find(b => b.name === baustelle);
        const kunde = baustellenObj ? baustellenObj.kunde : randomChoice(kunden);

        const anfahrt = randomChoice(anfahrten);
        const notizen = randomChoice(notizenOptionen);

        insertZeiteintrag.run(m.id, datum, arbeitsbeginn, arbeitsende, pause, baustelle, kunde, anfahrt, notizen);
        eintraegeCount++;
      }
    });
  }

  // Gelegentlich Samstagsarbeit (10% Chance)
  if (dayOfWeek === 6 && Math.random() < 0.10) {
    // 2-4 zufällige Mitarbeiter arbeiten am Samstag
    const samstagsArbeiter = mitarbeiter.filter(() => Math.random() < 0.3);
    samstagsArbeiter.forEach(m => {
      const datum = currentDate.toISOString().split('T')[0];
      const arbeitsbeginn = randomChoice(['07:00', '07:30', '08:00']);
      const dauer = randomChoice([300, 360, 420]); // 5h, 6h, 7h
      const pause = 30;

      const [startH, startM] = arbeitsbeginn.split(':').map(Number);
      const endMinuten = startH * 60 + startM + dauer + pause;
      const endH = Math.floor(endMinuten / 60);
      const endM = endMinuten % 60;
      const arbeitsende = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

      const baustelle = randomChoice(baustellen);
      const baustellenObj = baustellenDaten.find(b => b.name === baustelle);
      const kunde = baustellenObj ? baustellenObj.kunde : randomChoice(kunden);

      insertZeiteintrag.run(m.id, datum, arbeitsbeginn, arbeitsende, pause, baustelle, kunde, '', 'Samstagsarbeit');
      eintraegeCount++;
    });
  }

  // Nächster Tag
  currentDate.setDate(currentDate.getDate() + 1);
}

console.log(`\nZeiteinträge erstellt: ${eintraegeCount}`);

// ============================================
// ZUSAMMENFASSUNG
// ============================================
console.log('\n========================================');
console.log('DEMO-DATEN ERFOLGREICH ERSTELLT');
console.log('========================================');

const countMitarbeiter = db.prepare('SELECT COUNT(*) as c FROM mitarbeiter WHERE mitarbeiter_nr != ?').get('admin').c;
const countKunden = db.prepare('SELECT COUNT(*) as c FROM kunden').get().c;
const countBaustellen = db.prepare('SELECT COUNT(*) as c FROM baustellen').get().c;
const countZeiteintraege = db.prepare('SELECT COUNT(*) as c FROM zeiteintraege').get().c;

console.log(`Mitarbeiter: ${countMitarbeiter}`);
console.log(`Kunden: ${countKunden}`);
console.log(`Baustellen: ${countBaustellen}`);
console.log(`Zeiteinträge: ${countZeiteintraege}`);
console.log('\nAlle Mitarbeiter können sich mit PIN "1234" anmelden.');
console.log('Admin-Login: admin / 1234');

// Foreign Keys wieder aktivieren
db.pragma('foreign_keys = ON');

db.close();
