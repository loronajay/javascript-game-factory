import { createMessagesApiClient } from "./platform/api/messages-api.mjs";
import { initSessionNav, renderPrimaryAppNav } from "./arcade-session-nav.mjs";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(isoString) {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function renderBubble(msg, viewerPlayerId) {
  const isSent = msg.fromPlayerId === viewerPlayerId;
  const rowDiv = document.createElement("div");
  rowDiv.className = `msg-bubble-row ${isSent ? "msg-bubble-row--sent" : "msg-bubble-row--received"}`;
  rowDiv.dataset.msgId = msg.id;

  const bubble = document.createElement("div");
  bubble.className = `msg-bubble ${isSent ? "msg-bubble--sent" : "msg-bubble--received"}`;
  bubble.innerHTML = `
    <p class="msg-bubble__text">${escapeHtml(msg.text)}</p>
    <p class="msg-bubble__time">${escapeHtml(formatTime(msg.createdAt))}</p>
  `;
  rowDiv.appendChild(bubble);
  return rowDiv;
}

function scrollToBottom(el) {
  if (el) el.scrollTop = el.scrollHeight;
}

async function run() {
  renderPrimaryAppNav(document.getElementById("threadPrimaryNav"), {
    basePath: "../../",
    currentPage: "messages",
    linkClass: "search-stage__portal",
    sessionNavId: "threadAuthNav",
  });

  const navEl = document.getElementById("threadAuthNav");
  const otherNameEl = document.getElementById("threadOtherName");
  const bodyEl = document.getElementById("messageList");
  const inputEl = document.getElementById("msgInput");
  const sendBtn = document.getElementById("sendBtn");
  const flashEl = document.getElementById("threadFlash");

  const params = new URLSearchParams(globalThis.location?.search || "");
  let convId = params.get("id") || "";
  const playerParam = params.get("player") || "";
  const nameParam = params.get("name") || "";

  const session = await initSessionNav(navEl, {
    signInPath: "../../sign-in/index.html",
    signUpPath: "../../sign-up/index.html",
    homeOnLogout: "../../index.html",
  });
  const viewerPlayerId = session?.playerId || "";
  const api = createMessagesApiClient();

  if (!api.isConfigured) {
    if (flashEl) flashEl.textContent = "Messages require an internet connection.";
    return;
  }

  if (!viewerPlayerId) {
    if (flashEl) flashEl.textContent = "Sign in to send and receive messages.";
    if (inputEl) inputEl.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    return;
  }

  let toPlayerId = playerParam;
  let otherName = nameParam;

  // If we have a player param but no conv ID, try finding the existing conversation
  if (!convId && playerParam) {
    const existing = await api.findConversationWith(playerParam);
    if (existing) {
      convId = existing.id;
      const url = new URL(globalThis.location.href);
      url.searchParams.set("id", convId);
      url.searchParams.delete("player");
      url.searchParams.delete("name");
      globalThis.history?.replaceState(null, "", url.toString());
    }
  }

  // Track rendered message IDs to avoid duplicate rendering
  const renderedIds = new Set();

  function appendMessages(messages) {
    let appended = false;
    for (const msg of messages) {
      if (renderedIds.has(msg.id)) continue;
      renderedIds.add(msg.id);
      bodyEl?.appendChild(renderBubble(msg, viewerPlayerId));
      appended = true;
    }
    if (appended) scrollToBottom(bodyEl);
  }

  async function loadConversation() {
    if (!convId) return;
    const data = await api.getConversation(convId);
    if (!data) return;

    if (!toPlayerId) toPlayerId = data.conversation?.otherPlayerId || "";
    if (!otherName) otherName = data.conversation?.otherProfileName || toPlayerId;
    if (otherNameEl) otherNameEl.textContent = otherName;

    appendMessages(data.messages || []);
    void api.markRead(convId);
  }

  // Set header from params immediately if available (before API call)
  if (otherName && otherNameEl) otherNameEl.textContent = otherName;

  await loadConversation();

  // Poll for new messages every 5 seconds while thread is open
  const pollInterval = setInterval(async () => {
    if (!convId) return;
    const data = await api.getConversation(convId);
    if (!data) return;
    appendMessages(data.messages || []);
  }, 5000);

  globalThis.addEventListener?.("beforeunload", () => clearInterval(pollInterval));

  // Send message
  async function sendMessage() {
    const text = inputEl?.value?.trim();
    if (!text || !toPlayerId) return;
    if (sendBtn) sendBtn.disabled = true;

    const result = await api.sendMessage(toPlayerId, text);
    if (result) {
      if (!convId) {
        convId = result.conversationId;
        const url = new URL(globalThis.location.href);
        url.searchParams.set("id", convId);
        url.searchParams.delete("player");
        url.searchParams.delete("name");
        globalThis.history?.replaceState(null, "", url.toString());
      }
      if (inputEl) inputEl.value = "";
      // Append the new message immediately without waiting for poll
      if (result.message) {
        appendMessages([result.message]);
      }
    } else {
      if (flashEl) {
        flashEl.textContent = "Failed to send. Try again.";
        setTimeout(() => { if (flashEl) flashEl.textContent = ""; }, 3000);
      }
    }

    if (sendBtn) sendBtn.disabled = false;
    inputEl?.focus();
  }

  sendBtn?.addEventListener("click", sendMessage);
  inputEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

run();
