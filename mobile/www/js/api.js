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

    function imageBlock(image) {
        var alt = escapeHtml(image.altText || '');
        return '<!-- wp:image {"id":' + image.mediaId + ',"sizeSlug":"large","linkDestination":"none"} -->\n' +
            '<figure class="wp-block-image size-large"><img src="' + image.url + '" alt="' + alt + '" class="wp-image-' + image.mediaId + '"/></figure>\n' +
            '<!-- /wp:image -->';
    }

    function embedBlock(video) {
        var slug = video.platformSlug;
        return '<!-- wp:embed {"url":"' + video.url + '","type":"video","providerNameSlug":"' + slug + '","responsive":true} -->\n' +
            '<figure class="wp-block-embed is-type-video is-provider-' + slug + ' wp-block-embed-' + slug + ' wp-embed-aspect-16-9 wp-has-aspect-ratio"><div class="wp-block-embed__wrapper">\n' +
            video.url + '\n</div></figure>\n' +
            '<!-- /wp:embed -->';
    }

    /**
     * Builds the full post_content string: paragraph blocks with images
     * dynamically woven in, followed by a "Watch" section embedding any
     * video links using WordPress's own oEmbed block.
     */
    function composeContent(articleText, images, videos) {
        images = images || [];
        videos = videos || [];
        var paragraphs = splitParagraphs(articleText);
        if (paragraphs.length === 0 && images.length === 0 && videos.length === 0) return '';

        var blocks = [];
        var slots = computeInsertionSlots(paragraphs.length, images.length);
        var imagesBySlot = {};
        images.forEach(function (img, i) {
            var slot = slots[i];
            if (!imagesBySlot[slot]) imagesBySlot[slot] = [];
            imagesBySlot[slot].push(img);
        });

        paragraphs.forEach(function (p, index) {
            blocks.push(paragraphBlock(p));
            if (imagesBySlot[index]) imagesBySlot[index].forEach(function (img) { blocks.push(imageBlock(img)); });
        });

        // Paragraph-less articles still get their images appended in order.
        if (paragraphs.length === 0) {
            images.forEach(function (img) { blocks.push(imageBlock(img)); });
        }

        if (videos.length > 0) {
            blocks.push(headingBlock('Watch'));
            videos.forEach(function (v) { blocks.push(embedBlock(v)); });
        }

        return blocks.join('\n\n');
    }

    /**
     * Appends new images/videos to an existing post's raw content, for the
     * "add more media" flow when editing a post that already has structure
     * WordPress (or the user) arranged. Existing content is never rewritten.
     */
    function appendMedia(existingContent, images, videos) {
        images = images || [];
        videos = videos || [];
        var additions = [];
        images.forEach(function (img) { additions.push(imageBlock(img)); });
        if (videos.length > 0) {
            additions.push(headingBlock('Watch'));
            videos.forEach(function (v) { additions.push(embedBlock(v)); });
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

    /** Thumbnail via YouTube's public image CDN — no API key required. Null for non-YouTube links. */
    function youTubeThumbnail(url) {
        var m = /(?:youtu\.be\/|shorts\/|v=|\/embed\/)([A-Za-z0-9_-]{11})/.exec(url);
        return m ? ('https://img.youtube.com/vi/' + m[1] + '/hqdefault.jpg') : null;
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
