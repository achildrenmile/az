/**
 * Database Configuration
 *
 * Supports SQLite and PostgreSQL backends via environment variables.
 *
 * Environment Variables:
 * - DB_TYPE: 'sqlite' (default) or 'postgres'
 *
 * SQLite Configuration:
 * - DATABASE_PATH: Path to SQLite file (default: ./arbeitszeit.db)
 *
 * PostgreSQL Configuration:
 * - DB_HOST: PostgreSQL host (default: localhost)
 * - DB_PORT: PostgreSQL port (default: 5432)
 * - DB_NAME: Database name (default: arbeitszeit)
 * - DB_USER: Database user (default: postgres)
 * - DB_PASSWORD: Database password (required for postgres)
 * - DB_SSL: Enable SSL (default: false)
 */

const path = require('path');

const config = {
  type: (process.env.DB_TYPE || 'sqlite').toLowerCase(),

  sqlite: {
    path: process.env.DATABASE_PATH || path.join(__dirname, '..', 'arbeitszeit.db')
  },

  postgres: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'arbeitszeit',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  }
};

// Validate configuration
function validateConfig() {
  if (!['sqlite', 'postgres'].includes(config.type)) {
    throw new Error(`Invalid DB_TYPE: ${config.type}. Must be 'sqlite' or 'postgres'.`);
  }

  if (config.type === 'postgres' && !config.postgres.password) {
    console.warn('Warning: DB_PASSWORD not set for PostgreSQL connection');
  }

  return config;
}

module.exports = validateConfig();
