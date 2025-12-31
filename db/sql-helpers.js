/**
 * SQL Dialect Helpers
 *
 * Provides database-agnostic SQL expressions for common operations.
 * Supports SQLite and PostgreSQL dialects.
 */

class SqlHelpers {
  constructor(dialect) {
    this.dialect = dialect;
  }

  /**
   * Get current timestamp expression
   */
  currentTimestamp() {
    return this.dialect === 'postgres' ? 'NOW()' : 'CURRENT_TIMESTAMP';
  }

  /**
   * Get current date expression
   */
  currentDate() {
    return this.dialect === 'postgres' ? 'CURRENT_DATE' : 'DATE(\'now\')';
  }

  /**
   * Extract year from date column
   */
  year(column) {
    return this.dialect === 'postgres'
      ? `EXTRACT(YEAR FROM ${column})::INTEGER`
      : `CAST(strftime('%Y', ${column}) AS INTEGER)`;
  }

  /**
   * Extract month from date column
   */
  month(column) {
    return this.dialect === 'postgres'
      ? `EXTRACT(MONTH FROM ${column})::INTEGER`
      : `CAST(strftime('%m', ${column}) AS INTEGER)`;
  }

  /**
   * Extract day from date column
   */
  day(column) {
    return this.dialect === 'postgres'
      ? `EXTRACT(DAY FROM ${column})::INTEGER`
      : `CAST(strftime('%d', ${column}) AS INTEGER)`;
  }

  /**
   * Extract ISO week number from date column
   */
  isoWeek(column) {
    return this.dialect === 'postgres'
      ? `EXTRACT(WEEK FROM ${column})::INTEGER`
      : `CAST(strftime('%W', ${column}) AS INTEGER)`;
  }

  /**
   * Extract hour from time column
   */
  hour(column) {
    return this.dialect === 'postgres'
      ? `EXTRACT(HOUR FROM ${column}::TIME)::INTEGER`
      : `CAST(strftime('%H', ${column}) AS INTEGER)`;
  }

  /**
   * Extract minute from time column
   */
  minute(column) {
    return this.dialect === 'postgres'
      ? `EXTRACT(MINUTE FROM ${column}::TIME)::INTEGER`
      : `CAST(strftime('%M', ${column}) AS INTEGER)`;
  }

  /**
   * Calculate time difference in minutes between two time columns
   * (end - start)
   */
  timeDiffMinutes(endCol, startCol) {
    if (this.dialect === 'postgres') {
      return `(EXTRACT(HOUR FROM ${endCol}::TIME) * 60 + EXTRACT(MINUTE FROM ${endCol}::TIME) - EXTRACT(HOUR FROM ${startCol}::TIME) * 60 - EXTRACT(MINUTE FROM ${startCol}::TIME))::INTEGER`;
    }
    return `(strftime('%H', ${endCol}) * 60 + strftime('%M', ${endCol}) - strftime('%H', ${startCol}) * 60 - strftime('%M', ${startCol}))`;
  }

  /**
   * Calculate net work minutes (arbeitsende - arbeitsbeginn - pause_minuten)
   */
  nettoMinuten(endCol = 'arbeitsende', startCol = 'arbeitsbeginn', pauseCol = 'pause_minuten') {
    if (this.dialect === 'postgres') {
      return `(EXTRACT(HOUR FROM ${endCol}::TIME) * 60 + EXTRACT(MINUTE FROM ${endCol}::TIME) - EXTRACT(HOUR FROM ${startCol}::TIME) * 60 - EXTRACT(MINUTE FROM ${startCol}::TIME) - ${pauseCol})::INTEGER`;
    }
    return `(strftime('%H', ${endCol}) * 60 + strftime('%M', ${endCol}) - strftime('%H', ${startCol}) * 60 - strftime('%M', ${startCol}) - ${pauseCol})`;
  }

  /**
   * Format date as string (YYYY-MM-DD)
   */
  formatDate(column) {
    return this.dialect === 'postgres'
      ? `TO_CHAR(${column}, 'YYYY-MM-DD')`
      : `strftime('%Y-%m-%d', ${column})`;
  }

  /**
   * Format date as Austrian format (DD.MM.YYYY)
   */
  formatDateAT(column) {
    return this.dialect === 'postgres'
      ? `TO_CHAR(${column}, 'DD.MM.YYYY')`
      : `strftime('%d.%m.%Y', ${column})`;
  }

  /**
   * Format datetime as ISO string
   */
  formatDatetime(column) {
    return this.dialect === 'postgres'
      ? `TO_CHAR(${column}, 'YYYY-MM-DD HH24:MI:SS')`
      : `strftime('%Y-%m-%d %H:%M:%S', ${column})`;
  }

  /**
   * Date between range
   */
  dateBetween(column, startParam, endParam) {
    return `${column} BETWEEN ${startParam} AND ${endParam}`;
  }

  /**
   * Year equals
   */
  yearEquals(column, yearParam) {
    if (this.dialect === 'postgres') {
      return `EXTRACT(YEAR FROM ${column})::INTEGER = ${yearParam}`;
    }
    return `strftime('%Y', ${column}) = ${yearParam}`;
  }

  /**
   * Week equals (for string comparison)
   */
  weekEquals(column, weekParam) {
    if (this.dialect === 'postgres') {
      return `LPAD(EXTRACT(WEEK FROM ${column})::TEXT, 2, '0') = ${weekParam}`;
    }
    return `strftime('%W', ${column}) = ${weekParam}`;
  }

  /**
   * Get auto-increment column definition
   */
  autoIncrement() {
    return this.dialect === 'postgres'
      ? 'SERIAL PRIMARY KEY'
      : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  }

  /**
   * Get boolean column type
   */
  booleanType() {
    return this.dialect === 'postgres' ? 'BOOLEAN' : 'INTEGER';
  }

  /**
   * Get boolean value
   */
  booleanValue(val) {
    if (this.dialect === 'postgres') {
      return val ? 'TRUE' : 'FALSE';
    }
    return val ? '1' : '0';
  }

  /**
   * COALESCE with default
   */
  coalesce(column, defaultVal) {
    return `COALESCE(${column}, ${defaultVal})`;
  }

  /**
   * Parameter placeholder
   * SQLite uses ?, PostgreSQL uses $1, $2, etc.
   */
  param(index) {
    return this.dialect === 'postgres' ? `$${index}` : '?';
  }

  /**
   * Generate parameter placeholders for multiple values
   */
  params(count, startIndex = 1) {
    const placeholders = [];
    for (let i = 0; i < count; i++) {
      placeholders.push(this.param(startIndex + i));
    }
    return placeholders.join(', ');
  }

  /**
   * LIMIT OFFSET clause
   */
  limitOffset(limitParam, offsetParam) {
    return `LIMIT ${limitParam} OFFSET ${offsetParam}`;
  }

  /**
   * String concatenation
   */
  concat(...parts) {
    return this.dialect === 'postgres'
      ? parts.join(' || ')
      : parts.join(' || ');
  }

  /**
   * Get returning clause for INSERT
   */
  returning(columns = '*') {
    return this.dialect === 'postgres' ? `RETURNING ${columns}` : '';
  }

  /**
   * Get last insert ID method (used after insert for SQLite)
   */
  needsLastInsertId() {
    return this.dialect === 'sqlite';
  }
}

module.exports = SqlHelpers;
