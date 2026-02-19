const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'src');

let timer = null;
const debounceMs = 500;

const generate = () => {
  try {
    execSync('node scripts/generate-docs.js', {
      cwd: projectRoot,
      stdio: 'inherit'
    });
  } catch (err) {
    console.error('Docs generation failed.');
  }
};

const watch = () => {
  generate();

  fs.watch(srcDir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (!filename.endsWith('.js')) return;

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`Change detected: ${filename}`);
      generate();
    }, debounceMs);
  });

  console.log('Watching src/ for changes... Press Ctrl+C to stop.');
};

watch();
