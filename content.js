/**
 * Visionary PR Diff — v9 (Container-aware, no domain whitelist)
 *
 * Strategy: Target GitHub's diff containers directly (.file blocks
 * that contain images). Get the rendered <img> elements from inside
 * those containers. No domain filtering — GitHub serves images from
 * github.com, camo.githubusercontent.com, and others.
 */

(function () {
    'use strict';
    const V = 'v9';
    console.log(`%c[VPD] ${V} starting`, 'color:#58a6ff;font-weight:bold;font-size:13px');

    // ─── Toast ────────────────────────────────────────────────────────────────
    function toast(msg, color = '#58a6ff') {
        const el = Object.assign(document.createElement('div'), { textContent: msg });
        Object.assign(el.style, {
            position: 'fixed', bottom: '16px', right: '16px', zIndex: '999999',
            background: '#0d1117', border: `1px solid ${color}`,
            borderRadius: '8px', padding: '8px 14px', color,
            fontSize: '12px', fontWeight: '600', fontFamily: '-apple-system,sans-serif',
            boxShadow: '0 4px 20px rgba(0,0,0,.7)', transition: 'opacity .5s', opacity: '1'
        });
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 600); }, 4000);
    }
    toast(`🔍 Visionary PR Diff ${V} active`);

    // ─── CORS image loader (tries direct, then proxied) ───────────────────────
    function corsLoad(src) {
        return new Promise((res, rej) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => res(img);
            img.onerror = () => {
                // Fallback: try without crossOrigin (won't allow pixel-read but worth a try)
                const img2 = new Image();
                img2.onload = () => res(img2);
                img2.onerror = () => rej(new Error('Load failed: ' + src.slice(0, 60)));
                img2.src = src;
            };
            img.src = src;
        });
    }

    // ─── Heatmap engine ───────────────────────────────────────────────────────
    async function heatmap(urlA, urlB) {
        console.log('[VPD] Loading:', urlA.slice(0, 70));
        const [a, b] = await Promise.all([corsLoad(urlA), corsLoad(urlB)]);
        console.log('[VPD] Loaded. Sizes:', a.naturalWidth, 'x', a.naturalHeight, '|', b.naturalWidth, 'x', b.naturalHeight);

        const W = Math.max(a.naturalWidth, b.naturalWidth);
        const H = Math.max(a.naturalHeight, b.naturalHeight);

        function drawPx(img) {
            const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
            c.getContext('2d').drawImage(img, 0, 0, W, H);
            return c.getContext('2d').getImageData(0, 0, W, H).data;
        }
        const A = drawPx(a), B = drawPx(b);
        const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
        const ctx = cv.getContext('2d');
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
                let r, g, b2;
                if (t < .5) { const s = t * 2; r = s * 255 | 0; g = (220 - s * 60) | 0; b2 = (100 - s * 100) | 0; }
                else { const s = (t - .5) * 2; r = 255; g = (160 - s * 140) | 0; b2 = (s * 30) | 0; }
                const al = Math.min(.5 + n * .4, .92);
                d[i] = (B[i] * (1 - al) + r * al) | 0;
                d[i + 1] = (B[i + 1] * (1 - al) + g * al) | 0;
                d[i + 2] = (B[i + 2] * (1 - al) + b2 * al) | 0;
                d[i + 3] = 255;
            }
        }
        ctx.putImageData(id, 0, 0);
        // Watermark
        ctx.save(); ctx.font = 'bold 11px -apple-system,sans-serif';
        ctx.fillStyle = 'rgba(88,166,255,.4)'; ctx.textAlign = 'right';
        ctx.fillText(`DIFF ${W}×${H}`, W - 6, H - 6); ctx.restore();

        const pct = (diff / (W * H) * 100).toFixed(2);
        const intens = (sumD / (W * H) * 100).toFixed(1);
        console.log(`[VPD] ✓ ${pct}% changed`);
        return { canvas: cv, pct, diff, intens };
    }

    // ─── Severity ─────────────────────────────────────────────────────────────
    function sev(pct) {
        const p = parseFloat(pct);
        if (p === 0) return ['Identical', '#3fb950'];
        if (p < 0.5) return ['Trivial', '#3fb950'];
        if (p < 3) return ['Minor', '#d29922'];
        if (p < 15) return ['Moderate', '#f0883e'];
        return ['Major', '#f85149'];
    }

    // ─── Panel ────────────────────────────────────────────────────────────────
    function injectPanel(insertAfter, srcA, srcB) {
        const uid = Date.now();
        const wrap = document.createElement('div');
        wrap.dataset.vpdPanel = uid;
        wrap.style.cssText = 'margin-top:10px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
        wrap.innerHTML = `
      <div style="font-size:13px;font-weight:600;color:#58a6ff;margin-bottom:8px;letter-spacing:.4px;">Diff</div>
      <div data-vpd-card="${uid}" style="display:inline-block;border:1px solid rgba(88,166,255,.3);border-radius:8px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.6);">
        <div style="padding:20px 40px;color:#484f58;font-size:12px;">Computing…</div>
      </div>
      <div data-vpd-stats="${uid}" style="margin-top:8px;display:inline-flex;align-items:center;gap:12px;padding:6px 14px;border:1px solid #30363d;border-radius:6px;font-size:12px;color:#8b949e;background:#0d1117;">Computing…</div>
    `;

        insertAfter.insertAdjacentElement('afterend', wrap);

        heatmap(srcA, srcB).then(({ canvas, pct, diff, intens }) => {
            const [label, color] = sev(pct);
            canvas.style.cssText = 'display:block;max-width:min(587px,90vw);height:auto;';
            const leg = document.createElement('div');
            leg.style.cssText = 'height:4px;background:linear-gradient(to right,#00d264,#ffa500,#ff1e1e);';
            const card = wrap.querySelector(`[data-vpd-card="${uid}"]`);
            card.innerHTML = ''; card.appendChild(canvas); card.appendChild(leg);
            wrap.querySelector(`[data-vpd-stats="${uid}"]`).innerHTML = `
        <span style="display:flex;align-items:center;gap:5px;"><span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></span><b style="color:${color};">${label}</b></span>
        <span>Changed: <b style="color:#c9d1d9;">${pct}%</b></span>
        <span>Pixels: <b style="color:#c9d1d9;">${parseInt(diff).toLocaleString()}</b></span>
        <span>Intensity: <b style="color:#c9d1d9;">${intens}</b></span>
        <span style="font-size:10px;color:#484f58;display:flex;align-items:center;gap:4px;margin-left:4px;">
          <span style="display:inline-block;width:24px;height:3px;border-radius:2px;background:linear-gradient(to right,#00d264,#ffa500,#ff1e1e);"></span>Low→High
        </span>
      `;
        }).catch(err => {
            console.error('[VPD] ✗', err.message);
            wrap.querySelector(`[data-vpd-card="${uid}"]`).innerHTML = `<div style="padding:16px;color:#f85149;font-size:12px;max-width:280px;">${err.message}</div>`;
            wrap.querySelector(`[data-vpd-stats="${uid}"]`).innerHTML = `<span style="color:#f85149;">⚠ ${err.message}</span>`;
            toast('⚠ VPD: ' + err.message, '#f85149');
        });
    }

    // ─── Main scanner ─────────────────────────────────────────────────────────
    const done = new WeakSet();

    function isRealImage(img) {
        // Accept any loaded image that is "content-sized" (not icons/avatars/ui)
        return (
            img.complete &&
            img.naturalWidth >= 80 &&
            img.naturalHeight >= 40 &&
            img.src &&
            img.src.startsWith('http') &&
            !img.src.includes('githubassets.com') &&   // GitHub UI assets
            !img.src.includes('/avatars/') &&         // User avatars
            !img.src.includes('emoji')                  // Emoji images
        );
    }

    async function waitLoad(img) {
        if (img.complete && img.naturalWidth > 0) return true;
        return new Promise(res => {
            img.addEventListener('load', () => res(true), { once: true });
            img.addEventListener('error', () => res(false), { once: true });
            setTimeout(() => res(false), 8000);
        });
    }

    async function tryBlock(block) {
        if (done.has(block)) return;

        // Find all "real" images inside this file block
        const candidates = [...block.querySelectorAll('img')].filter(isRealImage);
        console.log(`[VPD] Block has ${candidates.length} real images`);

        if (candidates.length < 2) return;

        // Wait for first two to be ready
        const [okA, okB] = await Promise.all([waitLoad(candidates[0]), waitLoad(candidates[1])]);
        if (!okA || !okB) return;

        const imgA = candidates[0], imgB = candidates[1];
        if (imgA.src === imgB.src) return; // same image, skip

        done.add(block);

        console.log('[VPD] Injecting for block:', block.className.slice(0, 60));

        // Find best insertion point: right after the render container
        const anchor =
            block.querySelector('.image-diff, .render-wrapper, [data-render-url], .js-render-blob-wrapper, .file-body, .data.highlight')
            ?? block.querySelector('.file-info')
            ?? block.lastElementChild;

        if (!anchor) { console.log('[VPD] No anchor'); return; }
        injectPanel(anchor, imgA.src, imgB.src);
    }

    function scan() {
        // GitHub wraps each changed file in .file or [data-tagsearch-path]
        const blocks = [...document.querySelectorAll('.file, [data-tagsearch-path]')];
        console.log(`[VPD] Scanning ${blocks.length} file blocks`);
        blocks.forEach(b => tryBlock(b));
    }

    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    [800, 2000, 4000, 8000].forEach(t => setTimeout(scan, t));

})();
