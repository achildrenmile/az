# Arbeitszeit-Tracker - Dokumentation

## Übersicht

Einfache Arbeitszeiterfassung konform mit dem österreichischen Arbeitszeitgesetz (AZG).

- **URL:** https://azdemo.strali.solutions
- **Repository:** https://github.com/achildrenmile/az
- **Demo Login:** admin / 1234

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite (better-sqlite3)
- **Frontend:** Vanilla JS SPA
- **Auth:** bcryptjs for password hashing
- **Deployment:** Docker on Synology NAS

## Project Structure

```
├── server.js             # Express server with REST API
├── database.js           # SQLite database schema & functions
├── docker-init.js        # Docker initialization script
├── build.js              # Build script (minification)
├── Dockerfile            # Docker container definition
├── docker-compose.yml    # Docker compose config
├── deploy-production.sh  # Synology deployment script
├── public/
│   ├── index.html        # Frontend SPA
│   ├── app.js            # JavaScript (Login, Zeiterfassung, Admin)
│   └── style.css         # Styling (responsive)
└── data/
    └── arbeitszeit.db    # SQLite database (runtime, not in repo)
```

## Deployment

### Production (Synology NAS)

```bash
# Deploy to production
./deploy-production.sh
```

**Requirements:**
- Copy `.env.production.example` to `.env.production` and configure
- SSH access to Synology configured

**Infrastructure:**
- **Host**: Synology NAS
- **Container**: `arbeitszeit-synology` on port 3000
- **Tunnel**: `cloudflared-strali` (shared with strali.solutions)
- **Database**: SQLite at `/volume1/docker/arbeitszeit/data/arbeitszeit.db`

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production (minify JS/CSS)
npm run build
```

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/login` | Login with mitarbeiter_nr + pin |
| POST | `/api/logout` | Logout |

### Zeiteinträge (Employee)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/zeiteintraege` | Get own entries |
| POST | `/api/zeiteintraege` | Create new entry |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/zeiteintraege` | All entries (with filter) |
| DELETE | `/api/admin/zeiteintraege/:id` | Delete entry |
| GET | `/api/admin/mitarbeiter` | All employees |
| POST | `/api/admin/mitarbeiter` | New employee |
| PUT | `/api/admin/mitarbeiter/:id` | Edit employee |
| GET | `/api/admin/export` | CSV export |

## Database Schema

### Table: mitarbeiter
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary Key |
| mitarbeiter_nr | TEXT | Unique ID (login) |
| name | TEXT | Display name |
| pin_hash | TEXT | Hashed PIN (bcrypt) |
| ist_admin | INTEGER | 0 or 1 |
| aktiv | INTEGER | 0 or 1 |
| erstellt_am | DATETIME | Timestamp |

### Table: zeiteintraege
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary Key |
| mitarbeiter_id | INTEGER | Foreign Key |
| datum | DATE | Work day |
| arbeitsbeginn | TIME | Start time |
| arbeitsende | TIME | End time |
| pause_minuten | INTEGER | Break duration |
| baustelle | TEXT | Construction site |
| kunde | TEXT | Customer |
| anfahrt | TEXT | Travel info |
| notizen | TEXT | Notes |
| erstellt_am | DATETIME | Timestamp |

## AZG Compliance

Compliant with Austrian Working Time Act (Arbeitszeitgesetz):
- Records start and end of daily working time
- Records break duration
- Automatic warning for >6h without 30min break
- Calculates net working time

## Maintenance

### Check logs on Synology
```bash
ssh straliadmin@<SYNOLOGY_IP> '/usr/local/bin/docker logs arbeitszeit-synology'
```

### Database backup
Database is stored at `/volume1/docker/arbeitszeit/data/arbeitszeit.db` on Synology.

### Verify deployment
```bash
curl -s -o /dev/null -w "%{http_code}" https://azdemo.strali.solutions/
```
