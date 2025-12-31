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

## Migration Notes

Migrating from SQLite to PostgreSQL:

1. Export data from SQLite
2. Create PostgreSQL database
3. Import data with appropriate type conversions
4. Update environment variables
5. Restart application

**Note:** Automatic migration between databases is not currently supported.
