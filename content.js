/**
 * Visionary PR Diff — Premium Inline Injector v4
 *
 * Renders a professional heat-map diff overlay:
 *  - Unchanged pixels: shows the actual image, slightly dimmed.
 *  - Changed pixels: shows the "after" image with a vivid heat-map overlay
 *    whose intensity reflects the magnitude of the change.
 *    Low diff → green tint | Medium diff → amber | High diff → red
 *
 * The result is a third column that is immediately readable and beautiful.
 */

(function () {
    'use strict';

    console.log('%c[Visionary PR Diff] Premium engine v4', 'color:#58a6ff;font-weight:bold');

    // ─── Image helpers ────────────────────────────────────────────────────────

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image: ' + src.slice(0, 80)));
            img.src = src;
        });
    }

    function drawToCanvas(img, w, h) {
        const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        return cv.getContext('2d').getImageData(0, 0, w, h).data;
    }

    // ─── Premium Diff Engine ──────────────────────────────────────────────────

    async function renderPremiumDiff(srcBefore, srcAfter) {
        const [a, b] = await Promise.all([loadImage(srcBefore), loadImage(srcAfter)]);

        const w = Math.max(a.naturalWidth, b.naturalWidth);
        const h = Math.max(a.naturalHeight, b.naturalHeight);

        const dataA = drawToCanvas(a, w, h);
        const dataB = drawToCanvas(b, w, h);

        const outCanvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
        const ctx = outCanvas.getContext('2d');
        const out = ctx.createImageData(w, h);
        const d = out.data;

        let diffPx = 0;
        let totalDelta = 0;

        for (let i = 0; i < dataA.length; i += 4) {
            const rA = dataA[i], gA = dataA[i + 1], bA = dataA[i + 2];
            const rB = dataB[i], gB = dataB[i + 1], bB = dataB[i + 2];

            // Euclidean colour distance (ignoring alpha)
            const delta = Math.sqrt(
                (rA - rB) ** 2 + (gA - gB) ** 2 + (bA - bB) ** 2
            );
            const norm = Math.min(delta / 441.67, 1); // 441.67 = max possible √(255²*3)

            totalDelta += norm;

            if (norm < 0.02) {
                // ── Identical pixel → show original, slightly dimmed ──────────────
                d[i] = rB * 0.45;
                d[i + 1] = gB * 0.45;
                d[i + 2] = bB * 0.45;
                d[i + 3] = 255;
            } else {
                // ── Changed pixel → heat-map overlay blended onto "after" image ───
                diffPx++;
                const t = Math.min(norm * 3, 1); // boost low changes for visibility

                // Heat gradient: green (0,255,100) → amber (255,180,0) → red (255,30,30)
                let hR, hG, hB;
                if (t < 0.5) {
                    const s = t * 2;
                    hR = Math.round(0 + s * 255);
                    hG = Math.round(210 + s * (180 - 210));
                    hB = Math.round(80 + s * (0 - 80));
                } else {
                    const s = (t - 0.5) * 2;
                    hR = 255;
                    hG = Math.round(180 - s * 150);
                    hB = Math.round(0 + s * 30);
                }

                // Blend: 55% original after-image + 45% heat colour
                const alpha = 0.45 + norm * 0.3; // more intense = more colour
                d[i] = Math.round(rB * (1 - alpha) + hR * alpha);
                d[i + 1] = Math.round(gB * (1 - alpha) + hG * alpha);
                d[i + 2] = Math.round(bB * (1 - alpha) + hB * alpha);
                d[i + 3] = 255;
            }
        }

        ctx.putImageData(out, 0, 0);

        const totalPx = w * h;
        const pct = (diffPx / totalPx * 100).toFixed(2);
        const avgIntensity = (totalDelta / totalPx * 100).toFixed(1);

        return { canvas: outCanvas, pct, diffPx, totalPx, avgIntensity };
    }

    // ─── Build Panel UI ───────────────────────────────────────────────────────

    function buildPanel(container) {
        const panel = document.createElement('div');
        panel.style.cssText = [
            'display:inline-flex', 'flex-direction:column', 'align-items:center',
            'gap:0', 'vertical-align:top', 'margin-left:12px',
            'border-radius:10px', 'overflow:hidden',
            'border:1px solid rgba(88,166,255,.25)',
            'box-shadow:0 4px 24px rgba(0,0,0,.5)',
            'min-width:120px', 'background:#010409'
        ].join(';');

        // Header bar
        const header = document.createElement('div');
        header.style.cssText = [
            'width:100%', 'padding:7px 12px',
            'background:linear-gradient(135deg,rgba(88,166,255,.12),rgba(88,166,255,.04))',
            'border-bottom:1px solid rgba(88,166,255,.15)',
            'display:flex', 'align-items:center', 'gap:6px',
            'box-sizing:border-box'
        ].join(';');
        header.innerHTML = `
      <span style="font-size:13px;">🔍</span>
      <span style="font-size:12px;font-weight:700;color:#58a6ff;letter-spacing:.4px;">Diff</span>
    `;

        // Canvas area
        const canvasWrap = document.createElement('div');
        canvasWrap.id = 'vpd-canvas-slot';
        canvasWrap.style.cssText = [
            'width:100%', 'display:flex', 'justify-content:center',
            'padding:10px', 'box-sizing:border-box',
            'background:#010409'
        ].join(';');
        canvasWrap.innerHTML = `
      <span style="font-size:11px;color:#484f58;align-self:center;padding:20px 0;">
        Rendering…
      </span>
    `;

        // Stats footer
        const footer = document.createElement('div');
        footer.id = 'vpd-stats';
        footer.style.cssText = [
            'width:100%', 'padding:7px 10px',
            'border-top:1px solid rgba(255,255,255,.06)',
            'background:rgba(255,255,255,.02)',
            'box-sizing:border-box'
        ].join(';');

        panel.appendChild(header);
        panel.appendChild(canvasWrap);
        panel.appendChild(footer);
        container.appendChild(panel);

        return panel;
    }

    function renderStats(panel, { pct, diffPx, totalPx, avgIntensity }) {
        const severity =
            parseFloat(pct) === 0 ? { label: 'Identical', color: '#3fb950', icon: '✓' } :
                parseFloat(pct) < 0.5 ? { label: 'Trivial', color: '#3fb950', icon: '~' } :
                    parseFloat(pct) < 3 ? { label: 'Minor', color: '#d29922', icon: '!' } :
                        parseFloat(pct) < 15 ? { label: 'Moderate', color: '#f0883e', icon: '⚠' } :
                            { label: 'Major', color: '#f85149', icon: '✕' };

        const footer = panel.querySelector('#vpd-stats');
        footer.innerHTML = `
      <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">
        <span style="
          display:inline-flex;align-items:center;justify-content:center;
          width:16px;height:16px;border-radius:50%;
          background:${severity.color}22;border:1px solid ${severity.color}66;
          font-size:10px;font-weight:700;color:${severity.color};
        ">${severity.icon}</span>
        <span style="font-size:12px;font-weight:700;color:${severity.color};">${severity.label}</span>
      </div>
      <div style="font-size:11px;color:#8b949e;line-height:1.7;">
        <div>Changed: <b style="color:#c9d1d9;">${pct}%</b></div>
        <div>Pixels: <b style="color:#c9d1d9;">${diffPx.toLocaleString()}</b></div>
        <div>Intensity: <b style="color:#c9d1d9;">${avgIntensity}</b></div>
      </div>
      <div style="margin-top:8px;border-top:1px solid rgba(255,255,255,.06);padding-top:6px;">
        <div style="font-size:10px;color:#484f58;margin-bottom:3px;">Heat legend</div>
        <div style="
          height:6px;width:100%;border-radius:3px;
          background:linear-gradient(to right,#00d264,#ffa500,#ff1e1e);
        "></div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:#484f58;margin-top:2px;">
          <span>Low</span><span>High</span>
        </div>
      </div>
    `;
    }

    // ─── Image Extraction ─────────────────────────────────────────────────────

    function extractImages(fileEl) {
        const before = fileEl.querySelector(
            '.image-diff-item.deleted img, .js-diff-item.deleted img, ' +
            '[data-position="left"] img, .file-deleted img, .render-cell-left img'
        );
        const after = fileEl.querySelector(
            '.image-diff-item.added img, .js-diff-item.added img, ' +
            '[data-position="right"] img, .file-added img, .render-cell-right img'
        );
        if (before && after) return { before, after };

        const container = fileEl.querySelector('.image-diff, [data-render-url], .render-wrapper');
        if (container) {
            const imgs = [...container.querySelectorAll('img')].filter(i => i.src && !i.src.includes('avatar'));
            if (imgs.length >= 2) return { before: imgs[0], after: imgs[1] };
        }

        const all = [...fileEl.querySelectorAll('img')].filter(i => i.src && !i.src.includes('avatar'));
        if (all.length >= 2) return { before: all[0], after: all[1] };

        return null;
    }

    // ─── Injection ─────────────────────────────────────────────────────────────

    async function injectInlinePanel(fileEl) {
        if (fileEl.dataset.vpdInline) return;
        fileEl.dataset.vpdInline = 'pending';

        const srcs = extractImages(fileEl);
        if (!srcs) { fileEl.dataset.vpdInline = 'skip'; return; }

        const imageRow = srcs.before.closest(
            '.image-diff, .render-wrapper, [data-render-url]'
        ) || srcs.before.closest('td, .d-flex, .d-table-row') || srcs.before.parentElement;
        if (!imageRow) { fileEl.dataset.vpdInline = 'skip'; return; }

        imageRow.style.cssText += ';display:flex!important;flex-wrap:wrap;align-items:flex-start;gap:12px;';

        const panel = buildPanel(imageRow);

        try {
            const result = await renderPremiumDiff(srcs.before.src, srcs.after.src);

            result.canvas.style.cssText = [
                'max-width:100%', 'height:auto', 'display:block',
                'border-radius:4px'
            ].join(';');

            const slot = panel.querySelector('#vpd-canvas-slot');
            slot.innerHTML = '';
            slot.appendChild(result.canvas);

            renderStats(panel, result);
        } catch (err) {
            console.warn('[Visionary PR Diff]', err.message);
            const slot = panel.querySelector('#vpd-canvas-slot');
            slot.innerHTML = `<span style="font-size:11px;color:#f85149;padding:12px;text-align:center;">${err.message}</span>`;
        }

        fileEl.dataset.vpdInline = 'done';
    }

    // ─── Scanner ──────────────────────────────────────────────────────────────

    function scan() {
        const selectors = [
            '[data-details-container-group]',
            '.file.js-details-container',
            '.js-diff-container',
            '.file'
        ];
        for (const sel of selectors) {
            const items = document.querySelectorAll(sel);
            if (items.length) { items.forEach(el => injectInlinePanel(el)); break; }
        }
    }

    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    [1500, 3500, 7000].forEach(t => setTimeout(scan, t));

})();
