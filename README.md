# Journey To Poster

An Android app for creating, editing and publishing posts to
[letsjourneyto.com](https://letsjourneyto.com) on WordPress, plus the small
WordPress plugin it depends on. There are two implementations of the same
app — pick whichever build toolchain you'd rather use:

- **`mobile/`** — Capacitor (HTML/CSS/JS wrapped in a native shell).
  Builds with plain Android Studio + Java/Gradle, no Kotlin/Compose plugin
  wrangling. **This is the actively maintained version** — see
  `mobile/README.md` for details.
- **`android-app/`** — native Kotlin + Jetpack Compose. Kept for reference.

Both talk **directly to WordPress's own REST API** (`wp/v2/posts`,
`wp/v2/media`, `wp/v2/categories`, `wp/v2/tags`) using an Application
Password — there's no server in between, and posts stay 100% native
WordPress content (Gutenberg blocks), fully editable from wp-admin
afterwards.

## `android-app/`

A Kotlin + Jetpack Compose app (Material 3, Stripe-inspired UI, white
background with blue/green brand accents).

What it does:

- **Sign in** with your site URL, WordPress username, and an Application
  Password (WP Admin → Users → Your Profile → Application Passwords).
- **Create a post**: paste article text (or import a `.txt` file), attach
  photos, and the app weaves them into the article at evenly-spaced points
  automatically — different spacing for a short vs. a long article.
- **Add video**: paste a TikTok or YouTube Shorts link into "Shorts", or a
  full YouTube video link into "Long-form" — both are inserted using
  WordPress's own native oEmbed block, so they render exactly like videos
  added through the block editor.
- **Categories, tags, featured image, draft/publish** — all standard
  WordPress fields.
- **Manage posts**: search, filter by status, edit, and delete — reading
  and writing straight through `wp/v2/posts`, no separate database.
- **Follow us icons**: a social-links row (Facebook, Instagram, TikTok,
  YouTube, X, Pinterest, LinkedIn, website) sourced from the companion
  plugin below.

To build it: open `android-app/` in Android Studio (Kotlin, AGP 8.6,
compileSdk 35, minSdk 26) and run.

## `wordpress-plugin/autoposter-companion/`

A small companion plugin the app expects on the target site. It doesn't
handle posts or media — WordPress core already does that — it only adds:

- **Settings → AutoPoster Companion**: a page to enter your social media
  links.
- `GET /wp-json/autoposter/v1/site-info`: a public REST route the app
  calls to render those links as icons.
- A "Follow us" icon row auto-appended to published posts, plus CSS to
  keep embedded TikTok/YouTube videos responsive on any theme.

Install by uploading the `autoposter-companion` folder to
`wp-content/plugins/` and activating it.
