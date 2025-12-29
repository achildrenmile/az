const express = require('express');
const crypto = require('crypto');
const path = require('path');
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

// ==================== AUTH ROUTES ====================

// Login
app.post('/api/login', (req, res) => {
  const { mitarbeiter_nr, pin } = req.body;

  if (!mitarbeiter_nr || !pin) {
    return res.status(400).json({ error: 'Mitarbeiternummer und PIN erforderlich' });
  }

  const mitarbeiter = db.getMitarbeiterByNr(mitarbeiter_nr);
  if (!mitarbeiter) {
    return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
  }

  if (!db.verifyPin(mitarbeiter, pin)) {
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

  // AZG-Hinweis: Bei mehr als 6 Stunden ist mindestens 30 Min Pause Pflicht
  const nettoMinuten = arbeitsMinuten - (pause_minuten || 0);
  let warnung = null;
  if (nettoMinuten > 360 && (!pause_minuten || pause_minuten < 30)) {
    warnung = 'Hinweis: Bei mehr als 6 Stunden Arbeitszeit sind lt. AZG mindestens 30 Minuten Pause vorgeschrieben.';
  }

  try {
    db.createZeiteintrag({
      mitarbeiter_id: req.session.id,
      datum,
      arbeitsbeginn,
      arbeitsende,
      pause_minuten: pause_minuten || 0,
      baustelle,
      kunde,
      anfahrt,
      notizen
    });

    res.json({ success: true, warnung });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Speichern' });
  }
});

// Eigene Zeiteinträge abrufen
app.get('/api/zeiteintraege', checkSession, (req, res) => {
  const eintraege = db.getZeiteintraegeByMitarbeiter(req.session.id);
  res.json(eintraege);
});

// ==================== ADMIN ROUTES ====================

// Alle Zeiteinträge (Admin)
app.get('/api/admin/zeiteintraege', checkSession, checkAdmin, (req, res) => {
  const { von, bis } = req.query;
  const eintraege = db.getAllZeiteintraege(von, bis);
  res.json(eintraege);
});

// Zeiteintrag löschen (Admin)
app.delete('/api/admin/zeiteintraege/:id', checkSession, checkAdmin, (req, res) => {
  db.deleteZeiteintrag(req.params.id);
  res.json({ success: true });
});

// Alle Mitarbeiter (Admin)
app.get('/api/admin/mitarbeiter', checkSession, checkAdmin, (req, res) => {
  const mitarbeiter = db.getAllMitarbeiter();
  res.json(mitarbeiter);
});

// Neuen Mitarbeiter anlegen (Admin)
app.post('/api/admin/mitarbeiter', checkSession, checkAdmin, (req, res) => {
  const { mitarbeiter_nr, name, pin } = req.body;

  if (!mitarbeiter_nr || !name || !pin) {
    return res.status(400).json({ error: 'Alle Felder sind erforderlich' });
  }

  if (pin.length < 4) {
    return res.status(400).json({ error: 'PIN muss mindestens 4 Zeichen haben' });
  }

  try {
    db.createMitarbeiter(mitarbeiter_nr, name, pin);
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
  const { name, aktiv, pin } = req.body;

  if (name !== undefined) {
    db.updateMitarbeiter(req.params.id, name, aktiv !== false);
  }

  if (pin) {
    if (pin.length < 4) {
      return res.status(400).json({ error: 'PIN muss mindestens 4 Zeichen haben' });
    }
    db.updateMitarbeiterPin(req.params.id, pin);
  }

  res.json({ success: true });
});

// Helper: Datum formatieren (österreichisches Format DD.MM.YYYY)
function formatDateAT(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year}`;
}

// CSV-Export (Admin)
app.get('/api/admin/export', checkSession, checkAdmin, (req, res) => {
  const { von, bis } = req.query;
  const eintraege = db.getAllZeiteintraege(von, bis);

  // CSV-Header (österreichisches Format)
  let csv = 'Datum;Mitarbeiter-Nr;Name;Beginn;Ende;Pause (Min.);Netto (Std.);Baustelle;Kunde;Anfahrt;Notizen\n';

  eintraege.forEach(e => {
    const beginnMin = parseInt(e.arbeitsbeginn.split(':')[0]) * 60 + parseInt(e.arbeitsbeginn.split(':')[1]);
    const endeMin = parseInt(e.arbeitsende.split(':')[0]) * 60 + parseInt(e.arbeitsende.split(':')[1]);
    // Österreichisches Format: Komma als Dezimaltrennzeichen
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
  res.send('\ufeff' + csv); // BOM für Excel-Kompatibilität
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
