/**
 * Journey To Poster — Postiz client.
 *
 * Publishes videos to YouTube / Facebook / Instagram through a Postiz
 * instance's Public API (https://docs.postiz.com/public-api). Postiz owns the
 * platform OAuth connections; this app only needs the Postiz API key.
 *
 *   Base URL  cloud:       https://api.postiz.com/public/v1
 *             self-hosted: https://<your-backend-host>/public/v1
 *   Auth      `Authorization: <api key>` (no "Bearer" prefix)
 *   Endpoints GET /integrations, POST /upload (multipart "file"),
 *             POST /upload-from-url, POST /posts
 */
var JourneyToPostiz = (function () {
    'use strict';

    var DEFAULT_BASE = 'https://api.postiz.com/public/v1';
    var SUPPORTED = ['youtube', 'facebook', 'instagram', 'instagram-standalone'];
    var cfg = { baseUrl: DEFAULT_BASE, apiKey: '' };

    function configure(baseUrl, apiKey) {
        cfg.baseUrl = ((baseUrl || '').trim() || DEFAULT_BASE).replace(/\/+$/, '');
        cfg.apiKey = (apiKey || '').trim();
    }

    function isConfigured() { return !!cfg.apiKey; }

    function describe(status, data) {
        if (status === 401) return 'Postiz rejected the API key.';
        if (status === 403) return 'That Postiz key does not have access to this resource.';
        if (status === 413) return 'The upload is too large for this Postiz server.';
        if (status === 429) return 'Postiz rate limit reached. Wait a bit before posting again.';
        if (status >= 500) return 'Postiz had a server error. Check Postiz before retrying.';
        var msg = data && (data.message || data.error);
        if (Array.isArray(msg)) msg = msg.join('; ');
        return msg ? String(msg) : 'Postiz returned HTTP ' + status + '.';
    }

    async function request(path, opts) {
        opts = opts || {};
        var res;
        try {
            res = await fetch(cfg.baseUrl + path, {
                method: opts.method || 'GET',
                headers: Object.assign({ 'Authorization': cfg.apiKey }, opts.headers || {}),
                body: opts.body,
            });
        } catch (e) {
            // The request may or may not have reached Postiz — callers that
            // create posts must treat this as "outcome unknown", not "failed".
            var err = new Error("Couldn't reach Postiz. Check the URL and your connection (a browser/CORS block looks the same).");
            err.ambiguous = true;
            throw err;
        }
        var data = null;
        try { data = await res.json(); } catch (e) {}
        if (!res.ok) {
            var he = new Error(describe(res.status, data));
            he.status = res.status;
            he.ambiguous = res.status >= 500;
            throw he;
        }
        return data;
    }

    /** Connected channels, limited to the platforms this app publishes to. */
    async function listChannels() {
        var all = await request('/integrations');
        return (Array.isArray(all) ? all : []).filter(function (i) {
            return !i.disabled && SUPPORTED.indexOf(i.identifier) !== -1;
        });
    }

    /** Uploads a File/Blob. Returns { id, path }. */
    async function uploadFile(file) {
        var fd = new FormData();
        fd.append('file', file, file.name);
        var out = await request('/upload', { method: 'POST', body: fd });
        if (!out || !out.id || !out.path) throw new Error('Postiz upload returned an unexpected response.');
        return { id: out.id, path: out.path };
    }

    /** Asks Postiz to fetch a public video URL itself. Returns { id, path }. */
    async function uploadFromUrl(url) {
        var out = await request('/upload-from-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url }),
        });
        if (!out || !out.id || !out.path) throw new Error('Postiz upload returned an unexpected response.');
        return { id: out.id, path: out.path };
    }

    function settingsFor(channel, o) {
        var id = channel.identifier;
        if (id === 'youtube') {
            return {
                __type: 'youtube',
                title: (o.title || '').slice(0, 100),
                type: o.youtubeVisibility || 'private',
                selfDeclaredMadeForKids: 'no',
                tags: (o.tags || []).map(function (t) { return { value: t, label: t }; }),
            };
        }
        if (id === 'facebook') return { __type: 'facebook' };
        return { __type: id, post_type: 'post', collaborators: [] };
    }

    /**
     * Creates ONE Postiz request covering every selected channel.
     * mode: 'draft' | 'schedule' | 'now'. `date` (ISO) is required for 'schedule'.
     */
    async function createPost(o) {
        var body = {
            type: o.mode,
            date: (o.mode === 'schedule' ? o.date : new Date().toISOString()),
            shortLink: false,
            tags: [],
            posts: o.channels.map(function (ch) {
                return {
                    integration: { id: ch.id },
                    value: [{ content: o.content, image: [o.media] }],
                    settings: settingsFor(ch, o),
                };
            }),
        };
        return request('/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    return {
        DEFAULT_BASE: DEFAULT_BASE,
        configure: configure,
        isConfigured: isConfigured,
        listChannels: listChannels,
        uploadFile: uploadFile,
        uploadFromUrl: uploadFromUrl,
        createPost: createPost,
    };
})();
