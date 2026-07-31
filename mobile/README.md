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
- **Create a post**: paste article text (or import a `.txt` file), attach
  photos, and the app weaves them into the article at evenly-spaced points
  automatically — different spacing for a short vs. a long article.
- **Add video**: paste a TikTok or YouTube Shorts link into "Shorts", or a
  full YouTube video link into "Long-form" — both are inserted using
  WordPress's own native oEmbed block, so they render exactly like videos
  added through the block editor.
- **Categories, tags, featured image, draft/publish/pending/scheduled** —
  all standard WordPress fields, with inline "add new" for categories/tags.
- **Manage posts**: search, filter by status, edit, and delete — reading
  and writing straight through `wp/v2/posts`, no separate database.
- **Follow us icons**: a social-links row (Facebook, Instagram, TikTok,
  YouTube, X, Pinterest, LinkedIn, website) sourced from the companion
  plugin in `../wordpress-plugin/autoposter-companion`.

## Run in a browser (quickest way to try it)

```bash
cd mobile
npm install
npm start          # opens http://localhost:8100
```

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
│   ├── index.html        # shell: #view container + tab bar
│   ├── css/app.css        # Stripe-style white/blue/green design system
│   └── js/
│       ├── api.js         # WordPress REST client + Gutenberg block composer
│       └── app.js         # screens: Login, Posts, Editor, Settings
├── package.json
├── capacitor.config.json
└── scripts/patch-android.js  # re-applies INTERNET permission after cap sync
```

Credentials (site URL, username, Application Password) are stored via
`@capacitor/preferences` on-device (falls back to `localStorage` when
running in a plain browser for development).
