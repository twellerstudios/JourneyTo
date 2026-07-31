/**
 * Journey To Poster — WordPress API client.
 *
 * Talks straight to WordPress core's own REST API (wp/v2/*) using an
 * Application Password over HTTP Basic Auth — no custom backend involved.
 * Also carries the small autoposter/v1/site-info route the companion
 * plugin adds, and the dynamic-image-placement / Gutenberg block-markup
 * composer that turns a pasted article + photos + video links into a
 * fully native, block-editor-editable post.
 */
var JourneyToApi = (function () {
    'use strict';

    var cfg = { siteUrl: '', username: '', appPassword: '' };

    function configure(siteUrl, username, appPassword) {
        cfg.siteUrl = (siteUrl || '').trim().replace(/\/+$/, '');
        cfg.username = username || '';
        cfg.appPassword = appPassword || '';
    }

    function isConfigured() {
        return !!(cfg.siteUrl && cfg.username && cfg.appPassword);
    }

    function authHeader() {
        return 'Basic ' + btoa(cfg.username + ':' + cfg.appPassword);
    }

    function base() {
        return cfg.siteUrl + '/wp-json';
    }

    function describeError(code, data) {
        if (code === 401 || code === 403) return 'Login failed. Check your username and Application Password.';
        if (code === 404) return 'Not found. Is the site URL correct and is the REST API enabled?';
        if (code >= 500) return 'The WordPress site had a server error. Please try again shortly.';
        return (data && data.message) ? data.message : ('WordPress returned an error (HTTP ' + code + ').');
    }

    async function request(path, opts) {
        opts = opts || {};
        var headers = Object.assign({ 'Authorization': authHeader() }, opts.headers || {});
        var res;
        try {
            res = await fetch(base() + path, {
                method: opts.method || 'GET',
                headers: headers,
                body: opts.body,
            });
        } catch (e) {
            throw new Error("Couldn't reach that site. Check the site URL and your connection.");
        }
        var data = null;
        try { data = await res.json(); } catch (e) {}
        if (!res.ok) throw new Error(describeError(res.status, data));
        return data;
    }

    // ── Auth / account ──────────────────────────────────────────

    async function verifyLogin() {
        return request('/wp/v2/users/me');
    }

    // ── Posts ───────────────────────────────────────────────────

    async function getPosts(opts) {
        opts = opts || {};
        var qs = [];
        qs.push('status=' + encodeURIComponent(opts.status || 'publish,draft,pending,future'));
        qs.push('page=' + (opts.page || 1));
        qs.push('per_page=' + (opts.perPage || 20));
        qs.push('_embed=true');
        qs.push('orderby=date');
        qs.push('order=desc');
        if (opts.search) qs.push('search=' + encodeURIComponent(opts.search));
        return request('/wp/v2/posts?' + qs.join('&'));
    }

    async function getPost(id) {
        return request('/wp/v2/posts/' + id + '?context=edit&_embed=true');
    }

    async function createPost(body) {
        return request('/wp/v2/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    async function updatePost(id, body) {
        return request('/wp/v2/posts/' + id, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    async function deletePost(id) {
        return request('/wp/v2/posts/' + id + '?force=true', { method: 'DELETE' });
    }

    // ── Media ───────────────────────────────────────────────────

    async function uploadMedia(file, altText) {
        var fd = new FormData();
        fd.append('file', file, file.name);
        if (altText) fd.append('alt_text', altText);
        return request('/wp/v2/media', { method: 'POST', body: fd });
    }

    // ── Taxonomies ──────────────────────────────────────────────

    async function getCategories(search) {
        var qs = 'per_page=100' + (search ? '&search=' + encodeURIComponent(search) : '');
        return request('/wp/v2/categories?' + qs);
    }

    async function createCategory(name) {
        return request('/wp/v2/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name }),
        });
    }

    async function getTags(search) {
        var qs = 'per_page=100' + (search ? '&search=' + encodeURIComponent(search) : '');
        return request('/wp/v2/tags?' + qs);
    }

    async function createTag(name) {
        return request('/wp/v2/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name }),
        });
    }

    // ── Companion plugin ────────────────────────────────────────

    /** Returns null (not an error) if the companion plugin isn't installed. */
    async function getSiteInfo() {
        try {
            return await request('/autoposter/v1/site-info');
        } catch (e) {
            return null;
        }
    }

    // ── Content composer ────────────────────────────────────────
    // Turns a pasted/imported article plus attached images and video links
    // into WordPress block-editor (Gutenberg) markup — the same markup WP
    // itself generates — so the resulting post stays fully editable as
    // native blocks in wp-admin afterwards.
    //
    // Image placement is dynamic per article: images are spread evenly
    // across paragraph breaks rather than dumped at the top, so a
    // 6-paragraph article with 2 images gets one after paragraph ~2 and one
    // after paragraph ~4, while a 20-paragraph article with 2 images spaces
    // them much further apart.

    /**
     * Splits raw article text on blank lines into typed blocks, recognizing
     * a small amount of Markdown so posts generated elsewhere (e.g. an
     * imported Post File) render as real headings/lists rather than
     * literal "## " text: ATX headings (`#` … `######`) and simple
     * bullet lists (every line in the chunk starting with `-` or `*`).
     * Everything else is an ordinary paragraph.
     */
    function splitParagraphs(articleText) {
        var chunks = (articleText || '')
            .split(/\n\s*\n/)
            .map(function (c) { return c.trim(); })
            .filter(function (c) { return c.length > 0; });

        return chunks.map(function (chunk) {
            var heading = /^(#{1,6})\s+(.*)$/.exec(chunk);
            if (heading) {
                return { type: 'heading', level: heading[1].length, text: heading[2].trim() };
            }

            var lines = chunk.split(/\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });
            var isList = lines.length > 0 && lines.every(function (l) { return /^[-*]\s+/.test(l); });
            if (isList) {
                return { type: 'list', items: lines.map(function (l) { return l.replace(/^[-*]\s+/, '').trim(); }) };
            }

            return { type: 'paragraph', text: chunk.replace(/\s*\n\s*/g, ' ') };
        });
    }

    function blockForParagraph(item) {
        if (item.type === 'heading') return headingBlock(item.text, item.level);
        if (item.type === 'list') return listBlock(item.items);
        return paragraphBlock(item.text);
    }

    function computeInsertionSlots(paragraphCount, imageCount) {
        if (imageCount <= 0 || paragraphCount <= 0) return [];
        if (paragraphCount === 1) {
            var only = [];
            for (var i = 0; i < imageCount; i++) only.push(0);
            return only;
        }
        var interval = paragraphCount / (imageCount + 1);
        var slots = [];
        for (var n = 1; n <= imageCount; n++) {
            var slot = Math.trunc(interval * n);
            if (slot < 0) slot = 0;
            if (slot > paragraphCount - 1) slot = paragraphCount - 1;
            slots.push(slot);
        }
        return slots;
    }

    function escapeHtml(text) {
        return (text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function paragraphBlock(text) {
        return '<!-- wp:paragraph -->\n<p>' + escapeHtml(text) + '</p>\n<!-- /wp:paragraph -->';
    }

    function headingBlock(text, level) {
        level = level >= 1 && level <= 6 ? level : 2;
        var tag = 'h' + level;
        return '<!-- wp:heading {"level":' + level + '} -->\n<' + tag + '>' + escapeHtml(text) + '</' + tag + '>\n<!-- /wp:heading -->';
    }

    function listBlock(items) {
        var lis = items.map(function (i) { return '<li>' + escapeHtml(i) + '</li>'; }).join('');
        return '<!-- wp:list -->\n<ul class="wp-block-list">' + lis + '</ul>\n<!-- /wp:list -->';
    }

    /**
     * `isHero` marks the article's lead image — full-bleed and placed above
     * the very first paragraph, styled by the companion plugin's frontend
     * CSS (`.jt-hero-image`). Every other image gets the standard
     * comfortably-large, full-text-width treatment.
     */
    function imageBlock(image, isHero) {
        var alt = escapeHtml(image.altText || '');
        var extraClass = isHero ? ' jt-hero-image' : ' jt-content-image';
        var sizeSlug = isHero ? 'full' : 'large';
        return '<!-- wp:image {"id":' + image.mediaId + ',"sizeSlug":"' + sizeSlug + '","linkDestination":"none"' + (isHero ? ',"className":"jt-hero-image"' : '') + '} -->\n' +
            '<figure class="wp-block-image size-' + sizeSlug + extraClass + '"><img src="' + image.url + '" alt="' + alt + '" class="wp-image-' + image.mediaId + '"/></figure>\n' +
            '<!-- /wp:image -->';
    }

    /**
     * Video markup. WordPress's core embed block relies on the server
     * successfully round-tripping an oEmbed request to the provider at
     * render time — TikTok discovery frequently fails or times out on
     * shared hosting, which is why embeds were showing up as a bare
     * plaintext link in an empty box. Instead we embed directly:
     *   - YouTube: the standard youtube.com/embed/ iframe (always works).
     *   - TikTok: the tiktok.com/embed/v2/ iframe when a numeric video id
     *     can be read straight out of the URL (the common case for links
     *     copied from the app's share sheet).
     *   - Anything else (or a TikTok short-link without an id in it):
     *     a polished "Watch on X" card that links out — no dependency on
     *     the WP server being able to reach the provider at all.
     * Wrapped in a wp:html block so it stays a normal, editable Custom
     * HTML block in wp-admin afterwards.
     */
    function videoBlock(video) {
        var portrait = !!video.isShort;
        if (video.platformSlug === 'youtube') {
            var ytId = youTubeId(video.url);
            if (ytId) return htmlBlock(videoIframe('https://www.youtube.com/embed/' + ytId + '?rel=0', portrait ? 'portrait' : 'landscape', 'YouTube video', video));
        } else if (video.platformSlug === 'tiktok') {
            var ttId = tikTokId(video.url);
            if (ttId) return htmlBlock(videoIframe('https://www.tiktok.com/embed/v2/' + ttId, 'tiktok', 'TikTok video', video));
        }
        return htmlBlock(watchCard(video));
    }

    function htmlBlock(innerHtml) {
        return '<!-- wp:html -->\n' + innerHtml + '\n<!-- /wp:html -->';
    }

    /**
     * `shape` is 'landscape' (16:9, YouTube long-form), 'portrait' (9:16,
     * YouTube Shorts — the player scales cleanly to any box) or 'tiktok'
     * (a fixed-size box matching TikTok's own embed proportions, since
     * forcing their player into an arbitrary aspect ratio via the usual
     * padding-percentage trick made its internal UI overflow and show a
     * scrollbar — `scrolling="no"` plus a size TikTok is actually
     * designed for avoids that instead of fighting it).
     *
     * `data-jt-url`/`data-jt-is-short` on the wrapper carry the original
     * link and section back into the markup itself — with nowhere else to
     * persist "this was a Shorts link" once it's saved as an iframe embed,
     * this is what lets editing an existing post reconstruct the Shorts/
     * Long-form lists instead of them just looking empty. See
     * parseExistingContent().
     */
    function videoIframe(src, shape, title, video) {
        var frameClass = 'jt-video-embed__frame jt-video-embed__frame--' + shape;
        return '<div class="jt-video-embed" data-jt-url="' + escapeHtml(video.url) + '" data-jt-is-short="' + (!!video.isShort) + '"><div class="' + frameClass + '">' +
            '<iframe src="' + src + '" title="' + escapeHtml(title) + '" loading="lazy" scrolling="no" ' +
            'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
            'allowfullscreen></iframe></div></div>';
    }

    var PLAY_ICON = '<svg viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>';

    function watchCard(video) {
        var label = video.platformLabel || 'Video';
        var thumb = video.platformSlug === 'youtube' ? youTubeThumbnail(video.url) : null;
        var thumbStyle = thumb ? ' style="background-image:url(\'' + thumb + '\')"' : '';
        return '<a class="jt-watch-card' + (thumb ? ' jt-watch-card--thumb' : '') + '" href="' + escapeHtml(video.url) + '" data-jt-url="' + escapeHtml(video.url) + '" data-jt-is-short="' + (!!video.isShort) + '" target="_blank" rel="noopener noreferrer"' + thumbStyle + '>' +
            '<span class="jt-watch-card__play">' + PLAY_ICON + '</span>' +
            '<span class="jt-watch-card__text"><span class="jt-watch-card__label">Watch on ' + escapeHtml(label) + '</span>' +
            '<span class="jt-watch-card__title">' + escapeHtml(video.url) + '</span></span></a>';
    }

    /**
     * Builds the full post_content string:
     *   1. Shorts (TikTok / YouTube Shorts) right at the top, above
     *      everything else — the highest-visibility slot, for channels
     *      leading with short-form video — if there's more than one Short,
     *      only the first leads; the rest are woven through the article
     *      the same way extra images are, so a second/third Short doesn't
     *      just pile up in the same spot.
     *   2. A hero lead image (if any photos were attached).
     *   3. Paragraph blocks with the remaining images and any long-form
     *      video (each under its own "Watch" heading) dynamically woven
     *      in and spread across the article — a single long-form video
     *      naturally lands near the middle, several space themselves out
     *      — rather than everything piling up at the very end.
     *
     * The hero is whichever image is starred as the featured image
     * (`heroMediaId`) — not simply the first one uploaded — since photos
     * can arrive from more than one source (an imported post file's stock
     * photos plus shots taken on-location) in an order that doesn't
     * necessarily match which one should lead the article. Falls back to
     * the first image if nothing is starred.
     */
    function composeContent(articleText, images, shorts, longform, heroMediaId) {
        images = images || [];
        shorts = shorts || [];
        longform = longform || [];
        var paragraphs = splitParagraphs(articleText);
        if (paragraphs.length === 0 && images.length === 0 && shorts.length === 0 && longform.length === 0) return '';

        var blocks = [];

        var leadShort = shorts.length > 0 ? shorts[0] : null;
        var restShorts = shorts.slice(1);
        if (leadShort) blocks.push(videoBlock(leadShort));

        var hero = (heroMediaId != null && images.find(function (i) { return i.mediaId === heroMediaId; })) || images[0] || null;
        var rest = images.filter(function (i) { return i !== hero; });

        if (hero) blocks.push(imageBlock(hero, true));

        var imageSlots = computeInsertionSlots(paragraphs.length, rest.length);
        var imagesBySlot = {};
        rest.forEach(function (img, i) {
            var slot = imageSlots[i];
            if (!imagesBySlot[slot]) imagesBySlot[slot] = [];
            imagesBySlot[slot].push(img);
        });

        // Extra Shorts (beyond the lead one) and every long-form video share
        // the same "spread evenly through the paragraphs" placement images use.
        var mediaQueue = restShorts.map(function (v) { return { video: v, heading: false }; })
            .concat(longform.map(function (v) { return { video: v, heading: true }; }));
        var mediaSlots = computeInsertionSlots(paragraphs.length, mediaQueue.length);
        var mediaBySlot = {};
        mediaQueue.forEach(function (m, i) {
            var slot = mediaSlots[i];
            if (!mediaBySlot[slot]) mediaBySlot[slot] = [];
            mediaBySlot[slot].push(m);
        });

        paragraphs.forEach(function (item, index) {
            blocks.push(blockForParagraph(item));
            if (imagesBySlot[index]) imagesBySlot[index].forEach(function (img) { blocks.push(imageBlock(img, false)); });
            if (mediaBySlot[index]) mediaBySlot[index].forEach(function (m) {
                if (m.heading) blocks.push(headingBlock('Watch'));
                blocks.push(videoBlock(m.video));
            });
        });

        // Paragraph-less articles have no "spread through" to speak of —
        // everything still attached just gets appended in order.
        if (paragraphs.length === 0) {
            rest.forEach(function (img) { blocks.push(imageBlock(img, false)); });
            mediaQueue.forEach(function (m) {
                if (m.heading) blocks.push(headingBlock('Watch'));
                blocks.push(videoBlock(m.video));
            });
        }

        return blocks.join('\n\n');
    }

    /**
     * Appends new images/videos to an existing post's raw content, for the
     * "add more media" flow when editing a post that already has structure
     * WordPress (or the user) arranged. Existing content is never rewritten,
     * and appended images never get the hero treatment (the post already
     * has its own lead image).
     */
    function appendMedia(existingContent, images, videos) {
        images = images || [];
        videos = videos || [];
        var additions = [];
        images.forEach(function (img) { additions.push(imageBlock(img, false)); });
        if (videos.length > 0) {
            additions.push(headingBlock('Watch'));
            videos.forEach(function (v) { additions.push(videoBlock(v)); });
        }
        if (additions.length === 0) return existingContent;
        if (!existingContent || !existingContent.trim()) return additions.join('\n\n');
        return existingContent.replace(/\s+$/, '') + '\n\n' + additions.join('\n\n');
    }

    /**
     * Reconstructs the images/shorts/long-form video the editor's Photos
     * and video sections should show for an existing post — otherwise
     * opening a published post for editing looks like all its media
     * vanished, when really it's just sitting in the raw content with
     * nothing reading it back out. Images are recovered from the
     * `wp-image-{id}` class every generated `<img>` carries; videos from
     * the `data-jt-url`/`data-jt-is-short` attributes videoBlock() stamps
     * on its wrapper. Anything not generated by this app (hand-written
     * blocks, a wp:embed from before this existed) is simply not picked up
     * — the raw content itself is left completely untouched either way.
     */
    function parseExistingContent(html) {
        var images = [];
        var shorts = [];
        var longform = [];
        if (!html || typeof DOMParser === 'undefined') return { images: images, shorts: shorts, longform: longform };
        try {
            var doc = new DOMParser().parseFromString(html, 'text/html');
            doc.querySelectorAll('img[class*="wp-image-"]').forEach(function (img) {
                var m = /wp-image-(\d+)/.exec(img.getAttribute('class') || '');
                if (!m) return;
                images.push({ mediaId: parseInt(m[1], 10), url: img.getAttribute('src') || '', altText: img.getAttribute('alt') || '' });
            });
            doc.querySelectorAll('[data-jt-url]').forEach(function (node) {
                var url = node.getAttribute('data-jt-url');
                if (!url) return;
                var isShort = node.getAttribute('data-jt-is-short') === 'true';
                var platform = detectPlatform(url);
                var link = { url: url, platformSlug: platform.slug, platformLabel: platform.label, isShort: isShort };
                (isShort ? shorts : longform).push(link);
            });
        } catch (e) {}
        return { images: images, shorts: shorts, longform: longform };
    }

    /**
     * Removes the single `<!-- wp:type {...} --> … <!-- /wp:type -->`
     * block that contains `marker` (e.g. `wp-image-123` or a video's
     * `data-jt-url="…"`) from raw post content — used when the user
     * removes a photo/video the editor recovered via parseExistingContent,
     * so "remove" actually removes it from the post rather than just from
     * the preview grid.
     */
    function removeBlockContaining(content, marker) {
        if (!content || !marker) return content;
        var blockRegex = /<!--\s*wp:[a-z0-9\/-]+(?:\s+\{[^}]*\})?\s*-->[\s\S]*?<!--\s*\/wp:[a-z0-9\/-]+\s*-->/g;
        var match;
        while ((match = blockRegex.exec(content)) !== null) {
            if (match[0].indexOf(marker) !== -1) {
                return (content.slice(0, match.index) + content.slice(match.index + match[0].length)).replace(/\n{3,}/g, '\n\n').trim();
            }
        }
        return content;
    }

    // ── Video link parsing ──────────────────────────────────────

    function detectPlatform(url) {
        if (/(youtube\.com|youtu\.be)/i.test(url)) return { slug: 'youtube', label: 'YouTube' };
        if (/tiktok\.com/i.test(url)) return { slug: 'tiktok', label: 'TikTok' };
        return { slug: 'embed', label: 'Video' };
    }

    /** A YouTube Shorts URL or a TikTok URL both count as "short-form" by default. */
    function looksLikeShort(url) {
        var slug = detectPlatform(url).slug;
        if (slug === 'youtube') return /\/shorts\//i.test(url);
        if (slug === 'tiktok') return true;
        return false;
    }

    function isValidVideoUrl(url) {
        var trimmed = (url || '').trim();
        return trimmed.indexOf('http://') === 0 || trimmed.indexOf('https://') === 0;
    }

    function youTubeId(url) {
        var m = /(?:youtu\.be\/|shorts\/|v=|\/embed\/)([A-Za-z0-9_-]{11})/.exec(url);
        return m ? m[1] : null;
    }

    /** Numeric id out of a canonical tiktok.com/@user/video/{id} link. Null for shortened share links. */
    function tikTokId(url) {
        var m = /\/video\/(\d+)/.exec(url);
        return m ? m[1] : null;
    }

    /** Thumbnail via YouTube's public image CDN — no API key required. Null for non-YouTube links. */
    function youTubeThumbnail(url) {
        var id = youTubeId(url);
        return id ? ('https://img.youtube.com/vi/' + id + '/hqdefault.jpg') : null;
    }

    // ── Imported post files ──────────────────────────────────────
    // A "Journey To Post" file (plain JSON) carries everything the editor
    // would otherwise need typed in by hand: title, body, images (as
    // URLs to fetch — on-device photos are still added the normal way),
    // video links, categories and tags. See mobile/README.md for the
    // full schema this validates against.

    var ALLOWED_STATUSES = ['draft', 'publish', 'pending', 'future'];

    /** Parses + validates an imported post file's JSON text. Throws a user-facing Error on anything malformed. */
    function parseImportedPost(jsonText) {
        var data;
        try {
            data = JSON.parse(jsonText);
        } catch (e) {
            throw new Error("That file isn't valid JSON.");
        }
        if (!data || typeof data !== 'object') throw new Error('Empty or invalid post file.');
        if (typeof data.title !== 'string' || !data.title.trim()) {
            throw new Error('The post file needs a non-empty "title".');
        }

        var status = ALLOWED_STATUSES.indexOf(data.status) !== -1 ? data.status : 'draft';

        var images = Array.isArray(data.images)
            ? data.images
                .filter(function (i) { return i && typeof i.url === 'string' && i.url.trim(); })
                .map(function (i) { return { url: i.url.trim(), altText: typeof i.altText === 'string' ? i.altText : '' }; })
            : [];

        var videos = Array.isArray(data.videos)
            ? data.videos
                .filter(function (v) { return v && isValidVideoUrl(v.url); })
                .map(function (v) {
                    var platform = detectPlatform(v.url);
                    return { url: v.url.trim(), platformSlug: platform.slug, platformLabel: platform.label, isShort: !!v.isShort };
                })
            : [];

        var categories = Array.isArray(data.categories)
            ? data.categories.filter(function (c) { return typeof c === 'string' && c.trim(); }).map(function (c) { return c.trim(); })
            : [];
        var tags = Array.isArray(data.tags)
            ? data.tags.filter(function (t) { return typeof t === 'string' && t.trim(); }).map(function (t) { return t.trim(); })
            : [];

        return {
            title: data.title.trim(),
            body: typeof data.body === 'string' ? data.body : '',
            status: status,
            images: images,
            videos: videos,
            categories: categories,
            tags: tags,
        };
    }

    return {
        configure: configure,
        isConfigured: isConfigured,
        verifyLogin: verifyLogin,
        getPosts: getPosts,
        getPost: getPost,
        createPost: createPost,
        updatePost: updatePost,
        deletePost: deletePost,
        uploadMedia: uploadMedia,
        getCategories: getCategories,
        createCategory: createCategory,
        getTags: getTags,
        createTag: createTag,
        getSiteInfo: getSiteInfo,
        composeContent: composeContent,
        appendMedia: appendMedia,
        parseExistingContent: parseExistingContent,
        removeBlockContaining: removeBlockContaining,
        detectPlatform: detectPlatform,
        looksLikeShort: looksLikeShort,
        isValidVideoUrl: isValidVideoUrl,
        youTubeThumbnail: youTubeThumbnail,
        parseImportedPost: parseImportedPost,
        escapeHtml: escapeHtml,
    };
})();
