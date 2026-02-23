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
    try {
        console.log('[VPD-BG] Fetching raw:', url);
        // Include credentials to handle private repos / session-gated images
        // Use no-store to avoid getting a cached error page
        const response = await fetch(url, {
            credentials: 'include',
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('Content-Type') || '';
        const buffer = await response.arrayBuffer();

        // Convert ArrayBuffer to Array for sendMessage (Chrome structured clone handles this)
        // Actually, Uint8Array is often better managed.
        const bytes = new Uint8Array(buffer);

        // Structured clone in Chrome handles Uint8Array efficiently
        return {
            success: true,
            bytes: Array.from(bytes), // Still using Array for max compatibility in older versions, but Uint8Array preferred
            contentType
        };
    } catch (error) {
        console.error('[VPD-BG] Fetch error:', error);
        return { success: false, error: error.message };
    }
}
