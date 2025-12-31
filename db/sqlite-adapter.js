/**
 * SQLite Database Adapter
 *
 * Uses better-sqlite3 for synchronous database operations.
 */

const Database = require('better-sqlite3');
const DatabaseAdapter = require('./adapter');
const config = require('./config');

class SqliteAdapter extends DatabaseAdapter {
  constructor() {
    super();
    this.dialect = 'sqlite';
    this.isAsync = false;
  }

  async init() {
    this.db = new Database(config.sqlite.path);
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
    return this;
  }

  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async query(sql, params = []) {
    return this.db.prepare(sql).all(...params);
  }

  async queryOne(sql, params = []) {
    return this.db.prepare(sql).get(...params);
  }

  async execute(sql, params = []) {
    const result = this.db.prepare(sql).run(...params);
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid
    };
  }

  async transaction(callback) {
    const trx = this.db.transaction(callback);
    return trx();
  }

  async exec(sql) {
    this.db.exec(sql);
  }

  /**
   * Get raw better-sqlite3 database instance
   * (for backward compatibility with existing code)
   */
  getRawDb() {
    return this.db;
  }

  /**
   * Prepare a statement (for backward compatibility)
   */
  prepare(sql) {
    return this.db.prepare(sql);
  }
}

module.exports = SqliteAdapter;
