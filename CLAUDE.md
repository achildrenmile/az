# Arbeitszeit-Tracker - Dokumentation

## Übersicht

Einfache Arbeitszeiterfassung konform mit dem österreichischen Arbeitszeitgesetz (AZG).

**URL:** https://azdemo.strali.solutions
**Lokaler Port:** 3000
**Login:** admin / 1234

---

## Erstellte Dateien

```
/var/www/arbeitszeit/
├── package.json          # Dependencies (express, better-sqlite3, bcryptjs)
├── server.js             # Express-Server mit REST API
├── database.js           # SQLite-Datenbank Schema & Funktionen
├── arbeitszeit.db        # SQLite-Datenbank (wird automatisch erstellt)
├── README.md             # Benutzer-Dokumentation
├── CLAUDE.md             # Diese Datei
└── public/
    ├── index.html        # Frontend (Single Page App)
    ├── app.js            # JavaScript (Login, Erfassung, Admin)
    └── style.css         # Styling (responsive)
```

---

## Deployment-Schritte

### 1. App erstellen

```bash
# Projektstruktur erstellt in /home/oe8yml/arbeitszeit-tracker
mkdir -p arbeitszeit-tracker/public
```

### 2. Dependencies installieren

```bash
cd /home/oe8yml/arbeitszeit-tracker
npm install
```

### 3. App nach /var/www kopieren

```bash
sudo cp -r /home/oe8yml/arbeitszeit-tracker /var/www/arbeitszeit
sudo chown -R oe8yml:oe8yml /var/www/arbeitszeit
```

### 4. PM2 Prozess einrichten

```bash
cd /var/www/arbeitszeit
pm2 start server.js --name arbeitszeit
pm2 save
```

### 5. Cloudflare Tunnel konfigurieren

Config-Datei `/etc/cloudflared/strali.yml` aktualisiert:

```yaml
resolver: 1.1.1.1

tunnel: 3613bf97-d7ab-4184-908a-c4e260612eb2
credentials-file: /home/oe8yml/.cloudflared/3613bf97-d7ab-4184-908a-c4e260612eb2.json

ingress:
  - hostname: strali.solutions
    service: http://localhost:8080
  - hostname: azdemo.strali.solutions
    service: http://localhost:3000
  - service: http_status:404
```

### 6. DNS-Route und Tunnel neu starten

```bash
cloudflared tunnel route dns strali azdemo.strali.solutions
sudo systemctl restart cloudflared-strali
```

---

## API Endpoints

### Auth
| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| POST | `/api/login` | Login mit mitarbeiter_nr + pin |
| POST | `/api/logout` | Logout |

### Zeiteinträge (Mitarbeiter)
| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/api/zeiteintraege` | Eigene Einträge abrufen |
| POST | `/api/zeiteintraege` | Neuen Eintrag erstellen |

### Admin
| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/api/admin/zeiteintraege` | Alle Einträge (mit Filter) |
| DELETE | `/api/admin/zeiteintraege/:id` | Eintrag löschen |
| GET | `/api/admin/mitarbeiter` | Alle Mitarbeiter |
| POST | `/api/admin/mitarbeiter` | Neuer Mitarbeiter |
| PUT | `/api/admin/mitarbeiter/:id` | Mitarbeiter bearbeiten |
| GET | `/api/admin/export` | CSV-Export |

---

## Datenbank-Schema

### Tabelle: mitarbeiter
| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | INTEGER | Primary Key |
| mitarbeiter_nr | TEXT | Eindeutige Nummer (Login) |
| name | TEXT | Anzeigename |
| pin_hash | TEXT | Gehashter PIN (bcrypt) |
| ist_admin | INTEGER | 0 oder 1 |
| aktiv | INTEGER | 0 oder 1 |
| erstellt_am | DATETIME | Timestamp |

### Tabelle: zeiteintraege
| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | INTEGER | Primary Key |
| mitarbeiter_id | INTEGER | Foreign Key |
| datum | DATE | Arbeitstag |
| arbeitsbeginn | TIME | Startzeit |
| arbeitsende | TIME | Endzeit |
| pause_minuten | INTEGER | Pausendauer |
| baustelle | TEXT | Freitext |
| kunde | TEXT | Freitext |
| anfahrt | TEXT | Freitext |
| notizen | TEXT | Freitext |
| erstellt_am | DATETIME | Timestamp |

---

## AZG-Konformität

Erfasst gemäß österreichischem Arbeitszeitgesetz:
- Beginn und Ende der täglichen Arbeitszeit
- Dauer der Ruhepausen
- Automatische Warnung bei >6h ohne 30min Pause
- Berechnung der Netto-Arbeitszeit

---

## Wartung

### Logs prüfen
```bash
pm2 logs arbeitszeit
```

### Neustart
```bash
pm2 restart arbeitszeit
```

### Datenbank-Backup
```bash
cp /var/www/arbeitszeit/arbeitszeit.db ~/backups/arbeitszeit_$(date +%Y%m%d).db
```

### Status prüfen
```bash
pm2 list
curl http://localhost:3000/api/login -X POST -H "Content-Type: application/json" -d '{"mitarbeiter_nr":"admin","pin":"1234"}'
```

---

## Services

| Service | Config | Port |
|---------|--------|------|
| arbeitszeit (PM2) | /var/www/arbeitszeit/server.js | 3000 |
| cloudflared-strali | /etc/cloudflared/strali.yml | - |

---

*Erstellt am 28.12.2025 mit Claude Code*
