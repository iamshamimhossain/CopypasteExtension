// ---------------- State ----------------
let allTabs = [];           // [{id, title, url, favIconUrl, windowId}]
let selectedIds = new Set();
let filterText = "";

// ---------------- Elements ----------------
const tabListEl = document.getElementById("tabList");
const tabCountLabel = document.getElementById("tabCountLabel");
const searchInput = document.getElementById("searchInput");
const selectAllBtn = document.getElementById("selectAllBtn");
const formatSelect = document.getElementById("formatSelect");
const copyBtn = document.getElementById("copyBtn");
const copyBtnText = document.getElementById("copyBtnText");
const toast = document.getElementById("toast");

const urlInput = document.getElementById("urlInput");
const urlCountLabel = document.getElementById("urlCountLabel");
const pasteBtn = document.getElementById("pasteBtn");
const openBtn = document.getElementById("openBtn");

const segButtons = document.querySelectorAll(".seg-btn");
const panels = {
  copy: document.getElementById("panel-copy"),
  open: document.getElementById("panel-open"),
};

// ---------------- Panel switching ----------------
segButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    segButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.panel;
    Object.entries(panels).forEach(([key, el]) => {
      el.classList.toggle("hidden", key !== target);
    });
  });
});

// ---------------- Load tabs ----------------
async function loadTabs() {
  const tabs = await chrome.tabs.query({});
  allTabs = tabs
    .filter((t) => t.url) // skip tabs without a resolvable url
    .map((t) => ({
      id: t.id,
      title: t.title || t.url,
      url: t.url,
      favIconUrl: t.favIconUrl,
      windowId: t.windowId,
    }));

  selectedIds = new Set(allTabs.map((t) => t.id)); // select all by default
  renderTabList();
}

function faviconFallbackSvg() {
  return (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#2a2e37"/><text x="8" y="11.5" font-size="9" text-anchor="middle" fill="#8b90a0" font-family="sans-serif">?</text></svg>`
    )
  );
}

function renderTabList() {
  const query = filterText.trim().toLowerCase();
  const filtered = allTabs.filter(
    (t) =>
      !query ||
      t.title.toLowerCase().includes(query) ||
      t.url.toLowerCase().includes(query)
  );

  tabListEl.innerHTML = "";

  if (!filtered.length) {
    tabListEl.innerHTML = `<div class="empty-state">No tabs match "${escapeHtml(filterText)}"</div>`;
    updateFooter();
    return;
  }

  // group by window
  const byWindow = new Map();
  for (const t of filtered) {
    if (!byWindow.has(t.windowId)) byWindow.set(t.windowId, []);
    byWindow.get(t.windowId).push(t);
  }

  const multipleWindows = byWindow.size > 1;
  let windowIndex = 0;

  for (const [windowId, tabs] of byWindow) {
    windowIndex++;
    if (multipleWindows) {
      const label = document.createElement("div");
      label.className = "window-group-label";
      label.textContent = `Window ${windowIndex} · ${tabs.length} tab${tabs.length > 1 ? "s" : ""}`;
      tabListEl.appendChild(label);
    }

    for (const t of tabs) {
      tabListEl.appendChild(buildTabRow(t));
    }
  }

  updateFooter();
}

function buildTabRow(t) {
  const row = document.createElement("div");
  row.className = "tab-row";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = selectedIds.has(t.id);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) selectedIds.add(t.id);
    else selectedIds.delete(t.id);
    updateFooter();
  });

  const favicon = document.createElement("img");
  favicon.className = "tab-favicon";
  favicon.src = t.favIconUrl || faviconFallbackSvg();
  favicon.onerror = () => (favicon.src = faviconFallbackSvg());

  const info = document.createElement("div");
  info.className = "tab-info";
  info.innerHTML = `
    <div class="tab-title">${escapeHtml(t.title)}</div>
    <div class="tab-url">${escapeHtml(t.url)}</div>
  `;

  const copyOneBtn = document.createElement("button");
  copyOneBtn.className = "copy-one-btn";
  copyOneBtn.textContent = "Copy";
  copyOneBtn.title = "Copy this link";
  copyOneBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    writeClipboard(t.url);
    showToast("Link copied");
  });

  row.addEventListener("click", (e) => {
    if (e.target === checkbox || e.target === copyOneBtn) return;
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event("change"));
  });

  row.append(checkbox, favicon, info, copyOneBtn);
  return row;
}

function updateFooter() {
  const count = selectedIds.size;
  copyBtnText.textContent = `Copy ${count} link${count === 1 ? "" : "s"}`;
  copyBtn.disabled = count === 0;
  tabCountLabel.textContent = `${allTabs.length} open tab${allTabs.length === 1 ? "" : "s"} · ${count} selected`;

  const allVisible = getFilteredTabs();
  const allSelected = allVisible.length > 0 && allVisible.every((t) => selectedIds.has(t.id));
  selectAllBtn.textContent = allSelected ? "Deselect all" : "Select all";
}

function getFilteredTabs() {
  const query = filterText.trim().toLowerCase();
  return allTabs.filter(
    (t) =>
      !query ||
      t.title.toLowerCase().includes(query) ||
      t.url.toLowerCase().includes(query)
  );
}

// ---------------- Search ----------------
searchInput.addEventListener("input", () => {
  filterText = searchInput.value;
  renderTabList();
});

// ---------------- Select all / none ----------------
selectAllBtn.addEventListener("click", () => {
  const visible = getFilteredTabs();
  const allSelected = visible.length > 0 && visible.every((t) => selectedIds.has(t.id));
  if (allSelected) {
    visible.forEach((t) => selectedIds.delete(t.id));
  } else {
    visible.forEach((t) => selectedIds.add(t.id));
  }
  renderTabList();
});

// ---------------- Formatting ----------------
function formatLinks(tabs, format) {
  switch (format) {
    case "plain":
      return tabs.map((t) => t.url).join("\n");
    case "titled":
      return tabs.map((t) => `${t.title}\n${t.url}`).join("\n\n");
    case "markdown":
      return tabs.map((t) => `[${t.title}](${t.url})`).join("\n");
    case "html":
      return tabs.map((t) => `<a href="${t.url}">${escapeHtml(t.title)}</a>`).join("\n");
    case "json":
      return JSON.stringify(
        tabs.map((t) => ({ title: t.title, url: t.url })),
        null,
        2
      );
    default:
      return tabs.map((t) => t.url).join("\n");
  }
}

// ---------------- Copy ----------------
copyBtn.addEventListener("click", () => {
  const selected = allTabs.filter((t) => selectedIds.has(t.id));
  if (!selected.length) return;
  const text = formatLinks(selected, formatSelect.value);
  writeClipboard(text);
  showToast(`Copied ${selected.length} link${selected.length === 1 ? "" : "s"}`);
});

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // fallback for edge cases where clipboard API is blocked
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

// ---------------- Toast ----------------
let toastTimer = null;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1600);
}

// ---------------- Open URLs panel ----------------
function parseUrls(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/^https?:\/\//i.test(l) ? l : `https://${l}`));
}

function updateUrlCount() {
  const urls = parseUrls(urlInput.value);
  urlCountLabel.textContent = `${urls.length} URL${urls.length === 1 ? "" : "s"}`;
  openBtn.disabled = urls.length === 0;
}

urlInput.addEventListener("input", updateUrlCount);

pasteBtn.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    urlInput.value = urlInput.value ? urlInput.value + "\n" + text : text;
    updateUrlCount();
  } catch (e) {
    showToast("Clipboard read blocked — paste manually (Cmd/Ctrl+V)");
  }
});

openBtn.addEventListener("click", async () => {
  const urls = parseUrls(urlInput.value);
  if (!urls.length) return;

  if (urls.length > 15) {
    const proceed = confirm(`Open ${urls.length} new tabs?`);
    if (!proceed) return;
  }

  for (const url of urls) {
    try {
      await chrome.tabs.create({ url, active: false });
    } catch (e) {
      // skip invalid URLs
    }
  }
  showToast(`Opened ${urls.length} tab${urls.length === 1 ? "" : "s"}`);
});

// ---------------- Utils ----------------
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------- Init ----------------
loadTabs();
updateUrlCount();
