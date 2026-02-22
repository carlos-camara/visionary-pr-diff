/**
 * Visionary PR Diff — v6 (Inline Below Strategy)
 *
 * Injects a professional "Diff" panel directly below GitHub's 2‑up
 * image comparison. The diff uses a heatmap overlay:
 *   • Unchanged pixels → original image at 35% brightness
 *   • Changed pixels   → after‑image blended with green→amber→red heat
 */

(function () {
    'use strict';

    const VERSION = 'v6';
    const DONE = 'vpd-done';

    // ─── Visible toast (confirms extension is running) ────────────────────────
    function toast(msg, color = '#58a6ff') {
        const el = Object.assign(document.createElement('div'), { textContent: msg });
        Object.assign(el.style, {
            position: 'fixed', bottom: '16px', right: '16px', zIndex: '999999',
            background: '#0d1117', border: `1px solid ${color}`,
            borderRadius: '8px', padding: '8px 14px',
            color, fontSize: '12px', fontWeight: '600',
            fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif',
            boxShadow: '0 4px 20px rgba(0,0,0,.7)',
            transition: 'opacity .5s', opacity: '1'
        });
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 600); }, 3500);
    }

    toast(`🔍 Visionary PR Diff ${VERSION} active`);
    console.log(`%c[VPD] ${VERSION} loaded`, 'color:#58a6ff;font-weight:bold;font-size:13px');

    // ─── Image loader ─────────────────────────────────────────────────────────
    function loadImg(src) {
        return new Promise((res, rej) => {
            const i = new Image();
            i.crossOrigin = 'Anonymous';
            i.onload = () => res(i);
            i.onerror = () => rej(new Error('Cannot load: ' + src.slice(0, 60)));
            i.src = src;
        });
    }

    // ─── Heatmap engine ───────────────────────────────────────────────────────
    async function heatmapDiff(urlA, urlB) {
        const [a, b] = await Promise.all([loadImg(urlA), loadImg(urlB)]);
        const W = Math.max(a.naturalWidth, b.naturalWidth);
        const H = Math.max(a.naturalHeight, b.naturalHeight);

        function pixels(img) {
            const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
            cv.getContext('2d').drawImage(img, 0, 0, W, H);
            return cv.getContext('2d').getImageData(0, 0, W, H).data;
        }

        const dA = pixels(a), dB = pixels(b);
        const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
        const ctx = cv.getContext('2d');
        const id = ctx.createImageData(W, H);
        const px = id.data;

        let diff = 0, sumDelta = 0;

        for (let i = 0; i < dA.length; i += 4) {
            const rA = dA[i], gA = dA[i + 1], bA = dA[i + 2];
            const rB = dB[i], gB = dB[i + 1], bB = dB[i + 2];

            const d = Math.sqrt((rA - rB) ** 2 + (gA - gB) ** 2 + (bA - bB) ** 2);
            const norm = Math.min(d / 441.67, 1);
            sumDelta += norm;

            if (norm < 0.025) {
                // Identical — dim
                px[i] = rB * 0.32;
                px[i + 1] = gB * 0.32;
                px[i + 2] = bB * 0.32;
                px[i + 3] = 255;
            } else {
                diff++;
                const t = Math.min(norm * 2.5, 1);
                let hR, hG, hB;
                if (t < 0.5) {
                    const s = t * 2;
                    hR = Math.round(s * 255);
                    hG = Math.round(220 - s * 60);
                    hB = Math.round(100 - s * 100);
                } else {
                    const s = (t - 0.5) * 2;
                    hR = 255;
                    hG = Math.round(160 - s * 140);
                    hB = Math.round(s * 30);
                }
                const blend = Math.min(0.50 + norm * 0.40, 0.92);
                px[i] = Math.round(rB * (1 - blend) + hR * blend);
                px[i + 1] = Math.round(gB * (1 - blend) + hG * blend);
                px[i + 2] = Math.round(bB * (1 - blend) + hB * blend);
                px[i + 3] = 255;
            }
        }

        ctx.putImageData(id, 0, 0);

        const total = W * H;
        const pct = (diff / total * 100).toFixed(2);
        const intens = (sumDelta / total * 100).toFixed(1);
        return { canvas: cv, pct, diff, total, intens, W, H };
    }

    // ─── Severity helper ──────────────────────────────────────────────────────
    function severity(pct) {
        const p = parseFloat(pct);
        if (p === 0) return { label: 'Identical', color: '#3fb950' };
        if (p < 0.5) return { label: 'Trivial', color: '#3fb950' };
        if (p < 3) return { label: 'Minor', color: '#d29922' };
        if (p < 15) return { label: 'Moderate', color: '#f0883e' };
        return { label: 'Major', color: '#f85149' };
    }

    // ─── Panel renderer ───────────────────────────────────────────────────────
    function buildDiffSection(parent, urlA, urlB) {
        // Wrapper mimics GitHub's image diff column header style
        const wrap = document.createElement('div');
        wrap.style.cssText = [
            'margin-top:8px',
            'border-top:1px solid #30363d',
            'padding-top:8px',
            'display:flex',
            'flex-direction:column',
            'align-items:center',
            'gap:10px',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
        ].join(';');

        // Label — same visual style as "Deleted" / "Added"
        const label = document.createElement('div');
        label.style.cssText = [
            'font-size:13px',
            'font-weight:600',
            'color:#58a6ff',
            'letter-spacing:.4px'
        ].join(';');
        label.textContent = 'Diff';

        // Canvas container card
        const card = document.createElement('div');
        card.style.cssText = [
            'position:relative',
            'border:1px solid rgba(88,166,255,.35)',
            'border-radius:8px',
            'overflow:hidden',
            'box-shadow:0 4px 24px rgba(0,0,0,.6)',
            'background:#010409',
            'display:inline-block'
        ].join(';');

        const spinner = document.createElement('div');
        spinner.style.cssText = 'width:160px;height:60px;display:flex;align-items:center;justify-content:center;color:#484f58;font-size:12px;';
        spinner.textContent = 'Computing diff…';
        card.appendChild(spinner);

        // Stats bar beneath the canvas
        const statsBar = document.createElement('div');
        statsBar.style.cssText = [
            'display:flex', 'align-items:center', 'gap:14px',
            'padding:6px 14px',
            'background:rgba(255,255,255,.02)',
            'border:1px solid #30363d',
            'border-radius:6px',
            'font-size:12px',
            'color:#8b949e'
        ].join(';');
        statsBar.textContent = '…';

        wrap.appendChild(label);
        wrap.appendChild(card);
        wrap.appendChild(statsBar);
        parent.appendChild(wrap);

        // ── Async render ───────────────────────────────────────────────────────
        heatmapDiff(urlA, urlB).then(({ canvas, pct, diff, intens, W, H }) => {
            const sev = severity(pct);

            // Overlay "DIFF" watermark
            const ctx = canvas.getContext('2d');
            ctx.save();
            ctx.font = 'bold 11px -apple-system,"Segoe UI",sans-serif';
            ctx.fillStyle = 'rgba(88,166,255,0.55)';
            ctx.textAlign = 'right';
            ctx.fillText(`DIFF  ${W}×${H}`, W - 6, H - 5);
            ctx.restore();

            canvas.style.cssText = 'display:block;max-width:min(587px,100%);height:auto;';
            card.innerHTML = '';
            card.appendChild(canvas);

            // Gradient legend strip
            const legend = document.createElement('div');
            legend.style.cssText = [
                'height:4px', 'width:100%',
                'background:linear-gradient(to right,#00d264,#ffa500,#ff1e1e)'
            ].join(';');
            card.appendChild(legend);

            // Stats
            statsBar.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sev.color};"></span>
          <b style="color:${sev.color};">${sev.label}</b>
        </span>
        <span>Changed: <b style="color:#c9d1d9;">${pct}%</b></span>
        <span>Pixels: <b style="color:#c9d1d9;">${diff.toLocaleString()}</b></span>
        <span>Intensity: <b style="color:#c9d1d9;">${intens}</b></span>
        <span style="margin-left:auto;display:flex;align-items:center;gap:4px;font-size:11px;color:#484f58;">
          <span style="display:inline-block;width:32px;height:4px;border-radius:2px;background:linear-gradient(to right,#00d264,#ffa500,#ff1e1e);"></span>
          Low → High
        </span>
      `;

            console.log(`[VPD] Rendered: ${pct}% changed`);
        }).catch(err => {
            console.error('[VPD]', err);
            card.innerHTML = `<div style="padding:16px;color:#f85149;font-size:12px;">${err.message}</div>`;
            statsBar.textContent = 'Error — see console';
            toast('⚠ Diff error: ' + err.message, '#f85149');
        });
    }

    // ─── Image extraction (3 strategies) ─────────────────────────────────────
    function extractPair(root) {
        // S1: explicit deleted/added render cells
        const del = root.querySelector(
            '.render-cell-old img, .image-diff-item.deleted img, ' +
            '[data-position="left"] img, .render-cell:first-child img, ' +
            '.js-render-blob:first-of-type img'
        );
        const add = root.querySelector(
            '.render-cell-new img, .image-diff-item.added img,  ' +
            '[data-position="right"] img, .render-cell:last-child img,  ' +
            '.js-render-blob:last-of-type img'
        );
        if (del && add && del !== add) return { before: del.src, after: add.src };

        // S2: any render-wrapper / image-diff container
        const ctr = root.querySelector('.render-wrapper, .image-diff, [data-render-url]');
        if (ctr) {
            const imgs = [...ctr.querySelectorAll('img')].filter(x => x.naturalWidth > 4 && !x.src.includes('avatar'));
            if (imgs.length >= 2) return { before: imgs[0].src, after: imgs[1].src };
        }

        // S3: any 2 images in the block
        const all = [...root.querySelectorAll('img')].filter(x => x.naturalWidth > 4 && !x.src.includes('avatar'));
        if (all.length >= 2) return { before: all[0].src, after: all[1].src };

        return null;
    }

    // ─── Main scanner ─────────────────────────────────────────────────────────
    function scan() {
        // Find all file diff blocks
        const ROOT_SELECTORS = [
            '[data-details-container-group]',
            '.file.js-details-container',
            '.js-diff-container',
            '.file'
        ];

        for (const sel of ROOT_SELECTORS) {
            const blocks = [...document.querySelectorAll(sel)];
            if (!blocks.length) continue;

            console.log(`[VPD] Scanning ${blocks.length} blocks (${sel})`);

            blocks.forEach(block => {
                if (block.dataset[DONE]) return;

                // Look for the image diff container inside this block
                const imageDiffCtr = block.querySelector(
                    '.image-diff, .render-wrapper, [data-render-url], ' +
                    '.js-render-blob-wrapper, .blob-wrapper'
                );
                if (!imageDiffCtr) return;

                // Must have at least 2 images
                const imgs = [...block.querySelectorAll('img')].filter(x => x.naturalWidth > 4);
                if (imgs.length < 2) return;

                const pair = extractPair(block);
                if (!pair) return;

                block.dataset[DONE] = '1';
                console.log('[VPD] Injecting diff for:', pair.before.slice(0, 60));

                // Inject below the image-diff container
                buildDiffSection(imageDiffCtr.parentElement || block, pair.before, pair.after);
            });

            break; // stop at first selector that found blocks
        }
    }

    // Watch for GitHub's lazy-loaded diffs
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    [800, 2000, 4000, 8000].forEach(t => setTimeout(scan, t));

})();
