/**
 * Visionary PR Diff - Core Engine (v25)
 * Handles local decoding of background-fetched bytes.
 */

class VisionaryDiffEngine {
    static async compareImages(urlA, urlB) {
        console.log('[VPD] Starting Binary-Stream comparison...');

        const [resA, resB] = await Promise.all([
            this.fetchBytes(urlA),
            this.fetchBytes(urlB)
        ]);

        if (!resA.success || !resB.success) {
            throw new Error(resA.error || resB.error || 'Byte fetch failed');
        }

        // Decode locally in content script
        const [imgA, imgB] = await Promise.all([
            this.decodeBytes(resA.bytes, resA.contentType),
            this.decodeBytes(resB.bytes, resB.contentType)
        ]);

        const width = Math.max(imgA.width, imgB.width);
        const height = Math.max(imgA.height, imgB.height);

        const canvasBefore = this.createCanvas(width, height);
        const canvasAfter = this.createCanvas(width, height);
        const canvasDiff = this.createCanvas(width, height);

        const ctxBefore = canvasBefore.getContext('2d');
        const ctxAfter = canvasAfter.getContext('2d');
        const ctxDiff = canvasDiff.getContext('2d');

        ctxBefore.drawImage(imgA, 0, 0);
        ctxAfter.drawImage(imgB, 0, 0);

        const dataA = ctxBefore.getImageData(0, 0, width, height).data;
        const dataB = ctxAfter.getImageData(0, 0, width, height).data;
        const diffImgData = ctxDiff.createImageData(width, height);
        const out = diffImgData.data;

        for (let i = 0; i < dataA.length; i += 4) {
            if (dataA[i] !== dataB[i] || dataA[i + 1] !== dataB[i + 1] || dataA[i + 2] !== dataB[i + 2] || dataA[i + 3] !== dataB[i + 3]) {
                out[i] = 255; out[i + 1] = 0; out[i + 2] = 255; out[i + 3] = 255;
            } else {
                out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0;
            }
        }

        ctxDiff.putImageData(diffImgData, 0, 0);
        return { canvas: canvasDiff, imgB };
    }

    static async fetchBytes(url) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'FETCH_IMAGE_RAW', url }, resolve);
        });
    }

    static async decodeBytes(bytes, contentType) {
        const uint8 = new Uint8Array(bytes);

        if (!contentType || !contentType.startsWith('image/')) {
            const snippet = String.fromCharCode.apply(null, uint8.slice(0, 50)).replace(/[^\x20-\x7E]/g, '?');
            throw new Error(`Invalid content type: ${contentType} (Starts with: "${snippet}...")`);
        }

        const blob = new Blob([uint8], { type: contentType });
        const objectUrl = URL.createObjectURL(blob);
        try {
            return await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    if (img.naturalWidth === 0) reject(new Error('Image decoded but has 0 width'));
                    else resolve(img);
                };
                img.onerror = () => reject(new Error('Browser failed to decode image data'));
                img.src = objectUrl;
            });
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }

    static createCanvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }
}

window.VisionaryDiffEngine = VisionaryDiffEngine;
