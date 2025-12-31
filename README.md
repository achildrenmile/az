# AZ - Arbeitszeiterfassung

Einfache und gesetzeskonforme Arbeitszeiterfassung nach dem österreichischen Arbeitszeitgesetz (AZG).

## Features

### Zeiterfassung
- Tägliche Arbeitszeit mit Beginn, Ende und Pausen
- Zuordnung zu Baustellen und Kunden
- Automatische Berechnung der Netto-Arbeitszeit
- Notizen und Anfahrtszeiten

### AZG-Konformität
- **Pausenvalidierung** (§11 AZG): Warnung bei zu kurzer Pause (>6h = min. 30min Pause)
- **Tägliche Arbeitszeit** (§9 AZG):
  - Warnung bei >10 Stunden
  - Verletzung bei >12 Stunden
- **Wöchentliche Arbeitszeit** (§9 AZG):
  - Warnung bei >48 Stunden
  - Verletzung bei >60 Stunden
- Konfigurierbare Pausenregeln

### Überstunden-Berechnung
- Konfigurierbare Soll-Arbeitszeit (Woche/Monat)
- Trennung von Normalstunden und Überstunden
- Wochen- und Monatsstatistiken

### Audit-Trail (unveränderlich)
- Hash-verkettetes Protokoll aller Änderungen (Blockchain-ähnlich)
- CREATE, UPDATE, DELETE und VALIDATION-Ereignisse
- IP-Adressen-Tracking
- Integritätsprüfung der Hash-Kette
- Rechtskonformer CSV-Export

### Verstöße-Dashboard
- Übersicht aller AZG-Verstöße und Warnungen
- Filter nach Mitarbeiter und Zeitraum
- Statistiken (Gesamt/Kritisch/Warnungen)

### Export & Berichte
- CSV-Export aller Zeiteinträge
- PDF-Zeitnachweis zum Drucken
- Audit-Log Export mit Integritätsnachweis

### Verwaltung
- Mitarbeiter-Verwaltung mit sicheren Passwörtern
- Kunden- und Baustellen-Stammdaten
- Einstellbare Arbeitszeit-Parameter

## Technologie

- **Backend:** Node.js + Express
- **Datenbank:** SQLite (Standard) oder PostgreSQL
- **Frontend:** Vanilla JavaScript (Single Page App)
- **Hosting:** PM2, Docker oder Cloudflare Tunnel

## Installation

### Docker (empfohlen)

```bash
# Image bauen
docker build -t arbeitszeit:latest .

# Container starten
docker run -d -p 3000:3000 -v ./data:/data arbeitszeit:latest
```

Für Multi-Tenant-Deployment mit automatischen Cloudflare Tunnels:

```bash
./provision.sh kundenname
./provision.sh demo --with-dummydata
```

Siehe [DOCKER.md](DOCKER.md) für vollständige Dokumentation.

### Manuell

```bash
# Dependencies installieren
npm install

# Server starten
npm start

# Oder mit PM2
pm2 start server.js --name arbeitszeit
```

## Konfiguration

| Variable | Standard | Beschreibung |
|----------|----------|--------------|
| `PORT` | 3000 | Server-Port |
| `DATABASE_PATH` | ./arbeitszeit.db | SQLite-Datenbankpfad |
| `DB_TYPE` | sqlite | Datenbank-Backend (`sqlite` oder `postgres`) |
| `DB_HOST` | localhost | PostgreSQL Host |
| `DB_PORT` | 5432 | PostgreSQL Port |
| `DB_NAME` | arbeitszeit | PostgreSQL Datenbankname |
| `DB_USER` | postgres | PostgreSQL Benutzer |
| `DB_PASSWORD` | - | PostgreSQL Passwort |

Für detaillierte PostgreSQL-Konfiguration und Migration siehe [DATABASE.md](DATABASE.md).

### Datenbank-Migration

```bash
# SQLite → PostgreSQL migrieren
node migrate-db.js --from sqlite --to postgres --verbose
```

## API Endpunkte

### Authentifizierung
- `POST /api/login` - Anmelden
- `POST /api/logout` - Abmelden

### Zeiteinträge
- `GET /api/zeiteintraege` - Eigene Einträge
- `POST /api/zeiteintraege` - Neuer Eintrag (mit Validierung)
- `PUT /api/zeiteintraege/:id` - Eintrag bearbeiten
- `DELETE /api/zeiteintraege/:id` - Eintrag löschen

### Admin
- `GET /api/admin/zeiteintraege` - Alle Einträge
- `GET /api/admin/mitarbeiter` - Mitarbeiter verwalten
- `GET /api/admin/verstoesse` - AZG-Verstöße abrufen
- `GET /api/admin/audit` - Audit-Log
- `GET /api/admin/audit/verify` - Integrität prüfen
- `GET /api/admin/audit/export` - Audit-Export

## Lizenz

MIT License - siehe [LICENSE](LICENSE)

## Support

office@strali.solutions
