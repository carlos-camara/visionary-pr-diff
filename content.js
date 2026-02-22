/**
 * Visionary PR Diff
 * Advanced pixel-level image regression analysis for GitHub PRs.
 */

console.log('🤖 Visionary PR Diff engine active.');

// --- Core Configuration ---
const SELECTORS = {
    FILE_CONTAINER: '.file',
    IMAGE_DIFF_CONTAINER: '.render-wrapper, .image-diff',
    FILE_ACTIONS: '.file-actions',
    IMAGES: 'img'
};

let modalContainer = null;

/**
 * Initialize Modal
 */
function initModal() {
    if (modalContainer) return;

    modalContainer = document.createElement('div');
    modalContainer.className = 'visionary-modal-overlay';
    modalContainer.innerHTML = `
    <div class="visionary-diff-container">
      <div class="visionary-diff-close">✕ Close</div>
      <h3 style="color: #58a6ff; margin-bottom: 20px;">🔍 Visual Regression Analysis</h3>
      <div id="visionary-canvas-host" style="display: flex; justify-content: center; background: #0d1117; padding: 20px; border-radius: 8px;">
        <p style="color: #8b949e;">Analyzing pixels...</p>
      </div>
      <p style="margin-top: 15px; font-size: 13px; color: #8b949e;">
        <span style="color: #ff00ff;">■</span> Magenta pixels indicate detected differences between the original and new image.
      </p>
    </div>
  `;

    document.body.appendChild(modalContainer);
    modalContainer.querySelector('.visionary-diff-close').onclick = () => {
        modalContainer.classList.remove('active');
    };
}

/**
 * Main Observer to track DOM changes
 */
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
            scanForImageDiffs();
        }
    }
});

/**
 * Scans for image diffs and injects the button
 */
function scanForImageDiffs() {
    const fileContainers = document.querySelectorAll(SELECTORS.FILE_CONTAINER);

    fileContainers.forEach(container => {
        if (container.dataset.visionaryDiffInjected) return;

        const isImageDiff = container.querySelector(SELECTORS.IMAGE_DIFF_CONTAINER);
        if (!isImageDiff) return;

        injectDiffAction(container);
    });
}

function injectDiffAction(container) {
    const headerActions = container.querySelector(SELECTORS.FILE_ACTIONS);
    if (!headerActions) return;

    const diffButton = document.createElement('button');
    diffButton.className = 'btn btn-sm btn-primary ml-2 visionary-btn';
    diffButton.innerHTML = '🔍 Visual Diff';
    diffButton.onclick = (e) => {
        e.preventDefault();
        handleVisualDiff(container);
    };

    headerActions.appendChild(diffButton);
    container.dataset.visionaryDiffInjected = 'true';
}

/**
 * Orchestrates the image comparison logic
 */
async function handleVisualDiff(container) {
    initModal();
    modalContainer.classList.add('active');
    const canvasHost = document.getElementById('visionary-canvas-host');
    canvasHost.innerHTML = '<p style="color: #8b949e;">Analyzing pixels...</p>';

    try {
        const images = Array.from(container.querySelectorAll(SELECTORS.IMAGES));
        // GitHub typically has 'before' and 'after' images in the rich diff view
        if (images.length < 2) {
            canvasHost.innerHTML = '<p style="color: #f85149;">Error: Source images not found. Please ensure you are in the "Rich Diff" view.</p>';
            return;
        }

        const urlBefore = images[0].src;
        const urlAfter = images[1].src;

        const diffCanvas = await window.VisionaryDiffEngine.compareImages(urlBefore, urlAfter);

        canvasHost.innerHTML = '';
        canvasHost.appendChild(diffCanvas);
        diffCanvas.style.maxWidth = '100%';
        diffCanvas.style.height = 'auto';

    } catch (err) {
        console.error('Visionary Diff Error:', err);
        canvasHost.innerHTML = `<p style="color: #f85149;">Error: ${err.message}</p>`;
    }
}

// Global Initialization
observer.observe(document.body, { childList: true, subtree: true });
scanForImageDiffs();
initModal();
