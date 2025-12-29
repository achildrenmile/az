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

  -- Audit-Log für Änderungen (AZG-konform)
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zeitpunkt DATETIME DEFAULT CURRENT_TIMESTAMP,
    mitarbeiter_id INTEGER NOT NULL,
    aktion TEXT NOT NULL,
    tabelle TEXT NOT NULL,
    datensatz_id INTEGER,
    alte_werte TEXT,
    neue_werte TEXT,
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
`);

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

  getAllMitarbeiter: () => {
    return db.prepare('SELECT id, mitarbeiter_nr, name, ist_admin, aktiv, erstellt_am FROM mitarbeiter ORDER BY name').all();
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

  verifyPin: (mitarbeiter, pin) => {
    return bcrypt.compareSync(pin, mitarbeiter.pin_hash);
  },

  // Zeiteintrag-Funktionen
  createZeiteintrag: (data) => {
    return db.prepare(`
      INSERT INTO zeiteintraege (mitarbeiter_id, datum, arbeitsbeginn, arbeitsende, pause_minuten, baustelle, kunde, anfahrt, notizen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.mitarbeiter_id,
      data.datum,
      data.arbeitsbeginn,
      data.arbeitsende,
      data.pause_minuten || 0,
      data.baustelle || '',
      data.kunde || '',
      data.anfahrt || '',
      data.notizen || ''
    );
  },

  getZeiteintraegeByMitarbeiter: (mitarbeiterId, limit = 30) => {
    return db.prepare(`
      SELECT * FROM zeiteintraege
      WHERE mitarbeiter_id = ?
      ORDER BY datum DESC, arbeitsbeginn DESC
      LIMIT ?
    `).all(mitarbeiterId, limit);
  },

  getAllZeiteintraege: (von, bis) => {
    let query = `
      SELECT z.*, m.name as mitarbeiter_name, m.mitarbeiter_nr
      FROM zeiteintraege z
      JOIN mitarbeiter m ON z.mitarbeiter_id = m.id
    `;
    const params = [];

    if (von && bis) {
      query += ' WHERE z.datum BETWEEN ? AND ?';
      params.push(von, bis);
    } else if (von) {
      query += ' WHERE z.datum >= ?';
      params.push(von);
    } else if (bis) {
      query += ' WHERE z.datum <= ?';
      params.push(bis);
    }

    query += ' ORDER BY z.datum DESC, z.arbeitsbeginn DESC';

    return db.prepare(query).all(...params);
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
          baustelle = ?, kunde = ?, anfahrt = ?, notizen = ?
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
      id
    );
  },

  // Audit-Log Funktionen
  logAudit: (mitarbeiterId, aktion, tabelle, datensatzId, alteWerte, neueWerte) => {
    return db.prepare(`
      INSERT INTO audit_log (mitarbeiter_id, aktion, tabelle, datensatz_id, alte_werte, neue_werte)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      mitarbeiterId,
      aktion,
      tabelle,
      datensatzId,
      alteWerte ? JSON.stringify(alteWerte) : null,
      neueWerte ? JSON.stringify(neueWerte) : null
    );
  },

  getAuditLog: (tabelle, datensatzId) => {
    return db.prepare(`
      SELECT a.*, m.name as mitarbeiter_name
      FROM audit_log a
      JOIN mitarbeiter m ON a.mitarbeiter_id = m.id
      WHERE a.tabelle = ? AND a.datensatz_id = ?
      ORDER BY a.zeitpunkt DESC
    `).all(tabelle, datensatzId);
  },

  getAllAuditLogs: (limit = 100) => {
    return db.prepare(`
      SELECT a.*, m.name as mitarbeiter_name
      FROM audit_log a
      JOIN mitarbeiter m ON a.mitarbeiter_id = m.id
      ORDER BY a.zeitpunkt DESC
      LIMIT ?
    `).all(limit);
  },

  // Kunden-Funktionen
  getAllKunden: (nurAktive = true) => {
    if (nurAktive) {
      return db.prepare('SELECT * FROM kunden WHERE aktiv = 1 ORDER BY name').all();
    }
    return db.prepare('SELECT * FROM kunden ORDER BY name').all();
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
  }
};
