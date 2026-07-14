// The offscreen document has a real DOM, so navigator.clipboard works here
// even though it can't be called directly from the background service worker.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "OFFSCREEN_COPY") return;

  (async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      sendResponse({ ok: true });
    } catch (e) {
      // Fallback: textarea + execCommand
      try {
        const ta = document.createElement("textarea");
        ta.value = message.text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        sendResponse({ ok: true });
      } catch (e2) {
        sendResponse({ ok: false, error: String(e2) });
      }
    }
  })();

  return true; // keep the message channel open for the async response
});
