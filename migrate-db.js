#!/usr/bin/env node

/**
 * Database Migration Script
 * Migrates data between SQLite and PostgreSQL databases
 *
 * Usage:
 *   node migrate-db.js --from sqlite --to postgres [options]
 *   node migrate-db.js --from postgres --to sqlite [options]
 *
 * Options:
 *   --force           Allow migration to non-empty target database
 *   --dry-run         Validate without migrating
 *   --verbose         Show detailed progress
 *   --skip-validation Skip post-migration validation
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  from: null,
  to: null,
  force: args.includes('--force'),
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose'),
  skipValidation: args.includes('--skip-validation')
};

// Parse --from and --to arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--from' && args[i + 1]) {
    options.from = args[i + 1].toLowerCase();
  }
  if (args[i] === '--to' && args[i + 1]) {
    options.to = args[i + 1].toLowerCase();
  }
}

// Validate arguments
if (!options.from || !options.to) {
  console.error('Usage: node migrate-db.js --from <sqlite|postgres> --to <sqlite|postgres> [options]');
  console.error('');
  console.error('Options:');
  console.error('  --force           Allow migration to non-empty target database');
  console.error('  --dry-run         Validate without migrating');
  console.error('  --verbose         Show detailed progress');
  console.error('  --skip-validation Skip post-migration validation');
  console.error('');
  console.error('Environment variables for PostgreSQL:');
  console.error('  DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD');
  console.error('');
  console.error('Environment variables for SQLite:');
  console.error('  DATABASE_PATH (default: ./arbeitszeit.db)');
  process.exit(1);
}

if (options.from === options.to) {
  console.error('Error: Source and target database types must be different');
  process.exit(1);
}

if (!['sqlite', 'postgres'].includes(options.from) || !['sqlite', 'postgres'].includes(options.to)) {
  console.error('Error: Database type must be "sqlite" or "postgres"');
  process.exit(1);
}

// Tables in migration order (respecting foreign key dependencies)
const MIGRATION_ORDER = [
  // Level 0: No foreign key dependencies
  'mitarbeiter',
  'kunden',
  'baustellen',
  'pausenregeln',
  'kv_kollektivvertraege',
  'admin_benachrichtigungen',
  'loeschprotokoll',
  'einstellungen',
  'arbeitstypen',

  // Level 1: Depend on Level 0
  'sessions',
  'zeiteintraege',
  'audit_log',
  'monatsbestaetigung',
  'gleitzeit_saldo',
  'kv_regeln',
  'kv_gruppen',

  // Level 2: Depend on multiple Level 0/1 tables
  'leistungsnachweise',
  'buak_schlechtwetter',

  // Level 3: Junction tables
  'leistungsnachweis_mitarbeiter',
  'buak_schlechtwetter_mitarbeiter'
];

// Column mappings for tables (to handle schema differences)
const TABLE_COLUMNS = {
  mitarbeiter: ['id', 'mitarbeiter_nr', 'name', 'pin_hash', 'ist_admin', 'aktiv', 'erstellt_am', 'kv_gruppe_id', 'buak_relevant'],
  zeiteintraege: ['id', 'mitarbeiter_id', 'datum', 'arbeitsbeginn', 'arbeitsende', 'pause_minuten', 'baustelle', 'kunde', 'anfahrt', 'notizen', 'erstellt_am', 'standort', 'arbeitstyp', 'buak_relevant'],
  sessions: ['id', 'mitarbeiter_id', 'erstellt_am', 'laeuft_ab_am'],
  audit_log: ['id', 'zeitpunkt', 'mitarbeiter_id', 'aktion', 'tabelle', 'datensatz_id', 'alte_werte', 'neue_werte', 'ip_adresse', 'vorheriger_hash', 'eintrag_hash'],
  kunden: ['id', 'name', 'ansprechpartner', 'strasse', 'plz', 'ort', 'telefon', 'email', 'notizen', 'aktiv', 'erstellt_am'],
  baustellen: ['id', 'name', 'kunde', 'adresse', 'notizen', 'aktiv', 'erstellt_am', 'buak_relevant'],
  pausenregeln: ['id', 'name', 'min_arbeitszeit_minuten', 'min_pause_minuten', 'warnung_text', 'aktiv', 'erstellt_am'],
  monatsbestaetigung: ['id', 'mitarbeiter_id', 'jahr', 'monat', 'bestaetigt_am', 'ip_adresse', 'kommentar'],
  gleitzeit_saldo: ['id', 'mitarbeiter_id', 'periode_start', 'periode_ende', 'soll_minuten', 'ist_minuten', 'saldo_minuten', 'uebertrag_vorperiode', 'uebertrag_naechste', 'verfallen_minuten', 'abgeschlossen', 'erstellt_am', 'aktualisiert_am'],
  kv_kollektivvertraege: ['id', 'name', 'beschreibung', 'branche', 'gueltig_ab', 'gueltig_bis', 'aktiv', 'erstellt_am'],
  kv_regeln: ['id', 'kv_id', 'regel_typ', 'name', 'bedingung', 'wert', 'einheit', 'prioritaet', 'aktiv', 'erstellt_am'],
  kv_gruppen: ['id', 'kv_id', 'name', 'beschreibung', 'standard_wochenstunden', 'standard_monatsstunden', 'aktiv', 'erstellt_am'],
  admin_benachrichtigungen: ['id', 'typ', 'titel', 'nachricht', 'daten', 'gelesen', 'erstellt_am'],
  loeschprotokoll: ['id', 'tabelle', 'anzahl_geloescht', 'aeltester_eintrag', 'loeschgrund', 'ausgefuehrt_von', 'ausgefuehrt_am'],
  leistungsnachweise: ['id', 'datum', 'kunde_id', 'baustelle_id', 'kunde_freitext', 'baustelle_freitext', 'beschreibung', 'leistungszeit_von', 'leistungszeit_bis', 'leistungsdauer_minuten', 'notizen', 'ersteller_id', 'erstellt_am', 'unterschrift_daten', 'unterschrift_name', 'unterschrift_zeitpunkt', 'status', 'storniert_am', 'storniert_von', 'storno_grund'],
  leistungsnachweis_mitarbeiter: ['id', 'leistungsnachweis_id', 'mitarbeiter_id'],
  buak_schlechtwetter: ['id', 'datum', 'baustelle_id', 'baustelle_freitext', 'beginn', 'ende', 'dauer_minuten', 'grund', 'grund_details', 'notizen', 'ersteller_id', 'erstellt_am'],
  buak_schlechtwetter_mitarbeiter: ['id', 'schlechtwetter_id', 'mitarbeiter_id'],
  einstellungen: ['schluessel', 'wert', 'beschreibung', 'aktualisiert_am'],
  arbeitstypen: ['id', 'name', 'beschreibung', 'farbe', 'aktiv', 'sortierung', 'erstellt_am']
};

// Helper to log with timestamp
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function verbose(message) {
  if (options.verbose) {
    log(message);
  }
}

// Create SQLite connection
function createSqliteConnection() {
  const Database = require('better-sqlite3');
  const dbPath = process.env.DATABASE_PATH || './arbeitszeit.db';

  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite database not found: ${dbPath}`);
  }

  const db = new Database(dbPath);

  return {
    type: 'sqlite',
    query: (sql, params = []) => {
      const stmt = db.prepare(sql);
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        return stmt.all(...params);
      } else {
        return stmt.run(...params);
      }
    },
    getTableRowCount: (table) => {
      const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
      return result.count;
    },
    tableExists: (table) => {
      const result = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
      return !!result;
    },
    getColumns: (table) => {
      const result = db.prepare(`PRAGMA table_info(${table})`).all();
      return result.map(r => r.name);
    },
    close: () => db.close()
  };
}

// Create PostgreSQL connection
async function createPostgresConnection() {
  const { Pool } = require('pg');

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'arbeitszeit',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  // Test connection
  await pool.query('SELECT 1');

  return {
    type: 'postgres',
    query: async (sql, params = []) => {
      // Convert ? placeholders to $1, $2, etc.
      let paramIndex = 0;
      const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);
      const result = await pool.query(pgSql, params);
      return result.rows;
    },
    getTableRowCount: async (table) => {
      const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
      return parseInt(result.rows[0].count);
    },
    tableExists: async (table) => {
      const result = await pool.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
        [table]
      );
      return result.rows[0].exists;
    },
    getColumns: async (table) => {
      const result = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
        [table]
      );
      return result.rows.map(r => r.column_name);
    },
    close: () => pool.end()
  };
}

// Check if target database is empty
async function isTargetEmpty(target) {
  let totalRows = 0;

  for (const table of MIGRATION_ORDER) {
    const exists = await target.tableExists(table);
    if (exists) {
      const count = await target.getTableRowCount(table);
      totalRows += count;
    }
  }

  return totalRows === 0;
}

// Get available columns that exist in both source and target
async function getAvailableColumns(source, target, table) {
  const sourceColumns = await source.getColumns(table);
  const targetColumns = await target.getColumns(table);
  const expectedColumns = TABLE_COLUMNS[table] || [];

  // Use columns that exist in both source and target
  return expectedColumns.filter(col =>
    sourceColumns.includes(col) && targetColumns.includes(col)
  );
}

// Migrate a single table
async function migrateTable(source, target, table) {
  const exists = await source.tableExists(table);
  if (!exists) {
    verbose(`  Skipping ${table} (does not exist in source)`);
    return { table, sourceCount: 0, targetCount: 0, skipped: true };
  }

  const targetExists = await target.tableExists(table);
  if (!targetExists) {
    verbose(`  Skipping ${table} (does not exist in target)`);
    return { table, sourceCount: 0, targetCount: 0, skipped: true };
  }

  const columns = await getAvailableColumns(source, target, table);
  if (columns.length === 0) {
    verbose(`  Skipping ${table} (no matching columns)`);
    return { table, sourceCount: 0, targetCount: 0, skipped: true };
  }

  verbose(`  Migrating ${table} (${columns.length} columns)...`);

  // Get source data
  const rows = await source.query(`SELECT ${columns.join(', ')} FROM ${table}`);
  const sourceCount = rows.length;

  if (sourceCount === 0) {
    verbose(`  ${table}: 0 rows (empty)`);
    return { table, sourceCount: 0, targetCount: 0, skipped: false };
  }

  if (options.dryRun) {
    verbose(`  ${table}: ${sourceCount} rows (dry-run, not migrated)`);
    return { table, sourceCount, targetCount: 0, skipped: false, dryRun: true };
  }

  // Insert into target
  const placeholders = columns.map((_, i) => target.type === 'postgres' ? `$${i + 1}` : '?').join(', ');
  const insertSql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

  let inserted = 0;
  for (const row of rows) {
    const values = columns.map(col => row[col]);
    try {
      if (target.type === 'postgres') {
        await target.query(insertSql, values);
      } else {
        target.query(insertSql, values);
      }
      inserted++;
    } catch (err) {
      if (options.verbose) {
        console.error(`  Error inserting into ${table}: ${err.message}`);
      }
      throw err;
    }
  }

  verbose(`  ${table}: ${inserted} rows migrated`);

  // Reset sequence for PostgreSQL (for tables with SERIAL id)
  if (target.type === 'postgres' && columns.includes('id')) {
    try {
      await target.query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`
      );
      verbose(`  ${table}: sequence reset`);
    } catch (e) {
      // Ignore if table doesn't have a sequence
    }
  }

  return { table, sourceCount, targetCount: inserted, skipped: false };
}

// Validate migration
async function validateMigration(source, target, results) {
  log('Validating migration...');

  let errors = [];
  let warnings = [];

  for (const result of results) {
    if (result.skipped || result.dryRun) continue;

    const targetCount = await target.getTableRowCount(result.table);

    if (targetCount !== result.sourceCount) {
      errors.push(`${result.table}: row count mismatch (source: ${result.sourceCount}, target: ${targetCount})`);
    } else {
      verbose(`  ${result.table}: OK (${targetCount} rows)`);
    }
  }

  return { errors, warnings };
}

// Main migration function
async function migrate() {
  log(`Migration: ${options.from} → ${options.to}`);
  log(`Options: ${options.dryRun ? 'DRY-RUN ' : ''}${options.force ? 'FORCE ' : ''}${options.verbose ? 'VERBOSE' : ''}`);
  log('');

  let source, target;

  try {
    // Create connections
    log('Connecting to databases...');

    if (options.from === 'sqlite') {
      source = createSqliteConnection();
      log('  Source: SQLite connected');
    } else {
      source = await createPostgresConnection();
      log('  Source: PostgreSQL connected');
    }

    if (options.to === 'sqlite') {
      target = createSqliteConnection();
      log('  Target: SQLite connected');
    } else {
      target = await createPostgresConnection();
      log('  Target: PostgreSQL connected');
    }

    // Check if target is empty
    log('');
    log('Checking target database...');
    const isEmpty = await isTargetEmpty(target);

    if (!isEmpty && !options.force) {
      console.error('');
      console.error('Error: Target database is not empty!');
      console.error('Use --force to migrate anyway (existing data will cause conflicts)');
      console.error('');
      process.exit(1);
    }

    if (!isEmpty && options.force) {
      log('  Warning: Target database is not empty (--force specified)');
    } else {
      log('  Target database is empty');
    }

    // Migrate tables
    log('');
    log('Migrating tables...');

    const results = [];
    for (const table of MIGRATION_ORDER) {
      const result = await migrateTable(source, target, table);
      results.push(result);
    }

    // Validate
    if (!options.skipValidation && !options.dryRun) {
      log('');
      const validation = await validateMigration(source, target, results);

      if (validation.errors.length > 0) {
        console.error('');
        console.error('Validation FAILED:');
        validation.errors.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
      }

      log('Validation passed');
    }

    // Summary
    log('');
    log('='.repeat(50));
    log('Migration Summary');
    log('='.repeat(50));

    let totalSource = 0;
    let totalTarget = 0;
    let skipped = 0;

    for (const result of results) {
      if (result.skipped) {
        skipped++;
        continue;
      }
      totalSource += result.sourceCount;
      totalTarget += result.targetCount || result.sourceCount; // For dry-run

      const status = result.dryRun ? ' (dry-run)' : '';
      console.log(`  ${result.table.padEnd(35)} ${String(result.sourceCount).padStart(6)} rows${status}`);
    }

    log('-'.repeat(50));
    log(`  Total: ${totalSource} rows${options.dryRun ? ' (would be migrated)' : ' migrated'}`);
    if (skipped > 0) {
      log(`  Skipped: ${skipped} tables`);
    }
    log('');

    if (options.dryRun) {
      log('Dry-run complete. No data was modified.');
    } else {
      log('Migration complete!');
    }

  } catch (err) {
    console.error('');
    console.error('Migration FAILED:');
    console.error(`  ${err.message}`);
    if (options.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  } finally {
    if (source) source.close();
    if (target) await target.close?.();
  }
}

// Run migration
migrate().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
