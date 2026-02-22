/**
 * Visionary PR Diff — v7
 * Waits for images to fully load before computing diff.
 * Injects a heatmap "Diff" panel below GitHub's 2-up comparison.
 */

(function () {
    'use strict';

    const V = 'v7';
    console.log(`%c[VPD] ${V} loaded`, 'color:#58a6ff;font-weight:bold;font-size:13px');

    // ─── Toast ────────────────────────────────────────────────────────────────
    function toast(msg, color = '#58a6ff') {
        const el = Object.assign(document.createElement('div'), { textContent: msg });
        Object.assign(el.style, {
            position: 'fixed', bottom: '16px', right: '16px', zIndex: '999999',
            background: '#0d1117', border: `1px solid ${color}`,
            borderRadius: '8px', padding: '8px 14px', color,
            fontSize: '12px', fontWeight: '600',
            fontFamily: '-apple-system,sans-serif',
            boxShadow: '0 4px 20px rgba(0,0,0,.7)',
            transition: 'opacity .5s', opacity: '1'
        });
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 600); }, 3500);
    }
    toast(`🔍 Visionary PR Diff ${V} active`);

    // ─── Wait for an img to fully load ───────────────────────────────────────
    function waitForImg(img) {
        return new Promise(res => {
            if (img.complete && img.naturalWidth > 0) { res(img); return; }
            img.addEventListener('load', () => res(img), { once: true });
            img.addEventListener('error', () => res(null), { once: true });
        });
    }

    // ─── Cross-origin canvas load ─────────────────────────────────────────────
    function loadCors(src) {
        return new Promise((res, rej) => {
            const i = new Image();
            i.crossOrigin = 'Anonymous';
            i.onload = () => res(i);
            i.onerror = () => rej(new Error('CORS error loading image'));
            i.src = src + (src.includes('?') ? '&' : '?') + '_vpd=' + Date.now(); // cache-bust
        });
    }

    // ─── Heatmap diff ─────────────────────────────────────────────────────────
    async function heatmap(urlA, urlB) {
        const [imgA, imgB] = await Promise.all([loadCors(urlA), loadCors(urlB)]);
        const W = Math.max(imgA.naturalWidth, imgB.naturalWidth);
        const H = Math.max(imgA.naturalHeight, imgB.naturalHeight);

        function px(img) {
            const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
            c.getContext('2d').drawImage(img, 0, 0, W, H);
            return c.getContext('2d').getImageData(0, 0, W, H).data;
        }

        const A = px(imgA), B = px(imgB);
        const out = Object.assign(document.createElement('canvas'), { width: W, height: H });
        const ctx = out.getContext('2d');
        const id = ctx.createImageData(W, H);
        const d = id.data;

        let diff = 0, sumD = 0;
        for (let i = 0; i < A.length; i += 4) {
            const dr = A[i] - B[i], dg = A[i + 1] - B[i + 1], db = A[i + 2] - B[i + 2];
            const n = Math.min(Math.sqrt(dr * dr + dg * dg + db * db) / 441.67, 1);
            sumD += n;
            if (n < 0.025) {
                d[i] = B[i] * .3; d[i + 1] = B[i + 1] * .3; d[i + 2] = B[i + 2] * .3; d[i + 3] = 255;
            } else {
                diff++;
                const t = Math.min(n * 2.5, 1);
                let r, g, b;
                if (t < .5) { const s = t * 2; r = Math.round(s * 255); g = Math.round(220 - s * 60); b = Math.round(100 - s * 100); }
                else { const s = (t - .5) * 2; r = 255; g = Math.round(160 - s * 140); b = Math.round(s * 30); }
                const a = Math.min(.50 + n * .40, .92);
                d[i] = Math.round(B[i] * (1 - a) + r * a); d[i + 1] = Math.round(B[i + 1] * (1 - a) + g * a);
                d[i + 2] = Math.round(B[i + 2] * (1 - a) + b * a); d[i + 3] = 255;
            }
        }
        ctx.putImageData(id, 0, 0);

        // watermark
        ctx.save(); ctx.font = 'bold 11px -apple-system,sans-serif';
        ctx.fillStyle = 'rgba(88,166,255,.5)'; ctx.textAlign = 'right';
        ctx.fillText(`DIFF ${W}×${H}`, W - 6, H - 6); ctx.restore();

        const total = W * H, pct = (diff / total * 100).toFixed(2), intens = (sumD / total * 100).toFixed(1);
        return { canvas: out, pct, diff, total, intens };
    }

    // ─── Panel ────────────────────────────────────────────────────────────────
    function severity(pct) {
        const p = parseFloat(pct);
        if (p === 0) return ['Identical', '#3fb950'];
        if (p < 0.5) return ['Trivial', '#3fb950'];
        if (p < 3) return ['Minor', '#d29922'];
        if (p < 15) return ['Moderate', '#f0883e'];
        return ['Major', '#f85149'];
    }

    function insertPanel(anchor, urlA, urlB) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin-top:10px;border-top:1px solid #30363d;padding-top:10px;text-align:center;font-family:-apple-system,sans-serif;';

        wrap.innerHTML = `
      <div style="font-size:13px;font-weight:600;color:#58a6ff;margin-bottom:8px;letter-spacing:.4px;">Diff</div>
      <div id="vpd-card" style="display:inline-block;border:1px solid rgba(88,166,255,.3);border-radius:8px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.6);background:#010409;">
        <div style="padding:24px 40px;color:#484f58;font-size:12px;">Computing diff…</div>
      </div>
      <div id="vpd-stats" style="margin-top:8px;display:inline-flex;align-items:center;gap:14px;padding:6px 14px;background:rgba(255,255,255,.02);border:1px solid #30363d;border-radius:6px;font-size:12px;color:#8b949e;">Computing…</div>
    `;

        anchor.after(wrap);

        heatmap(urlA, urlB).then(({ canvas, pct, diff, intens }) => {
            const [label, color] = severity(pct);
            canvas.style.cssText = 'display:block;max-width:min(587px,90vw);height:auto;';

            const legend = document.createElement('div');
            legend.style.cssText = 'height:4px;width:100%;background:linear-gradient(to right,#00d264,#ffa500,#ff1e1e);';

            const card = wrap.querySelector('#vpd-card');
            card.innerHTML = '';
            card.appendChild(canvas);
            card.appendChild(legend);

            wrap.querySelector('#vpd-stats').innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:5px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></span>
          <b style="color:${color};">${label}</b>
        </span>
        <span>Changed: <b style="color:#c9d1d9;">${pct}%</b></span>
        <span>Pixels: <b style="color:#c9d1d9;">${parseInt(diff).toLocaleString()}</b></span>
        <span>Intensity: <b style="color:#c9d1d9;">${intens}</b></span>
        <span style="margin-left:8px;display:flex;align-items:center;gap:4px;font-size:10px;color:#484f58;">
          <span style="display:inline-block;width:28px;height:3px;border-radius:2px;background:linear-gradient(to right,#00d264,#ffa500,#ff1e1e);"></span> Low→High
        </span>
      `;
            console.log(`[VPD] Done — ${pct}% changed`);
        }).catch(err => {
            console.error('[VPD] Error:', err.message);
            wrap.querySelector('#vpd-card').innerHTML = `<div style="padding:16px;color:#f85149;font-size:12px;">${err.message}</div>`;
            wrap.querySelector('#vpd-stats').textContent = '';
        });
    }

    // ─── Scanner ──────────────────────────────────────────────────────────────
    async function processBlock(block) {
        if (block.dataset.vpd) return;

        // Find all images in this block (no naturalWidth filter — they may not be loaded yet)
        const allImgs = [...block.querySelectorAll('img')].filter(x =>
            x.src && !x.src.includes('avatar') && !x.src.includes('emoji') &&
            !x.src.includes('github.com/images') && x.src.startsWith('http')
        );

        if (allImgs.length < 2) return;

        console.log(`[VPD] Found ${allImgs.length} images, waiting for load…`);
        block.dataset.vpd = 'loading';

        // Wait for ALL images to load
        await Promise.all(allImgs.map(waitForImg));

        // Re-filter after load
        const loaded = allImgs.filter(x => x.complete && x.naturalWidth > 10);
        if (loaded.length < 2) {
            console.log('[VPD] Images loaded but too small/failed');
            block.dataset.vpd = 'skip';
            return;
        }

        // Try to identify before/after
        const imgBefore = loaded[0];
        const imgAfter = loaded[1];

        console.log('[VPD] Injecting diff:', imgBefore.src.slice(0, 60), '|', imgAfter.src.slice(0, 60));
        block.dataset.vpd = 'done';

        // Find the best anchor to inject after
        const anchor =
            block.querySelector('.image-diff, .render-wrapper, [data-render-url], .js-render-blob-wrapper') ||
            block.querySelector('.file-body, .data') ||
            block.querySelector('td') ||
            block.lastElementChild;

        if (!anchor) { console.log('[VPD] No anchor found'); return; }
        insertPanel(anchor, imgBefore.src, imgAfter.src);
    }

    function scan() {
        const sels = [
            '[data-details-container-group]',
            '.file.js-details-container',
            '.js-diff-container',
            '.file'
        ];
        for (const s of sels) {
            const blocks = document.querySelectorAll(s);
            if (blocks.length) {
                console.log(`[VPD] Scanning ${blocks.length} blocks via: ${s}`);
                blocks.forEach(b => processBlock(b));
                break;
            }
        }
    }

    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    [800, 2000, 4000, 8000, 15000].forEach(t => setTimeout(scan, t));

})();
