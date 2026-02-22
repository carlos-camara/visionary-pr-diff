/**
 * Visionary PR Diff — Inline Injector v3
 * Automatically appends a pixel-diff image next to the existing
 * "Deleted" and "Added" images inside GitHub's 2-up view.
 */

(function () {
    'use strict';

    console.log('%c[Visionary PR Diff] Inline engine v3 active', 'color:#58a6ff;font-weight:bold');

    // ─── Image Extraction ─────────────────────────────────────────────────────

    function extractImages(fileEl) {
        // Priority 1 — explicit deleted / added wrappers (Rich Diff 2-up)
        const before = fileEl.querySelector(
            '.image-diff-item.deleted img, .js-diff-item.deleted img, ' +
            '[data-position="left"] img, .file-deleted img, .render-cell-left img'
        );
        const after = fileEl.querySelector(
            '.image-diff-item.added img, .js-diff-item.added img, ' +
            '[data-position="right"] img, .file-added img, .render-cell-right img'
        );
        if (before && after) return { before, after };

        // Priority 2 — all imgs inside a known image-diff container
        const container = fileEl.querySelector(
            '.image-diff, [data-render-url], .render-wrapper'
        );
        if (container) {
            const imgs = [...container.querySelectorAll('img')].filter(i => i.src && !i.src.includes('avatar'));
            if (imgs.length >= 2) return { before: imgs[0], after: imgs[1] };
        }

        // Priority 3 — any two non-avatar images in the block
        const all = [...fileEl.querySelectorAll('img')].filter(i => i.src && !i.src.includes('avatar'));
        if (all.length >= 2) return { before: all[0], after: all[1] };

        return null;
    }

    // ─── Diff Engine (inline, no separate file needed) ───────────────────────

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    async function buildDiffCanvas(srcBefore, srcAfter) {
        const [a, b] = await Promise.all([loadImage(srcBefore), loadImage(srcAfter)]);
        const w = Math.max(a.naturalWidth, b.naturalWidth);
        const h = Math.max(a.naturalHeight, b.naturalHeight);

        const cvA = Object.assign(document.createElement('canvas'), { width: w, height: h });
        const cvB = Object.assign(document.createElement('canvas'), { width: w, height: h });
        const cvD = Object.assign(document.createElement('canvas'), { width: w, height: h });

        cvA.getContext('2d').drawImage(a, 0, 0);
        cvB.getContext('2d').drawImage(b, 0, 0);

        const ctxD = cvD.getContext('2d');
        const dA = cvA.getContext('2d').getImageData(0, 0, w, h).data;
        const dB = cvB.getContext('2d').getImageData(0, 0, w, h).data;
        const imgData = ctxD.createImageData(w, h);
        const dOut = imgData.data;

        let diffCount = 0;
        for (let i = 0; i < dA.length; i += 4) {
            const diff =
                Math.abs(dA[i] - dB[i]) +
                Math.abs(dA[i + 1] - dB[i + 1]) +
                Math.abs(dA[i + 2] - dB[i + 2]);

            if (diff > 10) {
                // Highlight: vivid magenta
                dOut[i] = 255;
                dOut[i + 1] = 0;
                dOut[i + 2] = 200;
                dOut[i + 3] = 255;
                diffCount++;
            } else {
                // Dim the unchanged pixels (50% opacity grey)
                const avg = (dA[i] + dA[i + 1] + dA[i + 2]) / 3;
                dOut[i] = avg;
                dOut[i + 1] = avg;
                dOut[i + 2] = avg;
                dOut[i + 3] = 120;
            }
        }
        ctxD.putImageData(imgData, 0, 0);

        // Stats badge (% changed)
        const totalPx = w * h;
        const pct = totalPx > 0 ? ((diffCount / totalPx) * 100).toFixed(2) : '0.00';
        return { canvas: cvD, pct };
    }

    // ─── Inline Injection ────────────────────────────────────────────────────

    async function injectInlinePanel(fileEl) {
        if (fileEl.dataset.vpdInline) return;
        fileEl.dataset.vpdInline = 'pending';

        const srcs = extractImages(fileEl);
        if (!srcs) {
            fileEl.dataset.vpdInline = 'no-images';
            return;
        }

        // Find the container that holds the 2-up comparison images.
        // GitHub wraps both "Deleted" and "Added" blocks in a flex/table row.
        const imageRow = srcs.before.closest(
            '.image-diff, .render-wrapper, [data-render-url], .file-diff'
        ) || srcs.before.closest('td, .d-flex, .d-table-row') || srcs.before.parentElement;

        if (!imageRow) {
            fileEl.dataset.vpdInline = 'no-row';
            return;
        }

        // ── Loading placeholder ──────────────────────────────────────────────
        const placeholder = document.createElement('div');
        placeholder.style.cssText = [
            'display:inline-flex', 'flex-direction:column', 'align-items:center',
            'gap:6px', 'min-width:80px', 'padding:8px 12px',
            'background:rgba(88,166,255,.06)', 'border:1px solid rgba(88,166,255,.2)',
            'border-radius:8px', 'vertical-align:top', 'margin-left:12px'
        ].join(';');
        placeholder.innerHTML = `
      <span style="font-size:12px;font-weight:600;color:#58a6ff;">🔍 Diff</span>
      <span style="font-size:11px;color:#8b949e;">Computing…</span>
    `;

        // Append after the image row (or inside it if it is a flex container)
        imageRow.style.display = 'flex';
        imageRow.style.flexWrap = 'wrap';
        imageRow.style.alignItems = 'flex-start';
        imageRow.style.gap = '12px';
        imageRow.appendChild(placeholder);

        // ── Compute diff ─────────────────────────────────────────────────────
        try {
            const { canvas, pct } = await buildDiffCanvas(srcs.before.src, srcs.after.src);

            canvas.style.cssText = [
                'max-width:100%', 'height:auto', 'border-radius:4px',
                'box-shadow:0 2px 8px rgba(0,0,0,.4)'
            ].join(';');

            const severity =
                parseFloat(pct) === 0 ? { label: 'Identical', color: '#3fb950' } :
                    parseFloat(pct) < 1 ? { label: 'Minor', color: '#d29922' } :
                        parseFloat(pct) < 10 ? { label: 'Moderate', color: '#f0883e' } :
                            { label: 'Major', color: '#f85149' };

            placeholder.innerHTML = `
        <span style="font-size:12px;font-weight:600;color:#58a6ff;">🔍 Diff</span>
      `;
            placeholder.appendChild(canvas);
            placeholder.innerHTML += `
        <div style="font-size:11px;margin-top:4px;text-align:center;">
          <span style="color:${severity.color};font-weight:600;">${severity.label}</span>
          <span style="color:#8b949e;"> · ${pct}% changed</span>
        </div>
        <div style="font-size:10px;color:#6e7681;margin-top:2px;">
          <span style="display:inline-block;width:8px;height:8px;background:#ff00c8;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>= pixel diff
        </div>
      `;
            placeholder.appendChild(canvas); // re-add canvas after innerHTML reset
        } catch (err) {
            console.warn('[Visionary PR Diff] Could not compute diff:', err.message);
            placeholder.innerHTML = `<span style="font-size:11px;color:#f85149;">⚠ ${err.message}</span>`;
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
            if (items.length) {
                items.forEach(el => injectInlinePanel(el));
                break;
            }
        }
    }

    // Observe GitHub's dynamic diff loading
    const obs = new MutationObserver(scan);
    obs.observe(document.body, { childList: true, subtree: true });

    // Initial attempts with delay for GitHub's lazy rendering
    setTimeout(scan, 1500);
    setTimeout(scan, 3500);
    setTimeout(scan, 7000);

})();
