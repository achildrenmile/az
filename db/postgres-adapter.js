/**
 * PostgreSQL Database Adapter
 *
 * Uses pg (node-postgres) for asynchronous database operations.
 */

const { Pool } = require('pg');
const DatabaseAdapter = require('./adapter');
const config = require('./config');

class PostgresAdapter extends DatabaseAdapter {
  constructor() {
    super();
    this.dialect = 'postgres';
    this.isAsync = true;
    this.pool = null;
  }

  async init() {
    this.pool = new Pool({
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
      ssl: config.postgres.ssl,
      max: config.postgres.max,
      idleTimeoutMillis: config.postgres.idleTimeoutMillis,
      connectionTimeoutMillis: config.postgres.connectionTimeoutMillis
    });

    // Test connection
    const client = await this.pool.connect();
    client.release();

    return this;
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async query(sql, params = []) {
    const result = await this.pool.query(sql, params);
    return result.rows;
  }

  async queryOne(sql, params = []) {
    const result = await this.pool.query(sql, params);
    return result.rows[0] || null;
  }

  async execute(sql, params = []) {
    const result = await this.pool.query(sql, params);
    return {
      changes: result.rowCount,
      lastInsertRowid: result.rows[0]?.id || null
    };
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback({
        query: (sql, params) => client.query(sql, params).then(r => r.rows),
        queryOne: (sql, params) => client.query(sql, params).then(r => r.rows[0] || null),
        execute: (sql, params) => client.query(sql, params).then(r => ({
          changes: r.rowCount,
          lastInsertRowid: r.rows[0]?.id || null
        }))
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async exec(sql) {
    // Split SQL by semicolons and execute each statement
    const statements = sql.split(';').filter(s => s.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await this.pool.query(statement);
      }
    }
  }

  /**
   * Get raw pg pool instance
   */
  getPool() {
    return this.pool;
  }
}

module.exports = PostgresAdapter;
