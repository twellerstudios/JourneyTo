#!/usr/bin/env node
/**
 * Keeps the app's version in one place: mobile/package.json.
 *
 * Propagates it to
 *   - www/js/version.js        (what the running app compares against the
 *                               update feed)
 *   - android/app/build.gradle (versionName + versionCode — Android refuses
 *                               to install an update whose versionCode isn't
 *                               higher than the installed one)
 *
 * `npx cap add android` regenerates build.gradle from a template, so this is
 * re-applied after every add/sync, same as patch-android.js. Safe to run
 * repeatedly.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = String(pkg.version || '').trim();

const semver = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
if (!semver) {
    console.error('[set-version] package.json "version" must be MAJOR.MINOR.PATCH, got: ' + JSON.stringify(version));
    process.exit(1);
}

// Monotonic integer Android can compare: 1.2.3 -> 10203. Allows 0-99 for
// minor/patch, which is plenty and keeps the number readable.
const [, major, minor, patch] = semver;
if (Number(minor) > 99 || Number(patch) > 99) {
    console.error('[set-version] minor and patch must each be <= 99 to map to a versionCode.');
    process.exit(1);
}
const versionCode = Number(major) * 10000 + Number(minor) * 100 + Number(patch);

// ── www/js/version.js ────────────────────────────────────────
const versionJs = path.join(ROOT, 'www', 'js', 'version.js');
let js = fs.readFileSync(versionJs, 'utf8');
const jsBefore = js;
js = js.replace(/^var JT_VERSION = '[^']*';$/m, "var JT_VERSION = '" + version + "';");
if (js === jsBefore && !js.includes("var JT_VERSION = '" + version + "';")) {
    console.error('[set-version] Could not find the JT_VERSION line in www/js/version.js.');
    process.exit(1);
}
if (js !== jsBefore) {
    fs.writeFileSync(versionJs, js, 'utf8');
    console.log('[set-version] www/js/version.js -> ' + version);
} else {
    console.log('[set-version] www/js/version.js already at ' + version);
}

// ── android/app/build.gradle ─────────────────────────────────
const gradle = path.join(ROOT, 'android', 'app', 'build.gradle');
if (!fs.existsSync(gradle)) {
    console.log('[set-version] No android/ yet — run "npm run android:init" first. Skipping the Gradle step.');
    process.exit(0);
}

let g = fs.readFileSync(gradle, 'utf8');
const gBefore = g;
g = g.replace(/versionCode\s+\d+/, 'versionCode ' + versionCode);
g = g.replace(/versionName\s+"[^"]*"/, 'versionName "' + version + '"');

if (g === gBefore) {
    console.log('[set-version] android/app/build.gradle already at ' + version + ' (' + versionCode + ')');
} else {
    fs.writeFileSync(gradle, g, 'utf8');
    console.log('[set-version] android/app/build.gradle -> versionName ' + version + ', versionCode ' + versionCode);
}
