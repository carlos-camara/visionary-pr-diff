/**
 * Visionary PR Diff — v26 (Multi-Diff Support)
 */

(function () {
    'use strict';
    let isIframe = false;
    try { isIframe = window.self !== window.top; } catch (e) { isIframe = true; }

    if (!isIframe && window.location.hostname === 'github.com') return;

    console.log(`[VPD] v26 Init: ${window.location.hostname}`);

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
            .handle, .swipe-bar, .swipe-container, .onion-skin-container, .divider, .drag-handle, .swipe-handle, .js-drag-handle {
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

    const reconcileViewMode = (view, val) => {
        if (!view) return;

        if (val === 'three-up') {
            // ── Measure BEFORE our CSS kicks in ──────────────────────────────
            // The view is still in native (Onion Skin / 2-up) layout so its
            // bounding rect reflects the real available content area.
            const rect = view.getBoundingClientRect();
            document.documentElement.style.setProperty('--vpd-view-top', rect.top + 'px');
            document.documentElement.style.setProperty('--vpd-view-height', rect.height + 'px');
            document.documentElement.style.setProperty('--vpd-view-left', rect.left + 'px');
            document.documentElement.style.setProperty('--vpd-view-width', rect.width + 'px');
            // ─────────────────────────────────────────────────────────────────

            // ── Apply dimensions as inline styles (highest priority) ──────────
            // CSS variables can lose to GitHub's own !important rules; inline
            // styles with !important always win.
            view.style.setProperty('position', 'fixed', 'important');
            view.style.setProperty('top', rect.top + 'px', 'important');
            view.style.setProperty('left', '0', 'important');
            view.style.setProperty('width', '100vw', 'important');
            view.style.setProperty('height', rect.height + 'px', 'important');
            view.style.setProperty('z-index', '9999', 'important');
            // ─────────────────────────────────────────────────────────────────

            // Remove native active classes visually, though Ghost 2-up should handle functionality
            view.classList.remove('swipe', 'onion-skin');
            view.classList.add('three-up', 'vpd-active');

            // Fallback Light DOM cleanup just in case GitHub misses something
            view.querySelectorAll('.swipe-container, .onion-skin-container, .swipe-bar, .handle, .swipe-handle, .js-drag-handle').forEach(el => {
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('visibility', 'hidden', 'important');
            });

            // Re-apply secondary shadow shield
            pierceShadowShield(view);
            activate3Up(view);
            startPersistentCleanup(view);
        } else {
            // User selected 2-up, Swipe, or Onion natively.
            // Reset inline styles we applied, then remove our classes.
            ['position', 'top', 'left', 'width', 'height', 'z-index'].forEach(p => view.style.removeProperty(p));
            // DO NOT FIGHT GITHUB'S DOM. Just remove our classes.
            view.classList.remove('three-up', 'vpd-active');
            deactivate3Up(view);
            stopPersistentCleanup(view);
        }
    };

    const startPersistentCleanup = (view) => {
        if (view._vpdObserver) return;

        const cleanup = () => {
            pierceShadowShield(view);
            view.querySelectorAll('.swipe-container, .onion-skin-container, .swipe-bar, .handle, .swipe-handle, .js-drag-handle').forEach(el => {
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('visibility', 'hidden', 'important');
            });
        };

        view._vpdObserver = new MutationObserver(cleanup);
        view._vpdObserver.observe(view, { childList: true, subtree: true, attributes: true });

        // Also run immediately
        cleanup();
    };

    const stopPersistentCleanup = (view) => {
        if (view._vpdObserver) {
            view._vpdObserver.disconnect();
            delete view._vpdObserver;
        }
    };

    const setup3Up = () => {
        // More resilient discovery: Start from fieldsets
        const fieldsets = document.querySelectorAll('fieldset, .view-modes fieldset');

        fieldsets.forEach(fieldset => {
            if (fieldset.querySelector('.vpd-3up-tab')) {
                syncTabSelection(fieldset);
                return;
            }

            // Find view relative to fieldset (supports both PR diffs and single file views)
            let view = fieldset.closest('.js-file, .file')?.querySelector('.view, .image-diff, image-diff')
                || fieldset.parentElement?.querySelector('.view, .image-diff, image-diff')
                || document.querySelector('.view, .image-diff, image-diff'); // Fallback for isolated views

            if (!view) return;

            // 1. Hook into native radio changes
            if (!fieldset.dataset.vpdObserved) {
                fieldset.dataset.vpdObserved = 'true';
                fieldset.addEventListener('change', (e) => {
                    if (e.target.name !== 'view-mode') return;
                    if (fieldset.dataset.vpdIgnore) return;

                    const val = e.target.value;

                    if (val === 'three-up') {
                        // THE GHOST 2-UP TRICK: Proxy through native 2-up to trigger pristine cleanup
                        const twoUpRadio = fieldset.querySelector('input[value="2-up"], input[value="two-up"]');
                        if (twoUpRadio) {
                            fieldset.dataset.vpdIgnore = 'true';
                            twoUpRadio.checked = true;
                            twoUpRadio.dispatchEvent(new Event('change', { bubbles: true })); // Trigger native cleanup

                            // Restore our physical radio state visually
                            e.target.checked = true;
                            delete fieldset.dataset.vpdIgnore;
                        }

                        reconcileViewMode(view, 'three-up');
                    } else {
                        // Native mode selected. Hand control back entirely.
                        reconcileViewMode(view, val);
                    }
                    syncTabSelection(fieldset);
                });
            }

            // 2. Add our tab as a native radio item
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

        const requestId = ++_currentRequestId;
        view.dataset.vpdState = 'loading';

        const hangTimer = setTimeout(() => {
            if (view.dataset.vpdState === 'loading' && requestId === _currentRequestId) {
                view.dataset.vpdState = 'idle';
                if (diffShell) setStatus(diffShell, 'Sync Timeout. Please Retry.', true);
            }
        }, 20000);

        let diffShell = view.querySelector('.vpd-diff-shell');
        if (!diffShell) {
            diffShell = document.createElement('div');
            diffShell.className = 'shell vpd-diff-shell';

            // Premium Iconography
            const sparkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`;

            diffShell.innerHTML = `
                <div class="frame-label vpd-premium-label">${sparkIcon} <span>Visionary Diff</span></div>
                <div class="vpd-diff-frame">
                    <div class="vpd-loader-container">
                        <div class="vpd-skeleton-rect"></div>
                        <div class="vpd-skeleton-rect" style="width: 60%"></div>
                        <div class="vpd-loader" style="margin-top:20px; font-size:12px; color:#8b949e; font-family:monospace;">INITIALIZING PIXELS...</div>
                    </div>
                </div>
                <div class="vpd-stats-card">...</div>
            `;
            const firstNativeShell = view.querySelector('.shell');
            if (firstNativeShell) firstNativeShell.after(diffShell);
            else view.appendChild(diffShell);
        }

        setStatus(diffShell, 'Waiting for source images...');

        const findImg = (label, type) => {
            if (view.shadowRoot) {
                const shadowImg = [...view.shadowRoot.querySelectorAll('img')].find(img =>
                    img.alt?.toLowerCase().includes(label.toLowerCase()) ||
                    img.closest('.shell')?.textContent.toLowerCase().includes(label.toLowerCase())
                );
                const shell = shadowImg?.closest('.shell');
                if (shell) {
                    shell.dataset.vpdType = type;
                    const lbl = shell.querySelector('.frame-label');
                    if (lbl) lbl.classList.add('vpd-premium-label');
                }
                if (shadowImg) return shadowImg;
            }
            const el = [...view.querySelectorAll('.shell')].find(s => s.textContent.toLowerCase().includes(label.toLowerCase()));
            if (el) {
                el.dataset.vpdType = type;
                const lbl = el.querySelector('.frame-label');
                if (lbl) lbl.classList.add('vpd-premium-label');
            }
            return el?.querySelector('img');
        };

        const imgA = findImg('Deleted', 'deleted') || findImg('Before', 'deleted') || view.shadowRoot?.querySelectorAll('img')[0] || view.querySelectorAll('img')[0];
        const imgB = findImg('Added', 'added') || findImg('After', 'added') || view.shadowRoot?.querySelectorAll('img')[1] || view.querySelectorAll('img')[1];

        if (!imgA || !imgB) {
            setStatus(diffShell, 'Error: Source images not found.', true);
            view.dataset.vpdState = 'error';
            clearTimeout(hangTimer);
            return;
        }

        const ready = await Promise.all([waitForImage(imgA), waitForImage(imgB)]);
        if (requestId !== _currentRequestId) return;

        if (!ready[0] || !ready[1]) {
            console.warn('[VPD] Target images failed to signal readiness.');
        }

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

            const aspect = canvas.width / canvas.height;
            frame.style.aspectRatio = aspect.toString();

            const ghost = document.createElement('img');
            ghost.src = decodedImgB.src;
            ghost.className = 'vpd-diff-bg';
            frame.appendChild(ghost);

            canvas.className = 'vpd-canvas-main';
            frame.appendChild(canvas);

            setStatus(diffShell, 'Calculating stats...');
            const stats = calculateStats(canvas.getContext('2d'), canvas.width, canvas.height);
            diffShell.querySelector('.vpd-stats-card').innerHTML = `
                <span>CHANGE</span> <b>${stats.pct}%</b> <span style="margin-left:8px; opacity:0.5;">|</span> <span>DELTA</span> <b>${stats.diff.toLocaleString()}</b> <span style="font-size:10px; opacity:0.6;">px</span>
            `;
            view.dataset.vpdState = 'active';
        } catch (e) {
            clearTimeout(hangTimer);
            if (requestId === _currentRequestId) {
                console.error(`[VPD] Failed:`, e);
                const isContextError = e.message.includes('refresh');
                const frame = diffShell.querySelector('.vpd-diff-frame');
                if (frame) {
                    frame.innerHTML = `<div style="padding:40px; text-align:center;"><div style="color:#f85149; font-size:13px; margin-bottom:10px; font-weight:600;">${e.message}</div></div>`;
                }
                view.dataset.vpdState = 'error';
            }
        }
    };

    const deactivate3Up = (view) => {
        if (!view) return;
        view.dataset.vpdState = 'inactive';
        if (view.shadowRoot) {
            const shield = view.shadowRoot.querySelector('#vpd-shadow-shield');
            if (shield) shield.remove();
        }
        view.querySelectorAll('.vpd-diff-shell').forEach(s => s.remove());
        if (view._vpdUrls) {
            view._vpdUrls.forEach(url => URL.revokeObjectURL(url));
            view._vpdUrls = [];
        }
    };

    setInterval(setup3Up, 1000);
})();
