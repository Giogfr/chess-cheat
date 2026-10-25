'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const chromium = process.env.CHROMIUM_PATH || process.env.CHROME_PATH || findBrowser();

function findBrowser() {
  const fromPath = process.platform === 'win32'
    ? ['chrome.exe', 'msedge.exe', 'chromium.exe']
    : process.platform === 'darwin'
      ? ['google-chrome', 'chromium', 'chromium-browser']
      : ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];

  const candidates = [];
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter(Boolean);
    for (const base of roots) {
      candidates.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      candidates.push(path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
      candidates.push(path.join(base, 'Chromium', 'Application', 'chromium.exe'));
    }
    for (const command of fromPath) {
      const result = spawnSync('where.exe', [command], { encoding: 'utf8', windowsHide: true });
      if (result.status === 0) candidates.push(...result.stdout.split(/\r?\n/).filter(Boolean));
    }
  } else {
    if (process.platform === 'darwin') {
      candidates.push(
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
      );
    }
    for (const command of fromPath) {
      const result = spawnSync(process.platform === 'darwin' ? 'which' : 'sh',
        process.platform === 'darwin' ? [command] : ['-lc', `command -v ${command}`],
        { encoding: 'utf8' });
      if (result.status === 0 && result.stdout.trim()) candidates.push(result.stdout.trim());
    }
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

if (!chromium) {
  console.error('Chromium / Chrome was not found. Set CHROMIUM_PATH to run the browser smoke test.');
  process.exitCode = 2;
} else {
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png'
  };
  const server = http.createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400).end('Bad request');
      return;
    }
    const target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(target, (error, data) => {
      if (error) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, { 'content-type': contentTypes[path.extname(target)] || 'application/octet-stream' });
      response.end(data);
    });
  });

  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chess-cheat-chrome-'));
    const url = `http://127.0.0.1:${address.port}/tests/fixtures/board.html`;
    const args = [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--disable-background-networking', '--disable-component-update', '--disable-extensions',
      '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profileDir}`,
      '--virtual-time-budget=4000', '--dump-dom', url
    ];

    let stdout = '';
    let stderr = '';
    let completed = false;
    let timedOut = false;
    const child = spawn(chromium, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 20000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    function finish(error) {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      server.close();
      fs.rmSync(profileDir, { recursive: true, force: true });
      if (error) {
        console.error(error.message || String(error));
        if (stderr) console.error(stderr.trim());
        process.exitCode = 1;
        return;
      }
      try {
        assert.match(stdout, /data-smoke="pass"/);
        assert.match(stdout, /<div id="smoke-result">PASS<\/div>/);
        console.log('Browser smoke test passed: automatic engine startup, turn detection, and an on-board arrow without an injected panel.');
      } catch (assertionError) {
        console.error(assertionError.message);
        console.error(stdout.match(/<div id="smoke-result">.*?<\/div>/)?.[0] || 'Smoke result was not written.');
        if (stderr) console.error(stderr.trim());
        process.exitCode = 1;
      }
    }

    child.on('error', (error) => finish(error));
    child.on('close', (code, signal) => {
      if (timedOut) {
        finish(new Error('Browser smoke test timed out. Verify that the configured browser can run headlessly.'));
      } else if (code !== 0) {
        finish(new Error(`Browser exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}.`));
      } else {
        finish();
      }
    });
  });
}
