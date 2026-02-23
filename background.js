/**
 * Visionary PR Diff - Background Service Worker (v25)
 * Proxies raw image bytes with credentials.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'FETCH_IMAGE_RAW') {
        fetchImageRaw(request.url)
            .then(sendResponse)
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});

async function fetchImageRaw(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        console.log('[VPD-BG] Fetching:', url);
        const response = await fetch(url, {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('Content-Type') || '';
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        return {
            success: true,
            bytes: Array.from(bytes),
            contentType
        };
    } catch (error) {
        clearTimeout(timeout);
        const isTimeout = error.name === 'AbortError';
        console.error('[VPD-BG] Error:', isTimeout ? 'Timeout' : error.message);
        return {
            success: false,
            error: isTimeout ? 'Background fetch timed out (10s)' : error.message
        };
    }
}
