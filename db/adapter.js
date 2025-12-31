/**
 * Database Adapter Interface
 *
 * Provides a unified interface for database operations.
 * Implementations handle SQLite and PostgreSQL specifics.
 */

const config = require('./config');
const SqlHelpers = require('./sql-helpers');

class DatabaseAdapter {
  constructor() {
    this.dialect = config.type;
    this.sql = new SqlHelpers(this.dialect);
    this.db = null;
    this.isAsync = false;
  }

  /**
   * Initialize the database connection
   */
  async init() {
    throw new Error('init() must be implemented by subclass');
  }

  /**
   * Close the database connection
   */
  async close() {
    throw new Error('close() must be implemented by subclass');
  }

  /**
   * Execute a query that returns rows
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Array} - Array of rows
   */
  async query(sql, params = []) {
    throw new Error('query() must be implemented by subclass');
  }

  /**
   * Execute a query that returns a single row
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Object|null} - Single row or null
   */
  async queryOne(sql, params = []) {
    throw new Error('queryOne() must be implemented by subclass');
  }

  /**
   * Execute a statement (INSERT, UPDATE, DELETE)
   * @param {string} sql - SQL statement
   * @param {Array} params - Statement parameters
   * @returns {Object} - Result with changes and lastInsertRowid
   */
  async execute(sql, params = []) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Execute multiple statements in a transaction
   * @param {Function} callback - Function receiving transaction context
   */
  async transaction(callback) {
    throw new Error('transaction() must be implemented by subclass');
  }

  /**
   * Execute raw SQL (for schema creation)
   * @param {string} sql - Raw SQL statements
   */
  async exec(sql) {
    throw new Error('exec() must be implemented by subclass');
  }

  /**
   * Get SQL helper instance
   */
  getSqlHelpers() {
    return this.sql;
  }

  /**
   * Check if database is async (PostgreSQL) or sync (SQLite)
   */
  isAsyncDb() {
    return this.isAsync;
  }
}

module.exports = DatabaseAdapter;
