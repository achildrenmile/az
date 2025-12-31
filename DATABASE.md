# Database Configuration

The Arbeitszeit-Tracker supports two database backends:
- **SQLite** (default) - For development and small deployments
- **PostgreSQL** - For production and multi-user environments

## Configuration

Database selection is controlled via environment variables.

### SQLite (Default)

SQLite is the default database and requires no configuration.

```bash
# Optional: Custom database path
export DATABASE_PATH=/path/to/arbeitszeit.db
```

### PostgreSQL

To use PostgreSQL, set the following environment variables:

```bash
export DB_TYPE=postgres
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=arbeitszeit
export DB_USER=postgres
export DB_PASSWORD=your_password

# Optional
export DB_SSL=true           # Enable SSL connection
export DB_POOL_SIZE=10       # Connection pool size
```

## PostgreSQL Setup

### 1. Create Database

```sql
CREATE DATABASE arbeitszeit;
```

### 2. Initialize Schema

The schema is automatically created on first startup. Alternatively, you can manually apply:

```bash
psql -h localhost -U postgres -d arbeitszeit -f db/schema-postgres.sql
```

### 3. Start Application

```bash
DB_TYPE=postgres DB_HOST=localhost DB_NAME=arbeitszeit DB_USER=postgres DB_PASSWORD=secret npm start
```

## Environment File

For convenience, create a `.env` file:

```bash
# SQLite (default)
# DB_TYPE=sqlite
# DATABASE_PATH=./arbeitszeit.db

# PostgreSQL
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=arbeitszeit
DB_USER=postgres
DB_PASSWORD=your_secure_password
```

## Differences Between Backends

| Feature | SQLite | PostgreSQL |
|---------|--------|------------|
| Setup | Zero configuration | Requires server |
| Concurrency | Single writer | Multiple writers |
| Scalability | Small deployments | Large deployments |
| Backup | File copy | pg_dump |
| Performance | Good for < 100k records | Better for large datasets |

## Production Recommendations

For production deployments with multiple users:

1. Use PostgreSQL for better concurrency
2. Enable SSL (`DB_SSL=true`)
3. Use connection pooling (default: 10 connections)
4. Regular backups with `pg_dump`
5. Monitor connection pool usage

## Troubleshooting

### Connection Refused
- Verify PostgreSQL is running
- Check host, port, and firewall settings

### Authentication Failed
- Verify username and password
- Check PostgreSQL `pg_hba.conf` for authentication rules

### SSL Certificate Error
- Set `DB_SSL=true` for SSL connections
- The application uses `rejectUnauthorized: false` by default

## Database Migration

A dedicated migration script is provided to safely transfer data between SQLite and PostgreSQL.

### Migration Script Usage

```bash
# Migrate from SQLite to PostgreSQL
node migrate-db.js --from sqlite --to postgres

# Migrate from PostgreSQL to SQLite
node migrate-db.js --from postgres --to sqlite

# Dry-run (validate without migrating)
node migrate-db.js --from sqlite --to postgres --dry-run

# Force migration to non-empty target
node migrate-db.js --from sqlite --to postgres --force

# Verbose output
node migrate-db.js --from sqlite --to postgres --verbose
```

### Options

| Option | Description |
|--------|-------------|
| `--from <type>` | Source database type (`sqlite` or `postgres`) |
| `--to <type>` | Target database type (`sqlite` or `postgres`) |
| `--force` | Allow migration to non-empty target database |
| `--dry-run` | Validate and show what would be migrated without making changes |
| `--verbose` | Show detailed progress for each table |
| `--skip-validation` | Skip post-migration row count validation |

### Migration Process: SQLite → PostgreSQL

1. **Prepare PostgreSQL database**
   ```bash
   # Create database
   createdb -U postgres arbeitszeit

   # Initialize schema
   psql -U postgres -d arbeitszeit -f db/schema-postgres.sql
   ```

2. **Set environment variables**
   ```bash
   export DB_HOST=localhost
   export DB_PORT=5432
   export DB_NAME=arbeitszeit
   export DB_USER=postgres
   export DB_PASSWORD=your_password
   export DATABASE_PATH=./arbeitszeit.db  # SQLite source
   ```

3. **Run dry-run first**
   ```bash
   node migrate-db.js --from sqlite --to postgres --dry-run --verbose
   ```

4. **Execute migration**
   ```bash
   node migrate-db.js --from sqlite --to postgres --verbose
   ```

5. **Verify and switch**
   ```bash
   # Update application to use PostgreSQL
   export DB_TYPE=postgres
   pm2 restart arbeitszeit
   ```

### What Gets Migrated

The script migrates all tables in the correct order (respecting foreign key dependencies):

- User data: `mitarbeiter`, `sessions`
- Time entries: `zeiteintraege`, `monatsbestaetigung`, `gleitzeit_saldo`
- Master data: `kunden`, `baustellen`, `pausenregeln`, `arbeitstypen`
- Audit trail: `audit_log`, `loeschprotokoll`
- Collective agreements: `kv_kollektivvertraege`, `kv_regeln`, `kv_gruppen`
- Service records: `leistungsnachweise`, `leistungsnachweis_mitarbeiter`
- BUAK data: `buak_schlechtwetter`, `buak_schlechtwetter_mitarbeiter`
- Settings: `einstellungen`, `admin_benachrichtigungen`

### Safety Features

- **Empty target check**: Migration fails if target contains data (use `--force` to override)
- **Row count validation**: Verifies all rows were transferred correctly
- **Dry-run mode**: Preview migration without making changes
- **Transaction safety**: Errors during migration are clearly reported
- **ID preservation**: All primary keys and relationships are preserved

### Post-Migration Verification

After migration, verify data integrity:

```bash
# Check row counts in PostgreSQL
psql -U postgres -d arbeitszeit -c "SELECT 'mitarbeiter' as table_name, COUNT(*) FROM mitarbeiter UNION ALL SELECT 'zeiteintraege', COUNT(*) FROM zeiteintraege UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log;"

# Verify audit log hash chain
curl http://localhost:3000/api/admin/audit/verify
```

### Rollback

If migration fails or needs to be reverted:

1. Keep the original SQLite database as backup
2. Switch back to SQLite by unsetting `DB_TYPE`:
   ```bash
   unset DB_TYPE
   pm2 restart arbeitszeit
   ```
3. The PostgreSQL database can be dropped and recreated for a fresh migration attempt
