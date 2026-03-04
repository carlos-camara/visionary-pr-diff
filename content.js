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

        style.textContent = \`
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
        \`;
    };

    const reconcileViewMode = (view, val, fieldset = null) => {
        if (!view) return;

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
            // Re-sync selection for native buttons
            if (fieldset) syncTabSelection(fieldset);
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
            if (fileWrapper) fileWrapper.classList.add('vpd-initialized');

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
            tab.innerHTML = \`<input type="radio" value="three-up" name="view-mode"> 3-up\`;
            fieldset.appendChild(tab);
            syncTabSelection(fieldset);
        });
    };

    const activate3Up = async (view) => {
        if (view.dataset.vpdState === 'active' || view.dataset.vpdState === 'loading') return;
        
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

            const sparkIcon = \`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>\`;

            container.innerHTML = \`
                <div class="shell" data-vpd-type="deleted">
                    <img class="vpd-source-img" src="" alt="Deleted">
                </div>
                <div class="shell" data-vpd-type="added">
                    <img class="vpd-source-img" src="" alt="Added">
                </div>
                <div class="vpd-diff-shell">
                    <div class="frame-label vpd-premium-label">\${sparkIcon} <span>Visionary Diff</span></div>
                    <div class="vpd-diff-frame">
                        <div class="vpd-loader-container">
                            <div class="vpd-skeleton-rect"></div>
                            <div class="vpd-loader">Analyzing regression pixels...</div>
                        </div>
                    </div>
                    <div class="vpd-stats-card"></div>
                </div>
            \`;
            view.appendChild(container);
        }

        const diffShell = container.querySelector('.vpd-diff-shell');
        const findImg = (alt) => {
            const el = [...view.querySelectorAll('img:not(.vpd-source-img)')].find(i => i.alt?.includes(alt));
            if (el) return el;
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

        const waitForImage = (img) => {
            if (img.complete) return Promise.resolve();
            return new Promise(res => img.onload = res);
        };

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
                statsCard.innerHTML = \`<span>CHANGE</span> <b>\${stats.pct}%</b> <span style="margin-left:8px; opacity:0.5;">|</span> <span>DELTA</span> <b>\${stats.diff.toLocaleString()}</b> <span style="font-size:10px; opacity:0.6;">px</span>\`;
            }
            view.dataset.vpdState = 'active';
        } catch (e) {
            clearTimeout(hangTimer);
            if (requestId === _currentRequestId) {
                console.error('[VPD] Failed:', e);
                const frame = diffShell.querySelector('.vpd-diff-frame');
                if (frame) {
                    frame.innerHTML = \`<div style="padding:40px; text-align:center;"><div style="color:#f85149; font-size:13px; margin-bottom:10px; font-weight:600;">\${e.message}</div></div>\`;
                }
                view.dataset.vpdState = 'error';
            }
        }
    };

    const proactiveGlobalExpansion = () => {
        // Find all potential image containers
        const containers = document.querySelectorAll('.view, .image-diff, .js-image-diff');
        containers.forEach(container => {
            const file = container.closest('.js-file, .file');
            if (file) file.classList.add('vpd-initialized');

            // Determine if we are in 2-up (natural) or an expanded mode (3-up, Swipe, Onion Skin)
            const is3Up = container.classList.contains('vpd-active');
            const isSwipe = container.classList.contains('swipe');
            const isOnion = container.classList.contains('onion-skin');
            const is2Up = !is3Up && !isSwipe && !isOnion;

            // FORCE AUTO HEIGHT on everything - this is the "un-shackling"
            if (container.style.height !== 'auto') container.style.height = 'auto';
            if (container.style.maxHeight !== 'none') container.style.maxHeight = 'none';
            if (container.style.overflow !== 'visible') container.style.overflow = 'visible';

            if (is2Up) {
                // 2-up: "Occupy the size it has" -> Clean auto height, no expansion forcing
                if (container.style.minHeight) container.style.minHeight = '';
            } else {
                // 3-up, Swipe, Onion skin: "Match Onion Skin size" -> Expanded & Tall
                // We use 500px as a baseline for the high-impact "Expanded" feel
                if (container.style.minHeight !== '500px') container.style.minHeight = '500px';
            }
        });
    };

    setInterval(() => {
        setup3Up();
        proactiveGlobalExpansion();
    }, 1000);
})();
