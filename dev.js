#!/usr/bin/env node

// Development helper script
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting ChatEngine WebSocket in development mode...');

// Check if .env exists
const fs = require('fs');
const envPath = path.join(__dirname, '.env');

if (!fs.existsSync(envPath)) {
  console.log('⚠️  .env file not found. Please copy env.example to .env and configure your settings.');
  console.log('   cp env.example .env');
  process.exit(1);
}

// Run the development server
const child = spawn('npx', ['tsx', 'watch', 'src/index.ts'], {
  stdio: 'inherit',
  cwd: __dirname,
  shell: true
});

child.on('exit', (code) => {
  console.log(`Development server exited with code ${code}`);
  process.exit(code);
});

process.on('SIGINT', () => {
  console.log('🛑 Stopping development server...');
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('🛑 Stopping development server...');
  child.kill('SIGTERM');
});