/**
 * Visionary PR Diff — v25 (Binary-Stream Fix)
 */

(function () {
    'use strict';
    let isIframe = false;
    try { isIframe = window.self !== window.top; } catch (e) { isIframe = true; }

    if (!isIframe && window.location.hostname === 'github.com') return;

    console.log(`[VPD] v25 Init: ${window.location.hostname}`);

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

    const setup3Up = () => {
        const fieldset = document.querySelector('fieldset, .view-modes fieldset');
        if (!fieldset) return;

        fieldset.querySelectorAll('label, .js-view-mode-item').forEach(l => {
            const txt = l.textContent.trim();
            if (txt === '2-up') l.style.display = 'none';
            if ((txt === 'Swipe' || txt === 'Onion Skin') && !l.dataset.vpdObserved) {
                l.dataset.vpdObserved = "true";
                l.addEventListener('mousedown', () => deactivate3Up(), true);
            }
        });

        if (fieldset.querySelector('.vpd-3up-tab')) return;

        const tab = document.createElement('label');
        tab.className = 'js-view-mode-item vpd-3up-tab';
        tab.innerHTML = '<input type="radio" value="three-up" name="view-mode"> 3-up';
        fieldset.appendChild(tab);

        tab.addEventListener('click', (e) => {
            e.preventDefault();
            activate3Up();
        });

        if (!window._vpdAutoTriggered) {
            window._vpdAutoTriggered = true;
            setTimeout(activate3Up, 500);
        }
    };

    const waitForImage = async (img, timeout = 5000) => {
        if (img.complete && img.naturalWidth !== 0) return true;
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(false), timeout);
            img.addEventListener('load', () => { clearTimeout(timer); resolve(true); }, { once: true });
            img.addEventListener('error', () => { clearTimeout(timer); resolve(false); }, { once: true });
        });
    };

    const activate3Up = async () => {
        const view = document.querySelector('.view, .image-diff, .two-up, .swipe, .onion-skin');
        if (!view || view.dataset.vpdState === 'active' || view.dataset.vpdState === 'loading') return;

        console.log('[VPD] Rendering 3-up view...');
        view.dataset.vpdState = 'loading';

        // Anti-hang protection
        const hangTimer = setTimeout(() => {
            if (view.dataset.vpdState === 'loading') {
                console.warn('[VPD] Render hang detected, resetting state.');
                view.dataset.vpdState = 'idle';
                const loader = view.querySelector('.vpd-loader');
                if (loader) loader.innerHTML = `<span style="color:#f85149">Sync Timeout. Click 3-up to retry.</span>`;
            }
        }, 15000);

        document.querySelectorAll('.js-view-mode-item, .vpd-3up-tab').forEach(t => t.classList.remove('selected'));
        const tab = document.querySelector('.vpd-3up-tab');
        if (tab) tab.classList.add('selected');

        document.body.classList.add('vpd-3up-active');
        view.classList.add('three-up');

        const shells = [...view.querySelectorAll('.shell')].filter(s => !s.classList.contains('vpd-diff-shell'));
        if (shells.length < 2) {
            view.dataset.vpdState = 'error';
            return;
        }

        const imgA = shells[0].querySelector('img');
        const imgB = shells[1].querySelector('img');

        // Ensure images are ready
        const ready = await Promise.all([waitForImage(imgA), waitForImage(imgB)]);
        if (!ready[0] || !ready[1]) {
            console.warn('[VPD] Target images failed to signal readiness.');
        }

        if (!imgA?.src || !imgB?.src || imgA.src.startsWith('data:')) {
            console.warn('[VPD] Invalid image sources.');
            view.dataset.vpdState = 'idle';
            clearTimeout(hangTimer);
            return;
        }

        let diffShell = view.querySelector('.vpd-diff-shell');
        if (!diffShell) {
            diffShell = document.createElement('div');
            diffShell.className = 'shell vpd-diff-shell';
            diffShell.innerHTML = `
                <span class="frame-label">Visionary Diff</span>
                <div class="vpd-diff-frame">
                    <div class="vpd-loader" style="padding:40px;text-align:center;font-size:12px;color:#8b949e;">
                        Syncing pixels...
                    </div>
                </div>
                <div class="vpd-stats-card">Analyzing...</div>
            `;
            shells[0].after(diffShell);
        }

        try {
            if (!chrome.runtime?.id) throw new Error('Extension updated. Please refresh GitHub.');
            if (!window.VisionaryDiffEngine) throw new Error('Engine missing');

            const urlA = new URL(imgA.getAttribute('src'), window.location.href).href;
            const urlB = new URL(imgB.getAttribute('src'), window.location.href).href;

            const { canvas, imgB: decodedImgB } = await window.VisionaryDiffEngine.compareImages(urlA, urlB);

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

            const stats = calculateStats(canvas.getContext('2d'), canvas.width, canvas.height);
            diffShell.querySelector('.vpd-stats-card').innerHTML = `
                Change: <b>${stats.pct}%</b> | Delta: <b>${stats.diff.toLocaleString()}</b> px
            `;
            view.dataset.vpdState = 'active';
        } catch (e) {
            clearTimeout(hangTimer);
            console.error('[VPD]', e);
            const frame = diffShell.querySelector('.vpd-diff-frame');
            if (frame) {
                const isContextError = e.message.includes('refresh');
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
    };

    const deactivate3Up = () => {
        document.body.classList.remove('vpd-3up-active');
        document.querySelectorAll('[data-vpd-state]').forEach(el => {
            el.dataset.vpdState = 'inactive';
            el.classList.remove('three-up');
        });
        document.querySelectorAll('.vpd-diff-shell').forEach(s => s.remove());
        const tab = document.querySelector('.vpd-3up-tab');
        if (tab) tab.classList.remove('selected');

        // Cleanup ObjectURLs
        if (window._vpdUrls) {
            window._vpdUrls.forEach(url => URL.revokeObjectURL(url));
            window._vpdUrls = [];
        }
    };

    setInterval(setup3Up, 1000);
})();
