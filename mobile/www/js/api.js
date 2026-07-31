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

    function splitParagraphs(articleText) {
        return (articleText || '')
            .split(/\n\s*\n/)
            .map(function (p) { return p.trim().replace(/\s*\n\s*/g, ' '); })
            .filter(function (p) { return p.length > 0; });
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

    function headingBlock(text) {
        return '<!-- wp:heading -->\n<h2>' + escapeHtml(text) + '</h2>\n<!-- /wp:heading -->';
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
            if (ytId) return htmlBlock(videoIframe('https://www.youtube.com/embed/' + ytId + '?rel=0', portrait, 'YouTube video'));
        } else if (video.platformSlug === 'tiktok') {
            var ttId = tikTokId(video.url);
            if (ttId) return htmlBlock(videoIframe('https://www.tiktok.com/embed/v2/' + ttId, true, 'TikTok video'));
        }
        return htmlBlock(watchCard(video));
    }

    function htmlBlock(innerHtml) {
        return '<!-- wp:html -->\n' + innerHtml + '\n<!-- /wp:html -->';
    }

    function videoIframe(src, portrait, title) {
        var frameClass = 'jt-video-embed__frame' + (portrait ? ' jt-video-embed__frame--portrait' : '');
        return '<div class="jt-video-embed"><div class="' + frameClass + '">' +
            '<iframe src="' + src + '" title="' + escapeHtml(title) + '" loading="lazy" ' +
            'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
            'allowfullscreen></iframe></div></div>';
    }

    var PLAY_ICON = '<svg viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>';

    function watchCard(video) {
        var label = video.platformLabel || 'Video';
        var thumb = video.platformSlug === 'youtube' ? youTubeThumbnail(video.url) : null;
        var thumbStyle = thumb ? ' style="background-image:url(\'' + thumb + '\')"' : '';
        return '<a class="jt-watch-card' + (thumb ? ' jt-watch-card--thumb' : '') + '" href="' + escapeHtml(video.url) + '" target="_blank" rel="noopener noreferrer"' + thumbStyle + '>' +
            '<span class="jt-watch-card__play">' + PLAY_ICON + '</span>' +
            '<span class="jt-watch-card__text"><span class="jt-watch-card__label">Watch on ' + escapeHtml(label) + '</span>' +
            '<span class="jt-watch-card__title">' + escapeHtml(video.url) + '</span></span></a>';
    }

    /**
     * Builds the full post_content string: a hero lead image (if any photos
     * were attached), paragraph blocks with the remaining images dynamically
     * woven in, followed by a "Watch" section for any video links.
     */
    function composeContent(articleText, images, videos) {
        images = images || [];
        videos = videos || [];
        var paragraphs = splitParagraphs(articleText);
        if (paragraphs.length === 0 && images.length === 0 && videos.length === 0) return '';

        var blocks = [];
        var hero = images.length > 0 ? images[0] : null;
        var rest = images.length > 0 ? images.slice(1) : [];

        if (hero) blocks.push(imageBlock(hero, true));

        var slots = computeInsertionSlots(paragraphs.length, rest.length);
        var imagesBySlot = {};
        rest.forEach(function (img, i) {
            var slot = slots[i];
            if (!imagesBySlot[slot]) imagesBySlot[slot] = [];
            imagesBySlot[slot].push(img);
        });

        paragraphs.forEach(function (p, index) {
            blocks.push(paragraphBlock(p));
            if (imagesBySlot[index]) imagesBySlot[index].forEach(function (img) { blocks.push(imageBlock(img, false)); });
        });

        // Paragraph-less articles still get their remaining images appended in order.
        if (paragraphs.length === 0) {
            rest.forEach(function (img) { blocks.push(imageBlock(img, false)); });
        }

        if (videos.length > 0) {
            blocks.push(headingBlock('Watch'));
            videos.forEach(function (v) { blocks.push(videoBlock(v)); });
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
        detectPlatform: detectPlatform,
        looksLikeShort: looksLikeShort,
        isValidVideoUrl: isValidVideoUrl,
        youTubeThumbnail: youTubeThumbnail,
    };
})();
