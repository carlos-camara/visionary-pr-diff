/**
 * Visionary PR Diff — Premium Inline Injector v5 (Diagnostic build)
 * Heat-map diff with comprehensive debug logging.
 */

(function () {
    'use strict';

    const VERSION = 'v5-heatmap';

    // ─── Diagnostic banner (visible in page for 4s to confirm extension is loaded) ─
    const diag = Object.assign(document.createElement('div'), { textContent: `🔍 Visionary PR Diff ${VERSION} active` });
    Object.assign(diag.style, {
        position: 'fixed', bottom: '16px', right: '16px', zIndex: '99999',
        background: 'linear-gradient(135deg,#0d1117,#161b22)',
        border: '1px solid #58a6ff', borderRadius: '8px',
        padding: '8px 14px', color: '#58a6ff', fontSize: '12px', fontWeight: '600',
        fontFamily: '-apple-system,sans-serif', boxShadow: '0 4px 16px rgba(0,0,0,.6)',
        transition: 'opacity .4s ease', opacity: '1'
    });
    document.body.appendChild(diag);
    setTimeout(() => { diag.style.opacity = '0'; setTimeout(() => diag.remove(), 500); }, 4000);

    console.log(`%c[Visionary PR Diff] ${VERSION} loaded ✓`, 'color:#58a6ff;font-weight:bold;font-size:13px');

    // ─── Image helpers ─────────────────────────────────────────────────────────

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('CORS/load error: ' + src.slice(0, 80)));
            img.src = src;
        });
    }

    function getPixels(img, w, h) {
        const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        return cv.getContext('2d').getImageData(0, 0, w, h).data;
    }

    // ─── Heatmap Diff Engine ──────────────────────────────────────────────────

    async function renderDiff(urlA, urlB) {
        console.log('[VPD] Loading images…', urlA.slice(0, 60), urlB.slice(0, 60));
        const [imgA, imgB] = await Promise.all([loadImage(urlA), loadImage(urlB)]);

        const w = Math.max(imgA.naturalWidth, imgB.naturalWidth);
        const h = Math.max(imgA.naturalHeight, imgB.naturalHeight);
        console.log('[VPD] Canvas size:', w, 'x', h);

        const dA = getPixels(imgA, w, h);
        const dB = getPixels(imgB, w, h);

        const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
        const ctx = cv.getContext('2d');
        const out = ctx.createImageData(w, h);
        const px = out.data;

        let changed = 0, totalDelta = 0;

        for (let i = 0; i < dA.length; i += 4) {
            const rA = dA[i], gA = dA[i + 1], bA = dA[i + 2];
            const rB = dB[i], gB = dB[i + 1], bB = dB[i + 2];

            const delta = Math.sqrt((rA - rB) ** 2 + (gA - gB) ** 2 + (bA - bB) ** 2);
            const norm = Math.min(delta / 441.67, 1);
            totalDelta += norm;

            if (norm < 0.02) {
                // Identical → dim original
                px[i] = rB * 0.35;
                px[i + 1] = gB * 0.35;
                px[i + 2] = bB * 0.35;
                px[i + 3] = 255;
            } else {
                changed++;
                const t = Math.min(norm * 2.5, 1);

                // Green → Amber → Red
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

                // Blend: after-image + heat
                const a = 0.50 + norm * 0.35;
                px[i] = Math.round(rB * (1 - a) + hR * a);
                px[i + 1] = Math.round(gB * (1 - a) + hG * a);
                px[i + 2] = Math.round(bB * (1 - a) + hB * a);
                px[i + 3] = 255;
            }
        }

        ctx.putImageData(out, 0, 0);

        const total = w * h;
        const pct = (changed / total * 100).toFixed(2);
        const intensity = (totalDelta / total * 100).toFixed(1);
        console.log(`[VPD] Done — ${pct}% changed, ${changed.toLocaleString()} pixels`);

        return { canvas: cv, pct, changed, total, intensity };
    }

    // ─── Panel Builder ────────────────────────────────────────────────────────

    function buildPanel(parent) {
        const p = document.createElement('div');
        p.style.cssText = [
            'display:inline-flex', 'flex-direction:column', 'align-items:stretch',
            'border-radius:10px', 'overflow:hidden',
            'border:1px solid rgba(88,166,255,.3)',
            'box-shadow:0 6px 30px rgba(0,0,0,.6)',
            'min-width:140px', 'max-width:260px', 'background:#0d1117',
            'vertical-align:top', 'flex-shrink:0'
        ].join(';');

        p.innerHTML = `
      <div style="padding:8px 12px;background:linear-gradient(135deg,rgba(88,166,255,.15),rgba(88,166,255,.04));border-bottom:1px solid rgba(88,166,255,.15);display:flex;align-items:center;gap:6px;">
        <span>🔍</span>
        <span style="font-size:12px;font-weight:700;color:#58a6ff;letter-spacing:.5px;font-family:-apple-system,sans-serif;">Diff</span>
        <span id="vpd-badge" style="margin-left:auto;font-size:10px;color:#484f58;">computing…</span>
      </div>
      <div id="vpd-slot" style="display:flex;justify-content:center;align-items:center;padding:10px;min-height:60px;background:#010409;">
        <span style="font-size:11px;color:#484f58;">Rendering…</span>
      </div>
      <div id="vpd-footer" style="padding:8px 10px;border-top:1px solid rgba(255,255,255,.06);font-family:-apple-system,sans-serif;font-size:11px;color:#8b949e;"></div>
    `;

        parent.appendChild(p);
        return p;
    }

    function fillPanel(panel, { pct, changed, intensity }) {
        const sev =
            parseFloat(pct) === 0 ? ['Identical', '#3fb950'] :
                parseFloat(pct) < 0.5 ? ['Trivial', '#3fb950'] :
                    parseFloat(pct) < 3 ? ['Minor', '#d29922'] :
                        parseFloat(pct) < 15 ? ['Moderate', '#f0883e'] :
                            ['Major', '#f85149'];

        panel.querySelector('#vpd-badge').textContent = sev[0];
        panel.querySelector('#vpd-badge').style.color = sev[1];
        panel.querySelector('#vpd-badge').style.fontWeight = '600';

        panel.querySelector('#vpd-footer').innerHTML = `
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${sev[1]};"></span>
        <b style="color:${sev[1]};">${sev[0]}</b>
      </div>
      <div style="line-height:1.8;">
        <div>Changed: <b style="color:#c9d1d9;">${pct}%</b></div>
        <div>Pixels: <b style="color:#c9d1d9;">${changed.toLocaleString()}</b></div>
        <div>Intensity: <b style="color:#c9d1d9;">${intensity}</b></div>
      </div>
      <div style="margin-top:8px;border-top:1px solid rgba(255,255,255,.06);padding-top:6px;">
        <div style="font-size:10px;color:#484f58;margin-bottom:3px;">Heat scale</div>
        <div style="height:5px;border-radius:3px;background:linear-gradient(to right,#00d264,#ffa500,#ff1e1e);"></div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:#484f58;margin-top:2px;"><span>Low</span><span>High</span></div>
      </div>
    `;
    }

    // ─── Image Extraction ─────────────────────────────────────────────────────

    function extractImages(fileEl) {
        // Try every known Github selector combination
        const strategies = [
            // Strategy 1: explicit position attributes
            () => {
                const b = fileEl.querySelector('[data-position="left"] img, .image-diff-item.deleted img, .render-cell-left img');
                const a = fileEl.querySelector('[data-position="right"] img, .image-diff-item.added img, .render-cell-right img');
                return b && a ? { before: b, after: a } : null;
            },
            // Strategy 2: render-wrapper with 2+ images
            () => {
                const c = fileEl.querySelector('.render-wrapper, .image-diff, [data-render-url]');
                if (!c) return null;
                const imgs = [...c.querySelectorAll('img')].filter(x => x.src && !x.src.includes('avatar') && !x.src.includes('emoji'));
                return imgs.length >= 2 ? { before: imgs[0], after: imgs[1] } : null;
            },
            // Strategy 3: any 2 non-avatar images in block
            () => {
                const imgs = [...fileEl.querySelectorAll('img')].filter(x => x.src && !x.src.includes('avatar') && !x.src.includes('emoji') && x.naturalWidth > 4);
                return imgs.length >= 2 ? { before: imgs[0], after: imgs[1] } : null;
            }
        ];

        for (const s of strategies) {
            const result = s();
            if (result) { console.log('[VPD] Images found via strategy', strategies.indexOf(s) + 1, result.before.src.slice(0, 60)); return result; }
        }

        console.log('[VPD] No images found in block');
        return null;
    }

    // ─── Inline Injection ─────────────────────────────────────────────────────

    async function inject(fileEl) {
        if (fileEl.dataset.vpd) return;
        fileEl.dataset.vpd = '1';

        const srcs = extractImages(fileEl);
        if (!srcs) return;

        // Find the row that contains both images
        const imageRow =
            srcs.before.closest('.render-wrapper, .image-diff, [data-render-url]') ||
            srcs.before.closest('td, [class*="d-flex"], [class*="table-row"]') ||
            srcs.before.parentElement;
        if (!imageRow) { console.log('[VPD] No row found'); return; }

        // Make the container flex so the panel sits alongside
        imageRow.style.setProperty('display', 'flex', 'important');
        imageRow.style.setProperty('flex-wrap', 'wrap', 'important');
        imageRow.style.setProperty('align-items', 'flex-start', 'important');
        imageRow.style.setProperty('gap', '12px', 'important');

        const panel = buildPanel(imageRow);

        try {
            const result = await renderDiff(srcs.before.src, srcs.after.src);

            result.canvas.style.cssText = 'max-width:100%;height:auto;display:block;border-radius:4px;';

            const slot = panel.querySelector('#vpd-slot');
            slot.innerHTML = '';
            slot.appendChild(result.canvas);
            fillPanel(panel, result);
        } catch (err) {
            console.error('[VPD] Error:', err.message);
            panel.querySelector('#vpd-slot').innerHTML =
                `<span style="font-size:11px;color:#f85149;padding:12px;text-align:center;">${err.message}</span>`;
        }
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
            const nodes = document.querySelectorAll(sel);
            if (nodes.length) { console.log('[VPD] Scanning', nodes.length, 'blocks with:', sel); nodes.forEach(inject); break; }
        }
    }

    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    [1000, 2500, 5000, 10000].forEach(t => setTimeout(scan, t));

    console.log('[VPD] Observer attached, scanning scheduled.');

})();
