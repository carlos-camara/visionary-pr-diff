/**
 * Visionary PR Diff — v28 (Final Architecture Overhaul)
 */

(function () {
    'use strict';
    let isIframe = false;
    try { isIframe = window.self !== window.top; } catch (e) { isIframe = true; }

    // console.log(`[VPD] v28 Init: ${window.location.hostname} (Iframe: ${isIframe})`);

    console.log(`[VPD] v28 Init: ${window.location.hostname}`);

    let _currentRequestId = 0;

    const setStatus = (diffShell, text, isError = false) => {
        const loader = diffShell?.querySelector('.vpd-loader');
        if (loader) {
            loader.innerHTML = isError
                ? `<div style="color:#f85149; font-weight:600;">${text}</div><button onclick="window._vpdRetry()" style="margin-top:10px; background:#238636; color:white; border:none; padding:4px 12px; border-radius:4px; cursor:pointer;">Retry</button>`
                : text;
        }
    };

    window._vpdRetry = () => {
        document.querySelectorAll('[data-vpd-state]').forEach(el => el.dataset.vpdState = 'idle');
    };

    const calculateStats = (ctx, w, h) => {
        if (!ctx || w === 0 || h === 0) return { diff: 0, pct: '0.00' };
        try {
            const data = ctx.getImageData(0, 0, w, h).data;
            let diff = 0;
            const total = data.length / 4;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i] === 255 && data[i + 2] === 255) diff++;
            }
            return { diff, pct: (diff / total * 100).toFixed(2) };
        } catch (e) {
            console.warn('[VPD] Stats failed:', e);
            return { diff: 0, pct: '0.00' };
        }
    };

    const syncTabSelection = (fieldset) => {
        if (!fieldset) return;
        fieldset.querySelectorAll('label, .js-view-mode-item').forEach(label => {
            const radio = label.querySelector('input[type="radio"]');
            if (radio?.checked) {
                label.classList.add('selected');
                label.setAttribute('aria-selected', 'true');
            } else {
                label.classList.remove('selected');
                label.setAttribute('aria-selected', 'false');
            }
        });
    };

    const pierceShadowShield = (view) => {
        if (!view || !view.shadowRoot) return;

        let style = view.shadowRoot.querySelector('#vpd-shadow-shield');
        if (!style) {
            style = document.createElement('style');
            style.id = 'vpd-shadow-shield';
            view.shadowRoot.appendChild(style);
        }

        style.textContent = `
            :host(.vpd-active) :has(> .shell) {
                display: contents !important;
            }
            :host(.vpd-active) .handle, 
            :host(.vpd-active) .swipe-bar, 
            :host(.vpd-active) .divider, 
            :host(.vpd-active) .drag-handle, 
            :host(.vpd-active) .swipe-handle, 
            :host(.vpd-active) .js-drag-handle {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
                height: 0 !important;
                width: 0 !important;
                overflow: hidden !important;
            }
        `;
    };

    const reconcileViewMode = (view, val, fieldset = null) => {
        if (!view) return;

        // Apply unified height tag for all "complex" views (Swipe, Onion, 3-up)
        // 2-up is excluded so it can grow naturally to full content height.
        if (['three-up', 'swipe', 'onion-skin'].includes(val)) {
            view.classList.add('vpd-unified-view');
        } else {
            view.classList.remove('vpd-unified-view');
        }

        if (val === 'three-up') {
            view.classList.remove('swipe', 'onion-skin');
            view.classList.add('three-up', 'vpd-active');
            pierceShadowShield(view);
            activate3Up(view);
            startPersistentCleanup(view);
        } else {
            view.classList.remove('three-up', 'vpd-active');
            deactivate3Up(view);
            stopPersistentCleanup(view);
        }
    };

    const deactivate3Up = (view) => {
        if (!view) return;
        view.dataset.vpdState = 'inactive';
        view.querySelectorAll('.vpd-3up-container').forEach(c => c.remove());

        // Flush inline styles added during activate3Up
        view.style.height = '';
        view.style.maxHeight = '';
        view.style.minHeight = '';

        if (view._vpdUrls) {
            view._vpdUrls.forEach(url => URL.revokeObjectURL(url));
            view._vpdUrls = [];
        }
    };

    const startPersistentCleanup = (view) => {
        if (view._vpdObserver) return;
        const cleanup = () => pierceShadowShield(view);
        view._vpdObserver = new MutationObserver(cleanup);
        view._vpdObserver.observe(view, { childList: true, subtree: true, attributes: true });
        cleanup();
    };

    const stopPersistentCleanup = (view) => {
        if (view._vpdObserver) {
            view._vpdObserver.disconnect();
            delete view._vpdObserver;
        }
    };

    const setup3Up = () => {
        const fieldsets = document.querySelectorAll('fieldset, .view-modes fieldset');

        fieldsets.forEach(fieldset => {
            if (fieldset.querySelector('.vpd-3up-tab')) {
                syncTabSelection(fieldset);
                return;
            }

            let view = fieldset.closest('.js-file, .file')?.querySelector('.view, .image-diff, image-diff')
                || fieldset.parentElement?.querySelector('.view, .image-diff, image-diff')
                || document.querySelector('.view, .image-diff, image-diff');

            if (!view) return;

            const fileWrapper = fieldset.closest('.js-file, .file');
            if (fileWrapper) {
                fileWrapper.classList.add('vpd-initialized');

                // Detect initial active view mode and apply unified height tag
                const activeInput = fieldset.querySelector('input[type="radio"]:checked');
                const initialMode = activeInput?.value;
                if (['swipe', 'onion-skin', 'three-up'].includes(initialMode)) {
                    view.classList.add('vpd-unified-view');
                    // Remove inline styles so CSS var takes over
                    view.style.height = '';
                    view.style.maxHeight = '';
                    view.style.minHeight = '';
                } else {
                    // 2-up or unknown: let it grow freely
                    view.classList.remove('vpd-unified-view');
                    view.style.height = 'auto';
                    view.style.maxHeight = 'none';
                    view.style.minHeight = '';
                    view.style.overflow = 'visible';
                }
            }

            if (!fieldset.dataset.vpdObserved) {
                fieldset.dataset.vpdObserved = 'true';
                fieldset.addEventListener('change', (e) => {
                    if (e.target.name !== 'view-mode') return;
                    const dynamicView = fieldset.closest('.js-file, .file')?.querySelector('.view, .image-diff, image-diff')
                        || fieldset.parentElement?.querySelector('.view, .image-diff, image-diff')
                        || view;
                    reconcileViewMode(dynamicView, e.target.value, fieldset);
                    syncTabSelection(fieldset);
                });
            }

            const tab = document.createElement('label');
            tab.className = 'js-view-mode-item vpd-3up-tab';
            tab.innerHTML = '<input type="radio" value="three-up" name="view-mode"> 3-up';
            fieldset.appendChild(tab);
        });
    };

    const waitForImage = async (img, timeout = 5000) => {
        if (img.complete && img.naturalWidth !== 0) return true;
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(false), timeout);
            const onFull = () => { clearTimeout(timer); resolve(true); };
            img.addEventListener('load', onFull, { once: true });
            img.addEventListener('error', onFull, { once: true });
        });
    };

    const activate3Up = async (view) => {
        if (!view || view.dataset.vpdState === 'loading') return;

        // Force-clear inline heights that might be set by GitHub's Swipe/Onion logic
        view.style.height = 'auto';
        view.style.maxHeight = 'none';
        view.style.minHeight = '500px';

        const requestId = ++_currentRequestId;
        view.dataset.vpdState = 'loading';

        const hangTimer = setTimeout(() => {
            if (view.dataset.vpdState === 'loading' && requestId === _currentRequestId) {
                view.dataset.vpdState = 'idle';
                const diffShell = view.querySelector('.vpd-diff-shell');
                if (diffShell) setStatus(diffShell, 'Sync Timeout. Please Retry.', true);
            }
        }, 20000);

        let container = view.querySelector('.vpd-3up-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'vpd-3up-container';

            const sparkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`;

            container.innerHTML = `
                <div class="shell" data-vpd-type="deleted">
                    <img class="vpd-source-img" src="" alt="Deleted">
                    <span class="vpd-shell-badge vpd-shell-badge--deleted">Deleted</span>
                </div>
                <div class="shell" data-vpd-type="added">
                    <img class="vpd-source-img" src="" alt="Added">
                    <span class="vpd-shell-badge vpd-shell-badge--added">Added</span>
                </div>
                <div class="vpd-diff-shell">
                    <div class="frame-label vpd-premium-label">${sparkIcon} <span>Visionary Diff</span></div>
                    <div class="vpd-diff-frame">
                        <div class="vpd-loader-container">
                            <div class="vpd-skeleton-rect"></div>
                            <div class="vpd-skeleton-rect" style="width: 60%"></div>
                            <div class="vpd-loader" style="margin-top:20px; font-size:12px; color:#8b949e; font-family:monospace;">INITIALIZING PIXELS...</div>
                        </div>
                    </div>
                </div>
                <div class="vpd-stats-card"></div>
            `;
            view.appendChild(container);
        }

        const diffShell = container.querySelector('.vpd-diff-shell');
        setStatus(diffShell, 'Waiting for source images...');

        const findImg = (label) => {
            if (view.shadowRoot) {
                return [...view.shadowRoot.querySelectorAll('img:not(.vpd-source-img)')].find(img =>
                    img.alt?.toLowerCase().includes(label.toLowerCase()) ||
                    img.closest('.shell')?.textContent.toLowerCase().includes(label.toLowerCase())
                );
            }
            const el = [...view.querySelectorAll('.shell:not(.vpd-3up-container .shell)')].find(s => s.textContent.toLowerCase().includes(label.toLowerCase()));
            return el?.querySelector('img:not(.vpd-source-img)');
        };

        const imgA = findImg('Deleted') || findImg('Before') || view.shadowRoot?.querySelectorAll('img:not(.vpd-source-img)')[0] || [...view.querySelectorAll('img:not(.vpd-source-img)')][0];
        const imgB = findImg('Added') || findImg('After') || view.shadowRoot?.querySelectorAll('img:not(.vpd-source-img)')[1] || [...view.querySelectorAll('img:not(.vpd-source-img)')][1];

        if (!imgA || !imgB) {
            setStatus(diffShell, 'Error: Source images not found.', true);
            view.dataset.vpdState = 'error';
            clearTimeout(hangTimer);
            return;
        }

        container.querySelector('.shell[data-vpd-type="deleted"] img').src = imgA.src;
        container.querySelector('.shell[data-vpd-type="added"] img').src = imgB.src;

        await Promise.all([waitForImage(imgA), waitForImage(imgB)]);
        if (requestId !== _currentRequestId) return;

        try {
            if (!chrome.runtime?.id) throw new Error('Refresh GitHub to re-connect.');
            if (!window.VisionaryDiffEngine) throw new Error('Engine missing');

            setStatus(diffShell, 'Streaming pixels...');
            const urlA = new URL(imgA.getAttribute('src'), window.location.href).href;
            const urlB = new URL(imgB.getAttribute('src'), window.location.href).href;

            const { canvas, imgB: decodedImgB } = await window.VisionaryDiffEngine.compareImages(urlA, urlB);

            if (requestId !== _currentRequestId) return;
            clearTimeout(hangTimer);

            view._vpdUrls = view._vpdUrls || [];
            if (decodedImgB.src.startsWith('blob:')) view._vpdUrls.push(decodedImgB.src);

            const frame = diffShell.querySelector('.vpd-diff-frame');
            frame.innerHTML = '';
            frame.style.aspectRatio = (canvas.width / canvas.height).toString();

            const ghost = document.createElement('img');
            ghost.src = decodedImgB.src;
            ghost.className = 'vpd-diff-bg';
            frame.appendChild(ghost);

            canvas.className = 'vpd-canvas-main';
            frame.appendChild(canvas);

            setStatus(diffShell, 'Calculating stats...');
            const stats = calculateStats(canvas.getContext('2d'), canvas.width, canvas.height);
            const statsCard = container.querySelector('.vpd-stats-card');
            if (statsCard) {
                statsCard.innerHTML = `<span>CHANGE</span> <b>${stats.pct}%</b> <span style="margin-left:8px; opacity:0.5;">|</span> <span>DELTA</span> <b>${stats.diff.toLocaleString()}</b> <span style="font-size:10px; opacity:0.6;">px</span>`;
            }
            view.dataset.vpdState = 'active';
        } catch (e) {
            clearTimeout(hangTimer);
            if (requestId === _currentRequestId) {
                console.error('[VPD] Failed:', e);
                const frame = diffShell.querySelector('.vpd-diff-frame');
                if (frame) {
                    frame.innerHTML = `<div style="padding:40px; text-align:center;"><div style="color:#f85149; font-size:13px; margin-bottom:10px; font-weight:600;">${e.message}</div></div>`;
                }
                view.dataset.vpdState = 'error';
            }
        }
    };

    setInterval(setup3Up, 1000);
})();
