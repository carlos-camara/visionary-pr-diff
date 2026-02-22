/**
 * Visionary PR Diff - Content Script v2
 * Advanced pixel-level image regression analysis for GitHub PRs.
 *
 * GitHub DOM selectors (as of 2024/2025):
 * - File container:           [data-file-type] or .file  (each changed file block)
 * - Image diff container:     .image-diff  or [data-render-url]
 * - The image diff tab list:  .image-diff-controls  or  [data-tab-item]
 * - Before image:             .image-diff-item.deleted img  or  .image-replace-header + div img  
 * - After image:              .image-diff-item.added img
 * - File header actions:      .file-actions  (inside .file-header)
 */

(function () {
    'use strict';

    console.log('%c[Visionary PR Diff] Engine v2 active', 'color:#58a6ff;font-weight:bold');

    // ─── Utility ────────────────────────────────────────────────────────────────

    function createModal() {
        const overlay = document.createElement('div');
        overlay.id = 'vpd-modal-overlay';
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'background:rgba(0,0,0,.85)',
            'backdrop-filter:blur(8px)', 'z-index:99999',
            'display:none', 'align-items:center', 'justify-content:center'
        ].join(';');

        overlay.innerHTML = `
      <div id="vpd-modal" style="
        background:#0d1117; border:1px solid #30363d; border-radius:12px;
        padding:24px; max-width:92vw; max-height:90vh; overflow:auto;
        box-shadow:0 25px 50px rgba(0,0,0,.7); position:relative; color:#c9d1d9;
      ">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
          <span style="font-size:20px;">🔍</span>
          <h2 style="margin:0; color:#58a6ff; font-size:16px; font-weight:600;">Visual Regression Analysis</h2>
          <button id="vpd-close" style="
            margin-left:auto; background:none; border:none; color:#8b949e;
            cursor:pointer; font-size:18px; line-height:1; padding:4px 8px;
          ">✕</button>
        </div>
        <div id="vpd-canvas-host" style="
          display:flex; flex-wrap:wrap; gap:20px; justify-content:center;
          background:#010409; padding:20px; border-radius:8px; min-height:80px;
        ">
          <p style="color:#8b949e; align-self:center;">Analyzing pixels…</p>
        </div>
        <p id="vpd-legend" style="margin-top:12px; font-size:13px; color:#8b949e; display:none;">
          <span style="display:inline-block;width:12px;height:12px;background:#ff00ff;border-radius:2px;margin-right:6px;vertical-align:middle;"></span>
          Magenta = detected pixel difference &nbsp;|&nbsp;
          <span style="display:inline-block;width:12px;height:12px;background:#1c1c1c;border:1px solid #30363d;border-radius:2px;margin-right:6px;vertical-align:middle;"></span>
          Transparent = identical pixels
        </p>
      </div>
    `;

        document.body.appendChild(overlay);

        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
        overlay.querySelector('#vpd-close').addEventListener('click', () => { overlay.style.display = 'none'; });

        return overlay;
    }

    let _modal = null;
    function getModal() {
        if (!_modal) _modal = createModal();
        return _modal;
    }

    // ─── Image Extraction ────────────────────────────────────────────────────────

    /**
     * Finds the before/after img elements within a file diff container.
     * GitHub uses several possible structures depending on the view mode.
     */
    function extractImages(fileEl) {
        // Strategy 1: explicit deleted / added sections (most common rich-diff layout)
        const deleted = fileEl.querySelector('.image-diff-item.deleted img, .js-diff-item.deleted img, [data-position="left"] img, .file-deleted img');
        const added = fileEl.querySelector('.image-diff-item.added img,   .js-diff-item.added img,   [data-position="right"] img, .file-added img');

        if (deleted && added) return { before: deleted.src, after: added.src };

        // Strategy 2: just any two images in the diff container (2-up view)
        const imgs = Array.from(fileEl.querySelectorAll('.image-diff img, [data-render-url] img, .render-wrapper img'));
        if (imgs.length >= 2) return { before: imgs[0].src, after: imgs[1].src };

        // Strategy 3: any two img elements in the file block
        const all = Array.from(fileEl.querySelectorAll('img')).filter(i => i.src && !i.src.includes('avatar'));
        if (all.length >= 2) return { before: all[0].src, after: all[1].src };

        return null;
    }

    // ─── Button Injection ────────────────────────────────────────────────────────

    function injectButton(fileEl) {
        if (fileEl.dataset.vpdInjected) return;

        // Is this file block an image diff?
        const isImageDiff =
            fileEl.querySelector('.image-diff, [data-render-url], .render-wrapper') ||
            fileEl.querySelector('img[src*=".png"], img[src*=".jpg"], img[src*=".gif"], img[src*=".svg"], img[src*=".webp"]');

        if (!isImageDiff) return;

        const actionsBar = fileEl.querySelector('.file-actions, .js-file-header-dropdown, .file-header-actions');
        if (!actionsBar) return;

        const btn = document.createElement('button');
        btn.className = 'vpd-trigger-btn';
        btn.textContent = '🔍 Visual Diff';
        btn.style.cssText = [
            'margin-left:8px', 'padding:3px 10px',
            'border-radius:6px', 'border:1px solid #30363d',
            'background:linear-gradient(135deg,#21262d,#161b22)',
            'color:#c9d1d9', 'cursor:pointer', 'font-size:12px',
            'font-weight:500', 'transition:all .2s'
        ].join(';');

        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'linear-gradient(135deg,#2ea44f,#238636)';
            btn.style.borderColor = '#3fb950';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'linear-gradient(135deg,#21262d,#161b22)';
            btn.style.borderColor = '#30363d';
        });
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            runDiff(fileEl);
        });

        actionsBar.prepend(btn);
        fileEl.dataset.vpdInjected = 'true';
    }

    // ─── Diff Runner ─────────────────────────────────────────────────────────────

    async function runDiff(fileEl) {
        const modal = getModal();
        const host = modal.querySelector('#vpd-canvas-host');
        const legend = modal.querySelector('#vpd-legend');

        host.innerHTML = '<p style="color:#8b949e;align-self:center;">Loading images…</p>';
        legend.style.display = 'none';
        modal.style.display = 'flex';

        const srcs = extractImages(fileEl);
        if (!srcs) {
            host.innerHTML = '<p style="color:#f85149;">Could not locate before/after images.<br>Make sure you are in the <strong>2-up</strong> view mode.</p>';
            return;
        }

        try {
            const diffCanvas = await window.VisionaryDiffEngine.compareImages(srcs.before, srcs.after);
            diffCanvas.style.cssText = 'max-width:100%;height:auto;border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,.5)';

            // Labels
            const label = txt => Object.assign(document.createElement('p'), {
                textContent: txt,
                style: 'color:#8b949e;margin:0 0 6px;font-size:12px;text-align:center;font-weight:600'
            });

            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px';
            wrap.appendChild(label('🔍 DIFFERENCE MAP'));
            wrap.appendChild(diffCanvas);

            host.innerHTML = '';
            host.appendChild(wrap);
            legend.style.display = 'block';
        } catch (err) {
            console.error('[Visionary PR Diff] Error:', err);
            host.innerHTML = `<p style="color:#f85149;">Error: ${err.message}</p>`;
        }
    }

    // ─── DOM Scanner ─────────────────────────────────────────────────────────────

    function scan() {
        // GitHub puts each changed file in a `[data-details-container-group]` or `.file` wrapper
        const selectors = [
            '[data-details-container-group]',
            '.js-diff-container',
            '.file.js-details-container',
            '.file'
        ];

        let found = 0;
        for (const sel of selectors) {
            document.querySelectorAll(sel).forEach(el => {
                injectButton(el);
                found++;
            });
            if (found) break; // use the first selector that matches
        }
    }

    const observer = new MutationObserver(() => scan());
    observer.observe(document.body, { childList: true, subtree: true });

    // Initial scan after a short delay (GitHub needs time to render the diff)
    setTimeout(scan, 1500);
    setTimeout(scan, 4000); // second attempt for slow connections

})();
