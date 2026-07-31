# Journey To Poster — Mobile (Capacitor)

A Capacitor app (HTML/CSS/JS wrapped in a thin native Android shell) for
creating, editing and publishing posts to
[letsjourneyto.com](https://letsjourneyto.com) on WordPress. This is the
same product as `../android-app` (native Kotlin/Compose) rebuilt on the
Capacitor stack used by Tweller Studios' other mobile apps, so it builds
the same way: no Kotlin compiler, no Jetpack Compose Gradle plugin —
just `npx cap sync` and Android Studio's stock Java/Gradle toolchain.

It talks **directly to WordPress's own REST API**
(`wp/v2/posts`, `wp/v2/media`, `wp/v2/categories`, `wp/v2/tags`) using an
Application Password — there's no server in between, and posts stay
100% native WordPress content (Gutenberg blocks), fully editable from
wp-admin afterwards.

## What it does

- **Sign in** with your site URL, WordPress username, and an Application
  Password (WP Admin → Users → Your Profile → Application Passwords).
- **Create a post**: paste article text (or import a `.txt` file, or a
  whole pre-built **Post File** — see below), attach photos, and the app
  weaves them into the article at evenly-spaced points automatically —
  the first photo becomes a full-bleed hero image, the rest are spaced
  through the paragraphs. Photos can also be added by pasting an image
  URL directly ("Add via URL" in the Photos section), not just picked
  from the device.
- **Add video**: just paste a TikTok share link, a TikTok/YouTube Shorts
  link, or a full YouTube link into "Shorts"/"Long-form" — it's added the
  moment you paste, no extra tap needed (typing is left alone, so a link
  isn't added halfway through being entered; there's still an Add button
  for that case). A TikTok share-sheet link (`vm.tiktok.com/…`) is
  automatically resolved to the canonical link the embed needs. These are
  inserted as direct `youtube.com/embed` / `tiktok.com/embed` iframes (not
  WordPress's oEmbed block — oEmbed discovery to TikTok is unreliable on
  shared hosting, so embedding directly is what actually renders
  reliably). The first Shorts link leads right after the post title — the
  highest-visibility spot — everything else (more Shorts, long-form video)
  is spread through the article the same way extra photos are, each
  long-form video under its own "Watch" heading, rather than piling up in
  one spot or at the very end.
- **Editing an existing post** rebuilds the Photos grid and Shorts/
  Long-form lists from what's already in the post, so its media doesn't
  just disappear from the editor — removing a recovered photo or video
  here actually removes it from the post, not just the preview.
- **Categories, tags, featured image, draft/publish/pending/scheduled** —
  all standard WordPress fields, with inline "add new" for categories/tags.
- **Manage posts**: search, filter by status, edit, and delete — reading
  and writing straight through `wp/v2/posts`, no separate database.
- **Follow us icons**: a social-links row (Facebook, Instagram, TikTok,
  YouTube, X, Pinterest, LinkedIn, website) sourced from the companion
  plugin in `../wordpress-plugin/autoposter-companion`.

## Importing a pre-built Post File

Tap **Import Post File** on the New Post screen and pick a `.json` file
matching this schema — the whole point is that this can be generated
somewhere else entirely (a Claude chat, a future skill, a script) and just
dropped into the app to review and publish:

```json
{
  "title": "10 Hidden Beaches in Trinidad You Need to Visit",
  "status": "draft",
  "body": "Paragraph one of the article...\n\nParagraph two...\n\nParagraph three...",
  "images": [
    { "url": "https://images.unsplash.com/photo-...", "altText": "Maracas Bay at sunrise" }
  ],
  "videos": [
    { "url": "https://www.tiktok.com/@user/video/7123456789012345678", "isShort": true },
    { "url": "https://www.youtube.com/watch?v=abc123", "isShort": false }
  ],
  "categories": ["Travel", "Trinidad"],
  "tags": ["beaches", "hidden gems", "travel tips"]
}
```

Only `title` is required — everything else defaults to empty/`"draft"`.
On import: `title`/`body`/`status` fill the form directly, `categories`/
`tags` are matched by name against the site's existing terms (creating
any that don't exist yet), `videos` are added to the Shorts/Long-form
sections per their `isShort` flag, and each `images[].url` is downloaded
and uploaded to the WordPress media library exactly like a manually
picked photo — including becoming the hero image if it's first. **Photos
taken on-device still get added the normal way** with "+ Add Photos"
after importing — imported and on-device photos share one list, and
whichever one you star becomes the featured/hero image regardless of
which source it came from.

Image URLs need to be on a host that allows cross-origin fetches (stock
photo CDNs like Unsplash and Wikimedia Commons do); a host that blocks
that will fail to download and the import will skip just that photo with
a toast, rather than failing the whole import.

### Formatting inside `body`

The composer recognizes a small amount of Markdown so generated articles
don't render their formatting as literal text:

- `## A subheading` → an `<h2>` (`#`…`######` map to `<h1>`–`<h6>`)
- A block of lines that all start with `-` or `*` → a proper bullet list
- Everything else is an ordinary paragraph

Blank lines are what separate one block from the next either way, same as
plain paragraphs.

## Adding the logo to the splash screen

The app opens on an animated splash: the logo rises in inside a slowly
orbiting dashed ring, "JOURNEY TO" animates in letter by letter in the
brand blue→green ramp, and "Powered by Tweller Studios © 2026" sits at the
bottom centre. It holds for ~2s (so the animation always lands rather than
flickering past) and fades out as soon as sign-in state is resolved.

**Drop your logo in as:**

```
mobile/www/img/journey-to-logo.png
```

A transparent PNG is best — square or landscape both work, it's scaled to
fit inside the ring either way. Roughly 400–600px on the long edge is
plenty. Nothing else needs changing; run `npm run android:sync` and
rebuild.

Until that file exists the splash falls back to the same "JT" gradient
brand mark used elsewhere in the app, so it never shows a broken image.

## Releasing a build (and in-app updates)

The app is sideloaded rather than shipped through Play, so releases are
GitHub Releases and the app checks for new ones itself.

`.github/workflows/android-release.yml` builds a signed APK and attaches it
to a GitHub Release whenever you push a `v*` tag. Team members download it
from the release page; installed copies notice the new version and prompt.

### One-time setup

**1. Create a signing keystore.** Android only installs an update over an
existing app when both APKs are signed with the **same** key — so this
keystore has to be created once and then never lost. Back it up somewhere
safe; losing it means everyone has to uninstall and reinstall to move to a
newer build.

```bash
keytool -genkey -v -keystore journey-to-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias journey-to
```

**2. Add four repository secrets** (Settings → Secrets and variables →
Actions → New repository secret):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 journey-to-release.jks` (macOS: `base64 -i journey-to-release.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password you just set |
| `ANDROID_KEY_ALIAS` | `journey-to` |
| `ANDROID_KEY_PASSWORD` | the key password (same as the keystore password unless you set a different one) |

Don't commit the `.jks` file itself.

**3. Make sure the update feed points somewhere the team can actually
reach** — see "If the repo is private" below.

### Shipping a version

```bash
cd mobile
npm version 1.1.0 --no-git-tag-version    # bumps package.json only
git commit -am "Release 1.1.0"
git tag v1.1.0
git push --follow-tags
```

The tag must match `mobile/package.json` — CI fails the build if they
disagree, since the app compares its baked-in version against the release
tag. `scripts/set-version.js` propagates that one version into
`www/js/version.js` and the Android `versionName`/`versionCode`, so
`package.json` is the only place you ever edit it.

Share this link with the team — it always resolves to the newest build:

```
https://github.com/twellerstudios/JourneyTo/releases/latest
```

On first install Android will ask them to allow installing apps from the
browser ("unknown sources"); that's a one-time per-device prompt.

### How the in-app check behaves

On launch (and from **Settings → App → Check for updates**) the app reads
the latest release, compares versions, and shows an update prompt with the
release notes if there's a newer one. Tapping **Download** opens the APK in
the browser; opening it from the download notification installs it over the
existing app, preserving the signed-in site. The automatic check is
throttled to once every 6 hours, runs after the UI is already up, and stays
silent on failure — a slow or unreachable feed never blocks or nags.

### If the repo is private

GitHub's API returns 404 for a private repo without a token, and its
release assets can't be downloaded without one either — and an app handed
to other people can't safely carry a token. So with a private repo the
GitHub feed won't work. Two options:

- **Host the manifest and APK yourself** (e.g. on letsjourneyto.com). Edit
  `JT_UPDATE_FEED` in `www/js/version.js` to `kind: 'json'` with a `url`,
  and serve:
  ```json
  { "version": "1.1.0",
    "apkUrl": "https://letsjourneyto.com/app/journey-to.apk",
    "notes": "What changed in this build" }
  ```
  Upload the APK CI produced (it's also on the workflow run as a build
  artifact) alongside that file.
- **Or keep a second, public repo** holding only the releases, and point
  `JT_UPDATE_FEED.repo` at it.

Nothing outside `JT_UPDATE_FEED` needs changing either way.

## Run in a browser (quickest way to try it)

```bash
cd mobile
npm install
npm start          # opens http://localhost:8100
```

Resolving a shortened TikTok share link (`vm.tiktok.com/…`) needs
Capacitor's native HTTP layer, which only exists in the built Android app
— a browser's `fetch()` can't follow that redirect cross-origin. In the
browser preview, a shortened link is just kept as-is and posts fine, it
just renders as a "Watch on TikTok" card instead of an inline player;
build the app to get the actual embed.

## Build the Android app (APK)

Requires Android Studio (or just its SDK + JDK 17) — no separate Kotlin
setup needed.

```bash
cd mobile
npm install
npm run android:init    # once — creates android/
npm run android:sync    # after any change to www/
npm run android:open    # opens Android Studio; Build > Build APK
# or, with a device connected:
npm run android:run
```

## Project layout

```
mobile/
├── www/
│   ├── index.html        # shell: splash + #view container + tab bar
│   ├── css/app.css        # Stripe-style white/blue/green design system
│   ├── img/               # journey-to-logo.png goes here (see above)
│   └── js/
│       ├── version.js     # build version + where to check for updates
│       ├── api.js         # WordPress REST client + Gutenberg block composer
│       └── app.js         # screens: Login, Posts, Editor, Settings
├── package.json           # the one place the version is bumped
├── capacitor.config.json
└── scripts/
    ├── patch-android.js   # re-applies INTERNET permission after cap sync
    └── set-version.js     # package.json version -> version.js + build.gradle
```

Credentials (site URL, username, Application Password) are stored via
`@capacitor/preferences` on-device (falls back to `localStorage` when
running in a plain browser for development).
