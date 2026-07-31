/**
 * Journey To Poster — screens and app state.
 * Vanilla JS SPA: a single #view container swapped between four screens
 * (login, posts, editor, settings). Dynamic list regions (images, video
 * links, taxonomy chips) are built with direct DOM methods rather than
 * full innerHTML re-renders, so typing in a field never loses focus.
 */
(function () {
    'use strict';

    var SOCIAL_LABELS = {
        facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok',
        youtube: 'YouTube', x: 'X', pinterest: 'Pinterest',
        linkedin: 'LinkedIn', website: 'Website',
    };
    var SOCIAL_INITIALS = {
        facebook: 'f', instagram: 'ig', tiktok: 'tt', youtube: 'yt',
        x: 'x', pinterest: 'p', linkedin: 'in', website: '→',
    };

    var view = document.getElementById('view');
    var tabbar = document.getElementById('tabbar');
    var toastEl = document.getElementById('toast');
    var toastTimer = null;

    var state = {
        credentials: null,
        currentUser: null,
        posts: [],
        postsPage: 1,
        postsHasMore: false,
        postsLoading: false,
        postsSearch: '',
        postsStatus: '',
    };

    // ── Storage (Capacitor Preferences, falls back to localStorage in browser) ──

    function prefs() {
        return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
    }

    async function loadCredentials() {
        try {
            var p = prefs();
            if (p) {
                var res = await p.get({ key: 'jt_credentials' });
                return res.value ? JSON.parse(res.value) : null;
            }
        } catch (e) {}
        var raw = localStorage.getItem('jt_credentials');
        return raw ? JSON.parse(raw) : null;
    }

    async function saveCredentials(creds) {
        var json = JSON.stringify(creds);
        try {
            var p = prefs();
            if (p) { await p.set({ key: 'jt_credentials', value: json }); return; }
        } catch (e) {}
        localStorage.setItem('jt_credentials', json);
    }

    async function clearCredentials() {
        try {
            var p = prefs();
            if (p) { await p.remove({ key: 'jt_credentials' }); return; }
        } catch (e) {}
        localStorage.removeItem('jt_credentials');
    }

    // ── Helpers ──────────────────────────────────────────────────

    function toast(message) {
        toastEl.textContent = message;
        toastEl.style.display = 'block';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.style.display = 'none'; }, 2600);
    }

    /** Opens a URL in the system browser (Chrome Custom Tab on Android via @capacitor/browser), falling back to window.open in a plain browser. */
    async function openExternal(url) {
        try {
            var p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
            if (p) { await p.open({ url: url }); return; }
        } catch (e) {}
        window.open(url, '_blank');
    }

    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        attrs = attrs || {};
        Object.keys(attrs).forEach(function (k) {
            if (k === 'class') node.className = attrs[k];
            else if (k === 'text') node.textContent = attrs[k];
            else if (k === 'html') node.innerHTML = attrs[k];
            else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
            else node.setAttribute(k, attrs[k]);
        });
        (children || []).forEach(function (c) { if (c) node.appendChild(c); });
        return node;
    }

    function decodeEntities(html) {
        var t = document.createElement('textarea');
        t.innerHTML = html || '';
        return t.value;
    }

    function formatDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function statusLabel(s) {
        return { publish: 'Published', draft: 'Draft', pending: 'Pending', future: 'Scheduled' }[s] || s;
    }

    function iconSvg(pathD, extra) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + pathD + (extra || '') + '</svg>';
    }

    var ICONS = {
        back: iconSvg('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>'),
        plus: iconSvg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
        trash: iconSvg('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
        edit: iconSvg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
        empty: iconSvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
        external: iconSvg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'),
        star: iconSvg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
        logout: iconSvg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
    };

    // ── Navigation / tab bar ─────────────────────────────────────

    function setActiveTab(name) {
        var buttons = tabbar.querySelectorAll('.tab');
        buttons.forEach(function (b) {
            b.classList.toggle('tab--active', b.getAttribute('data-tab') === name);
        });
    }

    tabbar.addEventListener('click', function (e) {
        var btn = e.target.closest('.tab');
        if (!btn) return;
        var tab = btn.getAttribute('data-tab');
        setActiveTab(tab);
        if (tab === 'posts') renderPosts();
        else if (tab === 'editor') renderEditor(null);
        else if (tab === 'settings') renderSettings();
    });

    // ── Screen: Login ────────────────────────────────────────────

    function renderLogin(errorMessage) {
        tabbar.style.display = 'none';
        view.innerHTML = '';

        var header = el('div', { class: 'login-header' }, [
            el('div', { class: 'brand-mark', text: 'JT' }),
            el('h1', { text: 'Journey To Poster' }),
            el('p', { text: 'Sign in with your WordPress site to manage posts.' }),
        ]);

        var errorBanner = errorMessage ? el('div', { class: 'error-banner', text: errorMessage }) : null;

        var siteInput = el('input', { type: 'url', placeholder: 'https://letsjourneyto.com', id: 'loginSite' });
        var userInput = el('input', { type: 'text', placeholder: 'WordPress username', id: 'loginUser' });
        var passInput = el('input', { type: 'password', placeholder: 'xxxx xxxx xxxx xxxx xxxx xxxx', id: 'loginPass' });

        var signInBtn = el('button', { class: 'btn btn-primary btn-block', text: 'Sign in' });

        var form = el('div', { class: 'card login-wrap' }, [
            header,
            errorBanner,
            el('div', { class: 'field' }, [el('label', { text: 'Site URL' }), siteInput]),
            el('div', { class: 'field' }, [el('label', { text: 'Username' }), userInput]),
            el('div', { class: 'field' }, [
                el('label', { text: 'Application Password' }),
                passInput,
                el('p', { class: 'hint', text: 'WP Admin → Users → Your Profile → Application Passwords. Spaces are fine — paste as-is.' }),
            ]),
            el('div', { class: 'field' }, [signInBtn]),
        ]);

        view.appendChild(form);

        signInBtn.addEventListener('click', async function () {
            var siteUrl = siteInput.value.trim();
            var username = userInput.value.trim();
            var appPassword = passInput.value.trim();
            if (!siteUrl || !username || !appPassword) {
                renderLogin('Please fill in all three fields.');
                return;
            }
            signInBtn.disabled = true;
            signInBtn.textContent = 'Signing in…';

            JourneyToApi.configure(siteUrl, username, appPassword);
            try {
                var user = await JourneyToApi.verifyLogin();
                state.credentials = { siteUrl: siteUrl, username: username, appPassword: appPassword };
                state.currentUser = user;
                await saveCredentials(state.credentials);
                tabbar.style.display = 'flex';
                setActiveTab('posts');
                renderPosts();
            } catch (e) {
                renderLogin(e.message || 'Sign in failed.');
            }
        });
    }

    // ── Screen: Posts ────────────────────────────────────────────

    async function renderPosts() {
        tabbar.style.display = 'flex';
        setActiveTab('posts');
        view.innerHTML = '';

        var searchInput = el('input', { type: 'search', placeholder: 'Search posts…', value: state.postsSearch });
        var statusSelect = el('select', {}, [
            el('option', { value: '', text: 'All statuses' }),
            el('option', { value: 'publish', text: 'Published' }),
            el('option', { value: 'draft', text: 'Draft' }),
            el('option', { value: 'pending', text: 'Pending' }),
            el('option', { value: 'future', text: 'Scheduled' }),
        ]);
        statusSelect.value = state.postsStatus;

        var listWrap = el('div', { id: 'postsList' });
        var loadMoreBtn = el('button', { class: 'btn btn-secondary btn-block', text: 'Load more' });
        loadMoreBtn.style.display = 'none';

        view.appendChild(el('div', { class: 'topbar' }, [
            el('div', { class: 'brand' }, [
                el('div', { class: 'brand-mark', text: 'JT' }),
                el('h1', { text: 'Posts' }),
            ]),
        ]));
        view.appendChild(el('div', { class: 'search-row' }, [searchInput, statusSelect]));
        view.appendChild(listWrap);
        view.appendChild(loadMoreBtn);
        view.appendChild(el('div', { style: 'height:24px' }));

        var fab = el('button', { class: 'fab', title: 'New post' }, []);
        fab.innerHTML = ICONS.plus;
        fab.addEventListener('click', function () { setActiveTab('editor'); renderEditor(null); });
        view.appendChild(fab);

        var searchDebounce = null;
        searchInput.addEventListener('input', function () {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(function () {
                state.postsSearch = searchInput.value.trim();
                loadPosts(true);
            }, 350);
        });
        statusSelect.addEventListener('change', function () {
            state.postsStatus = statusSelect.value;
            loadPosts(true);
        });
        loadMoreBtn.addEventListener('click', function () { loadPosts(false); });

        async function loadPosts(reset) {
            if (state.postsLoading) return;
            state.postsLoading = true;
            if (reset) { state.postsPage = 1; state.posts = []; }

            if (reset) listWrap.innerHTML = '';
            var loadingRow = el('div', { class: 'loading-row' }, [el('div', { class: 'spinner' })]);
            listWrap.appendChild(loadingRow);
            loadMoreBtn.style.display = 'none';

            try {
                var results = await JourneyToApi.getPosts({
                    search: state.postsSearch || undefined,
                    status: state.postsStatus || undefined,
                    page: state.postsPage,
                });
                loadingRow.remove();
                state.posts = reset ? results : state.posts.concat(results);
                state.postsHasMore = results.length >= 20;

                if (state.posts.length === 0) {
                    listWrap.innerHTML = '';
                    listWrap.appendChild(el('div', { class: 'empty-state', html: ICONS.empty }, [
                        el('p', { text: 'No posts yet. Tap + to create your first one.' }),
                    ]));
                } else {
                    listWrap.innerHTML = '';
                    state.posts.forEach(function (post) { listWrap.appendChild(postCard(post)); });
                }
                loadMoreBtn.style.display = state.postsHasMore ? 'inline-flex' : 'none';
                state.postsPage++;
            } catch (e) {
                loadingRow.remove();
                listWrap.appendChild(el('div', { class: 'error-banner', text: e.message }));
            } finally {
                state.postsLoading = false;
            }
        }

        function postCard(post) {
            var thumbUrl = post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0]
                ? post._embedded['wp:featuredmedia'][0].source_url : null;

            var thumb = thumbUrl
                ? el('img', { class: 'post-thumb', src: thumbUrl })
                : el('div', { class: 'post-thumb' });

            var chip = el('span', { class: 'chip chip-' + post.status, text: statusLabel(post.status) });

            var viewBtn = null;
            if (post.status === 'publish' && post.link) {
                viewBtn = el('button', { class: 'btn btn-icon btn-ghost', html: ICONS.external, title: 'View live' });
                viewBtn.addEventListener('click', function () { openExternal(post.link); });
            }

            var editBtn = el('button', { class: 'btn btn-icon btn-ghost', html: ICONS.edit, title: 'Edit' });
            editBtn.addEventListener('click', function () { setActiveTab('editor'); renderEditor(post.id); });

            var deleteBtn = el('button', { class: 'btn btn-icon btn-ghost', html: ICONS.trash, title: 'Delete' });
            deleteBtn.addEventListener('click', async function () {
                if (!window.confirm('Delete "' + decodeEntities(post.title.rendered) + '"? This can\'t be undone.')) return;
                try {
                    await JourneyToApi.deletePost(post.id);
                    toast('Post deleted.');
                    loadPosts(true);
                } catch (e) {
                    toast(e.message);
                }
            });

            var card = el('div', { class: 'post-card' }, [
                thumb,
                el('div', { class: 'post-body' }, [
                    el('div', { class: 'post-title', text: decodeEntities(post.title.rendered) || '(untitled)' }),
                    el('div', { class: 'post-meta' }, [chip, el('span', { text: formatDate(post.date) })]),
                ]),
                el('div', { class: 'post-actions' }, [viewBtn, editBtn, deleteBtn]),
            ]);
            card.addEventListener('click', function (e) {
                if (e.target.closest('button')) return;
                setActiveTab('editor'); renderEditor(post.id);
            });
            return card;
        }

        loadPosts(true);
    }

    // ── Screen: Editor ───────────────────────────────────────────

    function renderEditor(postId) {
        tabbar.style.display = 'flex';
        setActiveTab(postId ? 'posts' : 'editor');
        view.innerHTML = '';

        var mode = postId ? 'EDIT' : 'CREATE';
        var ed = {
            images: [],          // {mediaId, url, altText}
            shorts: [],          // {url, platformSlug, platformLabel}
            longform: [],
            categories: [],      // full list from server
            tags: [],
            selectedCategoryIds: [],
            selectedTagIds: [],
            featuredImageId: null,
        };

        var backBtn = el('button', { class: 'btn btn-icon btn-ghost', html: ICONS.back });
        backBtn.addEventListener('click', function () { setActiveTab('posts'); renderPosts(); });

        var titleH = el('h1', { text: mode === 'CREATE' ? 'New Post' : 'Edit Post' });
        view.appendChild(el('div', { class: 'topbar' }, [
            el('div', { class: 'brand', style: 'gap:4px' }, [backBtn, titleH]),
        ]));

        var errorSlot = el('div');
        view.appendChild(errorSlot);
        function showError(msg) {
            errorSlot.innerHTML = '';
            if (msg) errorSlot.appendChild(el('div', { class: 'error-banner', text: msg }));
        }

        // Title
        var titleInput = el('input', { type: 'text', placeholder: 'Post title' });
        view.appendChild(el('div', { class: 'card' }, [
            el('div', { class: 'field' }, [el('label', { text: 'Title' }), titleInput]),
        ]));

        // Article / content
        var articleTextarea = el('textarea', { placeholder: 'Paste your article here. Leave a blank line between paragraphs — photos will be woven in automatically.' });
        var importInput = el('input', { type: 'file', accept: '.txt,text/plain', style: 'display:none' });
        var importBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Import .txt' });
        importBtn.addEventListener('click', function () { importInput.click(); });
        importInput.addEventListener('change', function () {
            var file = importInput.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function () { articleTextarea.value = reader.result; };
            reader.readAsText(file);
        });

        var contentCard;
        if (mode === 'CREATE') {
            contentCard = el('div', { class: 'card' }, [
                el('div', { class: 'field' }, [
                    el('label', { text: 'Article' }),
                    articleTextarea,
                ]),
                importBtn, importInput,
            ]);
        } else {
            contentCard = el('div', { class: 'card' }, [
                el('div', { class: 'field' }, [
                    el('label', { text: 'Content (raw)' }),
                    articleTextarea,
                    el('p', { class: 'hint', text: 'Existing structure is preserved. New photos/videos you add below are appended to the end.' }),
                ]),
            ]);
        }
        view.appendChild(contentCard);

        // Images
        var imageGrid = el('div', { class: 'image-grid' });
        var imageInput = el('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });
        var addPhotosBtn = el('button', { class: 'btn btn-secondary btn-sm', text: '+ Add Photos' });
        addPhotosBtn.addEventListener('click', function () { imageInput.click(); });

        view.appendChild(el('div', { class: 'card' }, [
            el('div', { class: 'section-label', text: 'Photos' }),
            addPhotosBtn, imageInput,
            imageGrid,
            el('p', { class: 'hint', text: 'Photos are woven into the article automatically. Tap the star to set the featured image.' }),
        ]));

        imageInput.addEventListener('change', function () {
            var files = Array.prototype.slice.call(imageInput.files || []);
            files.forEach(uploadImage);
            imageInput.value = '';
        });

        async function uploadImage(file) {
            var tile = el('div', { class: 'image-tile uploading' }, [el('div', { class: 'spinner' })]);
            imageGrid.appendChild(tile);
            try {
                var media = await JourneyToApi.uploadMedia(file, titleInput.value.trim() || null);
                var image = { mediaId: media.id, url: media.source_url || '', altText: media.alt_text || '' };
                ed.images.push(image);
                if (ed.featuredImageId === null) ed.featuredImageId = image.mediaId;
                tile.classList.remove('uploading');
                tile.innerHTML = '';
                tile.appendChild(el('img', { src: image.url }));
                var removeBtn = el('button', { class: 'remove', text: '×' });
                var starBtn = el('button', { class: 'star', html: ICONS.star });
                tile.appendChild(removeBtn);
                tile.appendChild(starBtn);
                refreshFeaturedStyling();

                removeBtn.addEventListener('click', function () {
                    ed.images = ed.images.filter(function (i) { return i.mediaId !== image.mediaId; });
                    if (ed.featuredImageId === image.mediaId) {
                        ed.featuredImageId = ed.images.length ? ed.images[0].mediaId : null;
                    }
                    tile.remove();
                    refreshFeaturedStyling();
                });
                starBtn.addEventListener('click', function () {
                    ed.featuredImageId = image.mediaId;
                    refreshFeaturedStyling();
                });
                tile.setAttribute('data-media-id', image.mediaId);
            } catch (e) {
                tile.remove();
                toast(e.message || "Couldn't upload one of the selected images.");
            }
        }

        function refreshFeaturedStyling() {
            Array.prototype.forEach.call(imageGrid.children, function (tile) {
                var id = Number(tile.getAttribute('data-media-id'));
                tile.classList.toggle('featured', id === ed.featuredImageId);
            });
        }

        // Video links
        function videoSection(label, hint, targetArray, isShortSection) {
            var listEl = el('div');
            var urlInput = el('input', { type: 'url', placeholder: 'Paste link…' });
            var addBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Add' });
            var row = el('div', { class: 'inline-add' }, [urlInput, addBtn]);

            addBtn.addEventListener('click', function () {
                var url = urlInput.value.trim();
                if (!JourneyToApi.isValidVideoUrl(url)) {
                    toast('Please paste a full video link (starting with https://).');
                    return;
                }
                var platform = JourneyToApi.detectPlatform(url);
                var link = { url: url, platformSlug: platform.slug, platformLabel: platform.label, isShort: isShortSection };
                targetArray.push(link);
                urlInput.value = '';
                listEl.appendChild(videoRow(link, targetArray, listEl));
            });

            return el('div', { class: 'card' }, [
                el('div', { class: 'section-label', text: label }),
                row,
                el('p', { class: 'hint', text: hint }),
                listEl,
            ]);
        }

        function videoRow(link, targetArray, listEl) {
            var removeBtn = el('button', { class: 'btn btn-icon btn-ghost', html: ICONS.trash });
            var rowEl = el('div', { class: 'media-row' }, [
                el('span', { class: 'platform', text: link.platformLabel }),
                el('span', { class: 'url', text: link.url }),
                removeBtn,
            ]);
            removeBtn.addEventListener('click', function () {
                var idx = targetArray.indexOf(link);
                if (idx >= 0) targetArray.splice(idx, 1);
                rowEl.remove();
            });
            return rowEl;
        }

        view.appendChild(videoSection('Shorts', 'TikTok or YouTube Shorts links.', ed.shorts, true));
        view.appendChild(videoSection('Long-form video', 'Full YouTube video links.', ed.longform, false));

        // Categories & Tags
        var categoriesWrap = el('div', { class: 'chip-row' });
        var newCategoryInput = el('input', { type: 'text', placeholder: 'New category' });
        var addCategoryBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Add' });
        addCategoryBtn.addEventListener('click', async function () {
            var name = newCategoryInput.value.trim();
            if (!name) return;
            try {
                var cat = await JourneyToApi.createCategory(name);
                ed.categories.push(cat);
                ed.selectedCategoryIds.push(cat.id);
                categoriesWrap.appendChild(taxonomyChip(cat, ed.selectedCategoryIds));
                newCategoryInput.value = '';
            } catch (e) { toast(e.message); }
        });

        var tagsWrap = el('div', { class: 'chip-row' });
        var newTagInput = el('input', { type: 'text', placeholder: 'New tag' });
        var addTagBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Add' });
        addTagBtn.addEventListener('click', async function () {
            var name = newTagInput.value.trim();
            if (!name) return;
            try {
                var tag = await JourneyToApi.createTag(name);
                ed.tags.push(tag);
                ed.selectedTagIds.push(tag.id);
                tagsWrap.appendChild(taxonomyChip(tag, ed.selectedTagIds));
                newTagInput.value = '';
            } catch (e) { toast(e.message); }
        });

        function taxonomyChip(item, selectedArray) {
            var btn = el('button', { class: 'chip-toggle', text: decodeEntities(item.name) });
            if (selectedArray.indexOf(item.id) !== -1) btn.classList.add('selected');
            btn.addEventListener('click', function () {
                var idx = selectedArray.indexOf(item.id);
                if (idx === -1) selectedArray.push(item.id); else selectedArray.splice(idx, 1);
                btn.classList.toggle('selected');
            });
            return btn;
        }

        view.appendChild(el('div', { class: 'card' }, [
            el('div', { class: 'section-label', text: 'Categories' }),
            categoriesWrap,
            el('div', { class: 'inline-add' }, [newCategoryInput, addCategoryBtn]),
        ]));
        view.appendChild(el('div', { class: 'card' }, [
            el('div', { class: 'section-label', text: 'Tags' }),
            tagsWrap,
            el('div', { class: 'inline-add' }, [newTagInput, addTagBtn]),
        ]));

        // Status + Save
        var statusSelect = el('select', {}, [
            el('option', { value: 'draft', text: 'Draft' }),
            el('option', { value: 'publish', text: 'Publish' }),
            el('option', { value: 'pending', text: 'Pending review' }),
            el('option', { value: 'future', text: 'Scheduled' }),
        ]);
        var saveBtn = el('button', { class: 'btn btn-primary btn-block', text: mode === 'CREATE' ? 'Publish Post' : 'Save Changes' });

        view.appendChild(el('div', { class: 'card' }, [
            el('div', { class: 'field' }, [el('label', { text: 'Status' }), statusSelect]),
            saveBtn,
        ]));
        view.appendChild(el('div', { style: 'height:16px' }));

        saveBtn.addEventListener('click', async function () {
            var title = titleInput.value.trim();
            if (!title) { showError('Give your post a title first.'); return; }
            showError(null);
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving…';

            try {
                var allVideos = ed.shorts.concat(ed.longform);
                var content = mode === 'CREATE'
                    ? JourneyToApi.composeContent(articleTextarea.value, ed.images, allVideos)
                    : JourneyToApi.appendMedia(articleTextarea.value, ed.images, allVideos);

                var body = {
                    title: title,
                    content: content,
                    status: statusSelect.value,
                };
                if (ed.selectedCategoryIds.length) body.categories = ed.selectedCategoryIds;
                if (ed.selectedTagIds.length) body.tags = ed.selectedTagIds;
                if (ed.featuredImageId) body.featured_media = ed.featuredImageId;

                if (mode === 'CREATE') await JourneyToApi.createPost(body);
                else await JourneyToApi.updatePost(postId, body);

                toast(mode === 'CREATE' ? 'Post created.' : 'Post updated.');
                setActiveTab('posts');
                renderPosts();
            } catch (e) {
                showError(e.message);
                saveBtn.disabled = false;
                saveBtn.textContent = mode === 'CREATE' ? 'Publish Post' : 'Save Changes';
            }
        });

        // Load taxonomies
        (async function loadTaxonomies() {
            try {
                var cats = await JourneyToApi.getCategories();
                ed.categories = cats;
                categoriesWrap.innerHTML = '';
                cats.forEach(function (c) { categoriesWrap.appendChild(taxonomyChip(c, ed.selectedCategoryIds)); });
            } catch (e) {}
            try {
                var tags = await JourneyToApi.getTags();
                ed.tags = tags;
                tagsWrap.innerHTML = '';
                tags.forEach(function (t) { tagsWrap.appendChild(taxonomyChip(t, ed.selectedTagIds)); });
            } catch (e) {}
        })();

        // Load existing post (EDIT mode)
        if (mode === 'EDIT') {
            titleInput.disabled = true;
            articleTextarea.disabled = true;
            saveBtn.disabled = true;
            (async function loadPost() {
                try {
                    var post = await JourneyToApi.getPost(postId);
                    titleInput.value = decodeEntities(post.title.raw || post.title.rendered);
                    articleTextarea.value = post.content.raw || post.content.rendered;
                    statusSelect.value = post.status;
                    ed.featuredImageId = post.featured_media > 0 ? post.featured_media : null;
                    ed.selectedCategoryIds = (post.categories || []).slice();
                    ed.selectedTagIds = (post.tags || []).slice();
                    // Re-render taxonomy selections now that ids are known
                    categoriesWrap.innerHTML = '';
                    ed.categories.forEach(function (c) { categoriesWrap.appendChild(taxonomyChip(c, ed.selectedCategoryIds)); });
                    tagsWrap.innerHTML = '';
                    ed.tags.forEach(function (t) { tagsWrap.appendChild(taxonomyChip(t, ed.selectedTagIds)); });
                } catch (e) {
                    showError(e.message);
                } finally {
                    titleInput.disabled = false;
                    articleTextarea.disabled = false;
                    saveBtn.disabled = false;
                }
            })();
        }
    }

    // ── Screen: Settings ─────────────────────────────────────────

    async function renderSettings() {
        tabbar.style.display = 'flex';
        setActiveTab('settings');
        view.innerHTML = '';

        view.appendChild(el('div', { class: 'topbar' }, [
            el('div', { class: 'brand' }, [
                el('div', { class: 'brand-mark', text: 'JT' }),
                el('h1', { text: 'Settings' }),
            ]),
        ]));

        var siteCard = el('div', { class: 'card' }, [
            el('div', { class: 'section-label', text: 'Connected site' }),
            el('div', { class: 'loading-row' }, [el('div', { class: 'spinner' })]),
        ]);
        view.appendChild(siteCard);

        var signOutBtn = el('button', { class: 'btn btn-danger btn-block', html: '', text: 'Sign out' });
        signOutBtn.addEventListener('click', async function () {
            await clearCredentials();
            state.credentials = null;
            state.currentUser = null;
            renderLogin();
        });
        view.appendChild(el('div', { style: 'height:16px' }));
        view.appendChild(signOutBtn);

        try {
            var info = await JourneyToApi.getSiteInfo();
            siteCard.innerHTML = '';
            siteCard.appendChild(el('div', { class: 'section-label', text: 'Connected site' }));

            var avatarRow = el('div', { class: 'avatar-row' }, [
                info && info.site_icon_url
                    ? el('img', { class: 'avatar', src: info.site_icon_url })
                    : el('div', { class: 'avatar' }),
                el('div', {}, [
                    el('div', { class: 'post-title', text: (info && info.site_name) || state.credentials.siteUrl }),
                    el('div', { class: 'post-meta' }, [el('span', { text: state.credentials.username })]),
                ]),
            ]);
            siteCard.appendChild(avatarRow);

            var links = (info && info.social_links) || {};
            var linkKeys = Object.keys(links).filter(function (k) { return links[k]; });
            if (linkKeys.length) {
                var socialRow = el('div', { class: 'social-row' });
                linkKeys.forEach(function (key) {
                    var a = el('a', {
                        class: 'social-icon',
                        href: links[key],
                        target: '_blank',
                        rel: 'noopener',
                        text: SOCIAL_INITIALS[key] || key.charAt(0).toUpperCase(),
                        title: SOCIAL_LABELS[key] || key,
                    });
                    socialRow.appendChild(a);
                });
                siteCard.appendChild(el('div', { class: 'section-label', style: 'margin-top:16px', text: 'Follow us' }));
                siteCard.appendChild(socialRow);
            } else {
                siteCard.appendChild(el('p', { class: 'hint', style: 'margin-top:12px', text: 'Install the AutoPoster Companion plugin and add social links under Settings → AutoPoster Companion to show them here.' }));
            }
        } catch (e) {
            siteCard.innerHTML = '';
            siteCard.appendChild(el('div', { class: 'section-label', text: 'Connected site' }));
            siteCard.appendChild(el('p', { text: state.credentials.siteUrl }));
        }
    }

    // ── Boot ─────────────────────────────────────────────────────

    (async function boot() {
        var saved = await loadCredentials();
        if (saved) {
            JourneyToApi.configure(saved.siteUrl, saved.username, saved.appPassword);
            try {
                state.currentUser = await JourneyToApi.verifyLogin();
                state.credentials = saved;
                tabbar.style.display = 'flex';
                setActiveTab('posts');
                renderPosts();
                return;
            } catch (e) {
                await clearCredentials();
            }
        }
        renderLogin();
    })();
})();
