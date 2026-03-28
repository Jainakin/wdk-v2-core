#!/usr/bin/env node

/**
 * build.mjs — Bundles wdk-v2-core + wdk-v2-utils into a single JS file
 * for loading into QuickJS via wdk_engine_load_bytecode().
 *
 * Usage: node build.mjs
 * Output: dist/wdk-bundle.js
 */

import { build } from 'esbuild';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

const outfile = 'dist/wdk-bundle.js';

async function main() {
  console.log('Building wdk-bundle.js...');

  await build({
    entryPoints: ['src/bundle-entry.ts'],
    bundle: true,
    minify: false,  // Keep readable for debugging. Set to true for production.
    format: 'iife',
    globalName: '__wdk_exports',
    target: 'es2020',
    outfile,
    // Resolve local packages
    alias: {
      '@aspect/wdk-v2-utils': '../wdk-v2-utils/src',
      '@aspect/wdk-v2-core': './src',
    },
    // No external dependencies — everything is bundled
    external: [],
    logLevel: 'info',
  });

  console.log(`✓ Built: ${outfile}`);

  // Try to compile to bytecode if qjsc is available
  const qjscPath = process.env.QJSC_PATH || 'qjsc';
  try {
    execSync(`which ${qjscPath}`, { stdio: 'ignore' });
    console.log('Compiling to bytecode...');
    execSync(`${qjscPath} -c -o dist/wdk-bundle.qbc ${outfile}`);
    console.log('✓ Built: dist/wdk-bundle.qbc');
  } catch {
    console.log('⚠ qjsc not found — skipping bytecode compilation');
    console.log('  To compile: qjsc -c -o dist/wdk-bundle.qbc dist/wdk-bundle.js');
  }
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
