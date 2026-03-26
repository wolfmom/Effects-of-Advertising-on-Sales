const INSTRUCTOR_NAME = "Eva Wolf";
let highlightPanel;

function cleanName(name) {
  return String(name).replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

function getCanvasText() {
  return document.body?.innerText || "";
}

function getThreadMarkers(text) {
  const re = /^(?:Expand|Collapse) discussion thread from (.+)$/gm;
  const markers = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    markers.push({ author: cleanName(m[1]), start: m.index, end: re.lastIndex });
  }
  return markers;
}

function extractReplySectionText(fullText, currentIndex, markers) {
  const start = markers[currentIndex].end;
  const end = currentIndex + 1 < markers.length ? markers[currentIndex + 1].start : fullText.length;
  return fullText.slice(start, end);
}

function parseReplyEvents(replySectionText) {
  const lines = replySectionText.split(/\r?\n/);
  const events = [];
  for (const line of lines) {
    const stripped = line.trim();
    if (stripped.startsWith("Reply from ")) {
      events.push({ author: cleanName(stripped.replace("Reply from ", "")) });
    }
  }
  return events;
}

function summarizeThreads(fullText) {
  const markers = getThreadMarkers(fullText);
  return markers.map((marker, i) => {
    const replySectionText = extractReplySectionText(fullText, i, markers);
    const replyEvents = parseReplyEvents(replySectionText);
    const repliers = replyEvents.map((r) => r.author);
    return {
      threadAuthor: marker.author,
      instructorReplied: repliers.includes(INSTRUCTOR_NAME)
    };
  });
}

function findThreadElementsByAuthor() {
  const map = new Map();
  const selector = "button, a, [role='button'], div, span";
  const nodes = document.querySelectorAll(selector);

  nodes.forEach((node) => {
    const text = (node.textContent || "").trim();
    const match = text.match(/^(?:Expand|Collapse) discussion thread from (.+)$/);
    if (!match) return;
    const author = cleanName(match[1]);
    if (!map.has(author)) {
      map.set(author, node);
    }
  });

  return map;
}

function removeOldHighlights() {
  document.querySelectorAll(".ewolf-highlight").forEach((el) => {
    el.classList.remove("ewolf-highlight");
  });
}

function ensurePanel() {
  if (highlightPanel && document.body.contains(highlightPanel)) return highlightPanel;

  highlightPanel = document.createElement("aside");
  highlightPanel.className = "ewolf-panel";
  highlightPanel.innerHTML = `
    <div class="ewolf-panel-header">
      <img src="${chrome.runtime.getURL("wolf.svg")}" alt="Wolf" />
      <strong>Threads needing reply</strong>
      <button type="button" id="ewolf-close">×</button>
    </div>
    <ul id="ewolf-list"></ul>
  `;

  document.body.appendChild(highlightPanel);
  highlightPanel.querySelector("#ewolf-close")?.addEventListener("click", () => {
    highlightPanel.remove();
    removeOldHighlights();
  });

  return highlightPanel;
}

function highlightMissingThreads(missingThreads) {
  removeOldHighlights();
  const authorToElement = findThreadElementsByAuthor();
  const panel = ensurePanel();
  const list = panel.querySelector("#ewolf-list");
  list.innerHTML = "";

  missingThreads.forEach((author) => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = author;

    const target = authorToElement.get(author);
    if (target) {
      target.classList.add("ewolf-highlight");
      link.addEventListener("click", (e) => {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("ewolf-pulse");
        setTimeout(() => target.classList.remove("ewolf-pulse"), 1200);
      });
    } else {
      link.classList.add("ewolf-disabled-link");
      link.title = "Could not locate this thread in the current page DOM.";
    }

    li.appendChild(link);
    list.appendChild(li);
  });
}

async function copyRawTextToClipboard() {
  const text = getCanvasText();
  if (!text.trim()) {
    return { ok: false, error: "No page text detected." };
  }

  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch (_err) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const success = document.execCommand("copy");
    ta.remove();
    return success ? { ok: true } : { ok: false, error: "Clipboard permission was denied." };
  }
}

function getMissingThreads() {
  const fullText = getCanvasText();
  const all = summarizeThreads(fullText).filter((t) => t.threadAuthor !== INSTRUCTOR_NAME);
  const missing = all.filter((t) => !t.instructorReplied).map((t) => t.threadAuthor);
  return [...new Set(missing)];
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "COPY_RAW_TEXT") {
    copyRawTextToClipboard().then(sendResponse);
    return true;
  }

  if (message?.type === "SHOW_MISSING_THREADS") {
    try {
      const missing = getMissingThreads();
      highlightMissingThreads(missing);
      sendResponse({ ok: true, count: missing.length });
    } catch (err) {
      sendResponse({ ok: false, error: String(err.message || err) });
    }
  }

  return false;
});
