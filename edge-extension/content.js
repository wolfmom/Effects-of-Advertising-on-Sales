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
  return a === me || a.startsWith(`${me} `);
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
  const m = value.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:\s+(\d{1,2})(?::(\d{2}))?(am|pm))?$/i);
  if (!m) return null;

  const monthMap = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
  };

  const mon = m[1][0].toUpperCase() + m[1].slice(1, 3).toLowerCase();
  const month = monthMap[mon];
  const day = Number(m[2]);
  let hour = Number(m[3] || 0);
  const minute = Number(m[4] || 0);
  const ampm = (m[5] || "").toLowerCase();

  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;

  return new Date(DEFAULT_YEAR, month, day, hour, minute, 0, 0);
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
    const instructorEvents = replyEvents.filter((r) => isInstructorAuthor(r.author) && !!r.parsedDate);

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
      <strong>Discussion Tracker</strong>
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


function extractGlobalInstructorDates(fullText) {
  const lines = fullText.split(/\r?\n/);
  const dates = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.toLowerCase().includes(norm(INSTRUCTOR_NAME))) {
      for (let j = i; j <= Math.min(i + 3, lines.length - 1); j += 1) {
        const cand = lines[j].trim();
        if (MONTH_LINE_RE.test(cand)) {
          const parsed = parseCanvasDate(cand);
          if (parsed) dates.push(parsed);
          break;
        }
        const embedded = cand.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:\s+\d{1,2}(?::\d{2})?(?:am|pm)?)?/i);
        if (embedded) {
          const parsed = parseCanvasDate(embedded[0]);
          if (parsed) dates.push(parsed);
          break;
        }
      }
    }
  }

  return dates;
}

function buildSuggestion(author) {
  const first = cleanName(author).split(" ")[0] || "there";
  return `Hi ${first}, thank you for your thoughtful post. I appreciated your perspective and how you connected it to the discussion prompt. One follow-up I would love to hear is how you would apply this in a real classroom or work setting. Thanks again for contributing.`;
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
  if (stats.missingThreads.length) {
    stats.missingThreads.forEach((name) => {
      lines.push(`- ${name}:`);
      lines.push(`  ${buildSuggestion(name)}`);
    });
  } else {
    lines.push("No suggestions needed — Eva has covered all counted threads.");
  }

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
  const globalEvaDates = extractGlobalInstructorDates(fullText);
  const threadsWithGlobal = threads.map((t) => ({ ...t }));
  if (globalEvaDates.length && threadsWithGlobal.length) {
    // Attach global dates to first thread as a fallback source so engagement counts are not lost.
    threadsWithGlobal[0].instructorReplyDates = [
      ...(threadsWithGlobal[0].instructorReplyDates || []),
      ...globalEvaDates
    ];
  }

  const engagement = analyzeEngagement(threadsWithGlobal);

  return {
    title,
    totalTopLevelThreads,
    totalThreads: threads.length,
    repliedCount,
    missingCount: missingThreads.length,
    missingThreads,
    targetCount,
    targetLabel: intro ? "100% (Introductions forum)" : "50% (standard discussion rule)",
    threads: threadsWithGlobal,
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
  if (message?.type === "PING") {
    sendResponse({ ok: true });
    return false;
  }

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
