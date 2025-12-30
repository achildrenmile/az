const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'arbeitszeit.db');
const db = new Database(dbPath);

// Tabellen erstellen
db.exec(`
  -- Mitarbeiter-Tabelle
  CREATE TABLE IF NOT EXISTS mitarbeiter (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mitarbeiter_nr TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    ist_admin INTEGER DEFAULT 0,
    aktiv INTEGER DEFAULT 1,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Zeiteinträge-Tabelle (AZG-konform)
  CREATE TABLE IF NOT EXISTS zeiteintraege (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mitarbeiter_id INTEGER NOT NULL,
    datum DATE NOT NULL,
    arbeitsbeginn TIME NOT NULL,
    arbeitsende TIME NOT NULL,
    pause_minuten INTEGER DEFAULT 0,
    baustelle TEXT,
    kunde TEXT,
    anfahrt TEXT,
    notizen TEXT,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id)
  );

  -- Index für schnellere Abfragen
  CREATE INDEX IF NOT EXISTS idx_zeiteintraege_datum ON zeiteintraege(datum);
  CREATE INDEX IF NOT EXISTS idx_zeiteintraege_mitarbeiter ON zeiteintraege(mitarbeiter_id);

  -- Sessions-Tabelle (persistent)
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    mitarbeiter_id INTEGER NOT NULL,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    laeuft_ab_am DATETIME NOT NULL,
    FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id)
  );

  -- Index für Session-Cleanup
  CREATE INDEX IF NOT EXISTS idx_sessions_ablauf ON sessions(laeuft_ab_am);

  -- Audit-Log für Änderungen (AZG-konform, unveränderlich)
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zeitpunkt DATETIME DEFAULT CURRENT_TIMESTAMP,
    mitarbeiter_id INTEGER NOT NULL,
    aktion TEXT NOT NULL,
    tabelle TEXT NOT NULL,
    datensatz_id INTEGER,
    alte_werte TEXT,
    neue_werte TEXT,
    ip_adresse TEXT,
    vorheriger_hash TEXT,
    eintrag_hash TEXT,
    FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id)
  );

  CREATE INDEX IF NOT EXISTS idx_audit_zeitpunkt ON audit_log(zeitpunkt);
  CREATE INDEX IF NOT EXISTS idx_audit_datensatz ON audit_log(tabelle, datensatz_id);

  -- Kunden-Tabelle
  CREATE TABLE IF NOT EXISTS kunden (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    ansprechpartner TEXT,
    strasse TEXT,
    plz TEXT,
    ort TEXT,
    telefon TEXT,
    email TEXT,
    notizen TEXT,
    aktiv INTEGER DEFAULT 1,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_kunden_name ON kunden(name);

  -- Baustellen-Tabelle
  CREATE TABLE IF NOT EXISTS baustellen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    kunde TEXT,
    adresse TEXT,
    notizen TEXT,
    aktiv INTEGER DEFAULT 1,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_baustellen_name ON baustellen(name);

  -- Pausenregeln-Tabelle (konfigurierbar, AZG §11)
  CREATE TABLE IF NOT EXISTS pausenregeln (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    min_arbeitszeit_minuten INTEGER NOT NULL,
    min_pause_minuten INTEGER NOT NULL,
    warnung_text TEXT,
    aktiv INTEGER DEFAULT 1,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Monatsbestätigung-Tabelle (Mitarbeiter-Bestätigung der Monatsabrechnung)
  CREATE TABLE IF NOT EXISTS monatsbestaetigung (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mitarbeiter_id INTEGER NOT NULL,
    jahr INTEGER NOT NULL,
    monat INTEGER NOT NULL,
    bestaetigt_am DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_adresse TEXT,
    kommentar TEXT,
    FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id),
    UNIQUE(mitarbeiter_id, jahr, monat)
  );

  CREATE INDEX IF NOT EXISTS idx_bestaetigung_mitarbeiter ON monatsbestaetigung(mitarbeiter_id);
  CREATE INDEX IF NOT EXISTS idx_bestaetigung_periode ON monatsbestaetigung(jahr, monat);

  -- Gleitzeit-Saldo-Tabelle (Periodenbasierte Salden)
  CREATE TABLE IF NOT EXISTS gleitzeit_saldo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mitarbeiter_id INTEGER NOT NULL,
    periode_start DATE NOT NULL,
    periode_ende DATE NOT NULL,
    soll_minuten INTEGER DEFAULT 0,
    ist_minuten INTEGER DEFAULT 0,
    saldo_minuten INTEGER DEFAULT 0,
    uebertrag_vorperiode INTEGER DEFAULT 0,
    uebertrag_naechste INTEGER DEFAULT 0,
    verfallen_minuten INTEGER DEFAULT 0,
    abgeschlossen INTEGER DEFAULT 0,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    aktualisiert_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id),
    UNIQUE(mitarbeiter_id, periode_start)
  );

  CREATE INDEX IF NOT EXISTS idx_gleitzeit_mitarbeiter ON gleitzeit_saldo(mitarbeiter_id);
  CREATE INDEX IF NOT EXISTS idx_gleitzeit_periode ON gleitzeit_saldo(periode_start, periode_ende);

  -- Kollektivverträge (KV) - Branchenspezifische Regelwerke
  CREATE TABLE IF NOT EXISTS kv_kollektivvertraege (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    beschreibung TEXT,
    branche TEXT,
    gueltig_ab DATE,
    gueltig_bis DATE,
    aktiv INTEGER DEFAULT 1,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_kv_name ON kv_kollektivvertraege(name);

  -- KV-Regeln - Konkrete Regeln pro Kollektivvertrag
  CREATE TABLE IF NOT EXISTS kv_regeln (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kv_id INTEGER NOT NULL,
    regel_typ TEXT NOT NULL,
    name TEXT NOT NULL,
    bedingung TEXT,
    wert REAL NOT NULL,
    einheit TEXT DEFAULT 'PROZENT',
    prioritaet INTEGER DEFAULT 0,
    aktiv INTEGER DEFAULT 1,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kv_id) REFERENCES kv_kollektivvertraege(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_kv_regeln_kv ON kv_regeln(kv_id);
  CREATE INDEX IF NOT EXISTS idx_kv_regeln_typ ON kv_regeln(regel_typ);

  -- KV-Gruppen - Mitarbeitergruppen pro Kollektivvertrag
  CREATE TABLE IF NOT EXISTS kv_gruppen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kv_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    beschreibung TEXT,
    standard_wochenstunden REAL DEFAULT 40,
    standard_monatsstunden REAL DEFAULT 173,
    aktiv INTEGER DEFAULT 1,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kv_id) REFERENCES kv_kollektivvertraege(id) ON DELETE CASCADE,
    UNIQUE(kv_id, name)
  );

  CREATE INDEX IF NOT EXISTS idx_kv_gruppen_kv ON kv_gruppen(kv_id);

  -- Admin-Benachrichtigungen
  CREATE TABLE IF NOT EXISTS admin_benachrichtigungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    typ TEXT NOT NULL,
    titel TEXT NOT NULL,
    nachricht TEXT NOT NULL,
    daten TEXT,
    gelesen INTEGER DEFAULT 0,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_benachrichtigung_typ ON admin_benachrichtigungen(typ);
  CREATE INDEX IF NOT EXISTS idx_benachrichtigung_gelesen ON admin_benachrichtigungen(gelesen);

  -- Löschprotokoll (DSGVO-konform)
  CREATE TABLE IF NOT EXISTS loeschprotokoll (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tabelle TEXT NOT NULL,
    anzahl_geloescht INTEGER NOT NULL,
    aeltester_eintrag DATE,
    loeschgrund TEXT,
    ausgefuehrt_von TEXT,
    ausgefuehrt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_loeschprotokoll_datum ON loeschprotokoll(ausgefuehrt_am);

  -- Leistungsnachweise-Tabelle (separates Modul, nicht AZ-relevant)
  CREATE TABLE IF NOT EXISTS leistungsnachweise (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    datum DATE NOT NULL,
    kunde_id INTEGER,
    baustelle_id INTEGER,
    kunde_freitext TEXT,
    baustelle_freitext TEXT,
    beschreibung TEXT NOT NULL,
    leistungszeit_von TIME,
    leistungszeit_bis TIME,
    leistungsdauer_minuten INTEGER,
    notizen TEXT,
    ersteller_id INTEGER NOT NULL,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    unterschrift_daten TEXT,
    unterschrift_name TEXT,
    unterschrift_zeitpunkt DATETIME,
    status TEXT DEFAULT 'entwurf' CHECK(status IN ('entwurf', 'unterschrieben', 'storniert')),
    storniert_am DATETIME,
    storniert_von INTEGER,
    storno_grund TEXT,
    FOREIGN KEY (kunde_id) REFERENCES kunden(id),
    FOREIGN KEY (baustelle_id) REFERENCES baustellen(id),
    FOREIGN KEY (ersteller_id) REFERENCES mitarbeiter(id),
    FOREIGN KEY (storniert_von) REFERENCES mitarbeiter(id)
  );

  CREATE INDEX IF NOT EXISTS idx_leistungsnachweise_datum ON leistungsnachweise(datum);
  CREATE INDEX IF NOT EXISTS idx_leistungsnachweise_kunde ON leistungsnachweise(kunde_id);
  CREATE INDEX IF NOT EXISTS idx_leistungsnachweise_baustelle ON leistungsnachweise(baustelle_id);
  CREATE INDEX IF NOT EXISTS idx_leistungsnachweise_status ON leistungsnachweise(status);
  CREATE INDEX IF NOT EXISTS idx_leistungsnachweise_ersteller ON leistungsnachweise(ersteller_id);

  -- Leistungsnachweis-Mitarbeiter-Zuordnung (mehrere Mitarbeiter pro Nachweis)
  CREATE TABLE IF NOT EXISTS leistungsnachweis_mitarbeiter (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    leistungsnachweis_id INTEGER NOT NULL,
    mitarbeiter_id INTEGER NOT NULL,
    FOREIGN KEY (leistungsnachweis_id) REFERENCES leistungsnachweise(id) ON DELETE CASCADE,
    FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id),
    UNIQUE(leistungsnachweis_id, mitarbeiter_id)
  );

  CREATE INDEX IF NOT EXISTS idx_ln_mitarbeiter_nachweis ON leistungsnachweis_mitarbeiter(leistungsnachweis_id);
  CREATE INDEX IF NOT EXISTS idx_ln_mitarbeiter_ma ON leistungsnachweis_mitarbeiter(mitarbeiter_id);

  -- BUAK Compliance Support Module (Dokumentation & Reporting)
  -- Schlechtwetter-Dokumentation (Witterungsbedingte Arbeitsunterbrechung)
  CREATE TABLE IF NOT EXISTS buak_schlechtwetter (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    datum DATE NOT NULL,
    baustelle_id INTEGER,
    baustelle_freitext TEXT,
    beginn TIME,
    ende TIME,
    dauer_minuten INTEGER,
    grund TEXT NOT NULL CHECK(grund IN ('regen', 'schnee', 'frost', 'hitze', 'sturm', 'sonstiges')),
    grund_details TEXT,
    notizen TEXT,
    ersteller_id INTEGER NOT NULL,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (baustelle_id) REFERENCES baustellen(id),
    FOREIGN KEY (ersteller_id) REFERENCES mitarbeiter(id)
  );

  CREATE INDEX IF NOT EXISTS idx_buak_sw_datum ON buak_schlechtwetter(datum);
  CREATE INDEX IF NOT EXISTS idx_buak_sw_baustelle ON buak_schlechtwetter(baustelle_id);

  -- Betroffene Mitarbeiter pro Schlechtwetter-Ereignis
  CREATE TABLE IF NOT EXISTS buak_schlechtwetter_mitarbeiter (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schlechtwetter_id INTEGER NOT NULL,
    mitarbeiter_id INTEGER NOT NULL,
    FOREIGN KEY (schlechtwetter_id) REFERENCES buak_schlechtwetter(id) ON DELETE CASCADE,
    FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id),
    UNIQUE(schlechtwetter_id, mitarbeiter_id)
  );

  CREATE INDEX IF NOT EXISTS idx_buak_sw_ma_sw ON buak_schlechtwetter_mitarbeiter(schlechtwetter_id);
  CREATE INDEX IF NOT EXISTS idx_buak_sw_ma_ma ON buak_schlechtwetter_mitarbeiter(mitarbeiter_id);
`);

// Standard-Pausenregeln einfügen falls nicht vorhanden (AZG §11)
const pausenregelExists = db.prepare('SELECT id FROM pausenregeln LIMIT 1').get();
if (!pausenregelExists) {
  db.prepare(`
    INSERT INTO pausenregeln (name, min_arbeitszeit_minuten, min_pause_minuten, warnung_text, aktiv)
    VALUES (?, ?, ?, ?, 1)
  `).run(
    'AZG §11 - Standardregel',
    360, // 6 Stunden
    30,  // 30 Minuten Pause
    'Bei mehr als 6 Stunden Arbeitszeit sind mindestens 30 Minuten Pause vorgeschrieben (§11 AZG).'
  );
  console.log('Standard-Pausenregel (AZG §11) erstellt');
}

// Einstellungen-Tabelle erstellen
db.exec(`
  CREATE TABLE IF NOT EXISTS einstellungen (
    schluessel TEXT PRIMARY KEY,
    wert TEXT NOT NULL,
    beschreibung TEXT,
    aktualisiert_am DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Standard-Einstellungen für Arbeitsstunden einfügen
const defaultSettings = [
  { key: 'standard_wochenstunden', value: '40', desc: 'Soll-Arbeitszeit pro Woche (Stunden)' },
  { key: 'standard_monatsstunden', value: '173', desc: 'Soll-Arbeitszeit pro Monat (Stunden)' },
  { key: 'max_tagesstunden', value: '10', desc: 'Maximale Arbeitszeit pro Tag (§9 AZG)' },
  { key: 'max_wochenstunden', value: '50', desc: 'Maximale Arbeitszeit pro Woche (§9 AZG)' },
  // Gleitzeit-Einstellungen
  { key: 'gleitzeit_aktiv', value: '0', desc: 'Gleitzeit aktiviert (1=ja, 0=nein)' },
  { key: 'gleitzeit_durchrechnungszeitraum', value: '1', desc: 'Durchrechnungszeitraum in Monaten (1, 3, 6, 12)' },
  { key: 'gleitzeit_max_plus', value: '40', desc: 'Maximales Plus-Saldo (Stunden)' },
  { key: 'gleitzeit_max_minus', value: '20', desc: 'Maximales Minus-Saldo (Stunden)' },
  { key: 'gleitzeit_uebertrag_max', value: '20', desc: 'Maximaler Übertrag am Periodenende (Stunden)' },
  { key: 'gleitzeit_verfall_monate', value: '0', desc: 'Verfall nach X Monaten (0=kein Verfall)' },
  // Inspektions-Einstellungen
  { key: 'inspektion_code', value: '', desc: 'Zugangscode für Arbeitsinspektions-Ansicht (leer = deaktiviert)' },
  // Datenaufbewahrung (DSGVO)
  { key: 'retention_zeiteintraege_monate', value: '84', desc: 'Aufbewahrungsfrist Zeiteinträge in Monaten (84 = 7 Jahre, 0 = unbegrenzt)' },
  { key: 'retention_audit_monate', value: '120', desc: 'Aufbewahrungsfrist Audit-Log in Monaten (120 = 10 Jahre, 0 = unbegrenzt)' },
  { key: 'retention_warnung_tage', value: '30', desc: 'Tage vor Löschung: Admin-Benachrichtigung' },
  { key: 'retention_auto_loeschen', value: '0', desc: 'Automatische Löschung aktiviert (1=ja, 0=nein - nur Warnung)' }
];

defaultSettings.forEach(s => {
  const exists = db.prepare('SELECT schluessel FROM einstellungen WHERE schluessel = ?').get(s.key);
  if (!exists) {
    db.prepare('INSERT INTO einstellungen (schluessel, wert, beschreibung) VALUES (?, ?, ?)').run(s.key, s.value, s.desc);
  }
});

// Migration: Neue Spalten hinzufügen falls sie fehlen
try {
  db.exec(`ALTER TABLE kunden ADD COLUMN ansprechpartner TEXT`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE kunden ADD COLUMN strasse TEXT`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE kunden ADD COLUMN plz TEXT`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE kunden ADD COLUMN ort TEXT`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE kunden ADD COLUMN telefon TEXT`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE kunden ADD COLUMN email TEXT`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE kunden ADD COLUMN notizen TEXT`);
} catch (e) {}

// Migration: Audit-Log erweitern für Unveränderlichkeit
try {
  db.exec(`ALTER TABLE audit_log ADD COLUMN ip_adresse TEXT`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE audit_log ADD COLUMN vorheriger_hash TEXT`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE audit_log ADD COLUMN eintrag_hash TEXT`);
} catch (e) {}

// Index für Hash-Spalte erstellen (nach Migration)
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_hash ON audit_log(eintrag_hash)`);
} catch (e) {}

// Migration: KV-Gruppe zu Mitarbeiter hinzufügen
try {
  db.exec(`ALTER TABLE mitarbeiter ADD COLUMN kv_gruppe_id INTEGER REFERENCES kv_gruppen(id)`);
} catch (e) {}

// Migration: Standort und Arbeitstyp zu Zeiteinträgen hinzufügen
try {
  db.exec(`ALTER TABLE zeiteintraege ADD COLUMN standort TEXT`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE zeiteintraege ADD COLUMN arbeitstyp TEXT`);
} catch (e) {}

// Arbeitstypen-Tabelle erstellen
db.exec(`
  CREATE TABLE IF NOT EXISTS arbeitstypen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    beschreibung TEXT,
    farbe TEXT DEFAULT '#6b7280',
    aktiv INTEGER DEFAULT 1,
    sortierung INTEGER DEFAULT 0,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Standard-Arbeitstypen einfügen
const defaultArbeitstypen = [
  { name: 'Büro', beschreibung: 'Büroarbeit am Firmenstandort', farbe: '#3b82f6' },
  { name: 'Baustelle', beschreibung: 'Arbeit auf der Baustelle', farbe: '#f59e0b' },
  { name: 'Außendienst', beschreibung: 'Kundenbesuche und Außentermine', farbe: '#10b981' },
  { name: 'Homeoffice', beschreibung: 'Arbeit von zu Hause', farbe: '#8b5cf6' },
  { name: 'Schulung', beschreibung: 'Weiterbildung und Schulungen', farbe: '#ec4899' },
  { name: 'Montage', beschreibung: 'Montagearbeiten beim Kunden', farbe: '#ef4444' }
];

defaultArbeitstypen.forEach((typ, index) => {
  const exists = db.prepare('SELECT id FROM arbeitstypen WHERE name = ?').get(typ.name);
  if (!exists) {
    db.prepare('INSERT INTO arbeitstypen (name, beschreibung, farbe, sortierung) VALUES (?, ?, ?, ?)').run(typ.name, typ.beschreibung, typ.farbe, index);
  }
});

// Bestehende Audit-Einträge mit Hash versehen (falls noch ohne)
const crypto = require('crypto');
try {
  const unhashed = db.prepare('SELECT id, zeitpunkt, mitarbeiter_id, aktion, tabelle, datensatz_id, alte_werte, neue_werte FROM audit_log WHERE eintrag_hash IS NULL').all();
  let prevHash = null;
  unhashed.forEach(entry => {
    const hashData = `${entry.zeitpunkt}|${entry.mitarbeiter_id}|${entry.aktion}|${entry.tabelle}|${entry.datensatz_id}|${entry.alte_werte}|${entry.neue_werte}|${prevHash || 'GENESIS'}`;
    const hash = crypto.createHash('sha256').update(hashData).digest('hex');
    db.prepare('UPDATE audit_log SET eintrag_hash = ?, vorheriger_hash = ? WHERE id = ?').run(hash, prevHash, entry.id);
    prevHash = hash;
  });
} catch (e) {
  console.error('Audit-Hash Migration:', e.message);
}

// Migration: BUAK-Relevanz zu Baustellen hinzufügen
try {
  db.exec(`ALTER TABLE baustellen ADD COLUMN buak_relevant INTEGER DEFAULT 0`);
} catch (e) {}

// Migration: BUAK-Relevanz zu Mitarbeitern hinzufügen
try {
  db.exec(`ALTER TABLE mitarbeiter ADD COLUMN buak_relevant INTEGER DEFAULT 0`);
} catch (e) {}

// Migration: BUAK-Relevanz zu Zeiteinträgen hinzufügen
try {
  db.exec(`ALTER TABLE zeiteintraege ADD COLUMN buak_relevant INTEGER DEFAULT 0`);
} catch (e) {}

// BUAK-Einstellungen zu default settings hinzufügen
const buakSettings = [
  { key: 'buak_modul_aktiv', value: '0', desc: 'BUAK Compliance Support Modul aktiviert (1=ja, 0=nein)' }
];
buakSettings.forEach(s => {
  const exists = db.prepare('SELECT schluessel FROM einstellungen WHERE schluessel = ?').get(s.key);
  if (!exists) {
    db.prepare('INSERT INTO einstellungen (schluessel, wert, beschreibung) VALUES (?, ?, ?)').run(s.key, s.value, s.desc);
  }
});

// Standard-Admin erstellen falls nicht vorhanden
const adminExists = db.prepare('SELECT id FROM mitarbeiter WHERE mitarbeiter_nr = ?').get('admin');
if (!adminExists) {
  const pinHash = bcrypt.hashSync('1234', 10);
  db.prepare(`
    INSERT INTO mitarbeiter (mitarbeiter_nr, name, pin_hash, ist_admin)
    VALUES (?, ?, ?, 1)
  `).run('admin', 'Administrator', pinHash);
  console.log('Admin-Benutzer erstellt: Nr=admin, PIN=1234');
}

module.exports = {
  // Mitarbeiter-Funktionen
  getMitarbeiterByNr: (nr) => {
    return db.prepare('SELECT * FROM mitarbeiter WHERE mitarbeiter_nr = ? AND aktiv = 1').get(nr);
  },

  getAllMitarbeiter: (page = 1, limit = 10) => {
    const offset = (page - 1) * limit;
    const data = db.prepare(`
      SELECT id, mitarbeiter_nr, name, ist_admin, aktiv, erstellt_am
      FROM mitarbeiter ORDER BY name
      LIMIT ? OFFSET ?
    `).all(limit, offset);
    const total = db.prepare('SELECT COUNT(*) as count FROM mitarbeiter').get().count;
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  createMitarbeiter: (nr, name, pin) => {
    const pinHash = bcrypt.hashSync(pin, 10);
    return db.prepare('INSERT INTO mitarbeiter (mitarbeiter_nr, name, pin_hash) VALUES (?, ?, ?)').run(nr, name, pinHash);
  },

  updateMitarbeiter: (id, name, aktiv) => {
    return db.prepare('UPDATE mitarbeiter SET name = ?, aktiv = ? WHERE id = ?').run(name, aktiv ? 1 : 0, id);
  },

  updateMitarbeiterPin: (id, pin) => {
    const pinHash = bcrypt.hashSync(pin, 10);
    return db.prepare('UPDATE mitarbeiter SET pin_hash = ? WHERE id = ?').run(pinHash, id);
  },

  // Alias für Passwort-Update (moderner Name)
  updateMitarbeiterPassword: (id, password) => {
    const hash = bcrypt.hashSync(password, 12); // Höhere Runden für bessere Sicherheit
    return db.prepare('UPDATE mitarbeiter SET pin_hash = ? WHERE id = ?').run(hash, id);
  },

  verifyPin: (mitarbeiter, pin) => {
    return bcrypt.compareSync(pin, mitarbeiter.pin_hash);
  },

  // Alias für Passwort-Verifikation (moderner Name)
  verifyPassword: (mitarbeiter, password) => {
    return bcrypt.compareSync(password, mitarbeiter.pin_hash);
  },

  // Zeiteintrag-Funktionen
  createZeiteintrag: (data) => {
    return db.prepare(`
      INSERT INTO zeiteintraege (mitarbeiter_id, datum, arbeitsbeginn, arbeitsende, pause_minuten, baustelle, kunde, anfahrt, notizen, standort, arbeitstyp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.mitarbeiter_id,
      data.datum,
      data.arbeitsbeginn,
      data.arbeitsende,
      data.pause_minuten || 0,
      data.baustelle || '',
      data.kunde || '',
      data.anfahrt || '',
      data.notizen || '',
      data.standort || '',
      data.arbeitstyp || ''
    );
  },

  getZeiteintraegeByMitarbeiter: (mitarbeiterId, page = 1, limit = 10) => {
    const offset = (page - 1) * limit;
    const eintraege = db.prepare(`
      SELECT * FROM zeiteintraege
      WHERE mitarbeiter_id = ?
      ORDER BY datum DESC, arbeitsbeginn DESC
      LIMIT ? OFFSET ?
    `).all(mitarbeiterId, limit, offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM zeiteintraege WHERE mitarbeiter_id = ?
    `).get(mitarbeiterId).count;

    return {
      data: eintraege,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  },

  getAllZeiteintraege: (von, bis, page = 1, limit = 10, mitarbeiterId, baustelle, kunde) => {
    const conditions = [];
    const params = [];

    if (von && bis) {
      conditions.push('z.datum BETWEEN ? AND ?');
      params.push(von, bis);
    } else if (von) {
      conditions.push('z.datum >= ?');
      params.push(von);
    } else if (bis) {
      conditions.push('z.datum <= ?');
      params.push(bis);
    }

    if (mitarbeiterId) {
      conditions.push('z.mitarbeiter_id = ?');
      params.push(mitarbeiterId);
    }

    if (baustelle) {
      conditions.push('z.baustelle = ?');
      params.push(baustelle);
    }

    if (kunde) {
      conditions.push('z.kunde = ?');
      params.push(kunde);
    }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
    const offset = (page - 1) * limit;

    const query = `
      SELECT z.*, m.name as mitarbeiter_name, m.mitarbeiter_nr
      FROM zeiteintraege z
      JOIN mitarbeiter m ON z.mitarbeiter_id = m.id
      ${whereClause}
      ORDER BY z.datum DESC, z.arbeitsbeginn DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as count
      FROM zeiteintraege z
      JOIN mitarbeiter m ON z.mitarbeiter_id = m.id
      ${whereClause}
    `;

    const eintraege = db.prepare(query).all(...params, limit, offset);
    const total = db.prepare(countQuery).all(...params)[0].count;

    return {
      data: eintraege,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  },

  deleteZeiteintrag: (id) => {
    return db.prepare('DELETE FROM zeiteintraege WHERE id = ?').run(id);
  },

  // Statistiken
  getMonatsstatistik: (mitarbeiterId, jahr, monat) => {
    const von = `${jahr}-${String(monat).padStart(2, '0')}-01`;
    const bis = `${jahr}-${String(monat).padStart(2, '0')}-31`;

    return db.prepare(`
      SELECT
        COUNT(*) as tage,
        SUM(
          (strftime('%H', arbeitsende) * 60 + strftime('%M', arbeitsende)) -
          (strftime('%H', arbeitsbeginn) * 60 + strftime('%M', arbeitsbeginn)) -
          pause_minuten
        ) as gesamtminuten
      FROM zeiteintraege
      WHERE mitarbeiter_id = ? AND datum BETWEEN ? AND ?
    `).get(mitarbeiterId, von, bis);
  },

  // Wochenstatistik (§26 AZG konform)
  getWochenstatistik: (mitarbeiterId, jahr, woche) => {
    // ISO Woche berechnen - Montag bis Sonntag
    const result = db.prepare(`
      SELECT
        strftime('%W', datum) as kalenderwoche,
        COUNT(*) as tage,
        SUM(
          (strftime('%H', arbeitsende) * 60 + strftime('%M', arbeitsende)) -
          (strftime('%H', arbeitsbeginn) * 60 + strftime('%M', arbeitsbeginn)) -
          pause_minuten
        ) as gesamtminuten
      FROM zeiteintraege
      WHERE mitarbeiter_id = ?
        AND strftime('%Y', datum) = ?
        AND strftime('%W', datum) = ?
      GROUP BY strftime('%W', datum)
    `).get(mitarbeiterId, String(jahr), String(woche).padStart(2, '0'));

    return result || { kalenderwoche: woche, tage: 0, gesamtminuten: 0 };
  },

  // Alle Wochen eines Jahres für einen Mitarbeiter
  getJahresWochenstatistik: (mitarbeiterId, jahr) => {
    return db.prepare(`
      SELECT
        strftime('%W', datum) as kalenderwoche,
        MIN(datum) as woche_start,
        MAX(datum) as woche_ende,
        COUNT(*) as tage,
        SUM(
          (strftime('%H', arbeitsende) * 60 + strftime('%M', arbeitsende)) -
          (strftime('%H', arbeitsbeginn) * 60 + strftime('%M', arbeitsbeginn)) -
          pause_minuten
        ) as gesamtminuten
      FROM zeiteintraege
      WHERE mitarbeiter_id = ?
        AND strftime('%Y', datum) = ?
      GROUP BY strftime('%W', datum)
      ORDER BY kalenderwoche DESC
    `).all(mitarbeiterId, String(jahr));
  },

  // Alle Monate eines Jahres für einen Mitarbeiter
  getJahresMonatsstatistik: (mitarbeiterId, jahr) => {
    return db.prepare(`
      SELECT
        strftime('%m', datum) as monat,
        COUNT(*) as tage,
        SUM(
          (strftime('%H', arbeitsende) * 60 + strftime('%M', arbeitsende)) -
          (strftime('%H', arbeitsbeginn) * 60 + strftime('%M', arbeitsbeginn)) -
          pause_minuten
        ) as gesamtminuten
      FROM zeiteintraege
      WHERE mitarbeiter_id = ?
        AND strftime('%Y', datum) = ?
      GROUP BY strftime('%m', datum)
      ORDER BY monat DESC
    `).all(mitarbeiterId, String(jahr));
  },

  // Monatliche Zeitabrechnung für einen Mitarbeiter (vollständig)
  getMonatsabrechnung: (mitarbeiterId, jahr, monat) => {
    const von = `${jahr}-${String(monat).padStart(2, '0')}-01`;
    const bis = `${jahr}-${String(monat).padStart(2, '0')}-31`;

    // Mitarbeiter-Info
    const mitarbeiter = db.prepare(`
      SELECT id, mitarbeiter_nr, name FROM mitarbeiter WHERE id = ?
    `).get(mitarbeiterId);

    if (!mitarbeiter) return null;

    // Alle Einträge des Monats
    const eintraege = db.prepare(`
      SELECT
        id, datum, arbeitsbeginn, arbeitsende, pause_minuten,
        baustelle, kunde, anfahrt, notizen,
        (strftime('%H', arbeitsende) * 60 + strftime('%M', arbeitsende)) -
        (strftime('%H', arbeitsbeginn) * 60 + strftime('%M', arbeitsbeginn)) -
        pause_minuten as netto_minuten
      FROM zeiteintraege
      WHERE mitarbeiter_id = ? AND datum BETWEEN ? AND ?
      ORDER BY datum, arbeitsbeginn
    `).all(mitarbeiterId, von, bis);

    // Wochenweise Gruppierung
    const wochen = db.prepare(`
      SELECT
        strftime('%W', datum) as kalenderwoche,
        MIN(datum) as woche_start,
        MAX(datum) as woche_ende,
        COUNT(*) as tage,
        SUM(
          (strftime('%H', arbeitsende) * 60 + strftime('%M', arbeitsende)) -
          (strftime('%H', arbeitsbeginn) * 60 + strftime('%M', arbeitsbeginn)) -
          pause_minuten
        ) as netto_minuten
      FROM zeiteintraege
      WHERE mitarbeiter_id = ? AND datum BETWEEN ? AND ?
      GROUP BY strftime('%W', datum)
      ORDER BY kalenderwoche
    `).all(mitarbeiterId, von, bis);

    // Gesamtsummen
    const summen = db.prepare(`
      SELECT
        COUNT(*) as arbeitstage,
        COALESCE(SUM(
          (strftime('%H', arbeitsende) * 60 + strftime('%M', arbeitsende)) -
          (strftime('%H', arbeitsbeginn) * 60 + strftime('%M', arbeitsbeginn)) -
          pause_minuten
        ), 0) as netto_minuten,
        COALESCE(SUM(pause_minuten), 0) as pause_minuten
      FROM zeiteintraege
      WHERE mitarbeiter_id = ? AND datum BETWEEN ? AND ?
    `).get(mitarbeiterId, von, bis);

    // Soll-Stunden aus Einstellungen
    const sollWoche = db.prepare(`SELECT wert FROM einstellungen WHERE schluessel = 'standard_wochenstunden'`).get();
    const sollMonat = db.prepare(`SELECT wert FROM einstellungen WHERE schluessel = 'standard_monatsstunden'`).get();

    return {
      mitarbeiter,
      zeitraum: { jahr, monat, von, bis },
      eintraege,
      wochen,
      summen: {
        arbeitstage: summen?.arbeitstage || 0,
        nettoMinuten: summen?.netto_minuten || 0,
        nettoStunden: ((summen?.netto_minuten || 0) / 60).toFixed(2),
        pauseMinuten: summen?.pause_minuten || 0
      },
      soll: {
        wocheStunden: parseFloat(sollWoche?.wert) || 40,
        monatStunden: parseFloat(sollMonat?.wert) || 173
      }
    };
  },

  // Statistik-Übersicht für Admin (alle Mitarbeiter)
  getAlleMitarbeiterStatistik: (jahr, monat) => {
    const von = `${jahr}-${String(monat).padStart(2, '0')}-01`;
    const bis = `${jahr}-${String(monat).padStart(2, '0')}-31`;

    return db.prepare(`
      SELECT
        m.id as mitarbeiter_id,
        m.name as mitarbeiter_name,
        m.mitarbeiter_nr,
        COUNT(z.id) as tage,
        COALESCE(SUM(
          (strftime('%H', z.arbeitsende) * 60 + strftime('%M', z.arbeitsende)) -
          (strftime('%H', z.arbeitsbeginn) * 60 + strftime('%M', z.arbeitsbeginn)) -
          z.pause_minuten
        ), 0) as gesamtminuten
      FROM mitarbeiter m
      LEFT JOIN zeiteintraege z ON m.id = z.mitarbeiter_id
        AND z.datum BETWEEN ? AND ?
      WHERE m.aktiv = 1
      GROUP BY m.id
      ORDER BY m.name
    `).all(von, bis);
  },

  // Session-Funktionen
  createSession: (sessionId, mitarbeiterId, expiresAt) => {
    return db.prepare(`
      INSERT INTO sessions (id, mitarbeiter_id, laeuft_ab_am)
      VALUES (?, ?, ?)
    `).run(sessionId, mitarbeiterId, expiresAt);
  },

  getSession: (sessionId) => {
    return db.prepare(`
      SELECT s.*, m.mitarbeiter_nr, m.name, m.ist_admin
      FROM sessions s
      JOIN mitarbeiter m ON s.mitarbeiter_id = m.id
      WHERE s.id = ? AND s.laeuft_ab_am > datetime('now') AND m.aktiv = 1
    `).get(sessionId);
  },

  extendSession: (sessionId, newExpiresAt) => {
    return db.prepare(`
      UPDATE sessions SET laeuft_ab_am = ? WHERE id = ?
    `).run(newExpiresAt, sessionId);
  },

  deleteSession: (sessionId) => {
    return db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  },

  cleanupExpiredSessions: () => {
    return db.prepare(`DELETE FROM sessions WHERE laeuft_ab_am <= datetime('now')`).run();
  },

  // Zeiteintrag abrufen (für Update/Delete Validierung)
  getZeiteintragById: (id) => {
    return db.prepare('SELECT * FROM zeiteintraege WHERE id = ?').get(id);
  },

  // Zeiteintrag aktualisieren
  updateZeiteintrag: (id, data) => {
    return db.prepare(`
      UPDATE zeiteintraege
      SET datum = ?, arbeitsbeginn = ?, arbeitsende = ?, pause_minuten = ?,
          baustelle = ?, kunde = ?, anfahrt = ?, notizen = ?, standort = ?, arbeitstyp = ?
      WHERE id = ?
    `).run(
      data.datum,
      data.arbeitsbeginn,
      data.arbeitsende,
      data.pause_minuten || 0,
      data.baustelle || '',
      data.kunde || '',
      data.anfahrt || '',
      data.notizen || '',
      data.standort || '',
      data.arbeitstyp || '',
      id
    );
  },

  // Arbeitstypen-Funktionen
  getAllArbeitstypen: (nurAktive = true) => {
    if (nurAktive) {
      return db.prepare('SELECT * FROM arbeitstypen WHERE aktiv = 1 ORDER BY sortierung, name').all();
    }
    return db.prepare('SELECT * FROM arbeitstypen ORDER BY sortierung, name').all();
  },

  getArbeitstyp: (id) => {
    return db.prepare('SELECT * FROM arbeitstypen WHERE id = ?').get(id);
  },

  createArbeitstyp: (data) => {
    const maxSort = db.prepare('SELECT MAX(sortierung) as max FROM arbeitstypen').get();
    return db.prepare(`
      INSERT INTO arbeitstypen (name, beschreibung, farbe, sortierung)
      VALUES (?, ?, ?, ?)
    `).run(data.name, data.beschreibung || '', data.farbe || '#6b7280', (maxSort.max || 0) + 1);
  },

  updateArbeitstyp: (id, data) => {
    return db.prepare(`
      UPDATE arbeitstypen SET name = ?, beschreibung = ?, farbe = ?, aktiv = ?
      WHERE id = ?
    `).run(data.name, data.beschreibung || '', data.farbe || '#6b7280', data.aktiv ? 1 : 0, id);
  },

  deleteArbeitstyp: (id) => {
    return db.prepare('DELETE FROM arbeitstypen WHERE id = ?').run(id);
  },

  // Audit-Log Funktionen (unveränderlich, hash-verkettet)
  logAudit: (mitarbeiterId, aktion, tabelle, datensatzId, alteWerte, neueWerte, ipAdresse = null) => {
    // Letzten Hash holen für Verkettung
    const lastEntry = db.prepare('SELECT eintrag_hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
    const vorherigerHash = lastEntry?.eintrag_hash || 'GENESIS';

    // Zeitstempel generieren
    const zeitpunkt = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // Werte serialisieren
    const alteWerteJson = alteWerte ? JSON.stringify(alteWerte) : null;
    const neueWerteJson = neueWerte ? JSON.stringify(neueWerte) : null;

    // Hash für diesen Eintrag berechnen
    const hashData = `${zeitpunkt}|${mitarbeiterId}|${aktion}|${tabelle}|${datensatzId}|${alteWerteJson}|${neueWerteJson}|${vorherigerHash}`;
    const eintragHash = crypto.createHash('sha256').update(hashData).digest('hex');

    return db.prepare(`
      INSERT INTO audit_log (zeitpunkt, mitarbeiter_id, aktion, tabelle, datensatz_id, alte_werte, neue_werte, ip_adresse, vorheriger_hash, eintrag_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      zeitpunkt,
      mitarbeiterId,
      aktion,
      tabelle,
      datensatzId,
      alteWerteJson,
      neueWerteJson,
      ipAdresse,
      vorherigerHash,
      eintragHash
    );
  },

  getAuditLog: (tabelle, datensatzId) => {
    return db.prepare(`
      SELECT a.*, m.name as mitarbeiter_name, m.mitarbeiter_nr
      FROM audit_log a
      JOIN mitarbeiter m ON a.mitarbeiter_id = m.id
      WHERE a.tabelle = ? AND a.datensatz_id = ?
      ORDER BY a.zeitpunkt DESC
    `).all(tabelle, datensatzId);
  },

  getAllAuditLogs: (page = 1, limit = 50, tabelle = null, aktion = null) => {
    const offset = (page - 1) * limit;
    let whereClause = '';
    const params = [];

    if (tabelle) {
      whereClause = 'WHERE a.tabelle = ?';
      params.push(tabelle);
      if (aktion) {
        whereClause += ' AND a.aktion = ?';
        params.push(aktion);
      }
    } else if (aktion) {
      whereClause = 'WHERE a.aktion = ?';
      params.push(aktion);
    }

    const data = db.prepare(`
      SELECT a.*, m.name as mitarbeiter_name, m.mitarbeiter_nr
      FROM audit_log a
      JOIN mitarbeiter m ON a.mitarbeiter_id = m.id
      ${whereClause}
      ORDER BY a.zeitpunkt DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const countParams = params.slice(); // Clone params for count query
    const total = db.prepare(`
      SELECT COUNT(*) as count FROM audit_log a
      ${whereClause}
    `).get(...countParams).count;

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  // Audit-Log Integrität prüfen (Hash-Kette verifizieren)
  verifyAuditIntegrity: () => {
    const entries = db.prepare(`
      SELECT id, zeitpunkt, mitarbeiter_id, aktion, tabelle, datensatz_id,
             alte_werte, neue_werte, vorheriger_hash, eintrag_hash
      FROM audit_log ORDER BY id ASC
    `).all();

    const results = {
      total: entries.length,
      valid: 0,
      invalid: [],
      chainBroken: false
    };

    let expectedPrevHash = 'GENESIS';

    for (const entry of entries) {
      // Prüfe ob vorheriger_hash korrekt ist
      if (entry.vorheriger_hash !== expectedPrevHash) {
        results.invalid.push({
          id: entry.id,
          error: 'Ketten-Hash unterbrochen',
          expected: expectedPrevHash,
          actual: entry.vorheriger_hash
        });
        results.chainBroken = true;
      }

      // Hash neu berechnen und vergleichen
      const hashData = `${entry.zeitpunkt}|${entry.mitarbeiter_id}|${entry.aktion}|${entry.tabelle}|${entry.datensatz_id}|${entry.alte_werte}|${entry.neue_werte}|${entry.vorheriger_hash}`;
      const expectedHash = crypto.createHash('sha256').update(hashData).digest('hex');

      if (entry.eintrag_hash !== expectedHash) {
        results.invalid.push({
          id: entry.id,
          error: 'Eintrag manipuliert',
          expected: expectedHash,
          actual: entry.eintrag_hash
        });
      } else {
        results.valid++;
      }

      expectedPrevHash = entry.eintrag_hash;
    }

    return results;
  },

  // Audit-Export für rechtliche Nachweise
  getAuditExport: (von, bis, tabelle = null) => {
    let whereClause = 'WHERE DATE(a.zeitpunkt) BETWEEN ? AND ?';
    const params = [von, bis];

    if (tabelle) {
      whereClause += ' AND a.tabelle = ?';
      params.push(tabelle);
    }

    return db.prepare(`
      SELECT a.*, m.name as mitarbeiter_name, m.mitarbeiter_nr
      FROM audit_log a
      JOIN mitarbeiter m ON a.mitarbeiter_id = m.id
      ${whereClause}
      ORDER BY a.zeitpunkt ASC
    `).all(...params);
  },

  // Inspektion: Erweiterter Audit-Export mit allen Filtern
  getInspektionAudit: (filter = {}) => {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (filter.von) {
      whereClause += ' AND DATE(a.zeitpunkt) >= ?';
      params.push(filter.von);
    }
    if (filter.bis) {
      whereClause += ' AND DATE(a.zeitpunkt) <= ?';
      params.push(filter.bis);
    }
    if (filter.mitarbeiterId) {
      whereClause += ' AND a.mitarbeiter_id = ?';
      params.push(filter.mitarbeiterId);
    }
    if (filter.tabelle) {
      whereClause += ' AND a.tabelle = ?';
      params.push(filter.tabelle);
    }
    if (filter.aktion) {
      whereClause += ' AND a.aktion = ?';
      params.push(filter.aktion);
    }

    return db.prepare(`
      SELECT a.*, m.name as mitarbeiter_name, m.mitarbeiter_nr
      FROM audit_log a
      JOIN mitarbeiter m ON a.mitarbeiter_id = m.id
      ${whereClause}
      ORDER BY a.zeitpunkt ASC
    `).all(...params);
  },

  // Inspektion: Statistiken für Übersicht
  getInspektionStats: () => {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_eintraege,
        COUNT(DISTINCT mitarbeiter_id) as mitarbeiter_count,
        MIN(DATE(zeitpunkt)) as erster_eintrag,
        MAX(DATE(zeitpunkt)) as letzter_eintrag,
        SUM(CASE WHEN aktion = 'CREATE' THEN 1 ELSE 0 END) as erstellt,
        SUM(CASE WHEN aktion = 'UPDATE' THEN 1 ELSE 0 END) as geaendert,
        SUM(CASE WHEN aktion = 'DELETE' THEN 1 ELSE 0 END) as geloescht,
        SUM(CASE WHEN aktion = 'CONFIRM' THEN 1 ELSE 0 END) as bestaetigt
      FROM audit_log
    `).get();
    return stats;
  },

  // Kunden-Funktionen
  getAllKunden: (nurAktive = true, page = 1, limit = 10) => {
    const offset = (page - 1) * limit;
    const whereClause = nurAktive ? 'WHERE aktiv = 1' : '';
    const data = db.prepare(`SELECT * FROM kunden ${whereClause} ORDER BY name LIMIT ? OFFSET ?`).all(limit, offset);
    const total = db.prepare(`SELECT COUNT(*) as count FROM kunden ${whereClause}`).get().count;
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  getKundeById: (id) => {
    return db.prepare('SELECT * FROM kunden WHERE id = ?').get(id);
  },

  createKunde: (data) => {
    return db.prepare(`
      INSERT INTO kunden (name, ansprechpartner, strasse, plz, ort, telefon, email, notizen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.name,
      data.ansprechpartner || '',
      data.strasse || '',
      data.plz || '',
      data.ort || '',
      data.telefon || '',
      data.email || '',
      data.notizen || ''
    );
  },

  updateKunde: (id, data) => {
    return db.prepare(`
      UPDATE kunden
      SET name = ?, ansprechpartner = ?, strasse = ?, plz = ?, ort = ?,
          telefon = ?, email = ?, notizen = ?, aktiv = ?
      WHERE id = ?
    `).run(
      data.name,
      data.ansprechpartner || '',
      data.strasse || '',
      data.plz || '',
      data.ort || '',
      data.telefon || '',
      data.email || '',
      data.notizen || '',
      data.aktiv !== false ? 1 : 0,
      id
    );
  },

  deleteKunde: (id) => {
    return db.prepare('DELETE FROM kunden WHERE id = ?').run(id);
  },

  // Baustellen-Funktionen
  getAllBaustellen: (nurAktive = true, page = 1, limit = 10) => {
    const offset = (page - 1) * limit;
    const whereClause = nurAktive ? 'WHERE aktiv = 1' : '';
    const data = db.prepare(`SELECT * FROM baustellen ${whereClause} ORDER BY name LIMIT ? OFFSET ?`).all(limit, offset);
    const total = db.prepare(`SELECT COUNT(*) as count FROM baustellen ${whereClause}`).get().count;
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  getBaustelleById: (id) => {
    return db.prepare('SELECT * FROM baustellen WHERE id = ?').get(id);
  },

  createBaustelle: (data) => {
    return db.prepare(`
      INSERT INTO baustellen (name, kunde, adresse, notizen)
      VALUES (?, ?, ?, ?)
    `).run(
      data.name,
      data.kunde || '',
      data.adresse || '',
      data.notizen || ''
    );
  },

  updateBaustelle: (id, data) => {
    return db.prepare(`
      UPDATE baustellen
      SET name = ?, kunde = ?, adresse = ?, notizen = ?, aktiv = ?
      WHERE id = ?
    `).run(
      data.name,
      data.kunde || '',
      data.adresse || '',
      data.notizen || '',
      data.aktiv !== false ? 1 : 0,
      id
    );
  },

  deleteBaustelle: (id) => {
    return db.prepare('DELETE FROM baustellen WHERE id = ?').run(id);
  },

  // Export-Funktionen für rechtskonforme Berichte
  getExportDaten: (mitarbeiterId, von, bis) => {
    const conditions = ['z.datum BETWEEN ? AND ?'];
    const params = [von, bis];

    if (mitarbeiterId) {
      conditions.push('z.mitarbeiter_id = ?');
      params.push(mitarbeiterId);
    }

    const whereClause = conditions.join(' AND ');

    // Tageseinträge
    const eintraege = db.prepare(`
      SELECT z.*, m.name as mitarbeiter_name, m.mitarbeiter_nr
      FROM zeiteintraege z
      JOIN mitarbeiter m ON z.mitarbeiter_id = m.id
      WHERE ${whereClause}
      ORDER BY z.mitarbeiter_id, z.datum, z.arbeitsbeginn
    `).all(...params);

    return eintraege;
  },

  // Wochen-Totals für Export
  getWochenTotals: (mitarbeiterId, von, bis) => {
    const conditions = ['z.datum BETWEEN ? AND ?'];
    const params = [von, bis];

    if (mitarbeiterId) {
      conditions.push('z.mitarbeiter_id = ?');
      params.push(mitarbeiterId);
    }

    const whereClause = conditions.join(' AND ');

    return db.prepare(`
      SELECT
        m.id as mitarbeiter_id,
        m.name as mitarbeiter_name,
        m.mitarbeiter_nr,
        strftime('%Y', z.datum) as jahr,
        strftime('%W', z.datum) as kalenderwoche,
        MIN(z.datum) as woche_start,
        MAX(z.datum) as woche_ende,
        COUNT(DISTINCT z.datum) as arbeitstage,
        SUM(
          (strftime('%H', z.arbeitsende) * 60 + strftime('%M', z.arbeitsende)) -
          (strftime('%H', z.arbeitsbeginn) * 60 + strftime('%M', z.arbeitsbeginn)) -
          z.pause_minuten
        ) as netto_minuten,
        SUM(z.pause_minuten) as gesamt_pause
      FROM zeiteintraege z
      JOIN mitarbeiter m ON z.mitarbeiter_id = m.id
      WHERE ${whereClause}
      GROUP BY m.id, strftime('%Y-%W', z.datum)
      ORDER BY m.name, z.datum
    `).all(...params);
  },

  // AZG-Verstöße erkennen
  getAZGVerstoesse: (mitarbeiterId, von, bis) => {
    const conditions = ['z.datum BETWEEN ? AND ?'];
    const params = [von, bis];

    if (mitarbeiterId) {
      conditions.push('z.mitarbeiter_id = ?');
      params.push(mitarbeiterId);
    }

    const whereClause = conditions.join(' AND ');
    const verstoesse = [];

    // 1. Tägliche Arbeitszeit > 10 Stunden (§9 AZG)
    const tagesVerstoesse = db.prepare(`
      SELECT
        m.name as mitarbeiter_name,
        m.mitarbeiter_nr,
        z.datum,
        SUM(
          (strftime('%H', z.arbeitsende) * 60 + strftime('%M', z.arbeitsende)) -
          (strftime('%H', z.arbeitsbeginn) * 60 + strftime('%M', z.arbeitsbeginn)) -
          z.pause_minuten
        ) as netto_minuten
      FROM zeiteintraege z
      JOIN mitarbeiter m ON z.mitarbeiter_id = m.id
      WHERE ${whereClause}
      GROUP BY z.mitarbeiter_id, z.datum
      HAVING netto_minuten > 600
    `).all(...params);

    tagesVerstoesse.forEach(v => {
      verstoesse.push({
        typ: 'TAGESARBEITSZEIT',
        beschreibung: `Tägliche Arbeitszeit > 10h (§9 AZG)`,
        mitarbeiter: v.mitarbeiter_name,
        mitarbeiter_nr: v.mitarbeiter_nr,
        datum: v.datum,
        wert: Math.round(v.netto_minuten / 60 * 100) / 100,
        einheit: 'Stunden',
        grenzwert: 10
      });
    });

    // 2. Wöchentliche Arbeitszeit > 50 Stunden (§9 AZG)
    const wochenVerstoesse = db.prepare(`
      SELECT
        m.name as mitarbeiter_name,
        m.mitarbeiter_nr,
        strftime('%Y', z.datum) as jahr,
        strftime('%W', z.datum) as kalenderwoche,
        MIN(z.datum) as woche_start,
        SUM(
          (strftime('%H', z.arbeitsende) * 60 + strftime('%M', z.arbeitsende)) -
          (strftime('%H', z.arbeitsbeginn) * 60 + strftime('%M', z.arbeitsbeginn)) -
          z.pause_minuten
        ) as netto_minuten
      FROM zeiteintraege z
      JOIN mitarbeiter m ON z.mitarbeiter_id = m.id
      WHERE ${whereClause}
      GROUP BY z.mitarbeiter_id, strftime('%Y-%W', z.datum)
      HAVING netto_minuten > 3000
    `).all(...params);

    wochenVerstoesse.forEach(v => {
      verstoesse.push({
        typ: 'WOCHENARBEITSZEIT',
        beschreibung: `Wöchentliche Arbeitszeit > 50h (§9 AZG)`,
        mitarbeiter: v.mitarbeiter_name,
        mitarbeiter_nr: v.mitarbeiter_nr,
        datum: v.woche_start,
        kalenderwoche: `KW ${v.kalenderwoche}/${v.jahr}`,
        wert: Math.round(v.netto_minuten / 60 * 100) / 100,
        einheit: 'Stunden',
        grenzwert: 50
      });
    });

    // 3. Pause < 30 Min bei Arbeitszeit > 6h (§11 AZG)
    const pausenVerstoesse = db.prepare(`
      SELECT
        m.name as mitarbeiter_name,
        m.mitarbeiter_nr,
        z.datum,
        z.pause_minuten,
        (
          (strftime('%H', z.arbeitsende) * 60 + strftime('%M', z.arbeitsende)) -
          (strftime('%H', z.arbeitsbeginn) * 60 + strftime('%M', z.arbeitsbeginn))
        ) as brutto_minuten
      FROM zeiteintraege z
      JOIN mitarbeiter m ON z.mitarbeiter_id = m.id
      WHERE ${whereClause}
        AND (
          (strftime('%H', z.arbeitsende) * 60 + strftime('%M', z.arbeitsende)) -
          (strftime('%H', z.arbeitsbeginn) * 60 + strftime('%M', z.arbeitsbeginn))
        ) > 360
        AND z.pause_minuten < 30
    `).all(...params);

    pausenVerstoesse.forEach(v => {
      verstoesse.push({
        typ: 'PAUSENZEIT',
        beschreibung: `Pause < 30 Min bei > 6h Arbeitszeit (§11 AZG)`,
        mitarbeiter: v.mitarbeiter_name,
        mitarbeiter_nr: v.mitarbeiter_nr,
        datum: v.datum,
        wert: v.pause_minuten,
        einheit: 'Minuten Pause',
        grenzwert: 30
      });
    });

    return verstoesse;
  },

  // ==================== PAUSENREGELN ====================

  // Alle Pausenregeln abrufen
  getAllPausenregeln: () => {
    return db.prepare('SELECT * FROM pausenregeln ORDER BY min_arbeitszeit_minuten').all();
  },

  // Aktive Pausenregeln abrufen
  getAktivePausenregeln: () => {
    return db.prepare('SELECT * FROM pausenregeln WHERE aktiv = 1 ORDER BY min_arbeitszeit_minuten').all();
  },

  // Einzelne Pausenregel abrufen
  getPausenregelById: (id) => {
    return db.prepare('SELECT * FROM pausenregeln WHERE id = ?').get(id);
  },

  // Pausenregel erstellen
  createPausenregel: (data) => {
    return db.prepare(`
      INSERT INTO pausenregeln (name, min_arbeitszeit_minuten, min_pause_minuten, warnung_text, aktiv)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.name,
      data.min_arbeitszeit_minuten,
      data.min_pause_minuten,
      data.warnung_text || '',
      data.aktiv !== false ? 1 : 0
    );
  },

  // Pausenregel aktualisieren
  updatePausenregel: (id, data) => {
    return db.prepare(`
      UPDATE pausenregeln
      SET name = ?, min_arbeitszeit_minuten = ?, min_pause_minuten = ?, warnung_text = ?, aktiv = ?
      WHERE id = ?
    `).run(
      data.name,
      data.min_arbeitszeit_minuten,
      data.min_pause_minuten,
      data.warnung_text || '',
      data.aktiv !== false ? 1 : 0,
      id
    );
  },

  // Pausenregel löschen
  deletePausenregel: (id) => {
    return db.prepare('DELETE FROM pausenregeln WHERE id = ?').run(id);
  },

  // Pausenverstoß prüfen (für einzelnen Eintrag)
  checkPausenverstoesse: (bruttoMinuten, pauseMinuten) => {
    const regeln = db.prepare('SELECT * FROM pausenregeln WHERE aktiv = 1 ORDER BY min_arbeitszeit_minuten DESC').all();
    const verstoesse = [];

    for (const regel of regeln) {
      if (bruttoMinuten > regel.min_arbeitszeit_minuten && pauseMinuten < regel.min_pause_minuten) {
        verstoesse.push({
          regel_id: regel.id,
          regel_name: regel.name,
          min_arbeitszeit: regel.min_arbeitszeit_minuten,
          min_pause: regel.min_pause_minuten,
          ist_pause: pauseMinuten,
          warnung: regel.warnung_text
        });
      }
    }

    return verstoesse;
  },

  // ==================== EINSTELLUNGEN ====================

  // Alle Einstellungen abrufen
  getAllEinstellungen: () => {
    return db.prepare('SELECT * FROM einstellungen ORDER BY schluessel').all();
  },

  // Einzelne Einstellung abrufen
  getEinstellung: (schluessel) => {
    const row = db.prepare('SELECT wert FROM einstellungen WHERE schluessel = ?').get(schluessel);
    return row ? row.wert : null;
  },

  // Einstellung als Zahl abrufen
  getEinstellungNumber: (schluessel, defaultValue = 0) => {
    const wert = db.prepare('SELECT wert FROM einstellungen WHERE schluessel = ?').get(schluessel);
    return wert ? parseFloat(wert.wert) : defaultValue;
  },

  // Einstellung setzen
  setEinstellung: (schluessel, wert, beschreibung = null) => {
    const exists = db.prepare('SELECT schluessel FROM einstellungen WHERE schluessel = ?').get(schluessel);
    if (exists) {
      return db.prepare(`
        UPDATE einstellungen SET wert = ?, aktualisiert_am = CURRENT_TIMESTAMP WHERE schluessel = ?
      `).run(wert, schluessel);
    } else {
      return db.prepare(`
        INSERT INTO einstellungen (schluessel, wert, beschreibung) VALUES (?, ?, ?)
      `).run(schluessel, wert, beschreibung || '');
    }
  },

  // Arbeitsstunden-Konfiguration abrufen
  getArbeitszeitKonfig: () => {
    const konfig = {};
    const einstellungen = db.prepare('SELECT schluessel, wert FROM einstellungen').all();
    einstellungen.forEach(e => {
      konfig[e.schluessel] = parseFloat(e.wert) || e.wert;
    });
    return {
      standardWochenstunden: konfig.standard_wochenstunden || 40,
      standardMonatsstunden: konfig.standard_monatsstunden || 173,
      maxTagesstunden: konfig.max_tagesstunden || 10,
      maxWochenstunden: konfig.max_wochenstunden || 50
    };
  },

  // ==================== ARBEITSZEITVALIDIERUNG (AZG §9) ====================

  // Arbeitszeit-Limits (AZG-konform)
  ARBEITSZEIT_LIMITS: {
    TAEGLICH_WARNUNG: 600,      // 10 Stunden in Minuten
    TAEGLICH_VERLETZUNG: 720,   // 12 Stunden in Minuten
    WOECHENTLICH_STANDARD: 2880, // 48 Stunden in Minuten
    WOECHENTLICH_MAX: 3600      // 60 Stunden in Minuten (absolute Obergrenze)
  },

  // Validierung für einen Zeiteintrag (vor/nach Speichern)
  validateZeiteintrag: (mitarbeiterId, datum, arbeitsbeginn, arbeitsende, pauseMinuten, excludeId = null) => {
    const warnings = [];
    const violations = [];

    // Brutto- und Netto-Arbeitszeit berechnen
    const [startH, startM] = arbeitsbeginn.split(':').map(Number);
    const [endH, endM] = arbeitsende.split(':').map(Number);
    const bruttoMinuten = (endH * 60 + endM) - (startH * 60 + startM);
    const nettoMinuten = bruttoMinuten - (pauseMinuten || 0);

    // 1. Tägliche Arbeitszeit prüfen (nur dieser Eintrag)
    if (nettoMinuten > 720) {
      violations.push({
        typ: 'TAEGLICH_VERLETZUNG',
        code: 'AZG_§9_DAILY_MAX',
        nachricht: `Tägliche Arbeitszeit überschreitet 12 Stunden (${(nettoMinuten / 60).toFixed(1)}h) - AZG §9 Verletzung!`,
        wert: nettoMinuten,
        grenzwert: 720,
        schweregrad: 'KRITISCH'
      });
    } else if (nettoMinuten > 600) {
      warnings.push({
        typ: 'TAEGLICH_WARNUNG',
        code: 'AZG_§9_DAILY_WARN',
        nachricht: `Tägliche Arbeitszeit überschreitet 10 Stunden (${(nettoMinuten / 60).toFixed(1)}h) - AZG §9 Warnung`,
        wert: nettoMinuten,
        grenzwert: 600,
        schweregrad: 'WARNUNG'
      });
    }

    // 2. Gesamte Tagesarbeitszeit prüfen (alle Einträge des Tages)
    let excludeClause = '';
    const params = [mitarbeiterId, datum];
    if (excludeId) {
      excludeClause = ' AND id != ?';
      params.push(excludeId);
    }

    const tagesTotal = db.prepare(`
      SELECT COALESCE(SUM(
        (strftime('%H', arbeitsende) * 60 + strftime('%M', arbeitsende)) -
        (strftime('%H', arbeitsbeginn) * 60 + strftime('%M', arbeitsbeginn)) -
        pause_minuten
      ), 0) as total
      FROM zeiteintraege
      WHERE mitarbeiter_id = ? AND datum = ?${excludeClause}
    `).get(...params);

    const gesamtTagMinuten = (tagesTotal?.total || 0) + nettoMinuten;

    if (gesamtTagMinuten > 720) {
      violations.push({
        typ: 'TAEGLICH_GESAMT_VERLETZUNG',
        code: 'AZG_§9_DAILY_TOTAL_MAX',
        nachricht: `Gesamte Tagesarbeitszeit überschreitet 12 Stunden (${(gesamtTagMinuten / 60).toFixed(1)}h) - AZG §9 Verletzung!`,
        wert: gesamtTagMinuten,
        grenzwert: 720,
        schweregrad: 'KRITISCH'
      });
    } else if (gesamtTagMinuten > 600 && nettoMinuten <= 600) {
      warnings.push({
        typ: 'TAEGLICH_GESAMT_WARNUNG',
        code: 'AZG_§9_DAILY_TOTAL_WARN',
        nachricht: `Gesamte Tagesarbeitszeit überschreitet 10 Stunden (${(gesamtTagMinuten / 60).toFixed(1)}h) - AZG §9 Warnung`,
        wert: gesamtTagMinuten,
        grenzwert: 600,
        schweregrad: 'WARNUNG'
      });
    }

    // 3. Wöchentliche Arbeitszeit prüfen
    const wochenTotal = db.prepare(`
      SELECT COALESCE(SUM(
        (strftime('%H', arbeitsende) * 60 + strftime('%M', arbeitsende)) -
        (strftime('%H', arbeitsbeginn) * 60 + strftime('%M', arbeitsbeginn)) -
        pause_minuten
      ), 0) as total
      FROM zeiteintraege
      WHERE mitarbeiter_id = ?
        AND strftime('%Y-%W', datum) = strftime('%Y-%W', ?)
        ${excludeId ? 'AND id != ?' : ''}
    `).get(mitarbeiterId, datum, ...(excludeId ? [excludeId] : []));

    const gesamtWocheMinuten = (wochenTotal?.total || 0) + nettoMinuten;

    if (gesamtWocheMinuten > 3600) {
      violations.push({
        typ: 'WOECHENTLICH_VERLETZUNG',
        code: 'AZG_§9_WEEKLY_MAX',
        nachricht: `Wöchentliche Arbeitszeit überschreitet 60 Stunden (${(gesamtWocheMinuten / 60).toFixed(1)}h) - AZG §9 Verletzung!`,
        wert: gesamtWocheMinuten,
        grenzwert: 3600,
        schweregrad: 'KRITISCH'
      });
    } else if (gesamtWocheMinuten > 2880) {
      warnings.push({
        typ: 'WOECHENTLICH_WARNUNG',
        code: 'AZG_§9_WEEKLY_WARN',
        nachricht: `Wöchentliche Arbeitszeit überschreitet 48 Stunden (${(gesamtWocheMinuten / 60).toFixed(1)}h) - AZG §9 Warnung`,
        wert: gesamtWocheMinuten,
        grenzwert: 2880,
        schweregrad: 'WARNUNG'
      });
    }

    return {
      valid: violations.length === 0,
      warnings,
      violations,
      tagesMinuten: gesamtTagMinuten,
      wochenMinuten: gesamtWocheMinuten
    };
  },

  // Erweiterte AZG-Verstöße (inkl. 12h-Verletzungen)
  getAZGVerstoesseErweitert: (mitarbeiterId, von, bis) => {
    const conditions = ['z.datum BETWEEN ? AND ?'];
    const params = [von, bis];

    if (mitarbeiterId) {
      conditions.push('z.mitarbeiter_id = ?');
      params.push(mitarbeiterId);
    }

    const whereClause = conditions.join(' AND ');
    const verstoesse = [];

    // 1. Tägliche Arbeitszeit > 12h (VERLETZUNG)
    const tagesVerletzungen = db.prepare(`
      SELECT
        z.mitarbeiter_id,
        m.name as mitarbeiter_name,
        m.mitarbeiter_nr,
        z.datum,
        SUM(
          (strftime('%H', z.arbeitsende) * 60 + strftime('%M', z.arbeitsende)) -
          (strftime('%H', z.arbeitsbeginn) * 60 + strftime('%M', z.arbeitsbeginn)) -
          z.pause_minuten
        ) as netto_minuten
      FROM zeiteintraege z
      JOIN mitarbeiter m ON z.mitarbeiter_id = m.id
      WHERE ${whereClause}
      GROUP BY z.mitarbeiter_id, z.datum
      HAVING netto_minuten > 720
    `).all(...params);

    tagesVerletzungen.forEach(v => {
      verstoesse.push({
        typ: 'TAEGLICH_VERLETZUNG',
        schweregrad: 'KRITISCH',
        beschreibung: `Tägliche Arbeitszeit > 12h (§9 AZG VERLETZUNG)`,
        mitarbeiter_id: v.mitarbeiter_id,
        mitarbeiter: v.mitarbeiter_name,
        mitarbeiter_nr: v.mitarbeiter_nr,
        datum: v.datum,
        wert: Math.round(v.netto_minuten / 60 * 100) / 100,
        einheit: 'Stunden',
        grenzwert: 12
      });
    });

    // 2. Tägliche Arbeitszeit > 10h (WARNUNG)
    const tagesWarnungen = db.prepare(`
      SELECT
        z.mitarbeiter_id,
        m.name as mitarbeiter_name,
        m.mitarbeiter_nr,
        z.datum,
        SUM(
          (strftime('%H', z.arbeitsende) * 60 + strftime('%M', z.arbeitsende)) -
          (strftime('%H', z.arbeitsbeginn) * 60 + strftime('%M', z.arbeitsbeginn)) -
          z.pause_minuten
        ) as netto_minuten
      FROM zeiteintraege z
      JOIN mitarbeiter m ON z.mitarbeiter_id = m.id
      WHERE ${whereClause}
      GROUP BY z.mitarbeiter_id, z.datum
      HAVING netto_minuten > 600 AND netto_minuten <= 720
    `).all(...params);

    tagesWarnungen.forEach(v => {
      verstoesse.push({
        typ: 'TAEGLICH_WARNUNG',
        schweregrad: 'WARNUNG',
        beschreibung: `Tägliche Arbeitszeit > 10h (§9 AZG Warnung)`,
        mitarbeiter_id: v.mitarbeiter_id,
        mitarbeiter: v.mitarbeiter_name,
        mitarbeiter_nr: v.mitarbeiter_nr,
        datum: v.datum,
        wert: Math.round(v.netto_minuten / 60 * 100) / 100,
        einheit: 'Stunden',
        grenzwert: 10
      });
    });

    // 3. Wöchentliche > 60h (VERLETZUNG)
    const wochenVerletzungen = db.prepare(`
      SELECT
        z.mitarbeiter_id,
        m.name as mitarbeiter_name,
        m.mitarbeiter_nr,
        strftime('%Y', z.datum) as jahr,
        strftime('%W', z.datum) as kalenderwoche,
        MIN(z.datum) as woche_start,
        SUM(
          (strftime('%H', z.arbeitsende) * 60 + strftime('%M', z.arbeitsende)) -
          (strftime('%H', z.arbeitsbeginn) * 60 + strftime('%M', z.arbeitsbeginn)) -
          z.pause_minuten
        ) as netto_minuten
      FROM zeiteintraege z
      JOIN mitarbeiter m ON z.mitarbeiter_id = m.id
      WHERE ${whereClause}
      GROUP BY z.mitarbeiter_id, strftime('%Y-%W', z.datum)
      HAVING netto_minuten > 3600
    `).all(...params);

    wochenVerletzungen.forEach(v => {
      verstoesse.push({
        typ: 'WOECHENTLICH_VERLETZUNG',
        schweregrad: 'KRITISCH',
        beschreibung: `Wöchentliche Arbeitszeit > 60h (§9 AZG VERLETZUNG)`,
        mitarbeiter_id: v.mitarbeiter_id,
        mitarbeiter: v.mitarbeiter_name,
        mitarbeiter_nr: v.mitarbeiter_nr,
        datum: v.woche_start,
        kalenderwoche: `KW ${v.kalenderwoche}/${v.jahr}`,
        wert: Math.round(v.netto_minuten / 60 * 100) / 100,
        einheit: 'Stunden',
        grenzwert: 60
      });
    });

    // 4. Wöchentliche > 48h (WARNUNG)
    const wochenWarnungen = db.prepare(`
      SELECT
        z.mitarbeiter_id,
        m.name as mitarbeiter_name,
        m.mitarbeiter_nr,
        strftime('%Y', z.datum) as jahr,
        strftime('%W', z.datum) as kalenderwoche,
        MIN(z.datum) as woche_start,
        SUM(
          (strftime('%H', z.arbeitsende) * 60 + strftime('%M', z.arbeitsende)) -
          (strftime('%H', z.arbeitsbeginn) * 60 + strftime('%M', z.arbeitsbeginn)) -
          z.pause_minuten
        ) as netto_minuten
      FROM zeiteintraege z
      JOIN mitarbeiter m ON z.mitarbeiter_id = m.id
      WHERE ${whereClause}
      GROUP BY z.mitarbeiter_id, strftime('%Y-%W', z.datum)
      HAVING netto_minuten > 2880 AND netto_minuten <= 3600
    `).all(...params);

    wochenWarnungen.forEach(v => {
      verstoesse.push({
        typ: 'WOECHENTLICH_WARNUNG',
        schweregrad: 'WARNUNG',
        beschreibung: `Wöchentliche Arbeitszeit > 48h (§9 AZG Warnung)`,
        mitarbeiter_id: v.mitarbeiter_id,
        mitarbeiter: v.mitarbeiter_name,
        mitarbeiter_nr: v.mitarbeiter_nr,
        datum: v.woche_start,
        kalenderwoche: `KW ${v.kalenderwoche}/${v.jahr}`,
        wert: Math.round(v.netto_minuten / 60 * 100) / 100,
        einheit: 'Stunden',
        grenzwert: 48
      });
    });

    // Nach Schweregrad und Datum sortieren
    verstoesse.sort((a, b) => {
      if (a.schweregrad === 'KRITISCH' && b.schweregrad !== 'KRITISCH') return -1;
      if (b.schweregrad === 'KRITISCH' && a.schweregrad !== 'KRITISCH') return 1;
      return new Date(b.datum) - new Date(a.datum);
    });

    return verstoesse;
  },

  // Validierungsereignis im Audit-Log speichern
  logValidation: (mitarbeiterId, zeiteintragId, validationResult, ipAdresse = null) => {
    if (validationResult.violations.length > 0 || validationResult.warnings.length > 0) {
      const ereignisse = [
        ...validationResult.violations.map(v => ({ ...v, schweregrad: 'KRITISCH' })),
        ...validationResult.warnings.map(w => ({ ...w, schweregrad: 'WARNUNG' }))
      ];

      // Als Audit-Eintrag speichern
      const lastEntry = db.prepare('SELECT eintrag_hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
      const vorherigerHash = lastEntry?.eintrag_hash || 'GENESIS';
      const zeitpunkt = new Date().toISOString().replace('T', ' ').substring(0, 19);

      const neueWerteJson = JSON.stringify({
        ereignisse,
        tagesMinuten: validationResult.tagesMinuten,
        wochenMinuten: validationResult.wochenMinuten
      });

      const hashData = `${zeitpunkt}|${mitarbeiterId}|VALIDATION|zeiteintraege|${zeiteintragId}|null|${neueWerteJson}|${vorherigerHash}`;
      const eintragHash = crypto.createHash('sha256').update(hashData).digest('hex');

      return db.prepare(`
        INSERT INTO audit_log (zeitpunkt, mitarbeiter_id, aktion, tabelle, datensatz_id, alte_werte, neue_werte, ip_adresse, vorheriger_hash, eintrag_hash)
        VALUES (?, ?, 'VALIDATION', 'zeiteintraege', ?, NULL, ?, ?, ?, ?)
      `).run(
        zeitpunkt,
        mitarbeiterId,
        zeiteintragId,
        neueWerteJson,
        ipAdresse,
        vorherigerHash,
        eintragHash
      );
    }
    return null;
  },

  // ==================== GLEITZEIT FUNKTIONEN ====================

  // Gleitzeit-Konfiguration abrufen
  getGleitzeitKonfig: () => {
    const konfig = {};
    const keys = [
      'gleitzeit_aktiv',
      'gleitzeit_durchrechnungszeitraum',
      'gleitzeit_max_plus',
      'gleitzeit_max_minus',
      'gleitzeit_uebertrag_max',
      'gleitzeit_verfall_monate',
      'standard_monatsstunden'
    ];
    keys.forEach(key => {
      const row = db.prepare('SELECT wert FROM einstellungen WHERE schluessel = ?').get(key);
      konfig[key] = row ? parseFloat(row.wert) : 0;
    });
    return {
      aktiv: konfig.gleitzeit_aktiv === 1,
      durchrechnungszeitraum: konfig.gleitzeit_durchrechnungszeitraum || 1,
      maxPlus: konfig.gleitzeit_max_plus || 40,
      maxMinus: konfig.gleitzeit_max_minus || 20,
      uebertragMax: konfig.gleitzeit_uebertrag_max || 20,
      verfallMonate: konfig.gleitzeit_verfall_monate || 0,
      sollMonatsstunden: konfig.standard_monatsstunden || 173
    };
  },

  // Periodenstart berechnen basierend auf Durchrechnungszeitraum
  berechnePeriode: (jahr, monat, durchrechnungszeitraum) => {
    // Periode basiert auf Durchrechnungszeitraum (1, 3, 6, 12 Monate)
    const periodenProJahr = 12 / durchrechnungszeitraum;
    const periodenIndex = Math.floor((monat - 1) / durchrechnungszeitraum);
    const startMonat = periodenIndex * durchrechnungszeitraum + 1;
    const endeMonat = startMonat + durchrechnungszeitraum - 1;

    const periodeStart = `${jahr}-${String(startMonat).padStart(2, '0')}-01`;

    // Ende-Datum berechnen (letzter Tag des Endmonats)
    let endeJahr = jahr;
    let endeM = endeMonat;
    if (endeMonat > 12) {
      endeM = endeMonat - 12;
      endeJahr = jahr + 1;
    }
    const letzterTag = new Date(endeJahr, endeM, 0).getDate();
    const periodeEnde = `${endeJahr}-${String(endeM).padStart(2, '0')}-${String(letzterTag).padStart(2, '0')}`;

    return { periodeStart, periodeEnde, startMonat, endeMonat: endeM, jahr, endeJahr };
  },

  // Ist-Stunden für einen Zeitraum berechnen
  berechneIstMinuten: (mitarbeiterId, von, bis) => {
    const result = db.prepare(`
      SELECT COALESCE(SUM(
        (strftime('%H', arbeitsende) * 60 + strftime('%M', arbeitsende)) -
        (strftime('%H', arbeitsbeginn) * 60 + strftime('%M', arbeitsbeginn)) -
        pause_minuten
      ), 0) as total
      FROM zeiteintraege
      WHERE mitarbeiter_id = ? AND datum BETWEEN ? AND ?
    `).get(mitarbeiterId, von, bis);
    return result?.total || 0;
  },

  // Soll-Stunden für einen Zeitraum berechnen (basierend auf Arbeitstagen)
  berechneSollMinuten: (von, bis, sollMonatsstunden) => {
    // Vereinfachte Berechnung: Monatsstunden * Anzahl Monate
    const start = new Date(von);
    const end = new Date(bis);
    const monate = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    return Math.round(sollMonatsstunden * 60 * monate);
  },

  // Gleitzeit-Saldo für einen Mitarbeiter berechnen (aktuelle Periode)
  getGleitzeitSaldo: (mitarbeiterId, jahr = null, monat = null) => {
    const konfig = module.exports.getGleitzeitKonfig();

    if (!konfig.aktiv) {
      return { aktiv: false, message: 'Gleitzeit ist nicht aktiviert' };
    }

    const heute = new Date();
    const aktJahr = jahr || heute.getFullYear();
    const aktMonat = monat || (heute.getMonth() + 1);

    const periode = module.exports.berechnePeriode(aktJahr, aktMonat, konfig.durchrechnungszeitraum);

    // Prüfe ob bereits gespeicherter Saldo existiert
    let saldo = db.prepare(`
      SELECT * FROM gleitzeit_saldo
      WHERE mitarbeiter_id = ? AND periode_start = ?
    `).get(mitarbeiterId, periode.periodeStart);

    // Ist-Minuten neu berechnen
    const istMinuten = module.exports.berechneIstMinuten(mitarbeiterId, periode.periodeStart, periode.periodeEnde);

    // Soll-Minuten berechnen
    const sollMinuten = module.exports.berechneSollMinuten(periode.periodeStart, periode.periodeEnde, konfig.sollMonatsstunden);

    // Übertrag aus Vorperiode holen
    let uebertragVorperiode = 0;
    const vorperiode = module.exports.berechnePeriode(
      aktMonat <= konfig.durchrechnungszeitraum ? aktJahr - 1 : aktJahr,
      aktMonat <= konfig.durchrechnungszeitraum ? 12 - konfig.durchrechnungszeitraum + aktMonat : aktMonat - konfig.durchrechnungszeitraum,
      konfig.durchrechnungszeitraum
    );

    const vorperiodeSaldo = db.prepare(`
      SELECT uebertrag_naechste FROM gleitzeit_saldo
      WHERE mitarbeiter_id = ? AND periode_start = ? AND abgeschlossen = 1
    `).get(mitarbeiterId, vorperiode.periodeStart);

    if (vorperiodeSaldo) {
      uebertragVorperiode = vorperiodeSaldo.uebertrag_naechste;
    }

    // Saldo berechnen
    const saldoMinuten = istMinuten - sollMinuten + uebertragVorperiode;
    const saldoStunden = saldoMinuten / 60;

    // Kappung prüfen
    let gekapptePlus = 0;
    let gekapptesMinus = 0;
    let effektiverSaldo = saldoMinuten;

    if (saldoStunden > konfig.maxPlus) {
      gekapptePlus = (saldoStunden - konfig.maxPlus) * 60;
      effektiverSaldo = konfig.maxPlus * 60;
    } else if (saldoStunden < -konfig.maxMinus) {
      gekapptesMinus = (-konfig.maxMinus - saldoStunden) * 60;
      effektiverSaldo = -konfig.maxMinus * 60;
    }

    // Saldo speichern/aktualisieren
    if (saldo) {
      db.prepare(`
        UPDATE gleitzeit_saldo
        SET ist_minuten = ?, soll_minuten = ?, saldo_minuten = ?,
            uebertrag_vorperiode = ?, aktualisiert_am = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(istMinuten, sollMinuten, effektiverSaldo, uebertragVorperiode, saldo.id);
    } else {
      db.prepare(`
        INSERT INTO gleitzeit_saldo (mitarbeiter_id, periode_start, periode_ende, soll_minuten, ist_minuten, saldo_minuten, uebertrag_vorperiode)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(mitarbeiterId, periode.periodeStart, periode.periodeEnde, sollMinuten, istMinuten, effektiverSaldo, uebertragVorperiode);
    }

    return {
      aktiv: true,
      periode: {
        start: periode.periodeStart,
        ende: periode.periodeEnde,
        durchrechnungszeitraum: konfig.durchrechnungszeitraum
      },
      sollMinuten,
      sollStunden: (sollMinuten / 60).toFixed(2),
      istMinuten,
      istStunden: (istMinuten / 60).toFixed(2),
      uebertragVorperiode,
      uebertragStunden: (uebertragVorperiode / 60).toFixed(2),
      saldoMinuten: effektiverSaldo,
      saldoStunden: (effektiverSaldo / 60).toFixed(2),
      gekapptePlus: (gekapptePlus / 60).toFixed(2),
      gekapptesMinus: (gekapptesMinus / 60).toFixed(2),
      limits: {
        maxPlus: konfig.maxPlus,
        maxMinus: konfig.maxMinus,
        uebertragMax: konfig.uebertragMax
      }
    };
  },

  // Periode abschließen (mit Übertrag-Berechnung)
  schliesseGleitzeitPeriode: (mitarbeiterId, periodeStart) => {
    const konfig = module.exports.getGleitzeitKonfig();

    const saldo = db.prepare(`
      SELECT * FROM gleitzeit_saldo
      WHERE mitarbeiter_id = ? AND periode_start = ?
    `).get(mitarbeiterId, periodeStart);

    if (!saldo) {
      return { success: false, error: 'Periode nicht gefunden' };
    }

    if (saldo.abgeschlossen) {
      return { success: false, error: 'Periode bereits abgeschlossen' };
    }

    // Übertrag für nächste Periode berechnen (mit Kappung)
    let uebertragNaechste = saldo.saldo_minuten;
    let verfallenMinuten = 0;

    // Positiver Saldo: Maximal uebertragMax übertragen
    if (uebertragNaechste > 0) {
      const maxUebertrag = konfig.uebertragMax * 60;
      if (uebertragNaechste > maxUebertrag) {
        verfallenMinuten = uebertragNaechste - maxUebertrag;
        uebertragNaechste = maxUebertrag;
      }
    }
    // Negativer Saldo wird komplett übertragen (Schulden verfallen nicht)

    db.prepare(`
      UPDATE gleitzeit_saldo
      SET abgeschlossen = 1, uebertrag_naechste = ?, verfallen_minuten = ?, aktualisiert_am = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(uebertragNaechste, verfallenMinuten, saldo.id);

    return {
      success: true,
      saldoMinuten: saldo.saldo_minuten,
      uebertragNaechste,
      verfallenMinuten,
      verfallenStunden: (verfallenMinuten / 60).toFixed(2)
    };
  },

  // Gleitzeit-Historie für einen Mitarbeiter
  getGleitzeitHistorie: (mitarbeiterId, limit = 12) => {
    return db.prepare(`
      SELECT * FROM gleitzeit_saldo
      WHERE mitarbeiter_id = ?
      ORDER BY periode_start DESC
      LIMIT ?
    `).all(mitarbeiterId, limit);
  },

  // Gleitzeit-Übersicht für alle Mitarbeiter (Admin)
  getGleitzeitUebersicht: (jahr = null, monat = null) => {
    const konfig = module.exports.getGleitzeitKonfig();

    if (!konfig.aktiv) {
      return { aktiv: false, mitarbeiter: [] };
    }

    const heute = new Date();
    const aktJahr = jahr || heute.getFullYear();
    const aktMonat = monat || (heute.getMonth() + 1);
    const periode = module.exports.berechnePeriode(aktJahr, aktMonat, konfig.durchrechnungszeitraum);

    // Alle aktiven Mitarbeiter holen
    const mitarbeiter = db.prepare(`
      SELECT id, mitarbeiter_nr, name FROM mitarbeiter WHERE aktiv = 1 ORDER BY name
    `).all();

    const uebersicht = mitarbeiter.map(m => {
      const saldo = module.exports.getGleitzeitSaldo(m.id, aktJahr, aktMonat);
      return {
        mitarbeiter_id: m.id,
        mitarbeiter_nr: m.mitarbeiter_nr,
        name: m.name,
        ...saldo
      };
    });

    return {
      aktiv: true,
      periode: {
        start: periode.periodeStart,
        ende: periode.periodeEnde,
        durchrechnungszeitraum: konfig.durchrechnungszeitraum
      },
      konfig,
      mitarbeiter: uebersicht
    };
  },

  // ==================== MONATSBESTÄTIGUNG FUNKTIONEN ====================

  // Monatsbestätigung erstellen
  bestaetigeMonat: (mitarbeiterId, jahr, monat, ipAdresse = null, kommentar = null) => {
    // Prüfen ob bereits bestätigt
    const existing = db.prepare(`
      SELECT id FROM monatsbestaetigung WHERE mitarbeiter_id = ? AND jahr = ? AND monat = ?
    `).get(mitarbeiterId, jahr, monat);

    if (existing) {
      return { success: false, error: 'Monat bereits bestätigt', already_confirmed: true };
    }

    // Prüfen ob Einträge für diesen Monat existieren
    const startDatum = `${jahr}-${String(monat).padStart(2, '0')}-01`;
    const endeDatum = `${jahr}-${String(monat).padStart(2, '0')}-31`;

    const eintraege = db.prepare(`
      SELECT COUNT(*) as anzahl FROM zeiteintraege
      WHERE mitarbeiter_id = ? AND datum BETWEEN ? AND ?
    `).get(mitarbeiterId, startDatum, endeDatum);

    if (eintraege.anzahl === 0) {
      return { success: false, error: 'Keine Einträge für diesen Monat vorhanden' };
    }

    // Bestätigung speichern
    const zeitpunkt = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const result = db.prepare(`
      INSERT INTO monatsbestaetigung (mitarbeiter_id, jahr, monat, bestaetigt_am, ip_adresse, kommentar)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(mitarbeiterId, jahr, monat, zeitpunkt, ipAdresse, kommentar);

    // Audit-Log Eintrag
    const lastEntry = db.prepare('SELECT eintrag_hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
    const vorherigerHash = lastEntry?.eintrag_hash || 'GENESIS';

    const neueWerteJson = JSON.stringify({
      jahr,
      monat,
      bestaetigt_am: zeitpunkt,
      eintraege_anzahl: eintraege.anzahl
    });

    const hashData = `${zeitpunkt}|${mitarbeiterId}|CONFIRM|monatsbestaetigung|${result.lastInsertRowid}|null|${neueWerteJson}|${vorherigerHash}`;
    const eintragHash = crypto.createHash('sha256').update(hashData).digest('hex');

    db.prepare(`
      INSERT INTO audit_log (zeitpunkt, mitarbeiter_id, aktion, tabelle, datensatz_id, alte_werte, neue_werte, ip_adresse, vorheriger_hash, eintrag_hash)
      VALUES (?, ?, 'CONFIRM', 'monatsbestaetigung', ?, NULL, ?, ?, ?, ?)
    `).run(
      zeitpunkt,
      mitarbeiterId,
      result.lastInsertRowid,
      neueWerteJson,
      ipAdresse,
      vorherigerHash,
      eintragHash
    );

    return {
      success: true,
      id: result.lastInsertRowid,
      bestaetigt_am: zeitpunkt,
      eintraege_anzahl: eintraege.anzahl
    };
  },

  // Bestätigungsstatus für einen Monat prüfen
  getMonatsbestaetigung: (mitarbeiterId, jahr, monat) => {
    const bestaetigung = db.prepare(`
      SELECT mb.*, m.name as mitarbeiter_name, m.mitarbeiter_nr
      FROM monatsbestaetigung mb
      JOIN mitarbeiter m ON m.id = mb.mitarbeiter_id
      WHERE mb.mitarbeiter_id = ? AND mb.jahr = ? AND mb.monat = ?
    `).get(mitarbeiterId, jahr, monat);

    return bestaetigung || null;
  },

  // Alle Bestätigungen für einen Mitarbeiter
  getMitarbeiterBestaetigungen: (mitarbeiterId, limit = 24) => {
    return db.prepare(`
      SELECT * FROM monatsbestaetigung
      WHERE mitarbeiter_id = ?
      ORDER BY jahr DESC, monat DESC
      LIMIT ?
    `).all(mitarbeiterId, limit);
  },

  // Bestätigungsübersicht für Admin (alle Mitarbeiter für einen Monat)
  getBestaetigungsUebersicht: (jahr, monat) => {
    // Alle aktiven Mitarbeiter holen
    const mitarbeiter = db.prepare(`
      SELECT id, mitarbeiter_nr, name FROM mitarbeiter WHERE aktiv = 1 ORDER BY name
    `).all();

    const startDatum = `${jahr}-${String(monat).padStart(2, '0')}-01`;
    const endeDatum = `${jahr}-${String(monat).padStart(2, '0')}-31`;

    return mitarbeiter.map(m => {
      // Bestätigung prüfen
      const bestaetigung = db.prepare(`
        SELECT bestaetigt_am FROM monatsbestaetigung
        WHERE mitarbeiter_id = ? AND jahr = ? AND monat = ?
      `).get(m.id, jahr, monat);

      // Einträge zählen
      const eintraege = db.prepare(`
        SELECT COUNT(*) as anzahl,
               COALESCE(SUM(
                 (strftime('%H', arbeitsende) * 60 + strftime('%M', arbeitsende)) -
                 (strftime('%H', arbeitsbeginn) * 60 + strftime('%M', arbeitsbeginn)) -
                 pause_minuten
               ), 0) as minuten
        FROM zeiteintraege
        WHERE mitarbeiter_id = ? AND datum BETWEEN ? AND ?
      `).get(m.id, startDatum, endeDatum);

      return {
        mitarbeiter_id: m.id,
        mitarbeiter_nr: m.mitarbeiter_nr,
        name: m.name,
        eintraege: eintraege.anzahl,
        stunden: (eintraege.minuten / 60).toFixed(2),
        bestaetigt: !!bestaetigung,
        bestaetigt_am: bestaetigung?.bestaetigt_am || null
      };
    });
  },

  // ==================== KOLLEKTIVVERTRAG (KV) FUNKTIONEN ====================

  // Alle Kollektivverträge abrufen
  getAllKollektivvertraege: (nurAktive = true) => {
    const whereClause = nurAktive ? 'WHERE aktiv = 1' : '';
    return db.prepare(`
      SELECT kv.*,
        (SELECT COUNT(*) FROM kv_gruppen WHERE kv_id = kv.id) as gruppen_anzahl,
        (SELECT COUNT(*) FROM kv_regeln WHERE kv_id = kv.id) as regeln_anzahl
      FROM kv_kollektivvertraege kv
      ${whereClause}
      ORDER BY name
    `).all();
  },

  // Einzelnen KV abrufen
  getKollektivvertrag: (id) => {
    return db.prepare('SELECT * FROM kv_kollektivvertraege WHERE id = ?').get(id);
  },

  // KV erstellen
  createKollektivvertrag: (data) => {
    return db.prepare(`
      INSERT INTO kv_kollektivvertraege (name, beschreibung, branche, gueltig_ab, gueltig_bis, aktiv)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.name,
      data.beschreibung || '',
      data.branche || '',
      data.gueltig_ab || null,
      data.gueltig_bis || null,
      data.aktiv !== false ? 1 : 0
    );
  },

  // KV aktualisieren
  updateKollektivvertrag: (id, data) => {
    return db.prepare(`
      UPDATE kv_kollektivvertraege
      SET name = ?, beschreibung = ?, branche = ?, gueltig_ab = ?, gueltig_bis = ?, aktiv = ?
      WHERE id = ?
    `).run(
      data.name,
      data.beschreibung || '',
      data.branche || '',
      data.gueltig_ab || null,
      data.gueltig_bis || null,
      data.aktiv !== false ? 1 : 0,
      id
    );
  },

  // KV löschen (mit allen Regeln und Gruppen)
  deleteKollektivvertrag: (id) => {
    // Erst prüfen ob Mitarbeiter zugeordnet sind
    const zugeordnet = db.prepare(`
      SELECT COUNT(*) as count FROM mitarbeiter m
      JOIN kv_gruppen g ON m.kv_gruppe_id = g.id
      WHERE g.kv_id = ?
    `).get(id);

    if (zugeordnet.count > 0) {
      return { success: false, error: 'KV hat noch zugeordnete Mitarbeiter' };
    }

    db.prepare('DELETE FROM kv_regeln WHERE kv_id = ?').run(id);
    db.prepare('DELETE FROM kv_gruppen WHERE kv_id = ?').run(id);
    db.prepare('DELETE FROM kv_kollektivvertraege WHERE id = ?').run(id);
    return { success: true };
  },

  // KV-Gruppen für einen KV abrufen
  getKVGruppen: (kvId, nurAktive = true) => {
    const whereClause = nurAktive ? 'AND g.aktiv = 1' : '';
    return db.prepare(`
      SELECT g.*,
        (SELECT COUNT(*) FROM mitarbeiter WHERE kv_gruppe_id = g.id) as mitarbeiter_anzahl
      FROM kv_gruppen g
      WHERE g.kv_id = ? ${whereClause}
      ORDER BY g.name
    `).all(kvId);
  },

  // Alle KV-Gruppen (für Dropdowns)
  getAllKVGruppen: (nurAktive = true) => {
    const whereClause = nurAktive ? 'WHERE g.aktiv = 1 AND kv.aktiv = 1' : '';
    return db.prepare(`
      SELECT g.*, kv.name as kv_name
      FROM kv_gruppen g
      JOIN kv_kollektivvertraege kv ON kv.id = g.kv_id
      ${whereClause}
      ORDER BY kv.name, g.name
    `).all();
  },

  // Einzelne Gruppe abrufen
  getKVGruppe: (id) => {
    return db.prepare(`
      SELECT g.*, kv.name as kv_name
      FROM kv_gruppen g
      JOIN kv_kollektivvertraege kv ON kv.id = g.kv_id
      WHERE g.id = ?
    `).get(id);
  },

  // KV-Gruppe erstellen
  createKVGruppe: (data) => {
    return db.prepare(`
      INSERT INTO kv_gruppen (kv_id, name, beschreibung, standard_wochenstunden, standard_monatsstunden, aktiv)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.kv_id,
      data.name,
      data.beschreibung || '',
      data.standard_wochenstunden || 40,
      data.standard_monatsstunden || 173,
      data.aktiv !== false ? 1 : 0
    );
  },

  // KV-Gruppe aktualisieren
  updateKVGruppe: (id, data) => {
    return db.prepare(`
      UPDATE kv_gruppen
      SET name = ?, beschreibung = ?, standard_wochenstunden = ?, standard_monatsstunden = ?, aktiv = ?
      WHERE id = ?
    `).run(
      data.name,
      data.beschreibung || '',
      data.standard_wochenstunden || 40,
      data.standard_monatsstunden || 173,
      data.aktiv !== false ? 1 : 0,
      id
    );
  },

  // KV-Gruppe löschen
  deleteKVGruppe: (id) => {
    // Erst Mitarbeiter von der Gruppe lösen
    db.prepare('UPDATE mitarbeiter SET kv_gruppe_id = NULL WHERE kv_gruppe_id = ?').run(id);
    return db.prepare('DELETE FROM kv_gruppen WHERE id = ?').run(id);
  },

  // KV-Regeln für einen KV abrufen
  getKVRegeln: (kvId, nurAktive = true) => {
    const whereClause = nurAktive ? 'AND aktiv = 1' : '';
    return db.prepare(`
      SELECT * FROM kv_regeln
      WHERE kv_id = ? ${whereClause}
      ORDER BY prioritaet DESC, regel_typ, name
    `).all(kvId);
  },

  // Einzelne Regel abrufen
  getKVRegel: (id) => {
    return db.prepare('SELECT * FROM kv_regeln WHERE id = ?').get(id);
  },

  // KV-Regel erstellen
  createKVRegel: (data) => {
    return db.prepare(`
      INSERT INTO kv_regeln (kv_id, regel_typ, name, bedingung, wert, einheit, prioritaet, aktiv)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.kv_id,
      data.regel_typ,
      data.name,
      data.bedingung ? JSON.stringify(data.bedingung) : null,
      data.wert,
      data.einheit || 'PROZENT',
      data.prioritaet || 0,
      data.aktiv !== false ? 1 : 0
    );
  },

  // KV-Regel aktualisieren
  updateKVRegel: (id, data) => {
    return db.prepare(`
      UPDATE kv_regeln
      SET regel_typ = ?, name = ?, bedingung = ?, wert = ?, einheit = ?, prioritaet = ?, aktiv = ?
      WHERE id = ?
    `).run(
      data.regel_typ,
      data.name,
      data.bedingung ? JSON.stringify(data.bedingung) : null,
      data.wert,
      data.einheit || 'PROZENT',
      data.prioritaet || 0,
      data.aktiv !== false ? 1 : 0,
      id
    );
  },

  // KV-Regel löschen
  deleteKVRegel: (id) => {
    return db.prepare('DELETE FROM kv_regeln WHERE id = ?').run(id);
  },

  // Mitarbeiter einer KV-Gruppe zuordnen
  setMitarbeiterKVGruppe: (mitarbeiterId, kvGruppeId) => {
    return db.prepare('UPDATE mitarbeiter SET kv_gruppe_id = ? WHERE id = ?').run(kvGruppeId, mitarbeiterId);
  },

  // KV-Gruppe für Mitarbeiter abrufen
  getMitarbeiterKVGruppe: (mitarbeiterId) => {
    return db.prepare(`
      SELECT g.*, kv.name as kv_name, kv.id as kv_id
      FROM mitarbeiter m
      JOIN kv_gruppen g ON m.kv_gruppe_id = g.id
      JOIN kv_kollektivvertraege kv ON kv.id = g.kv_id
      WHERE m.id = ?
    `).get(mitarbeiterId);
  },

  // Regeln für Mitarbeiter anwenden (Rule Engine)
  anwendeKVRegeln: (mitarbeiterId, zeiteintrag) => {
    // KV-Gruppe des Mitarbeiters holen
    const gruppe = db.prepare(`
      SELECT g.*, kv.id as kv_id
      FROM mitarbeiter m
      JOIN kv_gruppen g ON m.kv_gruppe_id = g.id
      JOIN kv_kollektivvertraege kv ON kv.id = g.kv_id
      WHERE m.id = ? AND g.aktiv = 1 AND kv.aktiv = 1
    `).get(mitarbeiterId);

    if (!gruppe) {
      return { regeln: [], zuschlaege: [] };
    }

    // Regeln für diesen KV holen
    const regeln = db.prepare(`
      SELECT * FROM kv_regeln
      WHERE kv_id = ? AND aktiv = 1
      ORDER BY prioritaet DESC
    `).all(gruppe.kv_id);

    const angewendeteRegeln = [];
    const zuschlaege = [];

    // Arbeitszeit berechnen
    const [startH, startM] = zeiteintrag.arbeitsbeginn.split(':').map(Number);
    const [endeH, endeM] = zeiteintrag.arbeitsende.split(':').map(Number);
    const startMinuten = startH * 60 + startM;
    const endeMinuten = endeH * 60 + endeM;
    const arbeitsMinuten = endeMinuten - startMinuten - (zeiteintrag.pause_minuten || 0);
    const arbeitsStunden = arbeitsMinuten / 60;

    // Wochentag ermitteln (0=So, 1=Mo, ..., 6=Sa)
    const datum = new Date(zeiteintrag.datum);
    const wochentag = datum.getDay();

    regeln.forEach(regel => {
      let bedingung = {};
      try {
        bedingung = regel.bedingung ? JSON.parse(regel.bedingung) : {};
      } catch (e) {}

      let anwenden = false;
      let betroffeneStunden = 0;

      switch (regel.regel_typ) {
        case 'UEBERSTUNDEN':
          // Überstunden nach X Stunden pro Tag
          const schwelle = bedingung.nach_stunden || 8;
          if (arbeitsStunden > schwelle) {
            anwenden = true;
            betroffeneStunden = arbeitsStunden - schwelle;
          }
          break;

        case 'ZUSCHLAG_NACHT':
          // Nachtarbeit (z.B. 22:00-06:00)
          const nachtStart = bedingung.von_uhrzeit || '22:00';
          const nachtEnde = bedingung.bis_uhrzeit || '06:00';
          const [nsH, nsM] = nachtStart.split(':').map(Number);
          const [neH, neM] = nachtEnde.split(':').map(Number);
          const nachtStartMin = nsH * 60 + nsM;
          const nachtEndeMin = neH * 60 + neM;

          // Vereinfachte Berechnung: Prüfen ob Arbeitszeit in Nachtzeit fällt
          if (startMinuten < nachtEndeMin || endeMinuten > nachtStartMin) {
            anwenden = true;
            // Betroffene Stunden berechnen (vereinfacht)
            if (endeMinuten > nachtStartMin) {
              betroffeneStunden = (endeMinuten - nachtStartMin) / 60;
            }
            if (startMinuten < nachtEndeMin) {
              betroffeneStunden += (nachtEndeMin - startMinuten) / 60;
            }
            betroffeneStunden = Math.min(betroffeneStunden, arbeitsStunden);
          }
          break;

        case 'ZUSCHLAG_SAMSTAG':
          if (wochentag === 6) {
            anwenden = true;
            betroffeneStunden = arbeitsStunden;
          }
          break;

        case 'ZUSCHLAG_SONNTAG':
          if (wochentag === 0) {
            anwenden = true;
            betroffeneStunden = arbeitsStunden;
          }
          break;

        case 'ZUSCHLAG_FEIERTAG':
          // Feiertage müssten aus einer separaten Tabelle kommen
          // Hier vereinfacht: nur wenn explizit als Feiertag markiert
          if (zeiteintrag.ist_feiertag) {
            anwenden = true;
            betroffeneStunden = arbeitsStunden;
          }
          break;
      }

      if (anwenden && betroffeneStunden > 0) {
        angewendeteRegeln.push({
          regel_id: regel.id,
          regel_typ: regel.regel_typ,
          name: regel.name
        });

        const zuschlagBetrag = regel.einheit === 'PROZENT'
          ? betroffeneStunden * (regel.wert / 100)
          : regel.wert;

        zuschlaege.push({
          regel_id: regel.id,
          regel_typ: regel.regel_typ,
          name: regel.name,
          stunden: betroffeneStunden,
          wert: regel.wert,
          einheit: regel.einheit,
          zuschlag_stunden: zuschlagBetrag
        });
      }
    });

    return {
      gruppe: {
        id: gruppe.id,
        name: gruppe.name,
        kv_name: gruppe.kv_name,
        standard_wochenstunden: gruppe.standard_wochenstunden,
        standard_monatsstunden: gruppe.standard_monatsstunden
      },
      regeln: angewendeteRegeln,
      zuschlaege,
      gesamt_zuschlag_stunden: zuschlaege.reduce((sum, z) => sum + z.zuschlag_stunden, 0)
    };
  },

  // ==================== DATENAUFBEWAHRUNG (RETENTION) FUNKTIONEN ====================

  // Retention-Konfiguration abrufen
  getRetentionKonfig: () => {
    const keys = [
      'retention_zeiteintraege_monate',
      'retention_audit_monate',
      'retention_warnung_tage',
      'retention_auto_loeschen'
    ];
    const konfig = {};
    keys.forEach(key => {
      const row = db.prepare('SELECT wert FROM einstellungen WHERE schluessel = ?').get(key);
      konfig[key] = row ? parseInt(row.wert) : 0;
    });
    return konfig;
  },

  // Daten analysieren die zur Löschung anstehen
  analyzeRetentionData: () => {
    const konfig = module.exports.getRetentionKonfig();
    const heute = new Date();
    const results = {
      zeiteintraege: { zuLoeschen: 0, warnungAnzahl: 0, aeltestes: null },
      audit: { zuLoeschen: 0, warnungAnzahl: 0, aeltestes: null }
    };

    // Zeiteinträge analysieren
    if (konfig.retention_zeiteintraege_monate > 0) {
      const loeschDatum = new Date(heute);
      loeschDatum.setMonth(loeschDatum.getMonth() - konfig.retention_zeiteintraege_monate);
      const loeschDatumStr = loeschDatum.toISOString().split('T')[0];

      const warnDatum = new Date(loeschDatum);
      warnDatum.setDate(warnDatum.getDate() + konfig.retention_warnung_tage);
      const warnDatumStr = warnDatum.toISOString().split('T')[0];

      const zuLoeschen = db.prepare('SELECT COUNT(*) as count, MIN(datum) as aeltestes FROM zeiteintraege WHERE datum < ?').get(loeschDatumStr);
      const warnung = db.prepare('SELECT COUNT(*) as count FROM zeiteintraege WHERE datum >= ? AND datum < ?').get(loeschDatumStr, warnDatumStr);

      results.zeiteintraege = {
        zuLoeschen: zuLoeschen.count,
        aeltestes: zuLoeschen.aeltestes,
        warnungAnzahl: warnung.count,
        loeschDatum: loeschDatumStr,
        warnDatum: warnDatumStr
      };
    }

    // Audit-Log analysieren
    if (konfig.retention_audit_monate > 0) {
      const loeschDatum = new Date(heute);
      loeschDatum.setMonth(loeschDatum.getMonth() - konfig.retention_audit_monate);
      const loeschDatumStr = loeschDatum.toISOString().split('T')[0];

      const warnDatum = new Date(loeschDatum);
      warnDatum.setDate(warnDatum.getDate() + konfig.retention_warnung_tage);
      const warnDatumStr = warnDatum.toISOString().split('T')[0];

      const zuLoeschen = db.prepare('SELECT COUNT(*) as count, MIN(DATE(zeitpunkt)) as aeltestes FROM audit_log WHERE DATE(zeitpunkt) < ?').get(loeschDatumStr);
      const warnung = db.prepare('SELECT COUNT(*) as count FROM audit_log WHERE DATE(zeitpunkt) >= ? AND DATE(zeitpunkt) < ?').get(loeschDatumStr, warnDatumStr);

      results.audit = {
        zuLoeschen: zuLoeschen.count,
        aeltestes: zuLoeschen.aeltestes,
        warnungAnzahl: warnung.count,
        loeschDatum: loeschDatumStr,
        warnDatum: warnDatumStr
      };
    }

    return results;
  },

  // Alte Daten löschen (mit Protokollierung)
  executeRetention: (tabelle, ausfuehrender = 'SYSTEM') => {
    const konfig = module.exports.getRetentionKonfig();
    const heute = new Date();
    let result = { success: false, geloescht: 0 };

    if (tabelle === 'zeiteintraege' && konfig.retention_zeiteintraege_monate > 0) {
      const loeschDatum = new Date(heute);
      loeschDatum.setMonth(loeschDatum.getMonth() - konfig.retention_zeiteintraege_monate);
      const loeschDatumStr = loeschDatum.toISOString().split('T')[0];

      // Anzahl und ältesten Eintrag ermitteln
      const info = db.prepare('SELECT COUNT(*) as count, MIN(datum) as aeltestes FROM zeiteintraege WHERE datum < ?').get(loeschDatumStr);

      if (info.count > 0) {
        // Löschen
        db.prepare('DELETE FROM zeiteintraege WHERE datum < ?').run(loeschDatumStr);

        // Protokollieren
        db.prepare(`
          INSERT INTO loeschprotokoll (tabelle, anzahl_geloescht, aeltester_eintrag, loeschgrund, ausgefuehrt_von)
          VALUES (?, ?, ?, ?, ?)
        `).run('zeiteintraege', info.count, info.aeltestes, `Retention: ${konfig.retention_zeiteintraege_monate} Monate`, ausfuehrender);

        result = { success: true, geloescht: info.count, aeltestes: info.aeltestes };
      }
    }

    if (tabelle === 'audit_log' && konfig.retention_audit_monate > 0) {
      const loeschDatum = new Date(heute);
      loeschDatum.setMonth(loeschDatum.getMonth() - konfig.retention_audit_monate);
      const loeschDatumStr = loeschDatum.toISOString().split('T')[0];

      const info = db.prepare('SELECT COUNT(*) as count, MIN(DATE(zeitpunkt)) as aeltestes FROM audit_log WHERE DATE(zeitpunkt) < ?').get(loeschDatumStr);

      if (info.count > 0) {
        db.prepare('DELETE FROM audit_log WHERE DATE(zeitpunkt) < ?').run(loeschDatumStr);

        db.prepare(`
          INSERT INTO loeschprotokoll (tabelle, anzahl_geloescht, aeltester_eintrag, loeschgrund, ausgefuehrt_von)
          VALUES (?, ?, ?, ?, ?)
        `).run('audit_log', info.count, info.aeltestes, `Retention: ${konfig.retention_audit_monate} Monate`, ausfuehrender);

        result = { success: true, geloescht: info.count, aeltestes: info.aeltestes };
      }
    }

    return result;
  },

  // Löschprotokoll abrufen
  getLoeschprotokoll: (limit = 50) => {
    return db.prepare(`
      SELECT * FROM loeschprotokoll
      ORDER BY ausgefuehrt_am DESC
      LIMIT ?
    `).all(limit);
  },

  // ==================== ADMIN-BENACHRICHTIGUNGEN FUNKTIONEN ====================

  // Benachrichtigung erstellen
  createBenachrichtigung: (typ, titel, nachricht, daten = null) => {
    return db.prepare(`
      INSERT INTO admin_benachrichtigungen (typ, titel, nachricht, daten)
      VALUES (?, ?, ?, ?)
    `).run(typ, titel, nachricht, daten ? JSON.stringify(daten) : null);
  },

  // Ungelesene Benachrichtigungen abrufen
  getUngeleseneBenachrichtigungen: () => {
    return db.prepare(`
      SELECT * FROM admin_benachrichtigungen
      WHERE gelesen = 0
      ORDER BY erstellt_am DESC
    `).all();
  },

  // Alle Benachrichtigungen abrufen
  getAlleBenachrichtigungen: (limit = 50) => {
    return db.prepare(`
      SELECT * FROM admin_benachrichtigungen
      ORDER BY erstellt_am DESC
      LIMIT ?
    `).all(limit);
  },

  // Benachrichtigung als gelesen markieren
  markBenachrichtigungGelesen: (id) => {
    return db.prepare('UPDATE admin_benachrichtigungen SET gelesen = 1 WHERE id = ?').run(id);
  },

  // Alle Benachrichtigungen als gelesen markieren
  markAlleBenachrichtigungenGelesen: () => {
    return db.prepare('UPDATE admin_benachrichtigungen SET gelesen = 1 WHERE gelesen = 0').run();
  },

  // Anzahl ungelesener Benachrichtigungen
  getUngeleseneAnzahl: () => {
    const result = db.prepare('SELECT COUNT(*) as count FROM admin_benachrichtigungen WHERE gelesen = 0').get();
    return result.count;
  },

  // Retention-Warnung erstellen (falls nötig)
  checkAndCreateRetentionWarnung: () => {
    const analyse = module.exports.analyzeRetentionData();
    const konfig = module.exports.getRetentionKonfig();
    const created = [];

    // Prüfen ob bereits eine aktuelle Warnung existiert (heute)
    const heute = new Date().toISOString().split('T')[0];

    if (analyse.zeiteintraege.zuLoeschen > 0 || analyse.zeiteintraege.warnungAnzahl > 0) {
      const existing = db.prepare(`
        SELECT id FROM admin_benachrichtigungen
        WHERE typ = 'RETENTION_WARNUNG' AND DATE(erstellt_am) = ? AND nachricht LIKE '%Zeiteinträge%'
      `).get(heute);

      if (!existing) {
        module.exports.createBenachrichtigung(
          'RETENTION_WARNUNG',
          'Datenaufbewahrung: Zeiteinträge',
          `${analyse.zeiteintraege.zuLoeschen} Zeiteinträge zur Löschung bereit, ${analyse.zeiteintraege.warnungAnzahl} weitere in den nächsten ${konfig.retention_warnung_tage} Tagen.`,
          { analyse: analyse.zeiteintraege, autoLoeschen: konfig.retention_auto_loeschen === 1 }
        );
        created.push('zeiteintraege');
      }
    }

    if (analyse.audit.zuLoeschen > 0 || analyse.audit.warnungAnzahl > 0) {
      const existing = db.prepare(`
        SELECT id FROM admin_benachrichtigungen
        WHERE typ = 'RETENTION_WARNUNG' AND DATE(erstellt_am) = ? AND nachricht LIKE '%Audit%'
      `).get(heute);

      if (!existing) {
        module.exports.createBenachrichtigung(
          'RETENTION_WARNUNG',
          'Datenaufbewahrung: Audit-Log',
          `${analyse.audit.zuLoeschen} Audit-Einträge zur Löschung bereit, ${analyse.audit.warnungAnzahl} weitere in den nächsten ${konfig.retention_warnung_tage} Tagen.`,
          { analyse: analyse.audit, autoLoeschen: konfig.retention_auto_loeschen === 1 }
        );
        created.push('audit');
      }
    }

    return created;
  },

  // ==================== LEISTUNGSNACHWEISE FUNKTIONEN ====================

  // Leistungsnachweis erstellen
  createLeistungsnachweis: (data) => {
    const result = db.prepare(`
      INSERT INTO leistungsnachweise (
        datum, kunde_id, baustelle_id, kunde_freitext, baustelle_freitext,
        beschreibung, leistungszeit_von, leistungszeit_bis, leistungsdauer_minuten,
        notizen, ersteller_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'entwurf')
    `).run(
      data.datum,
      data.kunde_id || null,
      data.baustelle_id || null,
      data.kunde_freitext || null,
      data.baustelle_freitext || null,
      data.beschreibung,
      data.leistungszeit_von || null,
      data.leistungszeit_bis || null,
      data.leistungsdauer_minuten || null,
      data.notizen || null,
      data.ersteller_id
    );

    // Mitarbeiter zuordnen
    if (data.mitarbeiter_ids && data.mitarbeiter_ids.length > 0) {
      const insertMa = db.prepare(`
        INSERT INTO leistungsnachweis_mitarbeiter (leistungsnachweis_id, mitarbeiter_id)
        VALUES (?, ?)
      `);
      data.mitarbeiter_ids.forEach(maId => {
        insertMa.run(result.lastInsertRowid, maId);
      });
    }

    return { id: result.lastInsertRowid };
  },

  // Leistungsnachweis aktualisieren (nur wenn status = 'entwurf')
  updateLeistungsnachweis: (id, data) => {
    // Prüfen ob editierbar
    const existing = db.prepare('SELECT status FROM leistungsnachweise WHERE id = ?').get(id);
    if (!existing) {
      return { success: false, error: 'Leistungsnachweis nicht gefunden' };
    }
    if (existing.status !== 'entwurf') {
      return { success: false, error: 'Nur Entwürfe können bearbeitet werden' };
    }

    db.prepare(`
      UPDATE leistungsnachweise SET
        datum = ?, kunde_id = ?, baustelle_id = ?, kunde_freitext = ?, baustelle_freitext = ?,
        beschreibung = ?, leistungszeit_von = ?, leistungszeit_bis = ?, leistungsdauer_minuten = ?,
        notizen = ?
      WHERE id = ?
    `).run(
      data.datum,
      data.kunde_id || null,
      data.baustelle_id || null,
      data.kunde_freitext || null,
      data.baustelle_freitext || null,
      data.beschreibung,
      data.leistungszeit_von || null,
      data.leistungszeit_bis || null,
      data.leistungsdauer_minuten || null,
      data.notizen || null,
      id
    );

    // Mitarbeiter-Zuordnungen aktualisieren
    if (data.mitarbeiter_ids) {
      db.prepare('DELETE FROM leistungsnachweis_mitarbeiter WHERE leistungsnachweis_id = ?').run(id);
      const insertMa = db.prepare(`
        INSERT INTO leistungsnachweis_mitarbeiter (leistungsnachweis_id, mitarbeiter_id)
        VALUES (?, ?)
      `);
      data.mitarbeiter_ids.forEach(maId => {
        insertMa.run(id, maId);
      });
    }

    return { success: true };
  },

  // Leistungsnachweis unterschreiben
  signLeistungsnachweis: (id, unterschriftDaten, unterschriftName) => {
    const existing = db.prepare('SELECT status FROM leistungsnachweise WHERE id = ?').get(id);
    if (!existing) {
      return { success: false, error: 'Leistungsnachweis nicht gefunden' };
    }
    if (existing.status !== 'entwurf') {
      return { success: false, error: 'Nur Entwürfe können unterschrieben werden' };
    }

    const zeitpunkt = new Date().toISOString().replace('T', ' ').substring(0, 19);

    db.prepare(`
      UPDATE leistungsnachweise SET
        unterschrift_daten = ?,
        unterschrift_name = ?,
        unterschrift_zeitpunkt = ?,
        status = 'unterschrieben'
      WHERE id = ?
    `).run(unterschriftDaten, unterschriftName, zeitpunkt, id);

    return { success: true, unterschrift_zeitpunkt: zeitpunkt };
  },

  // Leistungsnachweis stornieren
  storniereLeistungsnachweis: (id, storniertVon, grund) => {
    const existing = db.prepare('SELECT status FROM leistungsnachweise WHERE id = ?').get(id);
    if (!existing) {
      return { success: false, error: 'Leistungsnachweis nicht gefunden' };
    }
    if (existing.status === 'storniert') {
      return { success: false, error: 'Bereits storniert' };
    }

    const zeitpunkt = new Date().toISOString().replace('T', ' ').substring(0, 19);

    db.prepare(`
      UPDATE leistungsnachweise SET
        status = 'storniert',
        storniert_am = ?,
        storniert_von = ?,
        storno_grund = ?
      WHERE id = ?
    `).run(zeitpunkt, storniertVon, grund, id);

    return { success: true };
  },

  // Leistungsnachweis abrufen
  getLeistungsnachweis: (id) => {
    const ln = db.prepare(`
      SELECT ln.*,
        k.name as kunde_name,
        b.name as baustelle_name,
        e.name as ersteller_name,
        s.name as storniert_von_name
      FROM leistungsnachweise ln
      LEFT JOIN kunden k ON ln.kunde_id = k.id
      LEFT JOIN baustellen b ON ln.baustelle_id = b.id
      LEFT JOIN mitarbeiter e ON ln.ersteller_id = e.id
      LEFT JOIN mitarbeiter s ON ln.storniert_von = s.id
      WHERE ln.id = ?
    `).get(id);

    if (!ln) return null;

    // Zugeordnete Mitarbeiter laden
    const mitarbeiter = db.prepare(`
      SELECT m.id, m.mitarbeiter_nr, m.name
      FROM leistungsnachweis_mitarbeiter lm
      JOIN mitarbeiter m ON lm.mitarbeiter_id = m.id
      WHERE lm.leistungsnachweis_id = ?
      ORDER BY m.name
    `).all(id);

    return { ...ln, mitarbeiter };
  },

  // Leistungsnachweise auflisten (mit Filtern)
  getLeistungsnachweise: (filter = {}) => {
    let where = ['1=1'];
    const params = [];

    if (filter.status) {
      where.push('ln.status = ?');
      params.push(filter.status);
    }
    if (filter.kunde_id) {
      where.push('ln.kunde_id = ?');
      params.push(filter.kunde_id);
    }
    if (filter.baustelle_id) {
      where.push('ln.baustelle_id = ?');
      params.push(filter.baustelle_id);
    }
    if (filter.datum_von) {
      where.push('ln.datum >= ?');
      params.push(filter.datum_von);
    }
    if (filter.datum_bis) {
      where.push('ln.datum <= ?');
      params.push(filter.datum_bis);
    }
    if (filter.ersteller_id) {
      where.push('ln.ersteller_id = ?');
      params.push(filter.ersteller_id);
    }
    if (filter.mitarbeiter_id) {
      where.push('EXISTS (SELECT 1 FROM leistungsnachweis_mitarbeiter lm WHERE lm.leistungsnachweis_id = ln.id AND lm.mitarbeiter_id = ?)');
      params.push(filter.mitarbeiter_id);
    }

    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;

    const data = db.prepare(`
      SELECT ln.*,
        k.name as kunde_name,
        b.name as baustelle_name,
        e.name as ersteller_name,
        (SELECT GROUP_CONCAT(m.name, ', ')
         FROM leistungsnachweis_mitarbeiter lm
         JOIN mitarbeiter m ON lm.mitarbeiter_id = m.id
         WHERE lm.leistungsnachweis_id = ln.id) as mitarbeiter_namen
      FROM leistungsnachweise ln
      LEFT JOIN kunden k ON ln.kunde_id = k.id
      LEFT JOIN baustellen b ON ln.baustelle_id = b.id
      LEFT JOIN mitarbeiter e ON ln.ersteller_id = e.id
      WHERE ${where.join(' AND ')}
      ORDER BY ln.datum DESC, ln.erstellt_am DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count
      FROM leistungsnachweise ln
      WHERE ${where.join(' AND ')}
    `).get(...params).count;

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  },

  // Leistungsnachweis löschen (nur Entwürfe)
  deleteLeistungsnachweis: (id) => {
    const existing = db.prepare('SELECT status FROM leistungsnachweise WHERE id = ?').get(id);
    if (!existing) {
      return { success: false, error: 'Leistungsnachweis nicht gefunden' };
    }
    if (existing.status !== 'entwurf') {
      return { success: false, error: 'Nur Entwürfe können gelöscht werden. Unterschriebene Nachweise müssen storniert werden.' };
    }

    db.prepare('DELETE FROM leistungsnachweis_mitarbeiter WHERE leistungsnachweis_id = ?').run(id);
    db.prepare('DELETE FROM leistungsnachweise WHERE id = ?').run(id);

    return { success: true };
  },

  // ==================== BUAK Compliance Support Module ====================

  // Schlechtwetter-Ereignis erstellen
  createSchlechtwetter: (data, erstellerId) => {
    const result = db.prepare(`
      INSERT INTO buak_schlechtwetter (
        datum, baustelle_id, baustelle_freitext, beginn, ende, dauer_minuten,
        grund, grund_details, notizen, ersteller_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.datum,
      data.baustelle_id || null,
      data.baustelle_freitext || null,
      data.beginn || null,
      data.ende || null,
      data.dauer_minuten || null,
      data.grund,
      data.grund_details || null,
      data.notizen || null,
      erstellerId
    );

    const swId = result.lastInsertRowid;

    // Betroffene Mitarbeiter einfügen
    if (data.mitarbeiter_ids && data.mitarbeiter_ids.length > 0) {
      const insertMa = db.prepare(`
        INSERT INTO buak_schlechtwetter_mitarbeiter (schlechtwetter_id, mitarbeiter_id)
        VALUES (?, ?)
      `);
      data.mitarbeiter_ids.forEach(maId => {
        insertMa.run(swId, maId);
      });
    }

    return { success: true, id: swId };
  },

  // Schlechtwetter-Ereignis aktualisieren
  updateSchlechtwetter: (id, data) => {
    db.prepare(`
      UPDATE buak_schlechtwetter SET
        datum = ?, baustelle_id = ?, baustelle_freitext = ?, beginn = ?, ende = ?,
        dauer_minuten = ?, grund = ?, grund_details = ?, notizen = ?
      WHERE id = ?
    `).run(
      data.datum,
      data.baustelle_id || null,
      data.baustelle_freitext || null,
      data.beginn || null,
      data.ende || null,
      data.dauer_minuten || null,
      data.grund,
      data.grund_details || null,
      data.notizen || null,
      id
    );

    // Mitarbeiter-Zuordnungen aktualisieren
    if (data.mitarbeiter_ids) {
      db.prepare('DELETE FROM buak_schlechtwetter_mitarbeiter WHERE schlechtwetter_id = ?').run(id);
      const insertMa = db.prepare(`
        INSERT INTO buak_schlechtwetter_mitarbeiter (schlechtwetter_id, mitarbeiter_id)
        VALUES (?, ?)
      `);
      data.mitarbeiter_ids.forEach(maId => {
        insertMa.run(id, maId);
      });
    }

    return { success: true };
  },

  // Schlechtwetter-Ereignis löschen
  deleteSchlechtwetter: (id) => {
    db.prepare('DELETE FROM buak_schlechtwetter_mitarbeiter WHERE schlechtwetter_id = ?').run(id);
    db.prepare('DELETE FROM buak_schlechtwetter WHERE id = ?').run(id);
    return { success: true };
  },

  // Schlechtwetter-Ereignis abrufen
  getSchlechtwetter: (id) => {
    const sw = db.prepare(`
      SELECT sw.*,
        b.name as baustelle_name,
        e.name as ersteller_name
      FROM buak_schlechtwetter sw
      LEFT JOIN baustellen b ON sw.baustelle_id = b.id
      LEFT JOIN mitarbeiter e ON sw.ersteller_id = e.id
      WHERE sw.id = ?
    `).get(id);

    if (!sw) return null;

    // Betroffene Mitarbeiter laden
    const mitarbeiter = db.prepare(`
      SELECT m.id, m.mitarbeiter_nr, m.name
      FROM buak_schlechtwetter_mitarbeiter sm
      JOIN mitarbeiter m ON sm.mitarbeiter_id = m.id
      WHERE sm.schlechtwetter_id = ?
      ORDER BY m.name
    `).all(id);

    return { ...sw, mitarbeiter };
  },

  // Schlechtwetter-Ereignisse auflisten
  getSchlechtwetterList: (filter = {}) => {
    let where = ['1=1'];
    const params = [];

    if (filter.datum_von) {
      where.push('sw.datum >= ?');
      params.push(filter.datum_von);
    }
    if (filter.datum_bis) {
      where.push('sw.datum <= ?');
      params.push(filter.datum_bis);
    }
    if (filter.baustelle_id) {
      where.push('sw.baustelle_id = ?');
      params.push(filter.baustelle_id);
    }
    if (filter.grund) {
      where.push('sw.grund = ?');
      params.push(filter.grund);
    }
    if (filter.mitarbeiter_id) {
      where.push('EXISTS (SELECT 1 FROM buak_schlechtwetter_mitarbeiter sm WHERE sm.schlechtwetter_id = sw.id AND sm.mitarbeiter_id = ?)');
      params.push(filter.mitarbeiter_id);
    }

    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;

    const data = db.prepare(`
      SELECT sw.*,
        b.name as baustelle_name,
        e.name as ersteller_name,
        (SELECT GROUP_CONCAT(m.name, ', ')
         FROM buak_schlechtwetter_mitarbeiter sm
         JOIN mitarbeiter m ON sm.mitarbeiter_id = m.id
         WHERE sm.schlechtwetter_id = sw.id) as mitarbeiter_namen,
        (SELECT COUNT(*) FROM buak_schlechtwetter_mitarbeiter sm WHERE sm.schlechtwetter_id = sw.id) as mitarbeiter_anzahl
      FROM buak_schlechtwetter sw
      LEFT JOIN baustellen b ON sw.baustelle_id = b.id
      LEFT JOIN mitarbeiter e ON sw.ersteller_id = e.id
      WHERE ${where.join(' AND ')}
      ORDER BY sw.datum DESC, sw.erstellt_am DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count
      FROM buak_schlechtwetter sw
      WHERE ${where.join(' AND ')}
    `).get(...params).count;

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  },

  // BUAK-relevante Baustellen auflisten
  getBuakBaustellen: () => {
    return db.prepare(`
      SELECT id, name, kunde, adresse, buak_relevant
      FROM baustellen
      WHERE aktiv = 1
      ORDER BY buak_relevant DESC, name
    `).all();
  },

  // BUAK-Relevanz für Baustelle setzen
  setBaustelleBuakRelevant: (id, buakRelevant) => {
    db.prepare('UPDATE baustellen SET buak_relevant = ? WHERE id = ?').run(buakRelevant ? 1 : 0, id);
    return { success: true };
  },

  // BUAK-relevante Mitarbeiter auflisten
  getBuakMitarbeiter: () => {
    return db.prepare(`
      SELECT id, mitarbeiter_nr, name, buak_relevant
      FROM mitarbeiter
      WHERE aktiv = 1
      ORDER BY buak_relevant DESC, name
    `).all();
  },

  // BUAK-Relevanz für Mitarbeiter setzen
  setMitarbeiterBuakRelevant: (id, buakRelevant) => {
    db.prepare('UPDATE mitarbeiter SET buak_relevant = ? WHERE id = ?').run(buakRelevant ? 1 : 0, id);
    return { success: true };
  },

  // BUAK-Relevanz für Zeiteintrag setzen
  setZeiteintragBuakRelevant: (id, buakRelevant) => {
    db.prepare('UPDATE zeiteintraege SET buak_relevant = ? WHERE id = ?').run(buakRelevant ? 1 : 0, id);
    return { success: true };
  },

  // BUAK-relevante Zeiteinträge für Berichtsperiode abrufen
  getBuakZeiteintraege: (filter = {}) => {
    let where = ['z.buak_relevant = 1'];
    const params = [];

    if (filter.datum_von) {
      where.push('z.datum >= ?');
      params.push(filter.datum_von);
    }
    if (filter.datum_bis) {
      where.push('z.datum <= ?');
      params.push(filter.datum_bis);
    }
    if (filter.mitarbeiter_id) {
      where.push('z.mitarbeiter_id = ?');
      params.push(filter.mitarbeiter_id);
    }
    if (filter.baustelle) {
      where.push('z.baustelle = ?');
      params.push(filter.baustelle);
    }

    return db.prepare(`
      SELECT z.*,
        m.mitarbeiter_nr, m.name as mitarbeiter_name,
        strftime('%H', z.arbeitsende) * 60 + strftime('%M', z.arbeitsende) -
        strftime('%H', z.arbeitsbeginn) * 60 - strftime('%M', z.arbeitsbeginn) - z.pause_minuten as netto_minuten
      FROM zeiteintraege z
      JOIN mitarbeiter m ON z.mitarbeiter_id = m.id
      WHERE ${where.join(' AND ')}
      ORDER BY z.datum DESC, m.name
    `).all(...params);
  },

  // BUAK-Report für Periode erstellen
  getBuakReport: (datumVon, datumBis) => {
    // Zusammenfassung der BUAK-relevanten Arbeitszeit pro Mitarbeiter
    const mitarbeiterSummary = db.prepare(`
      SELECT
        m.id, m.mitarbeiter_nr, m.name,
        COUNT(DISTINCT z.datum) as tage,
        SUM(
          strftime('%H', z.arbeitsende) * 60 + strftime('%M', z.arbeitsende) -
          strftime('%H', z.arbeitsbeginn) * 60 - strftime('%M', z.arbeitsbeginn) - z.pause_minuten
        ) as gesamt_minuten
      FROM zeiteintraege z
      JOIN mitarbeiter m ON z.mitarbeiter_id = m.id
      WHERE z.buak_relevant = 1 AND z.datum >= ? AND z.datum <= ?
      GROUP BY m.id
      ORDER BY m.name
    `).all(datumVon, datumBis);

    // Schlechtwetter-Zusammenfassung pro Mitarbeiter
    const schlechtwetterSummary = db.prepare(`
      SELECT
        m.id, m.mitarbeiter_nr, m.name,
        COUNT(DISTINCT sw.id) as ereignisse,
        SUM(COALESCE(sw.dauer_minuten, 0)) as gesamt_minuten
      FROM buak_schlechtwetter sw
      JOIN buak_schlechtwetter_mitarbeiter sm ON sw.id = sm.schlechtwetter_id
      JOIN mitarbeiter m ON sm.mitarbeiter_id = m.id
      WHERE sw.datum >= ? AND sw.datum <= ?
      GROUP BY m.id
      ORDER BY m.name
    `).all(datumVon, datumBis);

    // Baustellen-Zusammenfassung
    const baustellenSummary = db.prepare(`
      SELECT
        z.baustelle,
        COUNT(DISTINCT z.mitarbeiter_id) as mitarbeiter_anzahl,
        COUNT(DISTINCT z.datum) as tage,
        SUM(
          strftime('%H', z.arbeitsende) * 60 + strftime('%M', z.arbeitsende) -
          strftime('%H', z.arbeitsbeginn) * 60 - strftime('%M', z.arbeitsbeginn) - z.pause_minuten
        ) as gesamt_minuten
      FROM zeiteintraege z
      WHERE z.buak_relevant = 1 AND z.datum >= ? AND z.datum <= ? AND z.baustelle IS NOT NULL AND z.baustelle != ''
      GROUP BY z.baustelle
      ORDER BY gesamt_minuten DESC
    `).all(datumVon, datumBis);

    return {
      periode: { von: datumVon, bis: datumBis },
      mitarbeiter: mitarbeiterSummary,
      schlechtwetter: schlechtwetterSummary,
      baustellen: baustellenSummary
    };
  }
};
