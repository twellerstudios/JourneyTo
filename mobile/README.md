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
  through the paragraphs.
- **Add video**: paste a TikTok or YouTube Shorts link into "Shorts", or a
  full YouTube video link into "Long-form". These are inserted as direct
  `youtube.com/embed` / `tiktok.com/embed` iframes (not WordPress's oEmbed
  block — oEmbed discovery to TikTok is unreliable on shared hosting, so
  embedding directly is what actually renders reliably).
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
