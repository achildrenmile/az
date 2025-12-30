#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEPLOY_DIR = '/var/www/arbeitszeit';

console.log('Deploying to', DEPLOY_DIR);
console.log('');

// Check if dist directory exists
if (!fs.existsSync('dist')) {
  console.error('Error: dist/ directory not found. Run "npm run build" first.');
  process.exit(1);
}

// Check if required files exist
const requiredFiles = ['dist/index.html', 'dist/app.min.js', 'dist/style.min.css'];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`Error: ${file} not found. Run "npm run build" first.`);
    process.exit(1);
  }
}

// Create public directory in deploy target if needed
const publicDir = path.join(DEPLOY_DIR, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Deploy frontend files (from dist/)
console.log('Deploying frontend files...');
fs.copyFileSync('dist/index.html', path.join(publicDir, 'index.html'));
fs.copyFileSync('dist/app.min.js', path.join(publicDir, 'app.min.js'));
fs.copyFileSync('dist/style.min.css', path.join(publicDir, 'style.min.css'));

if (fs.existsSync('dist/hilfe.html')) {
  fs.copyFileSync('dist/hilfe.html', path.join(publicDir, 'hilfe.html'));
}
if (fs.existsSync('dist/inspektion.html')) {
  fs.copyFileSync('dist/inspektion.html', path.join(publicDir, 'inspektion.html'));
}

// Remove old unminified files from production (if they exist)
const filesToRemove = ['app.js', 'style.css'];
for (const file of filesToRemove) {
  const filePath = path.join(publicDir, file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`  Removed old file: ${file}`);
  }
}

// Deploy backend files
console.log('Deploying backend files...');
fs.copyFileSync('server.js', path.join(DEPLOY_DIR, 'server.js'));
fs.copyFileSync('database.js', path.join(DEPLOY_DIR, 'database.js'));

// Copy config.json if exists in public
if (fs.existsSync('public/config.json')) {
  fs.copyFileSync('public/config.json', path.join(publicDir, 'config.json'));
}

// Restart PM2
console.log('');
console.log('Restarting application...');
try {
  execSync('pm2 restart arbeitszeit', { stdio: 'inherit' });
} catch (error) {
  console.error('Warning: Could not restart PM2. You may need to restart manually.');
}

console.log('');
console.log('Deployment complete!');
console.log('');
console.log('Deployed files:');
console.log('  Frontend: index.html, app.min.js, style.min.css, hilfe.html');
console.log('  Backend:  server.js, database.js');
