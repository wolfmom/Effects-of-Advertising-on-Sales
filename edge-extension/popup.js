async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function sendToContent(message) {
  const tab = await getActiveTab();
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }
  return chrome.tabs.sendMessage(tab.id, message);
}

function setStatus(text, ok = true) {
  const node = document.getElementById("status");
  node.textContent = text;
  node.style.color = ok ? "#065f46" : "#991b1b";
}

document.getElementById("copyRaw").addEventListener("click", async () => {
  try {
    const result = await sendToContent({ type: "COPY_RAW_TEXT" });
    if (result?.ok) {
      setStatus("Copied Canvas discussion text to clipboard.");
    } else {
      setStatus(result?.error || "Could not copy text.", false);
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`, false);
  }
});

document.getElementById("showMissing").addEventListener("click", async () => {
  try {
    const result = await sendToContent({ type: "SHOW_MISSING_THREADS" });
    if (result?.ok) {
      const count = result.count ?? 0;
      setStatus(
        count > 0
          ? `Found ${count} thread(s) still needing your reply.`
          : "No missing threads found."
      );
    } else {
      setStatus(result?.error || "Unable to build missing-thread list.", false);
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`, false);
  }
});
