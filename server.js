const express = require('express');
const crypto = require('crypto');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Session-Konfiguration
const SESSION_DURATION_HOURS = 8; // Session läuft nach 8 Stunden ab
const SESSION_EXTEND_THRESHOLD_HOURS = 2; // Verlängern wenn weniger als 2h übrig

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Sichere Session-ID generieren
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

// Session-Ablaufzeit berechnen
function getSessionExpiry() {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + SESSION_DURATION_HOURS);
  return expiry.toISOString().replace('T', ' ').substring(0, 19);
}

// Session-Middleware (mit DB-Lookup und automatischer Verlängerung)
const checkSession = (req, res, next) => {
  const sessionId = req.headers['x-session-id'];

  if (!sessionId) {
    return res.status(401).json({ error: 'Nicht angemeldet' });
  }

  const session = db.getSession(sessionId);

  if (!session) {
    return res.status(401).json({ error: 'Sitzung abgelaufen - bitte erneut anmelden' });
  }

  // Session automatisch verlängern wenn bald ablaufend
  const expiresAt = new Date(session.laeuft_ab_am);
  const now = new Date();
  const hoursRemaining = (expiresAt - now) / (1000 * 60 * 60);

  if (hoursRemaining < SESSION_EXTEND_THRESHOLD_HOURS) {
    db.extendSession(sessionId, getSessionExpiry());
  }

  req.session = {
    id: session.mitarbeiter_id,
    mitarbeiter_nr: session.mitarbeiter_nr,
    name: session.name,
    ist_admin: session.ist_admin === 1
  };

  next();
};

const checkAdmin = (req, res, next) => {
  if (!req.session.ist_admin) {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }
  next();
};

// Abgelaufene Sessions regelmäßig aufräumen (alle 15 Minuten)
setInterval(() => {
  db.cleanupExpiredSessions();
}, 15 * 60 * 1000);

// Passwort-Validierung (erhöhte Sicherheitsstandards)
function validatePassword(password) {
  const errors = [];

  if (!password || password.length < 12) {
    errors.push('Mindestens 12 Zeichen');
  }
  if (!/[A-Z].*[A-Z]/.test(password)) {
    errors.push('Mindestens 2 Großbuchstaben');
  }
  if (!/[a-z].*[a-z]/.test(password)) {
    errors.push('Mindestens 2 Kleinbuchstaben');
  }
  if (!/[0-9].*[0-9]/.test(password)) {
    errors.push('Mindestens 2 Zahlen');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Mindestens ein Sonderzeichen (!@#$%^&*...)');
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

// ==================== AUTH ROUTES ====================

// Login
app.post('/api/login', (req, res) => {
  const { mitarbeiter_nr, pin, password } = req.body;
  const pwd = password || pin; // Abwärtskompatibilität

  if (!mitarbeiter_nr || !pwd) {
    return res.status(400).json({ error: 'Mitarbeiternummer und Passwort erforderlich' });
  }

  const mitarbeiter = db.getMitarbeiterByNr(mitarbeiter_nr);
  if (!mitarbeiter) {
    return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
  }

  if (!db.verifyPassword(mitarbeiter, pwd)) {
    return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
  }

  // Sichere Session in DB erstellen
  const sessionId = generateSessionId();
  const expiresAt = getSessionExpiry();

  try {
    db.createSession(sessionId, mitarbeiter.id, expiresAt);
  } catch (error) {
    console.error('Session-Erstellung fehlgeschlagen:', error);
    return res.status(500).json({ error: 'Anmeldung fehlgeschlagen' });
  }

  res.json({
    sessionId,
    name: mitarbeiter.name,
    ist_admin: mitarbeiter.ist_admin === 1,
    expiresAt
  });
});

// Logout
app.post('/api/logout', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (sessionId) {
    db.deleteSession(sessionId);
  }
  res.json({ success: true });
});

// Session-Status prüfen
app.get('/api/session', checkSession, (req, res) => {
  res.json({
    valid: true,
    name: req.session.name,
    ist_admin: req.session.ist_admin
  });
});

// ==================== ZEITEINTRAG ROUTES ====================

// Neuen Zeiteintrag erstellen
app.post('/api/zeiteintraege', checkSession, (req, res) => {
  const { datum, arbeitsbeginn, arbeitsende, pause_minuten, baustelle, kunde, anfahrt, notizen } = req.body;

  if (!datum || !arbeitsbeginn || !arbeitsende) {
    return res.status(400).json({ error: 'Datum, Beginn und Ende sind erforderlich' });
  }

  // Validierung: Ende muss nach Beginn sein
  if (arbeitsende <= arbeitsbeginn) {
    return res.status(400).json({ error: 'Arbeitsende muss nach Arbeitsbeginn liegen' });
  }

  // Validierung: Pause darf nicht länger als Arbeitszeit sein
  const beginnMinuten = parseInt(arbeitsbeginn.split(':')[0]) * 60 + parseInt(arbeitsbeginn.split(':')[1]);
  const endeMinuten = parseInt(arbeitsende.split(':')[0]) * 60 + parseInt(arbeitsende.split(':')[1]);
  const arbeitsMinuten = endeMinuten - beginnMinuten;

  if (pause_minuten && pause_minuten >= arbeitsMinuten) {
    return res.status(400).json({ error: 'Pause kann nicht länger als die Arbeitszeit sein' });
  }

  // Pausenregeln prüfen (konfigurierbar)
  const pausenVerstoesse = db.checkPausenverstoesse(arbeitsMinuten, pause_minuten || 0);
  let warnungen = [];

  if (pausenVerstoesse.length > 0) {
    warnungen = pausenVerstoesse.map(v => v.warnung ||
      `Bei mehr als ${Math.floor(v.min_arbeitszeit / 60)} Stunden Arbeitszeit sind mindestens ${v.min_pause} Minuten Pause vorgeschrieben.`
    );
  }

  // AZG-Validierung (tägliche/wöchentliche Limits)
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const validation = db.validateZeiteintrag(
    req.session.id,
    datum,
    arbeitsbeginn,
    arbeitsende,
    pause_minuten || 0
  );

  // Warnungen aus AZG-Validierung hinzufügen
  validation.warnings.forEach(w => warnungen.push(w.nachricht));

  try {
    const neueWerte = {
      mitarbeiter_id: req.session.id,
      datum,
      arbeitsbeginn,
      arbeitsende,
      pause_minuten: pause_minuten || 0,
      baustelle,
      kunde,
      anfahrt,
      notizen
    };

    const result = db.createZeiteintrag(neueWerte);

    // Audit-Log für CREATE
    db.logAudit(
      req.session.id,
      'CREATE',
      'zeiteintraege',
      result.lastInsertRowid,
      null,
      neueWerte,
      clientIp
    );

    // Validierungsereignisse loggen (für Audit-Trail)
    if (validation.violations.length > 0 || validation.warnings.length > 0) {
      db.logValidation(req.session.id, result.lastInsertRowid, validation, clientIp);
    }

    res.json({
      success: true,
      warnung: warnungen.length > 0 ? warnungen[0] : null,
      warnungen: warnungen.length > 0 ? warnungen : undefined,
      validation: {
        valid: validation.valid,
        violations: validation.violations,
        warnings: validation.warnings,
        tagesStunden: (validation.tagesMinuten / 60).toFixed(1),
        wochenStunden: (validation.wochenMinuten / 60).toFixed(1)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Speichern' });
  }
});

// Eigene Zeiteinträge abrufen
app.get('/api/zeiteintraege', checkSession, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const result = db.getZeiteintraegeByMitarbeiter(req.session.id, page, limit);
  res.json(result);
});

// Einzelnen Zeiteintrag abrufen
app.get('/api/zeiteintraege/:id', checkSession, (req, res) => {
  const eintrag = db.getZeiteintragById(req.params.id);

  if (!eintrag) {
    return res.status(404).json({ error: 'Eintrag nicht gefunden' });
  }

  // Nur eigene Einträge oder Admin
  if (eintrag.mitarbeiter_id !== req.session.id && !req.session.ist_admin) {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }

  res.json(eintrag);
});

// Zeiteintrag aktualisieren (eigene oder Admin)
app.put('/api/zeiteintraege/:id', checkSession, (req, res) => {
  const { datum, arbeitsbeginn, arbeitsende, pause_minuten, baustelle, kunde, anfahrt, notizen } = req.body;

  // Alten Eintrag laden
  const alterEintrag = db.getZeiteintragById(req.params.id);

  if (!alterEintrag) {
    return res.status(404).json({ error: 'Eintrag nicht gefunden' });
  }

  // Nur eigene Einträge oder Admin
  if (alterEintrag.mitarbeiter_id !== req.session.id && !req.session.ist_admin) {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }

  // Validierung
  if (!datum || !arbeitsbeginn || !arbeitsende) {
    return res.status(400).json({ error: 'Datum, Beginn und Ende sind erforderlich' });
  }

  if (arbeitsende <= arbeitsbeginn) {
    return res.status(400).json({ error: 'Arbeitsende muss nach Arbeitsbeginn liegen' });
  }

  // AZG-Validierung (tägliche/wöchentliche Limits)
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const validation = db.validateZeiteintrag(
    alterEintrag.mitarbeiter_id,
    datum,
    arbeitsbeginn,
    arbeitsende,
    pause_minuten || 0,
    parseInt(req.params.id) // excludeId - diesen Eintrag beim Summieren ausschließen
  );

  // Pausenregeln prüfen
  const beginnMinuten = parseInt(arbeitsbeginn.split(':')[0]) * 60 + parseInt(arbeitsbeginn.split(':')[1]);
  const endeMinuten = parseInt(arbeitsende.split(':')[0]) * 60 + parseInt(arbeitsende.split(':')[1]);
  const arbeitsMinuten = endeMinuten - beginnMinuten;
  const pausenVerstoesse = db.checkPausenverstoesse(arbeitsMinuten, pause_minuten || 0);
  let warnungen = pausenVerstoesse.map(v => v.warnung ||
    `Bei mehr als ${Math.floor(v.min_arbeitszeit / 60)} Stunden Arbeitszeit sind mindestens ${v.min_pause} Minuten Pause vorgeschrieben.`
  );

  // Warnungen aus AZG-Validierung hinzufügen
  validation.warnings.forEach(w => warnungen.push(w.nachricht));

  const neueWerte = {
    datum,
    arbeitsbeginn,
    arbeitsende,
    pause_minuten: pause_minuten || 0,
    baustelle: baustelle || '',
    kunde: kunde || '',
    anfahrt: anfahrt || '',
    notizen: notizen || ''
  };

  try {
    // Update durchführen
    db.updateZeiteintrag(req.params.id, neueWerte);

    // Audit-Log erstellen (mit IP-Adresse)
    db.logAudit(
      req.session.id,
      'UPDATE',
      'zeiteintraege',
      parseInt(req.params.id),
      alterEintrag,
      neueWerte,
      clientIp
    );

    // Validierungsereignisse loggen (für Audit-Trail)
    if (validation.violations.length > 0 || validation.warnings.length > 0) {
      db.logValidation(req.session.id, parseInt(req.params.id), validation, clientIp);
    }

    res.json({
      success: true,
      warnung: warnungen.length > 0 ? warnungen[0] : null,
      warnungen: warnungen.length > 0 ? warnungen : undefined,
      validation: {
        valid: validation.valid,
        violations: validation.violations,
        warnings: validation.warnings,
        tagesStunden: (validation.tagesMinuten / 60).toFixed(1),
        wochenStunden: (validation.wochenMinuten / 60).toFixed(1)
      }
    });
  } catch (error) {
    console.error('Update fehlgeschlagen:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren' });
  }
});

// Zeiteintrag löschen (eigene oder Admin)
app.delete('/api/zeiteintraege/:id', checkSession, (req, res) => {
  const eintrag = db.getZeiteintragById(req.params.id);

  if (!eintrag) {
    return res.status(404).json({ error: 'Eintrag nicht gefunden' });
  }

  // Nur eigene Einträge oder Admin
  if (eintrag.mitarbeiter_id !== req.session.id && !req.session.ist_admin) {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }

  try {
    // Audit-Log vor Löschung erstellen (mit IP-Adresse)
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    db.logAudit(
      req.session.id,
      'DELETE',
      'zeiteintraege',
      parseInt(req.params.id),
      eintrag,
      null,
      clientIp
    );

    // Löschen
    db.deleteZeiteintrag(req.params.id);

    res.json({ success: true });
  } catch (error) {
    console.error('Löschen fehlgeschlagen:', error);
    res.status(500).json({ error: 'Fehler beim Löschen' });
  }
});

// ==================== STATISTIK ROUTES ====================

// Eigene Statistik (Mitarbeiter)
app.get('/api/statistik/wochen', checkSession, (req, res) => {
  const jahr = parseInt(req.query.jahr) || new Date().getFullYear();
  const wochen = db.getJahresWochenstatistik(req.session.id, jahr);
  const konfig = db.getArbeitszeitKonfig();

  // Überstunden berechnen (konfigurierbar)
  const result = wochen.map(w => {
    const stunden = Math.round((w.gesamtminuten || 0) / 60 * 100) / 100;
    const normalstunden = Math.min(stunden, konfig.standardWochenstunden);
    const ueberstunden = Math.round((stunden - konfig.standardWochenstunden) * 100) / 100;

    return {
      ...w,
      stunden,
      normalstunden,
      ueberstunden: Math.max(0, ueberstunden),
      minderstunden: Math.max(0, -ueberstunden),
      sollstunden: konfig.standardWochenstunden
    };
  });

  res.json(result);
});

app.get('/api/statistik/monate', checkSession, (req, res) => {
  const jahr = parseInt(req.query.jahr) || new Date().getFullYear();
  const monate = db.getJahresMonatsstatistik(req.session.id, jahr);
  const konfig = db.getArbeitszeitKonfig();

  const monatsNamen = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  const result = monate.map(m => {
    const stunden = Math.round((m.gesamtminuten || 0) / 60 * 100) / 100;
    const normalstunden = Math.min(stunden, konfig.standardMonatsstunden);
    const ueberstunden = Math.round((stunden - konfig.standardMonatsstunden) * 100) / 100;

    return {
      ...m,
      monatName: monatsNamen[parseInt(m.monat)],
      stunden,
      normalstunden,
      ueberstunden: Math.max(0, ueberstunden),
      minderstunden: Math.max(0, -ueberstunden),
      sollstunden: konfig.standardMonatsstunden
    };
  });

  res.json(result);
});

// Admin Statistik (alle Mitarbeiter)
app.get('/api/admin/statistik/uebersicht', checkSession, checkAdmin, (req, res) => {
  const jahr = parseInt(req.query.jahr) || new Date().getFullYear();
  const monat = parseInt(req.query.monat) || new Date().getMonth() + 1;
  const konfig = db.getArbeitszeitKonfig();

  const statistik = db.getAlleMitarbeiterStatistik(jahr, monat);

  const result = statistik.map(s => {
    const stunden = Math.round((s.gesamtminuten || 0) / 60 * 100) / 100;
    const normalstunden = Math.min(stunden, konfig.standardMonatsstunden);
    const ueberstunden = Math.round((stunden - konfig.standardMonatsstunden) * 100) / 100;

    return {
      ...s,
      stunden,
      normalstunden,
      ueberstunden: Math.max(0, ueberstunden),
      minderstunden: Math.max(0, -ueberstunden),
      sollstunden: konfig.standardMonatsstunden
    };
  });

  res.json(result);
});

app.get('/api/admin/statistik/mitarbeiter/:id', checkSession, checkAdmin, (req, res) => {
  const mitarbeiterId = parseInt(req.params.id);
  const jahr = parseInt(req.query.jahr) || new Date().getFullYear();
  const typ = req.query.typ || 'monate'; // 'wochen' oder 'monate'
  const konfig = db.getArbeitszeitKonfig();

  if (typ === 'wochen') {
    const wochen = db.getJahresWochenstatistik(mitarbeiterId, jahr);
    const result = wochen.map(w => {
      const stunden = Math.round((w.gesamtminuten || 0) / 60 * 100) / 100;
      const normalstunden = Math.min(stunden, konfig.standardWochenstunden);
      const ueberstunden = Math.round((stunden - konfig.standardWochenstunden) * 100) / 100;

      return {
        ...w,
        stunden,
        normalstunden,
        ueberstunden: Math.max(0, ueberstunden),
        minderstunden: Math.max(0, -ueberstunden),
        sollstunden: konfig.standardWochenstunden
      };
    });
    res.json(result);
  } else {
    const monate = db.getJahresMonatsstatistik(mitarbeiterId, jahr);
    const monatsNamen = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    const result = monate.map(m => {
      const stunden = Math.round((m.gesamtminuten || 0) / 60 * 100) / 100;
      const normalstunden = Math.min(stunden, konfig.standardMonatsstunden);
      const ueberstunden = Math.round((stunden - konfig.standardMonatsstunden) * 100) / 100;

      return {
        ...m,
        monatName: monatsNamen[parseInt(m.monat)],
        stunden,
        normalstunden,
        ueberstunden: Math.max(0, ueberstunden),
        minderstunden: Math.max(0, -ueberstunden),
        sollstunden: konfig.standardMonatsstunden
      };
    });
    res.json(result);
  }
});

// Monatliche Zeitabrechnung (eigene - für Mitarbeiter)
app.get('/api/monatsabrechnung', checkSession, (req, res) => {
  const jahr = parseInt(req.query.jahr) || new Date().getFullYear();
  const monat = parseInt(req.query.monat) || new Date().getMonth() + 1;

  const abrechnung = db.getMonatsabrechnung(req.session.id, jahr, monat);

  if (!abrechnung) {
    return res.status(404).json({ error: 'Keine Daten gefunden' });
  }

  // Überstunden berechnen
  const istStunden = parseFloat(abrechnung.summen.nettoStunden);
  const sollStunden = abrechnung.soll.monatStunden;
  const differenz = Math.round((istStunden - sollStunden) * 100) / 100;

  res.json({
    ...abrechnung,
    berechnung: {
      istStunden,
      sollStunden,
      differenz,
      ueberstunden: Math.max(0, differenz),
      minderstunden: Math.max(0, -differenz)
    }
  });
});

// Monatliche Zeitabrechnung (Admin - für beliebigen Mitarbeiter)
app.get('/api/admin/monatsabrechnung/:mitarbeiterId', checkSession, checkAdmin, (req, res) => {
  const mitarbeiterId = parseInt(req.params.mitarbeiterId);
  const jahr = parseInt(req.query.jahr) || new Date().getFullYear();
  const monat = parseInt(req.query.monat) || new Date().getMonth() + 1;

  const abrechnung = db.getMonatsabrechnung(mitarbeiterId, jahr, monat);

  if (!abrechnung) {
    return res.status(404).json({ error: 'Keine Daten gefunden' });
  }

  // Überstunden berechnen
  const istStunden = parseFloat(abrechnung.summen.nettoStunden);
  const sollStunden = abrechnung.soll.monatStunden;
  const differenz = Math.round((istStunden - sollStunden) * 100) / 100;

  res.json({
    ...abrechnung,
    berechnung: {
      istStunden,
      sollStunden,
      differenz,
      ueberstunden: Math.max(0, differenz),
      minderstunden: Math.max(0, -differenz)
    }
  });
});

// ==================== ADMIN ROUTES ====================

// Alle Zeiteinträge (Admin)
app.get('/api/admin/zeiteintraege', checkSession, checkAdmin, (req, res) => {
  const { von, bis, mitarbeiter, baustelle, kunde } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const result = db.getAllZeiteintraege(von, bis, page, limit, mitarbeiter, baustelle, kunde);
  res.json(result);
});

// Zeiteintrag löschen (Admin)
app.delete('/api/admin/zeiteintraege/:id', checkSession, checkAdmin, (req, res) => {
  db.deleteZeiteintrag(req.params.id);
  res.json({ success: true });
});

// Alle Mitarbeiter (Admin)
app.get('/api/admin/mitarbeiter', checkSession, checkAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const result = db.getAllMitarbeiter(page, limit);
  res.json(result);
});

// Neuen Mitarbeiter anlegen (Admin)
app.post('/api/admin/mitarbeiter', checkSession, checkAdmin, (req, res) => {
  const { mitarbeiter_nr, name, pin, password } = req.body;
  const pwd = password || pin; // Abwärtskompatibilität

  if (!mitarbeiter_nr || !name || !pwd) {
    return res.status(400).json({ error: 'Alle Felder sind erforderlich' });
  }

  const validation = validatePassword(pwd);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Passwort unsicher: ' + validation.errors.join(', ') });
  }

  try {
    db.createMitarbeiter(mitarbeiter_nr, name, pwd);
    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Mitarbeiternummer existiert bereits' });
    }
    res.status(500).json({ error: 'Fehler beim Erstellen' });
  }
});

// Mitarbeiter bearbeiten (Admin)
app.put('/api/admin/mitarbeiter/:id', checkSession, checkAdmin, (req, res) => {
  const { name, aktiv, pin, password } = req.body;
  const pwd = password || pin; // Abwärtskompatibilität

  if (name !== undefined) {
    db.updateMitarbeiter(req.params.id, name, aktiv !== false);
  }

  if (pwd) {
    const validation = validatePassword(pwd);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Passwort unsicher: ' + validation.errors.join(', ') });
    }
    db.updateMitarbeiterPassword(req.params.id, pwd);
  }

  res.json({ success: true });
});

// Audit-Log abrufen (Admin) - mit Pagination und Filter
app.get('/api/admin/audit', checkSession, checkAdmin, (req, res) => {
  const { tabelle, datensatz_id, aktion, page, limit } = req.query;

  // Einzelner Datensatz
  if (tabelle && datensatz_id) {
    const logs = db.getAuditLog(tabelle, parseInt(datensatz_id));
    return res.json(logs);
  }

  // Paginierte Liste mit optionalen Filtern
  const result = db.getAllAuditLogs(
    parseInt(page) || 1,
    parseInt(limit) || 50,
    tabelle || null,
    aktion || null
  );

  res.json(result);
});

// Audit-Log Integrität prüfen (Admin)
app.get('/api/admin/audit/verify', checkSession, checkAdmin, (req, res) => {
  const result = db.verifyAuditIntegrity();
  res.json(result);
});

// Audit-Log Export (Admin) - CSV für rechtliche Nachweise
app.get('/api/admin/audit/export', checkSession, checkAdmin, (req, res) => {
  const { von, bis, tabelle, format } = req.query;

  if (!von || !bis) {
    return res.status(400).json({ error: 'Zeitraum (von, bis) erforderlich' });
  }

  const logs = db.getAuditExport(von, bis, tabelle || null);

  if (format === 'json') {
    return res.json(logs);
  }

  // CSV Export
  let csv = 'ID;Zeitpunkt;Mitarbeiter-Nr;Name;Aktion;Tabelle;Datensatz-ID;IP-Adresse;Hash;Vorheriger Hash\n';

  logs.forEach(log => {
    csv += [
      log.id,
      log.zeitpunkt,
      log.mitarbeiter_nr,
      `"${log.mitarbeiter_name}"`,
      log.aktion,
      log.tabelle,
      log.datensatz_id || '',
      log.ip_adresse || '',
      log.eintrag_hash?.substring(0, 16) + '...',
      log.vorheriger_hash?.substring(0, 16) + '...'
    ].join(';') + '\n';
  });

  // Integritätsprüfung anfügen
  const integrity = db.verifyAuditIntegrity();
  csv += '\n=== INTEGRITÄTSPRÜFUNG ===\n';
  csv += `Geprüfte Einträge;${integrity.total}\n`;
  csv += `Gültige Einträge;${integrity.valid}\n`;
  csv += `Ungültige Einträge;${integrity.invalid.length}\n`;
  csv += `Hash-Kette intakt;${!integrity.chainBroken ? 'JA' : 'NEIN'}\n`;
  csv += `Exportiert am;${new Date().toLocaleString('de-AT')}\n`;

  const filename = `audit_log_${von}_${bis}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\ufeff' + csv);
});

// ==================== AZG-VERSTÖSSE ROUTES ====================

// AZG-Verstöße abrufen (Admin) - erweitert mit Warnungen und Verletzungen
app.get('/api/admin/verstoesse', checkSession, checkAdmin, (req, res) => {
  const { von, bis, mitarbeiter_id } = req.query;

  // Standard: letzte 30 Tage
  const bisDate = bis || new Date().toISOString().split('T')[0];
  const vonDate = von || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const verstoesse = db.getAZGVerstoesseErweitert(
    mitarbeiter_id ? parseInt(mitarbeiter_id) : null,
    vonDate,
    bisDate
  );

  // Auch Pausenverstöße hinzufügen
  const pausenVerstoesse = db.getAZGVerstoesse(
    mitarbeiter_id ? parseInt(mitarbeiter_id) : null,
    vonDate,
    bisDate
  ).filter(v => v.typ === 'PAUSENZEIT');

  pausenVerstoesse.forEach(v => {
    verstoesse.push({
      ...v,
      schweregrad: 'WARNUNG'
    });
  });

  // Statistik
  const stats = {
    total: verstoesse.length,
    kritisch: verstoesse.filter(v => v.schweregrad === 'KRITISCH').length,
    warnung: verstoesse.filter(v => v.schweregrad === 'WARNUNG').length,
    zeitraum: { von: vonDate, bis: bisDate }
  };

  res.json({ verstoesse, stats });
});

// ==================== KUNDEN ROUTES ====================

// Alle aktiven Kunden abrufen (für Dropdown - alle Benutzer)
app.get('/api/kunden', checkSession, (req, res) => {
  const kunden = db.getAllKunden(true);
  res.json(kunden);
});

// Alle Kunden abrufen (Admin - inkl. inaktive)
app.get('/api/admin/kunden', checkSession, checkAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const result = db.getAllKunden(false, page, limit);
  res.json(result);
});

// Einzelnen Kunden abrufen (Admin)
app.get('/api/admin/kunden/:id', checkSession, checkAdmin, (req, res) => {
  const kunde = db.getKundeById(req.params.id);
  if (!kunde) {
    return res.status(404).json({ error: 'Kunde nicht gefunden' });
  }
  res.json(kunde);
});

// Neuen Kunden anlegen (Admin)
app.post('/api/admin/kunden', checkSession, checkAdmin, (req, res) => {
  const { name, ansprechpartner, strasse, plz, ort, telefon, email, notizen } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Firmenname erforderlich' });
  }

  try {
    db.createKunde({
      name: name.trim(),
      ansprechpartner,
      strasse,
      plz,
      ort,
      telefon,
      email,
      notizen
    });
    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Kunde existiert bereits' });
    }
    res.status(500).json({ error: 'Fehler beim Erstellen' });
  }
});

// Kunden bearbeiten (Admin)
app.put('/api/admin/kunden/:id', checkSession, checkAdmin, (req, res) => {
  const { name, ansprechpartner, strasse, plz, ort, telefon, email, notizen, aktiv } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Firmenname erforderlich' });
  }

  try {
    db.updateKunde(req.params.id, {
      name: name.trim(),
      ansprechpartner,
      strasse,
      plz,
      ort,
      telefon,
      email,
      notizen,
      aktiv
    });
    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Kundenname existiert bereits' });
    }
    res.status(500).json({ error: 'Fehler beim Aktualisieren' });
  }
});

// Kunden löschen (Admin)
app.delete('/api/admin/kunden/:id', checkSession, checkAdmin, (req, res) => {
  try {
    db.deleteKunde(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Löschen' });
  }
});

// ==================== BAUSTELLEN ROUTES ====================

// Alle aktiven Baustellen abrufen (für Dropdown - alle Benutzer)
app.get('/api/baustellen', checkSession, (req, res) => {
  const baustellen = db.getAllBaustellen(true);
  res.json(baustellen);
});

// Alle Baustellen abrufen (Admin - inkl. inaktive)
app.get('/api/admin/baustellen', checkSession, checkAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const result = db.getAllBaustellen(false, page, limit);
  res.json(result);
});

// Einzelne Baustelle abrufen (Admin)
app.get('/api/admin/baustellen/:id', checkSession, checkAdmin, (req, res) => {
  const baustelle = db.getBaustelleById(req.params.id);
  if (!baustelle) {
    return res.status(404).json({ error: 'Baustelle nicht gefunden' });
  }
  res.json(baustelle);
});

// Neue Baustelle anlegen (Admin)
app.post('/api/admin/baustellen', checkSession, checkAdmin, (req, res) => {
  const { name, kunde, adresse, notizen } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Baustellenname erforderlich' });
  }

  try {
    db.createBaustelle({
      name: name.trim(),
      kunde,
      adresse,
      notizen
    });
    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Baustelle existiert bereits' });
    }
    res.status(500).json({ error: 'Fehler beim Erstellen' });
  }
});

// Baustelle bearbeiten (Admin)
app.put('/api/admin/baustellen/:id', checkSession, checkAdmin, (req, res) => {
  const { name, kunde, adresse, notizen, aktiv } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Baustellenname erforderlich' });
  }

  try {
    db.updateBaustelle(req.params.id, {
      name: name.trim(),
      kunde,
      adresse,
      notizen,
      aktiv
    });
    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Baustellenname existiert bereits' });
    }
    res.status(500).json({ error: 'Fehler beim Aktualisieren' });
  }
});

// Baustelle löschen (Admin)
app.delete('/api/admin/baustellen/:id', checkSession, checkAdmin, (req, res) => {
  try {
    db.deleteBaustelle(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Löschen' });
  }
});

// ==================== PAUSENREGELN ROUTES ====================

// Alle Pausenregeln abrufen (Admin)
app.get('/api/admin/pausenregeln', checkSession, checkAdmin, (req, res) => {
  const regeln = db.getAllPausenregeln();
  res.json(regeln);
});

// Aktive Pausenregeln abrufen (für Validierung)
app.get('/api/pausenregeln', checkSession, (req, res) => {
  const regeln = db.getAktivePausenregeln();
  res.json(regeln);
});

// Einzelne Pausenregel abrufen (Admin)
app.get('/api/admin/pausenregeln/:id', checkSession, checkAdmin, (req, res) => {
  const regel = db.getPausenregelById(req.params.id);
  if (!regel) {
    return res.status(404).json({ error: 'Pausenregel nicht gefunden' });
  }
  res.json(regel);
});

// Neue Pausenregel erstellen (Admin)
app.post('/api/admin/pausenregeln', checkSession, checkAdmin, (req, res) => {
  const { name, min_arbeitszeit_minuten, min_pause_minuten, warnung_text, aktiv } = req.body;

  if (!name || !min_arbeitszeit_minuten || !min_pause_minuten) {
    return res.status(400).json({ error: 'Name, Mindestarbeitszeit und Mindestpause erforderlich' });
  }

  if (min_arbeitszeit_minuten < 0 || min_pause_minuten < 0) {
    return res.status(400).json({ error: 'Werte müssen positiv sein' });
  }

  try {
    db.createPausenregel({
      name,
      min_arbeitszeit_minuten: parseInt(min_arbeitszeit_minuten),
      min_pause_minuten: parseInt(min_pause_minuten),
      warnung_text,
      aktiv
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Erstellen' });
  }
});

// Pausenregel aktualisieren (Admin)
app.put('/api/admin/pausenregeln/:id', checkSession, checkAdmin, (req, res) => {
  const { name, min_arbeitszeit_minuten, min_pause_minuten, warnung_text, aktiv } = req.body;

  if (!name || !min_arbeitszeit_minuten || !min_pause_minuten) {
    return res.status(400).json({ error: 'Name, Mindestarbeitszeit und Mindestpause erforderlich' });
  }

  try {
    db.updatePausenregel(req.params.id, {
      name,
      min_arbeitszeit_minuten: parseInt(min_arbeitszeit_minuten),
      min_pause_minuten: parseInt(min_pause_minuten),
      warnung_text,
      aktiv
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Aktualisieren' });
  }
});

// Pausenregel löschen (Admin)
app.delete('/api/admin/pausenregeln/:id', checkSession, checkAdmin, (req, res) => {
  try {
    db.deletePausenregel(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Löschen' });
  }
});

// Pausenverstoß prüfen (für Frontend-Validierung)
app.post('/api/check-pause', checkSession, (req, res) => {
  const { arbeitsbeginn, arbeitsende, pause_minuten } = req.body;

  if (!arbeitsbeginn || !arbeitsende) {
    return res.status(400).json({ error: 'Beginn und Ende erforderlich' });
  }

  const beginnMinuten = parseInt(arbeitsbeginn.split(':')[0]) * 60 + parseInt(arbeitsbeginn.split(':')[1]);
  const endeMinuten = parseInt(arbeitsende.split(':')[0]) * 60 + parseInt(arbeitsende.split(':')[1]);
  const arbeitsMinuten = endeMinuten - beginnMinuten;

  const verstoesse = db.checkPausenverstoesse(arbeitsMinuten, pause_minuten || 0);

  res.json({
    valid: verstoesse.length === 0,
    verstoesse: verstoesse,
    warnungen: verstoesse.map(v => v.warnung ||
      `Bei mehr als ${Math.floor(v.min_arbeitszeit / 60)} Stunden Arbeitszeit sind mindestens ${v.min_pause} Minuten Pause vorgeschrieben.`
    )
  });
});

// ==================== EINSTELLUNGEN ROUTES ====================

// Alle Einstellungen abrufen (Admin)
app.get('/api/admin/einstellungen', checkSession, checkAdmin, (req, res) => {
  const einstellungen = db.getAlleEinstellungen();
  res.json(einstellungen);
});

// Arbeitszeitkonfiguration abrufen (für Frontend)
app.get('/api/einstellungen/arbeitszeit', checkSession, (req, res) => {
  const konfig = db.getArbeitszeitKonfig();
  res.json(konfig);
});

// Einstellung aktualisieren (Admin)
app.put('/api/admin/einstellungen/:schluessel', checkSession, checkAdmin, (req, res) => {
  const { schluessel } = req.params;
  const { wert } = req.body;

  if (wert === undefined || wert === null) {
    return res.status(400).json({ error: 'Wert erforderlich' });
  }

  // Validierung für numerische Werte
  const numValue = parseFloat(wert);
  if (isNaN(numValue) || numValue < 0) {
    return res.status(400).json({ error: 'Wert muss eine positive Zahl sein' });
  }

  // Spezifische Validierungen
  if (schluessel === 'standard_wochenstunden' && (numValue < 1 || numValue > 60)) {
    return res.status(400).json({ error: 'Wochenstunden müssen zwischen 1 und 60 liegen' });
  }
  if (schluessel === 'standard_monatsstunden' && (numValue < 1 || numValue > 260)) {
    return res.status(400).json({ error: 'Monatsstunden müssen zwischen 1 und 260 liegen' });
  }
  if (schluessel === 'max_tagesstunden' && (numValue < 1 || numValue > 16)) {
    return res.status(400).json({ error: 'Max. Tagesstunden müssen zwischen 1 und 16 liegen' });
  }
  if (schluessel === 'max_wochenstunden' && (numValue < 1 || numValue > 72)) {
    return res.status(400).json({ error: 'Max. Wochenstunden müssen zwischen 1 und 72 liegen' });
  }

  try {
    db.updateEinstellung(schluessel, wert.toString());
    res.json({ success: true });
  } catch (error) {
    console.error('Einstellung aktualisieren fehlgeschlagen:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren' });
  }
});

// Mehrere Einstellungen auf einmal aktualisieren (Admin)
app.put('/api/admin/einstellungen', checkSession, checkAdmin, (req, res) => {
  const einstellungen = req.body;

  if (!einstellungen || typeof einstellungen !== 'object') {
    return res.status(400).json({ error: 'Einstellungen-Objekt erforderlich' });
  }

  try {
    for (const [schluessel, wert] of Object.entries(einstellungen)) {
      if (wert !== undefined && wert !== null) {
        db.updateEinstellung(schluessel, wert.toString());
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Einstellungen aktualisieren fehlgeschlagen:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren' });
  }
});

// Helper: Datum formatieren (österreichisches Format DD.MM.YYYY)
function formatDateAT(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year}`;
}

// Helper: Minuten in Stunden formatieren (österreichisches Format)
function formatStunden(minuten) {
  return (minuten / 60).toFixed(2).replace('.', ',');
}

// ==================== EXPORT ROUTES ====================

// Erweiterte CSV-Export (Admin) - Rechtskonform mit Wochen-Totals und Verstößen
app.get('/api/admin/export/csv', checkSession, checkAdmin, (req, res) => {
  const { von, bis, mitarbeiter } = req.query;

  if (!von || !bis) {
    return res.status(400).json({ error: 'Zeitraum (von, bis) erforderlich' });
  }

  const eintraege = db.getExportDaten(mitarbeiter || null, von, bis);
  const wochenTotals = db.getWochenTotals(mitarbeiter || null, von, bis);
  const verstoesse = db.getAZGVerstoesse(mitarbeiter || null, von, bis);
  const konfig = db.getArbeitszeitKonfig();

  let csv = '';

  // Abschnitt 1: Tägliche Aufzeichnungen
  csv += '=== TÄGLICHE AUFZEICHNUNGEN ===\n';
  csv += 'Datum;Mitarbeiter-Nr;Name;Beginn;Ende;Pause (Min);Netto (Std);Normalstd;Überstd;Baustelle;Kunde;Anfahrt;Notizen\n';

  eintraege.forEach(e => {
    const beginnMin = parseInt(e.arbeitsbeginn.split(':')[0]) * 60 + parseInt(e.arbeitsbeginn.split(':')[1]);
    const endeMin = parseInt(e.arbeitsende.split(':')[0]) * 60 + parseInt(e.arbeitsende.split(':')[1]);
    const nettoMinuten = endeMin - beginnMin - e.pause_minuten;
    const nettoStunden = nettoMinuten / 60;
    // Tägliche Normalstunden = max. maxTagesstunden pro Tag
    const tagesNormal = Math.min(nettoStunden, konfig.maxTagesstunden);
    const tagesUeber = Math.max(0, nettoStunden - konfig.maxTagesstunden);

    csv += [
      formatDateAT(e.datum),
      e.mitarbeiter_nr,
      `"${e.mitarbeiter_name}"`,
      e.arbeitsbeginn,
      e.arbeitsende,
      e.pause_minuten,
      formatStunden(nettoMinuten),
      tagesNormal.toFixed(2).replace('.', ','),
      tagesUeber.toFixed(2).replace('.', ','),
      `"${e.baustelle || ''}"`,
      `"${e.kunde || ''}"`,
      `"${e.anfahrt || ''}"`,
      `"${(e.notizen || '').replace(/"/g, '""')}"`
    ].join(';') + '\n';
  });

  // Abschnitt 2: Wochen-Totals
  csv += '\n=== WOCHEN-TOTALS ===\n';
  csv += 'Mitarbeiter-Nr;Name;Jahr;KW;Von;Bis;Arbeitstage;Netto (Std);Soll (Std);Normalstd;Überstunden (Std);Pause gesamt (Min)\n';

  wochenTotals.forEach(w => {
    const nettoStunden = w.netto_minuten / 60;
    const normalstunden = Math.min(nettoStunden, konfig.standardWochenstunden);
    const ueberstunden = Math.max(0, nettoStunden - konfig.standardWochenstunden);

    csv += [
      w.mitarbeiter_nr,
      `"${w.mitarbeiter_name}"`,
      w.jahr,
      w.kalenderwoche,
      formatDateAT(w.woche_start),
      formatDateAT(w.woche_ende),
      w.arbeitstage,
      formatStunden(w.netto_minuten),
      konfig.standardWochenstunden,
      normalstunden.toFixed(2).replace('.', ','),
      ueberstunden.toFixed(2).replace('.', ','),
      w.gesamt_pause
    ].join(';') + '\n';
  });

  // Abschnitt 3: AZG-Verstöße
  csv += '\n=== AZG-VERSTÖSSE ===\n';
  if (verstoesse.length === 0) {
    csv += 'Keine Verstöße im gewählten Zeitraum.\n';
  } else {
    csv += 'Typ;Beschreibung;Mitarbeiter-Nr;Name;Datum;Wert;Grenzwert\n';
    verstoesse.forEach(v => {
      csv += [
        v.typ,
        `"${v.beschreibung}"`,
        v.mitarbeiter_nr,
        `"${v.mitarbeiter}"`,
        v.kalenderwoche || formatDateAT(v.datum),
        `${v.wert} ${v.einheit}`,
        `${v.grenzwert} ${v.einheit}`
      ].join(';') + '\n';
    });
  }

  // Fußzeile
  csv += '\n=== EXPORT-INFORMATIONEN ===\n';
  csv += `Exportiert am;${new Date().toLocaleString('de-AT')}\n`;
  csv += `Zeitraum;${formatDateAT(von)} - ${formatDateAT(bis)}\n`;
  csv += `Anzahl Einträge;${eintraege.length}\n`;
  csv += `Anzahl Verstöße;${verstoesse.length}\n`;

  const filename = `arbeitszeit_export_${von}_${bis}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\ufeff' + csv);
});

// PDF-Export (Admin) - Rechtskonform
app.get('/api/admin/export/pdf', checkSession, checkAdmin, (req, res) => {
  const { von, bis, mitarbeiter } = req.query;

  if (!von || !bis) {
    return res.status(400).json({ error: 'Zeitraum (von, bis) erforderlich' });
  }

  const eintraege = db.getExportDaten(mitarbeiter || null, von, bis);
  const wochenTotals = db.getWochenTotals(mitarbeiter || null, von, bis);
  const verstoesse = db.getAZGVerstoesse(mitarbeiter || null, von, bis);
  const konfig = db.getArbeitszeitKonfig();

  // PDF erstellen
  const doc = new PDFDocument({ margin: 40, size: 'A4' });

  const filename = `arbeitszeit_export_${von}_${bis}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  doc.pipe(res);

  // Header
  doc.fontSize(18).font('Helvetica-Bold').text('Arbeitszeitnachweis', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text(`Zeitraum: ${formatDateAT(von)} - ${formatDateAT(bis)}`, { align: 'center' });
  doc.moveDown();

  // Rechtlicher Hinweis
  doc.fontSize(8).fillColor('#666')
    .text('Erstellt gemäß österreichischem Arbeitszeitgesetz (AZG). Aufbewahrungspflicht: 1 Jahr nach Ablauf des Arbeitsjahres.', { align: 'center' });
  doc.fillColor('#000').moveDown();

  // Zusammenfassung
  doc.fontSize(14).font('Helvetica-Bold').text('Zusammenfassung');
  doc.fontSize(10).font('Helvetica');
  const gesamtMinuten = eintraege.reduce((sum, e) => {
    const beginnMin = parseInt(e.arbeitsbeginn.split(':')[0]) * 60 + parseInt(e.arbeitsbeginn.split(':')[1]);
    const endeMin = parseInt(e.arbeitsende.split(':')[0]) * 60 + parseInt(e.arbeitsende.split(':')[1]);
    return sum + (endeMin - beginnMin - e.pause_minuten);
  }, 0);

  doc.text(`Anzahl Einträge: ${eintraege.length}`);
  doc.text(`Gesamtstunden: ${formatStunden(gesamtMinuten).replace(',', '.')} h`);
  doc.text(`Gesamtpausen: ${eintraege.reduce((s, e) => s + e.pause_minuten, 0)} Min`);
  doc.text(`AZG-Verstöße: ${verstoesse.length}`, { continued: verstoesse.length > 0 });
  if (verstoesse.length > 0) {
    doc.fillColor('#c00').text(' (Siehe Details unten)', { continued: false });
    doc.fillColor('#000');
  }
  doc.moveDown();

  // Wochen-Totals Tabelle
  doc.fontSize(14).font('Helvetica-Bold').text('Wochen-Übersicht');
  doc.moveDown(0.5);

  if (wochenTotals.length > 0) {
    // Tabellen-Header
    const tableTop = doc.y;
    const colWidths = [80, 100, 50, 70, 70, 70, 70];
    const headers = ['Mitarbeiter', 'Name', 'KW', 'Von', 'Bis', 'Stunden', 'Überst.'];

    doc.fontSize(9).font('Helvetica-Bold');
    let x = 40;
    headers.forEach((h, i) => {
      doc.text(h, x, tableTop, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });

    doc.moveTo(40, tableTop + 12).lineTo(555, tableTop + 12).stroke();

    doc.font('Helvetica').fontSize(8);
    let y = tableTop + 18;

    wochenTotals.forEach(w => {
      if (y > 750) {
        doc.addPage();
        y = 50;
      }

      const nettoStunden = w.netto_minuten / 60;
      const normalstunden = Math.min(nettoStunden, konfig.standardWochenstunden);
      const ueberstunden = nettoStunden - konfig.standardWochenstunden;

      x = 40;
      doc.text(w.mitarbeiter_nr, x, y, { width: colWidths[0] }); x += colWidths[0];
      doc.text(w.mitarbeiter_name.substring(0, 15), x, y, { width: colWidths[1] }); x += colWidths[1];
      doc.text(`${w.kalenderwoche}`, x, y, { width: colWidths[2] }); x += colWidths[2];
      doc.text(formatDateAT(w.woche_start), x, y, { width: colWidths[3] }); x += colWidths[3];
      doc.text(formatDateAT(w.woche_ende), x, y, { width: colWidths[4] }); x += colWidths[4];
      doc.text(formatStunden(w.netto_minuten).replace(',', '.'), x, y, { width: colWidths[5] }); x += colWidths[5];

      // Überstunden farbig
      const ueberText = ueberstunden > 0 ? ueberstunden.toFixed(1) : ueberstunden.toFixed(1);
      if (ueberstunden > 0) {
        doc.fillColor('#060').text(`+${ueberText}`, x, y, { width: colWidths[6] });
      } else if (ueberstunden < 0) {
        doc.fillColor('#c00').text(ueberText, x, y, { width: colWidths[6] });
      } else {
        doc.text('0', x, y, { width: colWidths[6] });
      }
      doc.fillColor('#000');

      y += 14;
    });
  } else {
    doc.fontSize(10).text('Keine Daten im gewählten Zeitraum.');
  }

  doc.moveDown(2);

  // AZG-Verstöße
  if (verstoesse.length > 0) {
    doc.addPage();
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#c00').text('AZG-Verstöße');
    doc.fillColor('#000').moveDown(0.5);

    doc.fontSize(9).font('Helvetica');
    verstoesse.forEach((v, i) => {
      doc.font('Helvetica-Bold').text(`${i + 1}. ${v.beschreibung}`);
      doc.font('Helvetica')
        .text(`   Mitarbeiter: ${v.mitarbeiter_nr} - ${v.mitarbeiter}`)
        .text(`   Datum: ${v.kalenderwoche || formatDateAT(v.datum)}`)
        .text(`   Ist-Wert: ${v.wert} ${v.einheit} (Grenzwert: ${v.grenzwert} ${v.einheit})`);
      doc.moveDown(0.5);
    });
  }

  // Tägliche Aufzeichnungen (neue Seite)
  doc.addPage();
  doc.fontSize(14).font('Helvetica-Bold').text('Tägliche Aufzeichnungen');
  doc.moveDown(0.5);

  if (eintraege.length > 0) {
    const tableTop2 = doc.y;
    const colWidths2 = [65, 55, 85, 40, 40, 35, 40, 90];
    const headers2 = ['Datum', 'MA-Nr', 'Name', 'Von', 'Bis', 'Pause', 'Netto', 'Baustelle'];

    doc.fontSize(8).font('Helvetica-Bold');
    let x2 = 40;
    headers2.forEach((h, i) => {
      doc.text(h, x2, tableTop2, { width: colWidths2[i], align: 'left' });
      x2 += colWidths2[i];
    });

    doc.moveTo(40, tableTop2 + 10).lineTo(555, tableTop2 + 10).stroke();

    doc.font('Helvetica').fontSize(7);
    let y2 = tableTop2 + 14;

    eintraege.forEach(e => {
      if (y2 > 780) {
        doc.addPage();
        y2 = 50;
      }

      const beginnMin = parseInt(e.arbeitsbeginn.split(':')[0]) * 60 + parseInt(e.arbeitsbeginn.split(':')[1]);
      const endeMin = parseInt(e.arbeitsende.split(':')[0]) * 60 + parseInt(e.arbeitsende.split(':')[1]);
      const nettoMinuten = endeMin - beginnMin - e.pause_minuten;

      x2 = 40;
      doc.text(formatDateAT(e.datum), x2, y2, { width: colWidths2[0] }); x2 += colWidths2[0];
      doc.text(e.mitarbeiter_nr, x2, y2, { width: colWidths2[1] }); x2 += colWidths2[1];
      doc.text(e.mitarbeiter_name.substring(0, 12), x2, y2, { width: colWidths2[2] }); x2 += colWidths2[2];
      doc.text(e.arbeitsbeginn, x2, y2, { width: colWidths2[3] }); x2 += colWidths2[3];
      doc.text(e.arbeitsende, x2, y2, { width: colWidths2[4] }); x2 += colWidths2[4];
      doc.text(`${e.pause_minuten}`, x2, y2, { width: colWidths2[5] }); x2 += colWidths2[5];
      doc.text(formatStunden(nettoMinuten).replace(',', '.'), x2, y2, { width: colWidths2[6] }); x2 += colWidths2[6];
      doc.text((e.baustelle || '-').substring(0, 15), x2, y2, { width: colWidths2[7] });

      y2 += 11;
    });
  }

  // Fußzeile
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor('#999')
      .text(
        `Seite ${i + 1} von ${pages.count} | Exportiert: ${new Date().toLocaleString('de-AT')}`,
        40, 810, { align: 'center', width: 515 }
      );
  }

  doc.end();
});

// Alte Export-Route für Abwärtskompatibilität
app.get('/api/admin/export', checkSession, checkAdmin, (req, res) => {
  const { von, bis } = req.query;
  const result = db.getAllZeiteintraege(von, bis, 1, 10000);
  const eintraege = result.data || result;

  let csv = 'Datum;Mitarbeiter-Nr;Name;Beginn;Ende;Pause (Min.);Netto (Std.);Baustelle;Kunde;Anfahrt;Notizen\n';

  eintraege.forEach(e => {
    const beginnMin = parseInt(e.arbeitsbeginn.split(':')[0]) * 60 + parseInt(e.arbeitsbeginn.split(':')[1]);
    const endeMin = parseInt(e.arbeitsende.split(':')[0]) * 60 + parseInt(e.arbeitsende.split(':')[1]);
    const nettoStunden = ((endeMin - beginnMin - e.pause_minuten) / 60).toFixed(2).replace('.', ',');

    csv += [
      formatDateAT(e.datum),
      e.mitarbeiter_nr,
      `"${e.mitarbeiter_name}"`,
      e.arbeitsbeginn,
      e.arbeitsende,
      e.pause_minuten,
      nettoStunden,
      `"${e.baustelle || ''}"`,
      `"${e.kunde || ''}"`,
      `"${e.anfahrt || ''}"`,
      `"${(e.notizen || '').replace(/"/g, '""')}"`
    ].join(';') + '\n';
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=arbeitszeiten_${von || 'alle'}_${bis || 'alle'}.csv`);
  res.send('\ufeff' + csv);
});

// Verstöße-API (für Frontend)
app.get('/api/admin/verstoesse', checkSession, checkAdmin, (req, res) => {
  const { von, bis, mitarbeiter } = req.query;

  if (!von || !bis) {
    return res.status(400).json({ error: 'Zeitraum (von, bis) erforderlich' });
  }

  const verstoesse = db.getAZGVerstoesse(mitarbeiter || null, von, bis);
  res.json(verstoesse);
});

// ==================== START ====================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║         ARBEITSZEIT-TRACKER (AZG-konform)                  ║
╠════════════════════════════════════════════════════════════╣
║  Server läuft auf: http://localhost:${PORT}                    ║
║                                                            ║
║  Standard-Admin:                                           ║
║    Mitarbeiter-Nr: admin                                   ║
║    PIN: 1234                                               ║
║                                                            ║
║  WICHTIG: Ändere den Admin-PIN nach dem ersten Login!      ║
╚════════════════════════════════════════════════════════════╝
  `);
});
