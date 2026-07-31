#!/usr/bin/env node
/**
 * `npx cap add android` generates AndroidManifest.xml from a template. The
 * app talks to whatever WordPress site the user signs into over plain
 * REST/HTTPS, so it just needs INTERNET + network-state permissions —
 * this patches them in place and is safe to run repeatedly.
 */
const fs = require('fs');
const path = require('path');

const MANIFEST = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

const PERMISSIONS = [
    'android.permission.INTERNET',
    'android.permission.ACCESS_NETWORK_STATE',
];

if (!fs.existsSync(MANIFEST)) {
    console.log('[patch-android] No AndroidManifest.xml yet — run "npm run android:init" first.');
    process.exit(0);
}

let xml = fs.readFileSync(MANIFEST, 'utf8');
const before = xml;
const added = [];

for (const perm of PERMISSIONS) {
    if (xml.indexOf('android:name="' + perm + '"') !== -1) continue;
    xml = xml.replace(
        /<application/,
        '    <uses-permission android:name="' + perm + '" />\n\n    <application'
    );
    added.push(perm);
}

if (xml === before) {
    console.log('[patch-android] AndroidManifest.xml already has the required permissions — nothing to do.');
    process.exit(0);
}

fs.writeFileSync(MANIFEST, xml, 'utf8');
console.log('[patch-android] Added to AndroidManifest.xml:');
added.forEach(a => console.log('  + ' + a));
console.log('[patch-android] Rebuild the app to pick this up.');
