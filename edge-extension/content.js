const INSTRUCTOR_NAME = "Eva Wolf";
let highlightPanel;

function cleanName(name) {
  return String(name).replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

function norm(value) {
  return cleanName(value).toLowerCase();
}

function isInstructorAuthor(author) {
  const a = norm(author);
  const me = norm(INSTRUCTOR_NAME);
  return a === me || a.startsWith(`${me} `) || a.includes(me);
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
    const match = stripped.match(/^Reply from\s+(.+)$/i);
    if (!match) continue;
    events.push({ author: cleanName(match[1]) });
  }
  return events;
}

function summarizeThreads(fullText) {
  const markers = getThreadMarkers(fullText);
  return markers.map((marker, i) => {
    const replySectionText = extractReplySectionText(fullText, i, markers);
    const replyEvents = parseReplyEvents(replySectionText);
    const instructorReplied = replyEvents.some((r) => isInstructorAuthor(r.author));

    return {
      threadAuthor: marker.author,
      instructorReplied
    };
  });
}

function isIntroductionsForum() {
  const title = document.querySelector("h1")?.innerText || "";
  return /introduction/i.test(title);
}


function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clickButtonByLabel(labelPattern) {
  const candidates = document.querySelectorAll("button, a, [role='button']");
  for (const el of candidates) {
    const txt = (el.textContent || "").trim();
    if (labelPattern.test(txt)) {
      el.click();
      return true;
    }
  }
  return false;
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
      <strong>Reply Coverage</strong>
      <button type="button" id="ewolf-close">×</button>
    </div>
    <div id="ewolf-summary" class="ewolf-summary"></div>
    <div class="ewolf-subhead">Threads needing reply</div>
    <ul id="ewolf-list"></ul>
  `;

  document.body.appendChild(highlightPanel);
  highlightPanel.querySelector("#ewolf-close")?.addEventListener("click", () => {
    highlightPanel.remove();
    removeOldHighlights();
  });

  return highlightPanel;
}

function buildSummaryHtml(stats) {
  const status = stats.repliedCount >= stats.targetCount ? "✅ Target met" : "⚠️ Target not met";
  return `
    <div>Total top-level threads: <strong>${stats.totalThreads}</strong></div>
    <div>You replied to: <strong>${stats.repliedCount}</strong></div>
    <div>Still missing: <strong>${stats.missingCount}</strong></div>
    <div>Target (${stats.targetLabel}): <strong>${stats.targetCount}</strong></div>
    <div>${status}</div>
  `;
}

function renderMissingList(missingThreads) {
  removeOldHighlights();
  const authorToElement = findThreadElementsByAuthor();
  const panel = ensurePanel();
  const list = panel.querySelector("#ewolf-list");
  list.innerHTML = "";

  if (!missingThreads.length) {
    const li = document.createElement("li");
    li.textContent = "No missing threads found.";
    list.appendChild(li);
    return;
  }

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
      link.title = "Could not locate this thread marker in the current page DOM.";
    }

    li.appendChild(link);
    list.appendChild(li);
  });
}

function copyRawTextToClipboard() {
  const text = getCanvasText();
  if (!text.trim()) {
    return Promise.resolve({ ok: false, error: "No page text detected." });
  }

  return navigator.clipboard.writeText(text)
    .then(() => ({ ok: true }))
    .catch(() => {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const success = document.execCommand("copy");
      ta.remove();
      return success ? { ok: true } : { ok: false, error: "Clipboard permission was denied." };
    });
}

function getThreadStats() {
  const fullText = getCanvasText();
  const allThreads = summarizeThreads(fullText).filter((t) => !isInstructorAuthor(t.threadAuthor));
  const uniqueByAuthor = new Map();
  allThreads.forEach((t) => {
    if (!uniqueByAuthor.has(t.threadAuthor)) uniqueByAuthor.set(t.threadAuthor, t);
  });

  const threads = [...uniqueByAuthor.values()];
  const missingThreads = threads.filter((t) => !t.instructorReplied).map((t) => t.threadAuthor);
  const repliedCount = threads.length - missingThreads.length;
  const intro = isIntroductionsForum();
  const targetCount = intro ? threads.length : Math.ceil(threads.length * 0.5);

  return {
    totalThreads: threads.length,
    repliedCount,
    missingCount: missingThreads.length,
    missingThreads,
    targetCount,
    targetLabel: intro ? "100%" : "50%"
  };
}

async function showCoveragePanel() {
  let stats = getThreadStats();

  // Canvas often requires split-screen mode to expose thread text markers.
  if (stats.totalThreads === 0) {
    const openedSplit = clickButtonByLabel(/view\s+split\s+screen/i);
    if (openedSplit) {
      await sleep(1200);
      stats = getThreadStats();
    }
  }

  const panel = ensurePanel();
  const summary = panel.querySelector("#ewolf-summary");

  if (stats.totalThreads === 0) {
    summary.innerHTML = `
      <div><strong>Could not detect threads yet.</strong></div>
      <div>Try clicking <strong>View Split Screen</strong>, then click this extension button again.</div>
    `;
    renderMissingList([]);
    return { ...stats, warning: "no_threads_detected" };
  }

  summary.innerHTML = buildSummaryHtml(stats);
  renderMissingList(stats.missingThreads);
  return stats;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "COPY_RAW_TEXT") {
    copyRawTextToClipboard().then(sendResponse);
    return true;
  }

  if (message?.type === "SHOW_MISSING_THREADS") {
    showCoveragePanel()
      .then((stats) => sendResponse({ ok: true, count: stats.missingCount, stats }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }

  return false;
});
