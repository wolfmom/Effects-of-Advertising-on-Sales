const INSTRUCTOR_NAME = "Eva Wolf";
const DEFAULT_YEAR = 2026;
let highlightPanel;

const MONTH_LINE_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}.*$/;

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

function parseCanvasDate(line) {
  if (!line) return null;
  const value = line.split("|")[0].trim();
  const fmts = ["%b %d %I:%M%p", "%b %d %I%p"];

  for (const fmt of fmts) {
    try {
      const parsed = window.moment ? window.moment(value, fmt).toDate() : null;
      if (parsed && !Number.isNaN(parsed.getTime())) {
        parsed.setFullYear(DEFAULT_YEAR);
        return parsed;
      }
    } catch (_e) {
      // no-op
    }
  }

  // native fallback
  const native = new Date(`${value} ${DEFAULT_YEAR}`);
  return Number.isNaN(native.getTime()) ? null : native;
}

function parseReplyEvents(replySectionText) {
  const lines = replySectionText.split(/\r?\n/);
  const events = [];

  for (let i = 0; i < lines.length; i += 1) {
    const stripped = lines[i].trim();
    const match = stripped.match(/^Reply from\s+(.+)$/i);
    if (!match) continue;

    let detectedDateLine = null;
    for (let j = i - 1; j >= Math.max(0, i - 6); j -= 1) {
      const candidate = lines[j].trim();
      if (MONTH_LINE_RE.test(candidate)) {
        detectedDateLine = candidate;
        break;
      }
    }

    events.push({
      author: cleanName(match[1]),
      dateLine: detectedDateLine,
      parsedDate: parseCanvasDate(detectedDateLine)
    });
  }

  return events;
}

function summarizeThreads(fullText) {
  const markers = getThreadMarkers(fullText);
  return markers.map((marker, i) => {
    const replySectionText = extractReplySectionText(fullText, i, markers);
    const replyEvents = parseReplyEvents(replySectionText);
    const instructorEvents = replyEvents.filter((r) => isInstructorAuthor(r.author));

    return {
      threadAuthor: marker.author,
      instructorReplied: instructorEvents.length > 0,
      instructorReplyDates: instructorEvents.map((e) => e.parsedDate).filter(Boolean)
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
    if (!map.has(author)) map.set(author, node);
  });

  return map;
}

function removeOldHighlights() {
  document.querySelectorAll(".ewolf-highlight").forEach((el) => el.classList.remove("ewolf-highlight"));
}

function ensurePanel() {
  if (highlightPanel && document.body.contains(highlightPanel)) return highlightPanel;

  highlightPanel = document.createElement("aside");
  highlightPanel.className = "ewolf-panel";
  highlightPanel.innerHTML = `
    <div class="ewolf-panel-header">
      <img src="${chrome.runtime.getURL("wolf.svg")}" alt="Wolf" />
      <strong>Eva Wolf Tracker</strong>
      <button type="button" id="ewolf-close">×</button>
    </div>
    <div id="ewolf-summary" class="ewolf-summary"></div>
    <div class="ewolf-subhead">Threads needing reply</div>
    <ul id="ewolf-list"></ul>
    <div class="ewolf-subhead">Full report</div>
    <pre id="ewolf-report" class="ewolf-report"></pre>
  `;

  document.body.appendChild(highlightPanel);
  highlightPanel.querySelector("#ewolf-close")?.addEventListener("click", () => {
    highlightPanel.remove();
    removeOldHighlights();
  });

  return highlightPanel;
}

function formatDate(dt) {
  return dt.toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function analyzeEngagement(threads) {
  const allDates = threads.flatMap((t) => t.instructorReplyDates || []);
  const unique = [...new Map(allDates.map((d) => [d.getTime(), d])).values()].sort((a, b) => a - b);
  const daySummary = {
    Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0, Sunday: 0
  };
  const uniqueDays = new Map();

  unique.forEach((d) => {
    const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
    const label = d.toISOString().slice(0, 10);
    daySummary[weekday] += 1;
    uniqueDays.set(label, weekday);
  });

  const dayPairs = [...uniqueDays.entries()].map(([dateLabel, weekday]) => ({ dateLabel, weekday }));
  return {
    replyDates: unique,
    daySummary,
    uniqueDays: dayPairs,
    weekendMet: dayPairs.some((d) => d.weekday === "Saturday" || d.weekday === "Sunday"),
    fourDayRuleMet: dayPairs.length >= 4
  };
}

function buildReport(stats) {
  const lines = [];
  lines.push("=".repeat(75));
  lines.push("EVA WOLF CANVAS DISCUSSION TRACKER REPORT");
  lines.push("=".repeat(75));
  lines.push(`Discussion Title: ${stats.title}`);
  lines.push(`Instructor Name: ${INSTRUCTOR_NAME}`);
  lines.push(`Total top-level threads found: ${stats.totalTopLevelThreads}`);
  lines.push(`Threads counted toward target: ${stats.totalThreads}`);
  lines.push(`Threads Eva replied to: ${stats.repliedCount}`);
  lines.push(`Required target: ${stats.targetCount}`);
  lines.push(`Target rule: ${stats.targetLabel}`);
  lines.push(`Reply Target Status: ${stats.repliedCount >= stats.targetCount ? "✔ Met" : "⚠ Not yet met"}`);
  lines.push("-".repeat(75));
  lines.push("THREAD STATUS");
  lines.push("-".repeat(75));

  stats.threads.forEach((t) => lines.push(`- ${t.threadAuthor}: ${t.instructorReplied ? "REPLIED" : "NEEDS REPLY"}`));

  lines.push("-".repeat(75));
  lines.push("THREADS STILL NEEDING EVA'S REPLY");
  lines.push("-".repeat(75));
  if (stats.missingThreads.length) {
    stats.missingThreads.forEach((name) => lines.push(`- ${name}`));
  } else {
    lines.push("None. Eva has replied to all counted threads.");
  }

  lines.push("-".repeat(75));
  lines.push("EVA'S REPLY DATES");
  lines.push("-".repeat(75));
  if (stats.engagement.replyDates.length) {
    stats.engagement.replyDates.forEach((d) => lines.push(`- ${formatDate(d)}`));
  } else {
    lines.push("No Eva reply dates were detected.");
  }

  lines.push("-".repeat(75));
  lines.push("ENGAGEMENT DAY COUNTS");
  lines.push("-".repeat(75));
  Object.entries(stats.engagement.daySummary).forEach(([day, count]) => lines.push(`- ${day}: ${count}`));

  lines.push(`Unique calendar days with Eva replies: ${stats.engagement.uniqueDays.length}`);
  lines.push("Days used:");
  if (stats.engagement.uniqueDays.length) {
    stats.engagement.uniqueDays.forEach((d) => lines.push(`- ${d.weekday} (${d.dateLabel})`));
  } else {
    lines.push("- None");
  }

  lines.push(`Weekend participation: ${stats.engagement.weekendMet ? "✔ Yes" : "⚠ No weekend reply detected"}`);
  lines.push(`4-day engagement rule: ${stats.engagement.fourDayRuleMet ? "✔ Met" : "⚠ Not yet met"}`);
  lines.push("-".repeat(75));
  lines.push("SUGGESTED REPLIES FOR MISSING THREADS");
  lines.push("-".repeat(75));
  lines.push(stats.missingThreads.length ? "(Use tracker suggestions workflow.)" : "No suggestions needed — Eva has covered all counted threads.");

  return lines.join("\n");
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
  if (!text.trim()) return Promise.resolve({ ok: false, error: "No page text detected." });

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
  const title = document.querySelector("h1")?.innerText?.trim() || "Discussion";
  const allSummaries = summarizeThreads(fullText);
  const totalTopLevelThreads = allSummaries.length;
  const filtered = allSummaries.filter((t) => !isInstructorAuthor(t.threadAuthor));
  const uniqueByAuthor = new Map();
  filtered.forEach((t) => {
    if (!uniqueByAuthor.has(t.threadAuthor)) uniqueByAuthor.set(t.threadAuthor, t);
  });

  const threads = [...uniqueByAuthor.values()];
  const missingThreads = threads.filter((t) => !t.instructorReplied).map((t) => t.threadAuthor);
  const repliedCount = threads.length - missingThreads.length;
  const intro = isIntroductionsForum();
  const targetCount = intro ? threads.length : Math.ceil(threads.length * 0.5);
  const engagement = analyzeEngagement(threads);

  return {
    title,
    totalTopLevelThreads,
    totalThreads: threads.length,
    repliedCount,
    missingCount: missingThreads.length,
    missingThreads,
    targetCount,
    targetLabel: intro ? "100% (Introductions forum)" : "50% (standard discussion rule)",
    threads,
    engagement
  };
}

async function showCoveragePanel() {
  let stats = getThreadStats();

  if (stats.totalThreads === 0) {
    const openedSplit = clickButtonByLabel(/view\s+split\s+screen/i);
    if (openedSplit) {
      await sleep(1200);
      stats = getThreadStats();
    }
  }

  const panel = ensurePanel();
  const summary = panel.querySelector("#ewolf-summary");
  const reportNode = panel.querySelector("#ewolf-report");

  if (stats.totalThreads === 0) {
    summary.innerHTML = `
      <div><strong>Could not detect threads yet.</strong></div>
      <div>Click <strong>View Split Screen</strong>, then click this extension button again.</div>
    `;
    reportNode.textContent = "No report yet because no threads were detected.";
    renderMissingList([]);
    return { ...stats, warning: "no_threads_detected" };
  }

  summary.innerHTML = `
    <div>Total threads: <strong>${stats.totalThreads}</strong></div>
    <div>Replied: <strong>${stats.repliedCount}</strong></div>
    <div>Missing: <strong>${stats.missingCount}</strong></div>
    <div>Target: <strong>${stats.targetCount}</strong> (${stats.targetLabel})</div>
  `;

  reportNode.textContent = buildReport(stats);
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
