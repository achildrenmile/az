const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session-Speicher (einfach, für Produktion besser express-session verwenden)
const sessions = new Map();

// Session-Middleware
const checkSession = (req, res, next) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(401).json({ error: 'Nicht angemeldet' });
  }
  req.session = sessions.get(sessionId);
  next();
};

const checkAdmin = (req, res, next) => {
  if (!req.session.ist_admin) {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }
  next();
};

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

  // Session erstellen
  const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
  sessions.set(sessionId, {
    id: mitarbeiter.id,
    mitarbeiter_nr: mitarbeiter.mitarbeiter_nr,
    name: mitarbeiter.name,
    ist_admin: mitarbeiter.ist_admin === 1
  });

  res.json({
    sessionId,
    name: mitarbeiter.name,
    ist_admin: mitarbeiter.ist_admin === 1
  });
});

// Logout
app.post('/api/logout', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.json({ success: true });
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

// CSV-Export (Admin)
app.get('/api/admin/export', checkSession, checkAdmin, (req, res) => {
  const { von, bis } = req.query;
  const eintraege = db.getAllZeiteintraege(von, bis);

  // CSV-Header
  let csv = 'Datum;Mitarbeiter-Nr;Name;Beginn;Ende;Pause (Min);Netto (Std);Baustelle;Kunde;Anfahrt;Notizen\n';

  eintraege.forEach(e => {
    const beginnMin = parseInt(e.arbeitsbeginn.split(':')[0]) * 60 + parseInt(e.arbeitsbeginn.split(':')[1]);
    const endeMin = parseInt(e.arbeitsende.split(':')[0]) * 60 + parseInt(e.arbeitsende.split(':')[1]);
    const nettoStunden = ((endeMin - beginnMin - e.pause_minuten) / 60).toFixed(2);

    csv += [
      e.datum,
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
