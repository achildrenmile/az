-- PostgreSQL Schema for Arbeitszeit-Tracker
-- Compatible with SQLite schema structure

-- Mitarbeiter-Tabelle
CREATE TABLE IF NOT EXISTS mitarbeiter (
  id SERIAL PRIMARY KEY,
  mitarbeiter_nr TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  ist_admin INTEGER DEFAULT 0,
  aktiv INTEGER DEFAULT 1,
  erstellt_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Zeiteinträge-Tabelle (AZG-konform)
CREATE TABLE IF NOT EXISTS zeiteintraege (
  id SERIAL PRIMARY KEY,
  mitarbeiter_id INTEGER NOT NULL REFERENCES mitarbeiter(id),
  datum DATE NOT NULL,
  arbeitsbeginn TIME NOT NULL,
  arbeitsende TIME NOT NULL,
  pause_minuten INTEGER DEFAULT 0,
  baustelle TEXT,
  kunde TEXT,
  anfahrt TEXT,
  notizen TEXT,
  standort TEXT,
  arbeitstyp TEXT,
  erstellt_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_zeiteintraege_datum ON zeiteintraege(datum);
CREATE INDEX IF NOT EXISTS idx_zeiteintraege_mitarbeiter ON zeiteintraege(mitarbeiter_id);

-- Sessions-Tabelle (persistent)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  mitarbeiter_id INTEGER NOT NULL REFERENCES mitarbeiter(id),
  erstellt_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  laeuft_ab_am TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_ablauf ON sessions(laeuft_ab_am);

-- Audit-Log für Änderungen (AZG-konform, unveränderlich)
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  zeitpunkt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  mitarbeiter_id INTEGER NOT NULL REFERENCES mitarbeiter(id),
  aktion TEXT NOT NULL,
  tabelle TEXT NOT NULL,
  datensatz_id INTEGER,
  alte_werte TEXT,
  neue_werte TEXT,
  ip_adresse TEXT,
  vorheriger_hash TEXT,
  eintrag_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_zeitpunkt ON audit_log(zeitpunkt);
CREATE INDEX IF NOT EXISTS idx_audit_datensatz ON audit_log(tabelle, datensatz_id);

-- Kunden-Tabelle
CREATE TABLE IF NOT EXISTS kunden (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  ansprechpartner TEXT,
  strasse TEXT,
  plz TEXT,
  ort TEXT,
  telefon TEXT,
  email TEXT,
  notizen TEXT,
  aktiv INTEGER DEFAULT 1,
  erstellt_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kunden_name ON kunden(name);

-- Baustellen-Tabelle
CREATE TABLE IF NOT EXISTS baustellen (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  kunde TEXT,
  adresse TEXT,
  notizen TEXT,
  aktiv INTEGER DEFAULT 1,
  erstellt_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_baustellen_name ON baustellen(name);

-- Pausenregeln-Tabelle (konfigurierbar, AZG §11)
CREATE TABLE IF NOT EXISTS pausenregeln (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  min_arbeitszeit_minuten INTEGER NOT NULL,
  min_pause_minuten INTEGER NOT NULL,
  warnung_text TEXT,
  aktiv INTEGER DEFAULT 1,
  erstellt_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Monatsbestätigung-Tabelle
CREATE TABLE IF NOT EXISTS monatsbestaetigung (
  id SERIAL PRIMARY KEY,
  mitarbeiter_id INTEGER NOT NULL REFERENCES mitarbeiter(id),
  jahr INTEGER NOT NULL,
  monat INTEGER NOT NULL,
  bestaetigt_am TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_adresse TEXT,
  kommentar TEXT,
  UNIQUE(mitarbeiter_id, jahr, monat)
);

CREATE INDEX IF NOT EXISTS idx_bestaetigung_mitarbeiter ON monatsbestaetigung(mitarbeiter_id);
CREATE INDEX IF NOT EXISTS idx_bestaetigung_periode ON monatsbestaetigung(jahr, monat);

-- Gleitzeit-Saldo-Tabelle
CREATE TABLE IF NOT EXISTS gleitzeit_saldo (
  id SERIAL PRIMARY KEY,
  mitarbeiter_id INTEGER NOT NULL REFERENCES mitarbeiter(id),
  periode_start DATE NOT NULL,
  periode_ende DATE NOT NULL,
  soll_minuten INTEGER DEFAULT 0,
  ist_minuten INTEGER DEFAULT 0,
  saldo_minuten INTEGER DEFAULT 0,
  uebertrag_vorperiode INTEGER DEFAULT 0,
  uebertrag_naechste INTEGER DEFAULT 0,
  verfallen_minuten INTEGER DEFAULT 0,
  abgeschlossen INTEGER DEFAULT 0,
  erstellt_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  aktualisiert_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(mitarbeiter_id, periode_start)
);

CREATE INDEX IF NOT EXISTS idx_gleitzeit_mitarbeiter ON gleitzeit_saldo(mitarbeiter_id);
CREATE INDEX IF NOT EXISTS idx_gleitzeit_periode ON gleitzeit_saldo(periode_start, periode_ende);

-- Gleitzeit-Konfiguration
CREATE TABLE IF NOT EXISTS gleitzeit_konfig (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  wert TEXT NOT NULL,
  beschreibung TEXT,
  aktualisiert_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Kollektivvertrag-Regeln
CREATE TABLE IF NOT EXISTS kv_regeln (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  beschreibung TEXT,
  aktiv INTEGER DEFAULT 1,
  erstellt_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Kollektivvertrag-Einstellungen
CREATE TABLE IF NOT EXISTS kv_einstellungen (
  id SERIAL PRIMARY KEY,
  kv_id INTEGER NOT NULL REFERENCES kv_regeln(id),
  name TEXT NOT NULL,
  wert TEXT NOT NULL,
  einheit TEXT,
  beschreibung TEXT,
  UNIQUE(kv_id, name)
);

-- Arbeitszeit-Konfiguration
CREATE TABLE IF NOT EXISTS arbeitszeit_konfig (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  wert TEXT NOT NULL,
  beschreibung TEXT,
  aktualisiert_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Validierung-Protokoll
CREATE TABLE IF NOT EXISTS validierung_protokoll (
  id SERIAL PRIMARY KEY,
  mitarbeiter_id INTEGER NOT NULL REFERENCES mitarbeiter(id),
  zeiteintrag_id INTEGER,
  zeitpunkt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ergebnis TEXT NOT NULL,
  details TEXT,
  ip_adresse TEXT
);

CREATE INDEX IF NOT EXISTS idx_validierung_mitarbeiter ON validierung_protokoll(mitarbeiter_id);
CREATE INDEX IF NOT EXISTS idx_validierung_zeiteintrag ON validierung_protokoll(zeiteintrag_id);

-- Leistungsnachweise-Tabelle
CREATE TABLE IF NOT EXISTS leistungsnachweise (
  id SERIAL PRIMARY KEY,
  datum DATE NOT NULL,
  kunde_id INTEGER REFERENCES kunden(id),
  kunde_freitext TEXT,
  baustelle_id INTEGER REFERENCES baustellen(id),
  baustelle_freitext TEXT,
  leistungszeit_von TIME,
  leistungszeit_bis TIME,
  leistungsdauer_minuten INTEGER,
  beschreibung TEXT NOT NULL,
  notizen TEXT,
  status TEXT DEFAULT 'entwurf',
  erstellt_von INTEGER NOT NULL REFERENCES mitarbeiter(id),
  erstellt_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  aktualisiert_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ln_datum ON leistungsnachweise(datum);
CREATE INDEX IF NOT EXISTS idx_ln_status ON leistungsnachweise(status);
CREATE INDEX IF NOT EXISTS idx_ln_kunde ON leistungsnachweise(kunde_id);

-- Leistungsnachweise-Mitarbeiter (M:N)
CREATE TABLE IF NOT EXISTS leistungsnachweis_mitarbeiter (
  id SERIAL PRIMARY KEY,
  leistungsnachweis_id INTEGER NOT NULL REFERENCES leistungsnachweise(id) ON DELETE CASCADE,
  mitarbeiter_id INTEGER NOT NULL REFERENCES mitarbeiter(id),
  UNIQUE(leistungsnachweis_id, mitarbeiter_id)
);

-- Schlechtwetter-Tabelle (BUAK)
CREATE TABLE IF NOT EXISTS schlechtwetter (
  id SERIAL PRIMARY KEY,
  datum DATE NOT NULL,
  grund TEXT NOT NULL,
  grund_details TEXT,
  baustelle_id INTEGER REFERENCES baustellen(id),
  beginn TIME,
  ende TIME,
  dauer_minuten INTEGER,
  notizen TEXT,
  erstellt_von INTEGER NOT NULL REFERENCES mitarbeiter(id),
  erstellt_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sw_datum ON schlechtwetter(datum);

-- Schlechtwetter-Mitarbeiter (M:N)
CREATE TABLE IF NOT EXISTS schlechtwetter_mitarbeiter (
  id SERIAL PRIMARY KEY,
  schlechtwetter_id INTEGER NOT NULL REFERENCES schlechtwetter(id) ON DELETE CASCADE,
  mitarbeiter_id INTEGER NOT NULL REFERENCES mitarbeiter(id),
  UNIQUE(schlechtwetter_id, mitarbeiter_id)
);

-- Einstellungen
CREATE TABLE IF NOT EXISTS einstellungen (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  wert TEXT,
  beschreibung TEXT,
  aktualisiert_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Arbeitstypen
CREATE TABLE IF NOT EXISTS arbeitstypen (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  beschreibung TEXT,
  aktiv INTEGER DEFAULT 1,
  sortierung INTEGER DEFAULT 0,
  erstellt_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Benachrichtigungen
CREATE TABLE IF NOT EXISTS benachrichtigungen (
  id SERIAL PRIMARY KEY,
  mitarbeiter_id INTEGER REFERENCES mitarbeiter(id),
  typ TEXT NOT NULL,
  titel TEXT NOT NULL,
  nachricht TEXT NOT NULL,
  gelesen INTEGER DEFAULT 0,
  erstellt_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_benachrichtigungen_mitarbeiter ON benachrichtigungen(mitarbeiter_id);
CREATE INDEX IF NOT EXISTS idx_benachrichtigungen_gelesen ON benachrichtigungen(gelesen);

-- Retention-Konfiguration
CREATE TABLE IF NOT EXISTS retention_konfig (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  wert TEXT NOT NULL,
  beschreibung TEXT,
  aktualisiert_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
