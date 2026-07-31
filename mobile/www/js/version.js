/**
 * Journey To Poster — build version + update feed.
 *
 * JT_VERSION is generated from mobile/package.json by scripts/set-version.js
 * (which `npm run android:sync` runs), so package.json is the single place a
 * version is ever bumped. Don't hand-edit the version line.
 */
var JT_VERSION = '1.0.0';

/**
 * Where the app looks to find out whether a newer build exists.
 *
 *   kind: 'github' — reads the repo's latest GitHub Release. The repo must be
 *     PUBLIC: GitHub's API 404s on a private repo without a token, and release
 *     assets on a private repo can't be downloaded without one either (and an
 *     app shipped to people can't safely carry a token).
 *
 *   kind: 'json' — reads a small manifest you host yourself, e.g. on
 *     letsjourneyto.com. Use this to keep the repo private. Serve:
 *       { "version": "1.1.0",
 *         "apkUrl": "https://letsjourneyto.com/app/journey-to.apk",
 *         "notes": "What changed in this build" }
 *
 * Switching hosting is a change to this block only — nothing else reads it.
 */
var JT_UPDATE_FEED = {
    kind: 'github',
    repo: 'twellerstudios/JourneyTo',
    // kind: 'json',
    // url: 'https://letsjourneyto.com/app/latest.json',
};
