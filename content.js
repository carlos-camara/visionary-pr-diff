/**
 * Visionary PR Diff — v25 (Binary-Stream Fix)
 */

(function () {
    'use strict';
    let isIframe = false;
    try { isIframe = window.self !== window.top; } catch (e) { isIframe = true; }

    if (!isIframe && window.location.hostname === 'github.com') return;

    console.log(`[VPD] v25 Init: ${window.location.hostname}`);

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
        activate3Up();
    };

    const calculateStats = (ctx, w, h) => {
        if (!ctx || w === 0 || h === 0) return { diff: 0, pct: "0.00" };
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
            return { diff: 0, pct: "0.00" };
        }
    };

    const syncTabSelection = () => {
        const fieldset = document.querySelector('fieldset, .view-modes fieldset');
        if (!fieldset) return;
        fieldset.querySelectorAll('label, .js-view-mode-item').forEach(label => {
            const input = label.querySelector('input');
            if (input) {
                if (input.checked) label.classList.add('selected');
                else label.classList.remove('selected');
            }
        });
    };

    const setup3Up = () => {
        const fieldset = document.querySelector('fieldset, .view-modes fieldset');
        if (!fieldset) return;

        // 1. Hook into native radio changes for perfect sync
        if (!fieldset.dataset.vpdObserved) {
            fieldset.dataset.vpdObserved = "true";
            fieldset.addEventListener('change', (e) => {
                const val = e.target.value;
                if (val === 'three-up') activate3Up();
                else deactivate3Up();

                // Ensure selection highlight follows the radio check
                syncTabSelection();
            });
        }

        if (fieldset.querySelector('.vpd-3up-tab')) {
            syncTabSelection(); // Keep existing tab sync checked
            return;
        }

        // 2. Add our tab as a native radio item
        const tab = document.createElement('label');
        tab.className = 'js-view-mode-item vpd-3up-tab';
        tab.innerHTML = '<input type="radio" value="three-up" name="view-mode"> 3-up';
        fieldset.appendChild(tab);

        if (!window._vpdAutoTriggered) {
            window._vpdAutoTriggered = true;
            setTimeout(() => {
                const radio = tab.querySelector('input');
                if (radio) {
                    radio.checked = true;
                    activate3Up();
                    syncTabSelection();
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

    const activate3Up = async () => {
        const view = document.querySelector('.view, .image-diff, .two-up, .swipe');
        if (!view || view.dataset.vpdState === 'loading') return;

        const requestId = ++_currentRequestId;
        console.log(`[VPD] Request ${requestId}: Starting (Passive Mode)...`);
        view.dataset.vpdState = 'loading';

        // PASSIVE ISOLATION: Don't remove native classes.
        // Let CSS handle the neutralization via .three-up and .vpd-3up-active
        view.classList.add('three-up');
        document.body.classList.add('vpd-3up-active');

        // Note: We don't manually toggle .selected on labels anymore.
        // GitHub's native radio listener will handle that for us.

        // Anti-hang protection
        const hangTimer = setTimeout(() => {
            if (view.dataset.vpdState === 'loading' && requestId === _currentRequestId) {
                console.warn(`[VPD] Request ${requestId} hung.`);
                view.dataset.vpdState = 'idle';
                setStatus(diffShell, 'Sync Timeout. Please Retry.', true);
            }
        }, 20000);

        let diffShell = view.querySelector('.vpd-diff-shell');
        if (!diffShell) {
            diffShell = document.createElement('div');
            diffShell.className = 'shell vpd-diff-shell';
            diffShell.innerHTML = `
                <span class="frame-label">Visionary Diff</span>
                <div class="vpd-diff-frame"><div class="vpd-loader" style="padding:40px;text-align:center;font-size:12px;color:#8b949e;">Initialing...</div></div>
                <div class="vpd-stats-card">...</div>
            `;
            const firstNativeShell = view.querySelector('.shell');
            if (firstNativeShell) firstNativeShell.after(diffShell);
            else view.appendChild(diffShell);
        }

        setStatus(diffShell, 'Waiting for source images...');

        // Resilient Image Discovery
        const findImg = (label) => {
            const el = [...document.querySelectorAll('.shell')].find(s => s.textContent.toLowerCase().includes(label.toLowerCase()));
            return el?.querySelector('img') || document.querySelector(`.js-image-diff img[alt*="${label}"]`);
        };

        const imgA = findImg('Deleted') || findImg('Before') || view.querySelectorAll('img')[0];
        const imgB = findImg('Added') || findImg('After') || view.querySelectorAll('img')[1];

        if (!imgA || !imgB) {
            setStatus(diffShell, 'Error: Source images not found.', true);
            view.dataset.vpdState = 'error';
            clearTimeout(hangTimer);
            return;
        }

        // Ensure images are ready
        const ready = await Promise.all([waitForImage(imgA), waitForImage(imgB)]);
        if (requestId !== _currentRequestId) return;

        if (!ready[0] || !ready[1]) {
            console.warn('[VPD] Target images failed to signal readiness.');
        }

        if (!imgA?.src || !imgB?.src || imgA.src.startsWith('data:')) {
            console.warn('[VPD] Invalid image sources.');
            setStatus(diffShell, 'Error: Invalid image sources.', true);
            view.dataset.vpdState = 'idle';
            clearTimeout(hangTimer);
            return;
        }

        try {
            if (!chrome.runtime?.id) throw new Error('Refresh GitHub to re-connect.');
            if (!window.VisionaryDiffEngine) throw new Error('Engine missing');

            setStatus(diffShell, 'Streaming pixels...');
            const urlA = new URL(imgA.getAttribute('src'), window.location.href).href;
            const urlB = new URL(imgB.getAttribute('src'), window.location.href).href;

            const { canvas, imgB: decodedImgB } = await window.VisionaryDiffEngine.compareImages(urlA, urlB);

            if (requestId !== _currentRequestId) return;
            clearTimeout(hangTimer); // Success!

            // Track for cleanup
            window._vpdUrls = window._vpdUrls || [];
            if (decodedImgB.src.startsWith('blob:')) window._vpdUrls.push(decodedImgB.src);

            const frame = diffShell.querySelector('.vpd-diff-frame');
            frame.innerHTML = '';

            // Sync aspect ratio
            const aspect = canvas.width / canvas.height;
            frame.style.aspectRatio = aspect.toString();

            // Background Ghost
            const ghost = document.createElement('img');
            ghost.src = decodedImgB.src;
            ghost.className = 'vpd-diff-bg';
            frame.appendChild(ghost);

            // Diff Pixels
            canvas.className = 'vpd-canvas-main';
            frame.appendChild(canvas);

            setStatus(diffShell, 'Calculating stats...');
            const stats = calculateStats(canvas.getContext('2d'), canvas.width, canvas.height);
            diffShell.querySelector('.vpd-stats-card').innerHTML = `
                Change: <b>${stats.pct}%</b> | Delta: <b>${stats.diff.toLocaleString()}</b> px
            `;
            view.dataset.vpdState = 'active';
            console.log(`[VPD] Request ${requestId} complete.`);
        } catch (e) {
            clearTimeout(hangTimer);
            if (requestId === _currentRequestId) {
                console.error(`[VPD] Request ${requestId} failed:`, e);
                const isContextError = e.message.includes('refresh');
                const frame = diffShell.querySelector('.vpd-diff-frame');
                if (frame) {
                    frame.innerHTML = `
                        <div style="padding:40px; text-align:center;">
                            <div style="color:#f85149; font-size:13px; margin-bottom:10px; font-weight:600;">
                                ${e.message}
                            </div>
                            ${isContextError ? '<button onclick="window.location.reload()" style="background:#238636; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:600;">Refrescar Página</button>' : ''}
                        </div>
                    `;
                }
                view.dataset.vpdState = 'error';
            }
        }
    };

    const deactivate3Up = () => {
        _currentRequestId++; // Cancel any active analysis
        document.body.classList.remove('vpd-3up-active');
        document.querySelectorAll('[data-vpd-state]').forEach(el => {
            el.dataset.vpdState = 'inactive';
            el.classList.remove('three-up');
        });
        document.querySelectorAll('.vpd-diff-shell').forEach(s => s.remove());

        // Cleanup ObjectURLs
        if (window._vpdUrls) {
            window._vpdUrls.forEach(url => URL.revokeObjectURL(url));
            window._vpdUrls = [];
        }
    };

    setInterval(setup3Up, 1000);
})();
