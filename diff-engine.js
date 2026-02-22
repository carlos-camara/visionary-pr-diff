/**
 * Visionary PR Diff - Core Engine
 * Handles pixel-level comparison between two images.
 */

class VisionaryDiffEngine {
    /**
     * Compares two image URLs and returns a canvas with the highlighted differences.
     * @param {string} urlBefore 
     * @param {string} urlAfter 
     */
    static async compareImages(urlBefore, urlAfter) {
        const [imgBefore, imgAfter] = await Promise.all([
            this.loadImage(urlBefore),
            this.loadImage(urlAfter)
        ]);

        const width = Math.max(imgBefore.width, imgAfter.width);
        const height = Math.max(imgBefore.height, imgAfter.height);

        const canvasBefore = this.createCanvas(width, height);
        const canvasAfter = this.createCanvas(width, height);
        const canvasDiff = this.createCanvas(width, height);

        const ctxBefore = canvasBefore.getContext('2d');
        const ctxAfter = canvasAfter.getContext('2d');
        const ctxDiff = canvasDiff.getContext('2d');

        ctxBefore.drawImage(imgBefore, 0, 0);
        ctxAfter.drawImage(imgAfter, 0, 0);

        const dataBefore = ctxBefore.getImageData(0, 0, width, height).data;
        const dataAfter = ctxAfter.getImageData(0, 0, width, height).data;
        const diffImgData = ctxDiff.createImageData(width, height);
        const dataDiff = diffImgData.data;

        for (let i = 0; i < dataBefore.length; i += 4) {
            const r1 = dataBefore[i], g1 = dataBefore[i + 1], b1 = dataBefore[i + 2], a1 = dataBefore[i + 3];
            const r2 = dataAfter[i], g2 = dataAfter[i + 1], b2 = dataAfter[i + 2], a2 = dataAfter[i + 3];

            if (r1 !== r2 || g1 !== g2 || b1 !== b2 || a1 !== a2) {
                // Pixel is different - highlight in magenta
                dataDiff[i] = 255;     // R
                dataDiff[i + 1] = 0;   // G
                dataDiff[i + 2] = 255; // B
                dataDiff[i + 3] = 255; // A
            } else {
                // Pixel is same - keep transparent or low opacity
                dataDiff[i] = 0;
                dataDiff[i + 1] = 0;
                dataDiff[i + 2] = 0;
                dataDiff[i + 3] = 0;
            }
        }

        ctxDiff.putImageData(diffImgData, 0, 0);
        return canvasDiff;
    }

    static loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }

    static createCanvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }
}

window.VisionaryDiffEngine = VisionaryDiffEngine;
