/**
 * Database Module
 *
 * Provides a unified database interface supporting SQLite and PostgreSQL.
 * Selection is based on DB_TYPE environment variable.
 */

const config = require('./config');
const SqlHelpers = require('./sql-helpers');

let adapter = null;
let sql = null;

/**
 * Initialize the database connection
 */
async function init() {
  if (adapter) {
    return adapter;
  }

  sql = new SqlHelpers(config.type);

  if (config.type === 'postgres') {
    const PostgresAdapter = require('./postgres-adapter');
    adapter = new PostgresAdapter();
  } else {
    const SqliteAdapter = require('./sqlite-adapter');
    adapter = new SqliteAdapter();
  }

  await adapter.init();

  console.log(`Database initialized: ${config.type.toUpperCase()}`);

  return adapter;
}

/**
 * Get the database adapter
 */
function getAdapter() {
  if (!adapter) {
    throw new Error('Database not initialized. Call init() first.');
  }
  return adapter;
}

/**
 * Get SQL helpers for the current dialect
 */
function getSqlHelpers() {
  if (!sql) {
    sql = new SqlHelpers(config.type);
  }
  return sql;
}

/**
 * Get the current database type
 */
function getDbType() {
  return config.type;
}

/**
 * Check if using PostgreSQL
 */
function isPostgres() {
  return config.type === 'postgres';
}

/**
 * Check if using SQLite
 */
function isSqlite() {
  return config.type === 'sqlite';
}

/**
 * Close the database connection
 */
async function close() {
  if (adapter) {
    await adapter.close();
    adapter = null;
  }
}

module.exports = {
  init,
  getAdapter,
  getSqlHelpers,
  getDbType,
  isPostgres,
  isSqlite,
  close,
  config
};
