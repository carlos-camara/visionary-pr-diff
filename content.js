/**
 * Visionary PR Diff — v8 (Image-first strategy + exhaustive debug)
 *
 * Instead of relying on container selectors, we find ALL loaded images
 * on the page, group them by their parent render block, and inject
 * a Diff panel for every pair we find.
 */

(function () {
    'use strict';
    const V = 'v8';

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

    // ─── Load image with CORS ─────────────────────────────────────────────────
    function corsLoad(src) {
        // Strip any existing cache-busters
        const clean = src.split('?')[0];
        return new Promise((res, rej) => {
            const i = new Image();
            i.crossOrigin = 'Anonymous';
            i.onload = () => res(i);
            i.onerror = () => rej(new Error('CORS blocked: ' + clean.slice(0, 60)));
            i.src = clean;
        });
    }

    // ─── Heatmap ──────────────────────────────────────────────────────────────
    async function buildHeatmap(srcA, srcB) {
        console.log('[VPD] Loading pair:', srcA.slice(0, 50), '|', srcB.slice(0, 50));
        const [a, b] = await Promise.all([corsLoad(srcA), corsLoad(srcB)]);
        const W = Math.max(a.naturalWidth, b.naturalWidth), H = Math.max(a.naturalHeight, b.naturalHeight);
        console.log('[VPD] Canvas:', W, 'x', H);

        function px(img) { const c = Object.assign(document.createElement('canvas'), { width: W, height: H }); c.getContext('2d').drawImage(img, 0, 0, W, H); return c.getContext('2d').getImageData(0, 0, W, H).data; }
        const A = px(a), B = px(b);
        const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
        const ctx = cv.getContext('2d'); const id = ctx.createImageData(W, H); const d = id.data;
        let diff = 0, sumD = 0;
        for (let i = 0; i < A.length; i += 4) {
            const dr = A[i] - B[i], dg = A[i + 1] - B[i + 1], db = A[i + 2] - B[i + 2];
            const n = Math.min(Math.sqrt(dr * dr + dg * dg + db * db) / 441.67, 1); sumD += n;
            if (n < 0.025) { d[i] = B[i] * .3; d[i + 1] = B[i + 1] * .3; d[i + 2] = B[i + 2] * .3; d[i + 3] = 255; }
            else {
                diff++; const t = Math.min(n * 2.5, 1);
                let r, g, b2;
                if (t < .5) { const s = t * 2; r = Math.round(s * 255); g = Math.round(220 - s * 60); b2 = Math.round(100 - s * 100); }
                else { const s = (t - .5) * 2; r = 255; g = Math.round(160 - s * 140); b2 = Math.round(s * 30); }
                const al = Math.min(.50 + n * .40, .92);
                d[i] = Math.round(B[i] * (1 - al) + r * al); d[i + 1] = Math.round(B[i + 1] * (1 - al) + g * al);
                d[i + 2] = Math.round(B[i + 2] * (1 - al) + b2 * al); d[i + 3] = 255;
            }
        }
        ctx.putImageData(id, 0, 0);
        // watermark
        ctx.save(); ctx.font = 'bold 11px -apple-system,sans-serif'; ctx.fillStyle = 'rgba(88,166,255,.45)'; ctx.textAlign = 'right'; ctx.fillText(`DIFF ${W}×${H}`, W - 6, H - 6); ctx.restore();
        const total = W * H, pct = (diff / total * 100).toFixed(2), intens = (sumD / total * 100).toFixed(1);
        return { canvas: cv, pct, diff, intens, W, H };
    }

    // ─── Panel ────────────────────────────────────────────────────────────────
    function sev(pct) { const p = parseFloat(pct); if (p === 0) return ['Identical', '#3fb950']; if (p < .5) return ['Trivial', '#3fb950']; if (p < 3) return ['Minor', '#d29922']; if (p < 15) return ['Moderate', '#f0883e']; return ['Major', '#f85149']; }

    function injectPanel(anchor, srcA, srcB) {
        const wrap = document.createElement('div');
        wrap.dataset.vpd = 'panel';
        wrap.style.cssText = 'margin-top:10px;border-top:1px solid #30363d;padding-top:10px;text-align:center;font-family:-apple-system,sans-serif;';
        wrap.innerHTML = `
      <div style="font-size:13px;font-weight:600;color:#58a6ff;margin-bottom:8px;letter-spacing:.4px;">Diff</div>
      <div id="vpd-card-${Date.now()}" style="display:inline-block;border:1px solid rgba(88,166,255,.3);border-radius:8px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.6);">
        <div style="padding:24px 40px;color:#484f58;font-size:12px;">Computing…</div>
      </div>
      <div class="vpd-stats" style="margin-top:8px;display:inline-flex;align-items:center;gap:12px;padding:6px 14px;background:rgba(255,255,255,.02);border:1px solid #30363d;border-radius:6px;font-size:12px;color:#8b949e;">Computing…</div>
    `;
        anchor.after(wrap);

        const cardId = wrap.querySelector('[id^="vpd-card-"]').id;

        buildHeatmap(srcA, srcB).then(({ canvas, pct, diff, intens }) => {
            const [label, color] = sev(pct);
            canvas.style.cssText = 'display:block;max-width:min(587px,90vw);height:auto;';
            const leg = document.createElement('div');
            leg.style.cssText = 'height:4px;width:100%;background:linear-gradient(to right,#00d264,#ffa500,#ff1e1e);';
            const card = document.getElementById(cardId);
            card.innerHTML = ''; card.appendChild(canvas); card.appendChild(leg);
            wrap.querySelector('.vpd-stats').innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></span><b style="color:${color};">${label}</b></span>
        <span>Changed: <b style="color:#c9d1d9;">${pct}%</b></span>
        <span>Pixels: <b style="color:#c9d1d9;">${parseInt(diff).toLocaleString()}</b></span>
        <span>Intensity: <b style="color:#c9d1d9;">${intens}</b></span>
        <span style="font-size:10px;color:#484f58;display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:24px;height:3px;border-radius:2px;background:linear-gradient(to right,#00d264,#ffa500,#ff1e1e);"></span>Low→High</span>
      `;
            console.log(`[VPD] ✓ Diff rendered: ${pct}% changed`);
        }).catch(err => {
            console.error('[VPD] ✗ Error:', err.message);
            document.getElementById(cardId).innerHTML = `<div style="padding:16px;color:#f85149;font-size:12px;max-width:260px;">${err.message}</div>`;
            wrap.querySelector('.vpd-stats').innerHTML = `<span style="color:#f85149;">⚠ ${err.message}</span>`;
            toast('⚠ VPD: ' + err.message, '#f85149');
        });
    }

    // ─── Image-first scanner ──────────────────────────────────────────────────
    const processed = new WeakSet();

    // Content-image domains only (never GitHub UI/animation assets)
    const CONTENT_DOMAINS = [
        'raw.githubusercontent.com',
        'user-images.githubusercontent.com',
        'camo.githubusercontent.com',
        'objects.githubusercontent.com',
        'private-user-images.githubusercontent.com'
    ];

    function isContentImg(img) {
        if (!img.src || !img.complete || img.naturalWidth < 30 || img.naturalHeight < 30) return false;
        if (img.dataset.vpd) return false;
        try {
            const host = new URL(img.src).hostname;
            return CONTENT_DOMAINS.some(d => host === d || host.endsWith('.' + d));
        } catch { return false; }
    }

    function scanImages() {
        const allImgs = [...document.querySelectorAll('img')].filter(isContentImg);

        console.log(`[VPD] Found ${allImgs.length} candidate images on page`);
        if (!allImgs.length) return;

        // Group into pairs by common ancestor
        const seen = new Set();
        for (const img of allImgs) {
            if (seen.has(img)) continue;

            // Walk up to find a container that has exactly 2+ images
            let node = img.parentElement;
            for (let depth = 0; depth < 8; depth++) {
                if (!node) break;
                const siblings = [...node.querySelectorAll('img')].filter(x =>
                    x.complete && x.naturalWidth > 50 && !x.dataset.vpd && !x.src.includes('avatar')
                );
                if (siblings.length >= 2) {
                    if (processed.has(node)) break;
                    processed.add(node);

                    const imgA = siblings[0], imgB = siblings[1];
                    seen.add(imgA);
                    seen.add(imgB);

                    console.log(`[VPD] Pair found at depth ${depth}, ancestor: ${node.tagName}.${[...node.classList].join('.')}`);
                    console.log(`[VPD]   Before: ${imgA.src.slice(0, 60)}`);
                    console.log(`[VPD]   After:  ${imgB.src.slice(0, 60)}`);

                    // Mark as processed only AFTER successful injection attempt
                    injectPanel(node, imgA.src, imgB.src);
                    imgA.dataset.vpd = '1';
                    imgB.dataset.vpd = '1';
                    break;
                }
                node = node.parentElement;
            }
        }
    }

    // Also try waiting for images to load if none are ready yet
    function scanWithRetry(attempt = 0) {
        const readyImgs = [...document.querySelectorAll('img')].filter(x =>
            x.complete && x.naturalWidth > 50 && !x.src.includes('avatar')
        );
        console.log(`[VPD] Attempt ${attempt}: ${readyImgs.length} loaded imgs on page`);

        if (readyImgs.length >= 2) {
            scanImages();
        } else if (attempt < 5) {
            // No images loaded yet — retry
            setTimeout(() => scanWithRetry(attempt + 1), 2000);
        } else {
            console.log('[VPD] Giving up after 5 attempts — no image pairs found');
        }
    }

    new MutationObserver(() => {
        // Only re-scan if new images appeared
        const imgs = [...document.querySelectorAll('img')].filter(x => x.complete && x.naturalWidth > 50 && !x.dataset.vpd && !x.src.includes('avatar'));
        if (imgs.length >= 2) scanImages();
    }).observe(document.body, { childList: true, subtree: true });

    [600, 1500, 3000, 6000].forEach(t => setTimeout(() => scanWithRetry(), t));

})();
