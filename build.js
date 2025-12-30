#!/usr/bin/env node

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const isWatch = process.argv.includes('--watch');

// Build configuration
const buildOptions = {
  entryPoints: ['public/app.js'],
  bundle: false, // No bundling needed - single file
  minify: true,
  sourcemap: false, // No source maps in production
  target: ['es2020'],
  outfile: 'dist/app.min.js',
  charset: 'utf8',
  legalComments: 'none', // Remove all comments
  drop: ['console', 'debugger'], // Remove console.log and debugger statements
};

// Ensure dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist', { recursive: true });
}

async function build() {
  try {
    console.log('Building JavaScript...');

    // Build app.js
    await esbuild.build(buildOptions);

    // Get file hash for cache busting
    const content = fs.readFileSync('dist/app.min.js', 'utf8');
    const hash = crypto.createHash('md5').update(content).digest('hex').substring(0, 8);

    // Copy and process other static files
    console.log('Copying static files...');

    // Copy CSS (minified)
    const cssResult = await esbuild.build({
      entryPoints: ['public/style.css'],
      bundle: false,
      minify: true,
      outfile: 'dist/style.min.css',
      charset: 'utf8',
    });

    // Copy index.html and update references
    let html = fs.readFileSync('public/index.html', 'utf8');

    // Update script reference to use minified version with hash
    html = html.replace(
      /<script src="app\.js[^"]*"><\/script>/,
      `<script src="app.min.js?v=${hash}"></script>`
    );

    // Update CSS reference to use minified version with hash
    const cssContent = fs.readFileSync('dist/style.min.css', 'utf8');
    const cssHash = crypto.createHash('md5').update(cssContent).digest('hex').substring(0, 8);
    html = html.replace(
      /<link rel="stylesheet" href="style\.css[^"]*">/,
      `<link rel="stylesheet" href="style.min.css?v=${cssHash}">`
    );

    fs.writeFileSync('dist/index.html', html);

    // Copy hilfe.html
    if (fs.existsSync('public/hilfe.html')) {
      let hilfeHtml = fs.readFileSync('public/hilfe.html', 'utf8');
      hilfeHtml = hilfeHtml.replace(
        /<link rel="stylesheet" href="style\.css[^"]*">/,
        `<link rel="stylesheet" href="style.min.css?v=${cssHash}">`
      );
      fs.writeFileSync('dist/hilfe.html', hilfeHtml);
    }

    // Copy inspektion.html if exists
    if (fs.existsSync('public/inspektion.html')) {
      let inspHtml = fs.readFileSync('public/inspektion.html', 'utf8');
      inspHtml = inspHtml.replace(
        /<link rel="stylesheet" href="style\.css[^"]*">/,
        `<link rel="stylesheet" href="style.min.css?v=${cssHash}">`
      );
      fs.writeFileSync('dist/inspektion.html', inspHtml);
    }

    // Get file sizes
    const originalJs = fs.statSync('public/app.js').size;
    const minifiedJs = fs.statSync('dist/app.min.js').size;
    const originalCss = fs.statSync('public/style.css').size;
    const minifiedCss = fs.statSync('dist/style.min.css').size;

    console.log('');
    console.log('Build complete!');
    console.log('');
    console.log('JavaScript:');
    console.log(`  Original: ${(originalJs / 1024).toFixed(1)} KB`);
    console.log(`  Minified: ${(minifiedJs / 1024).toFixed(1)} KB (${((1 - minifiedJs/originalJs) * 100).toFixed(0)}% reduction)`);
    console.log('');
    console.log('CSS:');
    console.log(`  Original: ${(originalCss / 1024).toFixed(1)} KB`);
    console.log(`  Minified: ${(minifiedCss / 1024).toFixed(1)} KB (${((1 - minifiedCss/originalCss) * 100).toFixed(0)}% reduction)`);
    console.log('');
    console.log('Output directory: dist/');
    console.log('Files: index.html, app.min.js, style.min.css, hilfe.html');

  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

if (isWatch) {
  console.log('Watching for changes...');
  // For watch mode, we'd need to set up file watchers
  // For now, just run the build once
  build();
} else {
  build();
}
