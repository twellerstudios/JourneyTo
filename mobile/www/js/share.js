/**
 * Journey To Poster — "Share" tab: send a video to YouTube / Facebook /
 * Instagram through Postiz.
 *
 * Safety defaults: sends as a Postiz DRAFT, YouTube visibility defaults to
 * private, "Post now" needs an explicit confirmation, and a local log warns
 * before the same video goes to the same channel twice (including after an
 * ambiguous network failure, where the post may actually have been created).
 */
var JourneyToShare = (function () {
    'use strict';

    var CRED_KEY = 'jt_postiz';
    var LOG_KEY = 'jt_share_log';
    var LABELS = { youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', 'instagram-standalone': 'Instagram' };

    function prefs() {
        return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
    }
    async function load(key) {
        try {
            var p = prefs();
            if (p) { var r = await p.get({ key: key }); return r.value ? JSON.parse(r.value) : null; }
        } catch (e) {}
        try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    }
    async function save(key, value) {
        var json = JSON.stringify(value);
        try { var p = prefs(); if (p) { await p.set({ key: key, value: json }); return; } } catch (e) {}
        try { localStorage.setItem(key, json); } catch (e) {}
    }

    function dupKey(media, channelId) { return media + '|' + channelId; }

    async function render(h) {
        var el = h.el, toast = h.toast, view = h.view;
        view.innerHTML = '';
        view.appendChild(el('div', { class: 'topbar' }, [
            el('div', { class: 'brand' }, [el('div', { class: 'brand-mark', text: 'JT' }), el('h1', { text: 'Share video' })]),
        ]));

        var creds = (await load(CRED_KEY)) || { baseUrl: '', apiKey: '' };
        JourneyToPostiz.configure(creds.baseUrl, creds.apiKey);

        // ── Postiz connection ────────────────────────────────────
        var urlInput = el('input', { type: 'url', placeholder: JourneyToPostiz.DEFAULT_BASE, value: creds.baseUrl || '' });
        var keyInput = el('input', { type: 'password', placeholder: 'Postiz API key', value: creds.apiKey || '', autocomplete: 'off' });
        var saveBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Save & load channels' });
        view.appendChild(el('div', { class: 'card' }, [
            el('div', { class: 'section-label', text: 'Postiz connection' }),
            el('div', { class: 'field' }, [el('label', { text: 'API URL (leave blank for Postiz Cloud)' }), urlInput]),
            el('div', { class: 'field' }, [
                el('label', { text: 'API key' }), keyInput,
                el('p', { class: 'hint', text: 'Postiz → Settings → Developers → Public API. Stored on this device only.' }),
            ]),
            saveBtn,
        ]));

        var channelsWrap = el('div', { class: 'chip-row' });
        var channelsMsg = el('p', { class: 'hint', text: '' });
        var selected = {}; // channel id -> channel

        var fileInput = el('input', { type: 'file', accept: 'video/*' });
        var urlVideo = el('input', { type: 'url', placeholder: 'or a public video URL (https://…)' });
        var captionTa = el('textarea', { rows: '5', placeholder: 'Caption / description' });
        var titleInput = el('input', { type: 'text', maxlength: '100', placeholder: 'YouTube title (max 100)' });
        var tagsInput = el('input', { type: 'text', placeholder: 'YouTube tags, comma separated' });
        var visSelect = el('select', {}, [
            el('option', { value: 'private', text: 'YouTube: Private (safe default)' }),
            el('option', { value: 'unlisted', text: 'YouTube: Unlisted' }),
            el('option', { value: 'public', text: 'YouTube: Public' }),
        ]);
        var modeSelect = el('select', {}, [
            el('option', { value: 'draft', text: 'Save as draft in Postiz (recommended)' }),
            el('option', { value: 'schedule', text: 'Schedule' }),
            el('option', { value: 'now', text: 'Post now' }),
        ]);
        var dateInput = el('input', { type: 'datetime-local', style: 'display:none' });
        modeSelect.addEventListener('change', function () {
            dateInput.style.display = modeSelect.value === 'schedule' ? '' : 'none';
        });
        var sendBtn = el('button', { class: 'btn btn-primary btn-block', text: 'Send to Postiz' });
        var resultBox = el('div', {});

        view.appendChild(el('div', { class: 'card' }, [
            el('div', { class: 'section-label', text: 'Video' }),
            el('div', { class: 'field' }, [fileInput]),
            el('div', { class: 'field' }, [urlVideo]),
        ]));
        view.appendChild(el('div', { class: 'card' }, [
            el('div', { class: 'section-label', text: 'Destinations' }),
            channelsWrap, channelsMsg,
        ]));
        view.appendChild(el('div', { class: 'card' }, [
            el('div', { class: 'section-label', text: 'Content' }),
            el('div', { class: 'field' }, [el('label', { text: 'Caption' }), captionTa]),
            el('div', { class: 'field' }, [el('label', { text: 'YouTube title' }), titleInput]),
            el('div', { class: 'field' }, [el('label', { text: 'YouTube tags' }), tagsInput]),
            el('div', { class: 'field' }, [visSelect]),
        ]));
        view.appendChild(el('div', { class: 'card' }, [
            el('div', { class: 'section-label', text: 'Publish' }),
            el('div', { class: 'field' }, [modeSelect, dateInput]),
            sendBtn, resultBox,
        ]));

        async function loadChannels() {
            channelsWrap.innerHTML = '';
            selected = {};
            if (!JourneyToPostiz.isConfigured()) { channelsMsg.textContent = 'Enter your Postiz API key above.'; return; }
            channelsMsg.textContent = 'Loading channels…';
            try {
                var chans = await JourneyToPostiz.listChannels();
                channelsMsg.textContent = chans.length ? '' : 'No YouTube / Facebook / Instagram channels are connected in Postiz yet.';
                chans.forEach(function (ch) {
                    var btn = el('button', { type: 'button', class: 'chip-toggle', text: (LABELS[ch.identifier] || ch.identifier) + ' · ' + (ch.name || ch.profile || ch.id) });
                    btn.addEventListener('click', function () {
                        if (selected[ch.id]) { delete selected[ch.id]; btn.classList.remove('selected'); }
                        else { selected[ch.id] = ch; btn.classList.add('selected'); }
                    });
                    channelsWrap.appendChild(btn);
                });
            } catch (e) { channelsMsg.textContent = e.message; }
        }

        saveBtn.addEventListener('click', async function () {
            creds = { baseUrl: urlInput.value.trim(), apiKey: keyInput.value.trim() };
            await save(CRED_KEY, creds);
            JourneyToPostiz.configure(creds.baseUrl, creds.apiKey);
            loadChannels();
        });

        function line(cls, text) { return el('p', { class: cls || 'hint', text: text }); }

        sendBtn.addEventListener('click', async function () {
            resultBox.innerHTML = '';
            var channels = Object.keys(selected).map(function (k) { return selected[k]; });
            var file = fileInput.files[0];
            var vurl = urlVideo.value.trim();
            var mode = modeSelect.value;

            if (!JourneyToPostiz.isConfigured()) return toast('Add your Postiz API key first');
            if (!file && !/^https:\/\//i.test(vurl)) return toast('Pick a video or paste an https:// URL');
            if (!channels.length) return toast('Choose at least one destination');
            if (!captionTa.value.trim()) return toast('Add a caption');
            if (channels.some(function (c) { return c.identifier === 'youtube'; }) && !titleInput.value.trim()) return toast('YouTube needs a title');

            var date = null;
            if (mode === 'schedule') {
                var d = new Date(dateInput.value);
                if (!dateInput.value || isNaN(d.getTime()) || d.getTime() < Date.now() + 60000) return toast('Pick a future date and time');
                date = d.toISOString();
            }

            var mediaId = file ? (file.name + ':' + file.size) : vurl;
            var log = (await load(LOG_KEY)) || {};
            var dups = channels.filter(function (c) { return log[dupKey(mediaId, c.id)]; });
            if (dups.length) {
                var when = new Date(log[dupKey(mediaId, dups[0].id)].at).toLocaleString();
                if (!window.confirm('This video was already sent to ' + dups.map(function (c) { return c.name || c.id; }).join(', ') + ' (' + when + '). It may already exist in Postiz. Send again?')) return;
            }
            if (mode === 'now' && !window.confirm('Publish NOW to ' + channels.length + ' destination(s)? This goes live immediately.')) return;
            if (mode === 'schedule' && !window.confirm('Schedule for ' + new Date(date).toLocaleString() + '?')) return;

            sendBtn.disabled = true;
            sendBtn.textContent = 'Uploading video…';
            var posted = false;
            try {
                var media = file ? await JourneyToPostiz.uploadFile(file) : await JourneyToPostiz.uploadFromUrl(vurl);
                sendBtn.textContent = 'Sending…';
                posted = true; // from here on a failure can be ambiguous
                await JourneyToPostiz.createPost({
                    mode: mode, date: date, channels: channels, media: media,
                    content: captionTa.value.trim(), title: titleInput.value.trim(),
                    youtubeVisibility: visSelect.value,
                    tags: tagsInput.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean),
                });
                log = (await load(LOG_KEY)) || {};
                channels.forEach(function (c) { log[dupKey(mediaId, c.id)] = { at: Date.now(), mode: mode, state: 'sent' }; });
                await save(LOG_KEY, log);
                resultBox.appendChild(line('hint', mode === 'draft'
                    ? 'Saved as a draft in Postiz. Review and publish it there.'
                    : mode === 'schedule' ? 'Scheduled in Postiz.' : 'Sent to Postiz for immediate publishing. Check Postiz for per-channel results.'));
                toast('Sent to Postiz');
            } catch (e) {
                if (posted && e.ambiguous) {
                    // Don't invite a blind retry: the post may exist.
                    log = (await load(LOG_KEY)) || {};
                    channels.forEach(function (c) { log[dupKey(mediaId, c.id)] = { at: Date.now(), mode: mode, state: 'unknown' }; });
                    await save(LOG_KEY, log);
                    resultBox.appendChild(line('hint', 'Outcome unknown: ' + e.message + ' Check Postiz before sending again — the post may have been created.'));
                } else {
                    resultBox.appendChild(line('hint', 'Not sent: ' + e.message));
                }
            } finally {
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send to Postiz';
            }
        });

        loadChannels();
    }

    return { render: render };
})();
