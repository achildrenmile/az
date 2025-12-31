#!/usr/bin/env node

/**
 * Docker Initialization Script
 *
 * Handles database initialization with two modes:
 * 1. Admin-only mode (default): Creates single admin user
 * 2. Dummy-data mode: Creates admin + demo data
 *
 * Environment variables:
 * - ADMIN_PASSWORD: Admin password (generated if not set)
 * - INIT_DUMMY_DATA: Set to "true" to enable dummy data mode
 * - DATABASE_PATH: Path to SQLite database (default: /data/arbeitszeit.db)
 *
 * Initialization is idempotent - only runs on first startup.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const DATABASE_PATH = process.env.DATABASE_PATH || '/data/arbeitszeit.db';
const INIT_MARKER = path.join(path.dirname(DATABASE_PATH), '.initialized');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const INIT_DUMMY_DATA = process.env.INIT_DUMMY_DATA === 'true';

/**
 * Generate a strong random password
 */
function generatePassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
  let password = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += chars[randomBytes[i] % chars.length];
  }
  return password;
}

/**
 * Check if initialization has already been done
 */
function isInitialized() {
  return fs.existsSync(INIT_MARKER);
}

/**
 * Mark initialization as complete
 */
function markInitialized() {
  fs.writeFileSync(INIT_MARKER, new Date().toISOString());
}

/**
 * Initialize the database with admin user
 */
async function initializeDatabase() {
  console.log('='.repeat(60));
  console.log('ARBEITSZEIT-TRACKER INITIALIZATION');
  console.log('='.repeat(60));
  console.log('');

  // Determine password
  const password = ADMIN_PASSWORD || generatePassword();
  const passwordGenerated = !ADMIN_PASSWORD;

  // Set environment variable for database.js to use
  process.env.ADMIN_PASSWORD = password;
  process.env.INIT_MODE = 'true';

  console.log(`Mode: ${INIT_DUMMY_DATA ? 'DUMMY DATA' : 'ADMIN ONLY'}`);
  console.log(`Database: ${DATABASE_PATH}`);
  console.log('');

  // Import and initialize database (this creates tables and admin user)
  try {
    // The database.js module will check ADMIN_PASSWORD env var
    require('./database.js');
    console.log('Database schema initialized.');
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
    process.exit(1);
  }

  // If dummy data mode, run the demo data generator
  if (INIT_DUMMY_DATA) {
    console.log('');
    console.log('Generating demo data...');

    try {
      // Inline simplified demo data generation
      await generateDemoData(password);
      console.log('Demo data generated successfully.');
    } catch (err) {
      console.error('Failed to generate demo data:', err.message);
      // Don't exit - admin user is created, demo data is optional
    }
  }

  // Print credentials
  console.log('');
  console.log('='.repeat(60));
  console.log('INITIALIZATION COMPLETE');
  console.log('='.repeat(60));
  console.log('');
  console.log('Admin Credentials:');
  console.log(`  Username: admin`);
  console.log(`  Password: ${password}`);
  if (passwordGenerated) {
    console.log('');
    console.log('  (Password was auto-generated. Save it now!)');
  }
  console.log('');
  console.log('='.repeat(60));
  console.log('');

  // Mark as initialized
  markInitialized();
}

/**
 * Generate demo data (simplified version for Docker)
 */
async function generateDemoData(adminPassword) {
  const Database = require('better-sqlite3');
  const bcrypt = require('bcryptjs');

  const db = new Database(DATABASE_PATH);

  // Demo employees
  const mitarbeiterNamen = [
    { nr: '001', name: 'Thomas Huber' },
    { nr: '002', name: 'Michael Gruber' },
    { nr: '003', name: 'Stefan Bauer' },
    { nr: '004', name: 'Andreas Pichler' },
    { nr: '005', name: 'Markus Wagner' }
  ];

  const pinHash = bcrypt.hashSync('Demo1234!', 10);
  const insertMitarbeiter = db.prepare(`
    INSERT OR IGNORE INTO mitarbeiter (mitarbeiter_nr, name, pin_hash, ist_admin, aktiv)
    VALUES (?, ?, ?, 0, 1)
  `);

  mitarbeiterNamen.forEach(m => {
    insertMitarbeiter.run(m.nr, m.name, pinHash);
  });

  // Demo customers
  const kundenDaten = [
    { name: 'Gemeinde Innsbruck', ort: 'Innsbruck' },
    { name: 'Wohnbau GmbH', ort: 'Wien' },
    { name: 'Hotel Alpenblick', ort: 'Kitzbühel' },
    { name: 'Baumeister Schneider GmbH', ort: 'Linz' },
    { name: 'Familie Oberhofer', ort: 'Axams' }
  ];

  const insertKunde = db.prepare(`
    INSERT OR IGNORE INTO kunden (name, ort, aktiv)
    VALUES (?, ?, 1)
  `);

  kundenDaten.forEach(k => {
    insertKunde.run(k.name, k.ort);
  });

  // Demo construction sites
  const baustellenDaten = [
    { name: 'Rathausplatz Sanierung', kunde: 'Gemeinde Innsbruck' },
    { name: 'Wohnpark Sonnental', kunde: 'Wohnbau GmbH' },
    { name: 'Hotel Wellness Erweiterung', kunde: 'Hotel Alpenblick' },
    { name: 'Bürogebäude Neubau', kunde: 'Baumeister Schneider GmbH' },
    { name: 'EFH Oberhofer', kunde: 'Familie Oberhofer' }
  ];

  const insertBaustelle = db.prepare(`
    INSERT OR IGNORE INTO baustellen (name, kunde, aktiv)
    VALUES (?, ?, 1)
  `);

  baustellenDaten.forEach(b => {
    insertBaustelle.run(b.name, b.kunde);
  });

  // Demo time entries (last 30 days)
  const mitarbeiter = db.prepare('SELECT id FROM mitarbeiter WHERE mitarbeiter_nr != ?').all('admin');
  const baustellen = db.prepare('SELECT name FROM baustellen').all().map(b => b.name);
  const kunden = db.prepare('SELECT name FROM kunden').all().map(k => k.name);

  const insertZeiteintrag = db.prepare(`
    INSERT INTO zeiteintraege (mitarbeiter_id, datum, arbeitsbeginn, arbeitsende, pause_minuten, baustelle, kunde)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const today = new Date();
  for (let i = 30; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const datum = date.toISOString().split('T')[0];

    mitarbeiter.forEach(m => {
      // 80% chance of working
      if (Math.random() < 0.8) {
        const startHour = 6 + Math.floor(Math.random() * 3);
        const duration = 8 + Math.floor(Math.random() * 3);
        const pause = 30;

        const arbeitsbeginn = `0${startHour}:00`.slice(-5);
        const endHour = startHour + duration + (pause / 60);
        const arbeitsende = `${Math.floor(endHour)}:${(endHour % 1) * 60 || '00'}`.replace(/(\d+):(\d)$/, '$1:0$2');

        const baustelle = baustellen[Math.floor(Math.random() * baustellen.length)];
        const kunde = kunden[Math.floor(Math.random() * kunden.length)];

        insertZeiteintrag.run(m.id, datum, arbeitsbeginn, arbeitsende.slice(0, 5), pause, baustelle, kunde);
      }
    });
  }

  db.close();

  console.log('  - 5 demo employees (password: Demo1234!)');
  console.log('  - 5 demo customers');
  console.log('  - 5 demo construction sites');
  console.log('  - ~30 days of time entries');
}

/**
 * Start the application server
 */
function startServer() {
  console.log('Starting Arbeitszeit-Tracker server...');
  console.log('');

  // Spawn server.js as child process
  const server = spawn('node', ['server.js'], {
    stdio: 'inherit',
    env: process.env
  });

  server.on('error', (err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });

  server.on('exit', (code) => {
    process.exit(code || 0);
  });

  // Forward signals to child
  ['SIGTERM', 'SIGINT', 'SIGHUP'].forEach(signal => {
    process.on(signal, () => {
      server.kill(signal);
    });
  });
}

/**
 * Main entry point
 */
async function main() {
  console.log('');
  console.log('Arbeitszeit-Tracker Docker Container');
  console.log('');

  // Check if already initialized
  if (isInitialized()) {
    console.log('Database already initialized. Skipping initialization.');
    console.log('');
  } else {
    console.log('First startup detected. Initializing...');
    console.log('');
    await initializeDatabase();
  }

  // Start server
  startServer();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
