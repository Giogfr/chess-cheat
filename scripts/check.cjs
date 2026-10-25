'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'manifest.json');
const packagePath = path.join(root, 'package.json');
const errors = [];
const projectFiles = [
  'README.md', 'CHANGELOG.md', 'LICENSE', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md',
  'CREDITS.md', 'PRIVACY.md', 'SECURITY.md', 'docs/INSTALL.md', 'docs/architecture.md', 'docs/testing.md',
  'docs/RELEASING.md', '.github/workflows/ci.yml', '.github/workflows/release.yml', '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml', '.github/PULL_REQUEST_TEMPLATE.md'
];
for (const relativePath of projectFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) errors.push(`Publish-ready project file is missing: ${relativePath}`);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(`${path.relative(root, filePath)} could not be parsed: ${error.message}`);
    return {};
  }
}

const manifest = readJson(manifestPath);
const packageInfo = readJson(packagePath);
const requiredPaths = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  'popup.js',
  'popup.css',
  'site-policy.js',
  'board-adapter.js',
  'visual-settings.js',
  'move-overlay.js',
  'think-timer.js',
  'turn-detection.js',
  'engine-commands.js',
  'bridge.js',
  ...(manifest.content_scripts || []).flatMap((entry) => entry.js || []),
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {})
].filter(Boolean);

for (const relativePath of requiredPaths) {
  const resolvedPath = path.resolve(root, relativePath);
  if (!resolvedPath.startsWith(`${root}${path.sep}`) || !fs.existsSync(resolvedPath)) {
    errors.push(`Manifest references a missing or out-of-project file: ${relativePath}`);
  }
}

if (manifest.manifest_version !== 3) errors.push('manifest.json must use Manifest V3.');
if (manifest.action?.default_popup !== 'popup.html') errors.push('The extension icon must open popup.html.');
const popupHtml = fs.existsSync(path.join(root, 'popup.html')) ? fs.readFileSync(path.join(root, 'popup.html'), 'utf8') : '';
if (!popupHtml.includes('<script src="site-policy.js"></script>')) errors.push('The popup must load site-policy.js for route-aware connection diagnostics.');
if (!popupHtml.includes('<script src="visual-settings.js"></script>')) errors.push('The popup must load visual-settings.js before popup.js.');
if (!(popupHtml.indexOf('site-policy.js') < popupHtml.indexOf('popup.js'))) errors.push('The popup must load site-policy.js before popup.js.');
if (!popupHtml.includes('id="display-mode"') || !popupHtml.includes('id="marker-color"') || !popupHtml.includes('id="line-weight"')) {
  errors.push('The popup must expose the move display mode, color and line weight controls.');
}
if (!popupHtml.includes('id="show-think-timer"')) errors.push('The popup must expose the position-timer toggle.');
const architectureSource = fs.existsSync(path.join(root, 'docs/architecture.md')) ? fs.readFileSync(path.join(root, 'docs/architecture.md'), 'utf8') : '';
const sitePolicySource = fs.existsSync(path.join(root, 'site-policy.js')) ? fs.readFileSync(path.join(root, 'site-policy.js'), 'utf8') : '';
if (!/all HTTP\(S\) routes on the main Chess\.com and Lichess domains/i.test(architectureSource)) {
  errors.push('Architecture documentation must state that all HTTP(S) routes on the main Chess.com and Lichess domains are eligible.');
}
if (/LIVE_ROUTE|LICHESS_GAME_ID/.test(sitePolicySource)) {
  errors.push('site-policy.js must not reintroduce a live/competitive route-name block.');
}
if (!manifest.action?.default_icon?.['16']) errors.push('The toolbar action must define its 16px icon.');
const backgroundSource = fs.existsSync(path.join(root, manifest.background?.service_worker || ''))
  ? fs.readFileSync(path.join(root, manifest.background.service_worker), 'utf8') : '';
if (!backgroundSource.includes("importScripts('site-policy.js')")) errors.push('The service worker must load the shared URL safety policy.');
for (const injectedFile of ['engine-commands.js', 'bridge.js']) {
  if (!backgroundSource.includes(`'${injectedFile}'`) && !backgroundSource.includes(`\"${injectedFile}\"`)) {
    errors.push(`The service worker must inject ${injectedFile} into the page world.`);
  }
}
if (manifest.name !== 'Chess Cheat') errors.push('manifest.json must use the Chess Cheat product name.');
if (!/^[a-z0-9-]+$/.test(packageInfo.name || '')) errors.push('package.json must use a lowercase project name.');
if (packageInfo.license !== 'MIT') errors.push('package.json license metadata must match the root MIT LICENSE.');
if (!/^\d+(?:\.\d+){0,3}$/.test(manifest.version || '')) errors.push('Chrome requires a valid internal manifest version string.');
if (!manifest.permissions?.includes('scripting')) errors.push('The scripting permission is required.');
if (!manifest.permissions?.includes('storage')) errors.push('The storage permission is required for saved settings.');
if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length === 0) {
  errors.push('At least one content script entry is required.');
}
if (!(manifest.content_scripts || []).some((entry) => (entry.matches || []).includes('<all_urls>'))) {
  errors.push('Cross-site board detection requires a content-script match pattern for all web URLs.');
}
if (!manifest.host_permissions?.includes('<all_urls>')) {
  errors.push('The page-world engine bridge requires an all-sites host permission for cross-site injection.');
}
const contentScripts = (manifest.content_scripts || []).flatMap((entry) => entry.js || []);
if (contentScripts.indexOf('site-policy.js') !== 0 || contentScripts.indexOf('board-adapter.js') !== 1 ||
    contentScripts.indexOf('visual-settings.js') < 2 || contentScripts.indexOf('move-overlay.js') < 2 ||
    contentScripts.indexOf('move-styles.js') < 0 || contentScripts.indexOf('turn-detection.js') < 0 || contentScripts.indexOf('think-timer.js') < 0 || contentScripts.indexOf('content.js') < 0 ||
    contentScripts.indexOf('site-policy.js') > contentScripts.indexOf('content.js') ||
    contentScripts.indexOf('board-adapter.js') > contentScripts.indexOf('content.js') ||
    contentScripts.indexOf('visual-settings.js') > contentScripts.indexOf('move-overlay.js') ||
    contentScripts.indexOf('visual-settings.js') > contentScripts.indexOf('content.js') ||
    contentScripts.indexOf('move-overlay.js') > contentScripts.indexOf('content.js') ||
    contentScripts.indexOf('move-styles.js') > contentScripts.indexOf('content.js') ||
    contentScripts.indexOf('turn-detection.js') > contentScripts.indexOf('content.js') ||
    contentScripts.indexOf('think-timer.js') > contentScripts.indexOf('content.js')) {
  errors.push('Content scripts must load site policy, board adapter, visual settings, move overlay, turn detection and timer helpers before content.js.');
}
if (!fs.existsSync(path.join(root, 'popup.html'))) errors.push('popup.html is required for the toolbar action.');

for (const [size, relativePath] of Object.entries(manifest.icons || {})) {
  const iconPath = path.join(root, relativePath);
  if (!fs.existsSync(iconPath)) continue;
  const image = fs.readFileSync(iconPath);
  if (image.length < 24 || image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    errors.push(`Icon is not a valid PNG: ${relativePath}`);
    continue;
  }
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (width !== Number(size) || height !== Number(size)) {
    errors.push(`Icon ${relativePath} must be ${size}×${size}, found ${width}×${height}.`);
  }
}

const sourceFiles = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(fullPath);
    else if (/\.(?:js|cjs|mjs)$/.test(entry.name)) sourceFiles.push(fullPath);
  }
}
collect(root);

for (const file of sourceFiles) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    errors.push(`${path.relative(root, file)} failed syntax checking:\n${check.stderr || check.stdout}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n\n'));
  process.exitCode = 1;
} else {
  console.log(`Checked manifest references, publish-required project files, license metadata, PNG dimensions, and JavaScript syntax (${sourceFiles.length} files).`);
}
