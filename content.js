/**
 * Visionary PR Diff — v26 (Instance Isolation & Shell Restoration)
 * Standardized for all GitHub Image Diff modes (2-up, Swipe, Onion Skin)
 */

(function () {
    'use strict';
    let isIframe = false;
    try { isIframe = window.self !== window.top; } catch (e) { isIframe = true; }

    // Keep active in iframes but only if on github domain
    if (!isIframe && window.location.hostname === 'github.com') return;

    console.log(`[VPD] v26 Core (Isolated): ${window.location.hostname}`);

    const TAB_MAP = {
        'two-up': '2-up',
        'swipe': 'Swipe',
        'onion-skin': 'Onion Skin',
        'three-up': '3-up'
    };

    const setStatus = (diffShell, text, isError = false) => {
        const loader = diffShell?.querySelector('.vpd-loader');
        if (loader) {
            loader.innerHTML = isError
                ? `<div style="color:#f85149; font-weight:600;">${text}</div><button onclick="window._vpdRetry(this)" style="margin-top:10px; background:#238636; color:white; border:none; padding:4px 12px; border-radius:4px; cursor:pointer;">Retry</button>`
                : text;
        }
    };

    window._vpdRetry = (btn) => {
        const view = btn.closest('.image-diff, .view');
        if (view) {
            view.dataset.vpdState = 'idle';
            activate3Up(view);
        }
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
        fieldset.querySelectorAll('label, .js-view-mode-item, button').forEach(tab => {
            const input = tab.querySelector('input') ||
                fieldset.querySelector(`input#${tab.getAttribute('for')}`);

            let val = '';
            if (input) val = input.value;
            else {
                // Heuristic for button-based tabs
                const text = tab.textContent.trim().toLowerCase();
                val = Object.keys(TAB_MAP).find(k => TAB_MAP[k].toLowerCase() === text) || text;
            }

            // Get current selected value from radio or attributes
            const currentVal = fieldset.querySelector('input:checked')?.value ||
                fieldset.dataset.viewMode;

            if (val === currentVal || (val === 'three-up' && fieldset.closest('.image-diff')?.classList.contains('three-up'))) {
                tab.classList.add('selected');
            } else {
                tab.classList.remove('selected');
            }
        });
    };

    const setup3Up = (container) => {
        const fieldset = container.querySelector('fieldset, .view-modes fieldset, .js-image-diff-tabs fieldset');
        if (!fieldset) return;

        if (!fieldset.dataset.vpdObserved) {
            fieldset.dataset.vpdObserved = 'true';
            fieldset.addEventListener('change', (e) => {
                const val = e.target.value;
                const view = fieldset.closest('.image-diff, .view');
                fieldset.dataset.viewMode = val;
                if (val === 'three-up') activate3Up(view);
                else deactivate3Up(view);
                syncTabSelection(fieldset);
            });
        }

        if (fieldset.querySelector('.vpd-3up-tab')) {
            syncTabSelection(fieldset);
            return;
        }

        // Add 3-up tab
        const tab = document.createElement('label');
        tab.className = 'js-view-mode-item vpd-3up-tab';
        tab.innerHTML = '<input type="radio" value="three-up" name="view-mode"> 3-up';
        fieldset.appendChild(tab);

        // Auto-trigger logic
        if (!container.dataset.vpdAutoTriggered) {
            container.dataset.vpdAutoTriggered = 'true';
            setTimeout(() => {
                const radio = tab.querySelector('input');
                if (radio) {
                    radio.checked = true;
                    fieldset.dataset.viewMode = 'three-up';
                    activate3Up(container);
                    syncTabSelection(fieldset);
                }
            }, 500);
        }
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

        const requestId = Date.now();
        view.dataset.vpdRequestId = requestId.toString();
        view.dataset.vpdState = 'loading';

        console.log(`[VPD] Request ${requestId}: Activating...`);

        // DYNAMIC SHELL MANAGEMENT: 
        // If we only have ONE shell (Swipe mode), we need to handle image discovery differently
        const nativeShells = [...view.querySelectorAll('.shell:not(.vpd-diff-shell)')];

        view.classList.add('three-up');
        document.body.classList.add('vpd-3up-active');

        let diffShell = view.querySelector('.vpd-diff-shell');
        if (!diffShell) {
            diffShell = document.createElement('div');
            diffShell.className = 'shell vpd-diff-shell';
            diffShell.innerHTML = `
                <span class="frame-label">Visionary Diff</span>
                <div class="vpd-diff-frame"><div class="vpd-loader" style="padding:40px;text-align:center;font-size:12px;color:#8b949e;">Detecting Pixels...</div></div>
                <div class="vpd-stats-card">...</div>
            `;
            const anchor = nativeShells[nativeShells.length - 1];
            if (anchor) anchor.after(diffShell);
            else view.appendChild(diffShell);
        }

        setStatus(diffShell, 'Searching for image targets...');

        // Improved Discovery
        let imgA, imgB;
        if (nativeShells.length === 1) {
            // Swipe mode: images are siblings or layered in one shell
            const imgs = nativeShells[0].querySelectorAll('img');
            imgA = imgs[0];
            imgB = imgs[1];
        } else {
            // 2-up mode: images are in separate shells
            const findImgInShell = (label) => {
                const shell = nativeShells.find(s => s.textContent.toLowerCase().includes(label.toLowerCase()));
                return shell?.querySelector('img');
            };
            imgA = findImgInShell('Deleted') || findImgInShell('Before') || nativeShells[0]?.querySelector('img');
            imgB = findImgInShell('Added') || findImgInShell('After') || nativeShells[1]?.querySelector('img');
        }

        if (!imgA || !imgB) {
            setStatus(diffShell, 'Error: Failed to isolate images.', true);
            view.dataset.vpdState = 'error';
            return;
        }

        await Promise.all([waitForImage(imgA), waitForImage(imgB)]);
        if (view.dataset.vpdRequestId !== requestId.toString()) return;

        try {
            if (!chrome.runtime?.id) throw new Error('Refrescar Página (Connection Lost)');
            if (!window.VisionaryDiffEngine) throw new Error('Engine Inactivo');

            setStatus(diffShell, 'Streaming binary data...');
            const urlA = new URL(imgA.getAttribute('src'), window.location.href).href;
            const urlB = new URL(imgB.getAttribute('src'), window.location.href).href;

            const { canvas, imgB: decodedImgB } = await window.VisionaryDiffEngine.compareImages(urlA, urlB);

            if (view.dataset.vpdRequestId !== requestId.toString()) return;

            const frame = diffShell.querySelector('.vpd-diff-frame');
            frame.innerHTML = '';
            frame.style.aspectRatio = (canvas.width / canvas.height).toString();

            const ghost = document.createElement('img');
            ghost.src = decodedImgB.src;
            ghost.className = 'vpd-diff-bg';
            frame.appendChild(ghost);

            canvas.className = 'vpd-canvas-main';
            frame.appendChild(canvas);

            const stats = calculateStats(canvas.getContext('2d'), canvas.width, canvas.height);
            diffShell.querySelector('.vpd-stats-card').innerHTML = `
                DIFF: <b>${stats.pct}%</b> | PIXELS: <b>${stats.diff.toLocaleString()}</b>
            `;
            view.dataset.vpdState = 'active';
        } catch (e) {
            if (view.dataset.vpdRequestId === requestId.toString()) {
                console.error(`[VPD] Failure:`, e);
                setStatus(diffShell, e.message, true);
                view.dataset.vpdState = 'error';
            }
        }
    };

    const deactivate3Up = (view) => {
        if (!view) return;
        view.dataset.vpdRequestId = '0';
        view.dataset.vpdState = 'idle';
        view.classList.remove('three-up');

        const shell = view.querySelector('.vpd-diff-shell');
        if (shell) shell.remove();

        const allActive = document.querySelectorAll('.three-up');
        if (allActive.length === 0) {
            document.body.classList.remove('vpd-3up-active');
        }
    };

    const scan = () => {
        document.querySelectorAll('.image-diff, .view').forEach(setup3Up);
    };

    setInterval(scan, 1000);
})();
