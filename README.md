# Arbeitszeit-Tracker

Einfache Arbeitszeiterfassung konform mit dem österreichischen Arbeitszeitgesetz (AZG).

## Features

- Mitarbeiter-Login mit Nummer + PIN
- Zeiterfassung: Beginn, Ende, Pause (AZG-konform)
- Freitextfelder: Baustelle, Kunde, Anfahrt, Notizen
- Admin-Bereich: Alle Einträge sehen, Mitarbeiter verwalten
- CSV-Export für die Lohnbuchhaltung
- Mobile-freundlich

## Installation

```bash
cd arbeitszeit-tracker
npm install
npm start
```

Server läuft dann auf http://localhost:3000

## Standard-Login

- **Mitarbeiter-Nr:** admin
- **PIN:** 1234

**Wichtig:** PIN nach erstem Login ändern!

## Kostenlos Hosten

### Option 1: Railway.app (empfohlen)
1. Account auf https://railway.app erstellen
2. Neues Projekt > Deploy from GitHub
3. Repository verbinden oder als ZIP hochladen
4. Automatisches Deployment

### Option 2: Render.com
1. Account auf https://render.com erstellen
2. New > Web Service
3. Repository verbinden
4. Build Command: `npm install`
5. Start Command: `npm start`

### Option 3: Fly.io
```bash
flyctl launch
flyctl deploy
```

### Option 4: Eigener Server
```bash
# Mit PM2 für dauerhaften Betrieb
npm install -g pm2
pm2 start server.js --name arbeitszeit
pm2 save
pm2 startup
```

## Umgebungsvariablen

| Variable | Beschreibung | Standard |
|----------|-------------|----------|
| PORT | Server-Port | 3000 |
| DATABASE_PATH | Pfad zur SQLite-Datei | ./arbeitszeit.db |

## AZG-Konformität

Diese App erfasst gemäß österreichischem Arbeitszeitgesetz:
- Beginn und Ende der täglichen Arbeitszeit
- Dauer der Ruhepausen
- Berechnung der Netto-Arbeitszeit

Hinweis bei über 6 Stunden Arbeitszeit ohne ausreichende Pause.

## Datensicherheit

- Alle Daten werden lokal in einer SQLite-Datei gespeichert
- PINs werden gehasht (bcrypt)
- Keine externen Dienste, volle Kontrolle über die Daten
- Für DSGVO-Konformität: Regelmäßige Backups der `arbeitszeit.db` empfohlen

## Backup

```bash
# Datenbank sichern
cp arbeitszeit.db backup/arbeitszeit_$(date +%Y%m%d).db
```

## Lizenz

MIT - Frei verwendbar
