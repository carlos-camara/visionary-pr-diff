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
        const data = ctx.getImageData(0, 0, w, h).data;
        let diff = 0;
        const total = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] === 255 && data[i + 2] === 255) diff++;
        }
        return { diff, pct: (diff / total * 100).toFixed(2) };
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

    const activate3Up = async () => {
        const view = document.querySelector('.view, .image-diff, .two-up, .swipe, .onion-skin');
        if (!view || view.dataset.vpdState === 'active' || view.dataset.vpdState === 'loading') return;

        console.log('[VPD] v25: Rendering diff...');
        view.dataset.vpdState = 'loading';

        document.querySelectorAll('.js-view-mode-item, .vpd-3up-tab').forEach(t => t.classList.remove('selected'));
        const tab = document.querySelector('.vpd-3up-tab');
        if (tab) tab.classList.add('selected');

        document.body.classList.add('vpd-3up-active');
        view.classList.add('three-up');

        const shells = [...view.querySelectorAll('.shell')].filter(s => !s.classList.contains('vpd-diff-shell'));
        if (shells.length < 2) return;

        const imgA = shells[0].querySelector('img');
        const imgB = shells[1].querySelector('img');

        // Wait for images to have a src and be somewhat ready
        if (!imgA?.src || !imgB?.src || imgA.src.startsWith('data:') || imgB.src.startsWith('data:')) {
            console.warn('[VPD] Images not ready or invalid SRCS', { a: imgA?.src, b: imgB?.src });
            view.dataset.vpdState = 'idle';
            return;
        }

        let diffShell = view.querySelector('.vpd-diff-shell');
        if (!diffShell) {
            diffShell = document.createElement('span');
            diffShell.className = 'shell vpd-diff-shell';
            diffShell.innerHTML = `
                <span class="frame-label">Visionary Diff</span>
                <span class="vpd-diff-frame">
                    <div class="vpd-loader" style="padding:20px;font-size:11px;color:#8b949e;text-align:center;">
                        Syncing pixels...
                    </div>
                </span>
                <div class="vpd-stats-card" style="font-size:10px;text-align:center;">Analyzing...</div>
            `;
            shells[0].after(diffShell);
        }

        try {
            if (!window.VisionaryDiffEngine) throw new Error('Engine missing');

            // Resolve potentially relative URLs to absolute
            const urlA = new URL(imgA.getAttribute('src'), window.location.href).href;
            const urlB = new URL(imgB.getAttribute('src'), window.location.href).href;

            const { canvas, imgB: decodedImgB } = await window.VisionaryDiffEngine.compareImages(urlA, urlB);

            const frame = diffShell.querySelector('.vpd-diff-frame');
            frame.innerHTML = '';

            // Fix frame aspect ratio to match source
            const aspect = canvas.width / canvas.height;
            frame.style.aspectRatio = aspect.toString();

            // Background Ghost
            const ghost = decodedImgB.cloneNode();
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
            console.error('[VPD]', e);
            const frame = diffShell.querySelector('.vpd-diff-frame');
            if (frame) frame.innerHTML = `<div style="padding:10px;color:#f85149;font-size:10px;">Render Error: ${e.message}</div>`;
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
    };

    setInterval(setup3Up, 1000);
})();
