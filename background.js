// Handles the two keyboard shortcuts (see manifest "commands"):
//   copy-all-tabs   -> copies every open tab's link to the clipboard
//   copy-current-tab -> copies just the active tab's link
// Runs even when the popup isn't open, using an offscreen document for
// clipboard access and a notification for feedback.

const OFFSCREEN_URL = "offscreen.html";

async function ensureOffscreenDocument() {
  try {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });
    if (existing.length > 0) return;
  } catch (e) {
    // getContexts unavailable on this Chrome version — fall through and
    // rely on createDocument's own "already exists" error below.
  }

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ["CLIPBOARD"],
      justification: "Write copied tab links to the clipboard from a keyboard shortcut.",
    });
  } catch (e) {
    if (!String(e).includes("single offscreen document")) throw e;
  }
}

async function copyToClipboard(text) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({ type: "OFFSCREEN_COPY", text });
  return response && response.ok;
}

function notify(message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Tab Link Copier",
    message,
  });
}

async function getPreferredFormat() {
  const { lastFormat } = await chrome.storage.local.get("lastFormat");
  return lastFormat || "plain";
}

function formatLinks(tabs, format) {
  switch (format) {
    case "titled":
      return tabs.map((t) => `${t.title}\n${t.url}`).join("\n\n");
    case "markdown":
      return tabs.map((t) => `[${t.title}](${t.url})`).join("\n");
    case "html":
      return tabs.map((t) => `<a href="${t.url}">${t.title}</a>`).join("\n");
    case "json":
      return JSON.stringify(tabs.map((t) => ({ title: t.title, url: t.url })), null, 2);
    default:
      return tabs.map((t) => t.url).join("\n");
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  const format = await getPreferredFormat();

  if (command === "copy-all-tabs") {
    const tabs = await chrome.tabs.query({});
    const usable = tabs.filter((t) => t.url).map((t) => ({ title: t.title || t.url, url: t.url }));
    if (!usable.length) return;

    const text = formatLinks(usable, format);
    const ok = await copyToClipboard(text);
    notify(ok ? `Copied ${usable.length} tab links` : "Couldn't copy — click the extension icon and try Copy tabs instead");
  }

  if (command === "copy-current-tab") {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.url) return;

    const text = formatLinks([{ title: activeTab.title || activeTab.url, url: activeTab.url }], format);
    const ok = await copyToClipboard(text);
    notify(ok ? "Copied current tab link" : "Couldn't copy — click the extension icon and try again");
  }
});
