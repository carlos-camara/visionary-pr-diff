/**
 * Visionary PR Diff — v26 (Instance Isolation & Multi-Image Fix)
 */

(function () {
    'use strict';
    let isIframe = false;
    try { isIframe = window.self !== window.top; } catch (e) { isIframe = true; }

    if (!isIframe && window.location.hostname === 'github.com') return;

    console.log(`[VPD] v26 Init: ${window.location.hostname}`);

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
        fieldset.querySelectorAll('label, .js-view-mode-item').forEach(label => {
            const input = label.querySelector('input');
            if (input) {
                if (input.checked) label.classList.add('selected');
                else label.classList.remove('selected');
            }
        });
    };

    const setup3Up = (container) => {
        const fieldset = container.querySelector('fieldset, .view-modes fieldset');
        if (!fieldset) return;

        // 1. Hook into native radio changes for perfect sync
        if (!fieldset.dataset.vpdObserved) {
            fieldset.dataset.vpdObserved = 'true';
            fieldset.addEventListener('change', (e) => {
                const val = e.target.value;
                const view = fieldset.closest('.image-diff, .view');
                if (val === 'three-up') activate3Up(view);
                else deactivate3Up(view);

                syncTabSelection(fieldset);
            });
        }

        if (fieldset.querySelector('.vpd-3up-tab')) {
            syncTabSelection(fieldset);
            return;
        }

        // 2. Add our tab as a native radio item
        const tab = document.createElement('label');
        tab.className = 'js-view-mode-item vpd-3up-tab';
        tab.innerHTML = '<input type="radio" value="three-up" name="view-mode"> 3-up';
        fieldset.appendChild(tab);

        // Auto-trigger only if this specific container hasn't been triggered
        if (!container.dataset.vpdAutoTriggered) {
            container.dataset.vpdAutoTriggered = 'true';
            setTimeout(() => {
                const radio = tab.querySelector('input');
                if (radio) {
                    radio.checked = true;
                    const view = fieldset.closest('.image-diff, .view');
                    activate3Up(view);
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

        console.log(`[VPD] Request ${requestId}: Starting Scoped Activation...`);

        // ISOLATION: Explicitly hide native modes
        view.classList.remove('swipe', 'onion-skin', 'two-up');
        view.classList.add('three-up');
        document.body.classList.add('vpd-3up-active');

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

        // Scoped Image Discovery
        const findImg = (label) => {
            const el = [...view.querySelectorAll('.shell')].find(s => s.textContent.toLowerCase().includes(label.toLowerCase()));
            return el?.querySelector('img') || view.querySelector(`img[alt*="${label}"]`);
        };

        const imgA = findImg('Deleted') || findImg('Before') || view.querySelectorAll('img')[0];
        const imgB = findImg('Added') || findImg('After') || view.querySelectorAll('img')[1];

        if (!imgA || !imgB) {
            setStatus(diffShell, 'Error: Source images not found.', true);
            view.dataset.vpdState = 'error';
            return;
        }

        const ready = await Promise.all([waitForImage(imgA), waitForImage(imgB)]);
        if (view.dataset.vpdRequestId !== requestId.toString()) return;

        if (!imgA?.src || !imgB?.src || imgA.src.startsWith('data:')) {
            setStatus(diffShell, 'Error: Invalid image sources.', true);
            view.dataset.vpdState = 'idle';
            return;
        }

        try {
            if (!chrome.runtime?.id) throw new Error('Refresh GitHub to re-connect.');
            if (!window.VisionaryDiffEngine) throw new Error('Engine missing');

            setStatus(diffShell, 'Streaming pixels...');
            const urlA = new URL(imgA.getAttribute('src'), window.location.href).href;
            const urlB = new URL(imgB.getAttribute('src'), window.location.href).href;

            const { canvas, imgB: decodedImgB } = await window.VisionaryDiffEngine.compareImages(urlA, urlB);

            if (view.dataset.vpdRequestId !== requestId.toString()) return;

            // Track for cleanup
            window._vpdUrls = window._vpdUrls || [];
            if (decodedImgB.src.startsWith('blob:')) window._vpdUrls.push(decodedImgB.src);

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
                Change: <b>${stats.pct}%</b> | Delta: <b>${stats.diff.toLocaleString()}</b> px
            `;
            view.dataset.vpdState = 'active';
        } catch (e) {
            if (view.dataset.vpdRequestId === requestId.toString()) {
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

    const deactivate3Up = (view) => {
        if (!view) return;
        view.dataset.vpdRequestId = '0';
        view.dataset.vpdState = 'inactive';
        view.classList.remove('three-up');

        const shell = view.querySelector('.vpd-diff-shell');
        if (shell) shell.remove();

        const allActive = document.querySelectorAll('[data-vpd-state="active"], [data-vpd-state="loading"]');
        if (allActive.length === 0) {
            document.body.classList.remove('vpd-3up-active');
        }
    };

    const scan = () => {
        document.querySelectorAll('.image-diff, .view').forEach(setup3Up);
    };

    setInterval(scan, 1000);
})();
