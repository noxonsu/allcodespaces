#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Get the path to the tts.js script
const ttsScriptPath = path.join(__dirname, 'tts.js');

console.log(`Running TTS script: ${ttsScriptPath}`);

// Spawn a new process to run the tts.js script
const child = spawn('node', [ttsScriptPath, '--prevent-sending-existing-files'], { stdio: 'inherit' });

child.on('error', (err) => {
  console.error('Failed to start child process:', err);
  process.exit(1);
});

child.on('close', (code) => {
  console.log(`TTS script exited with code ${code}`);
  process.exit(code);
});
