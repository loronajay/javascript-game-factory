import { createMessagesApiClient } from "./platform/api/messages-api.mjs";
import { createPlatformApiClient } from "./platform/api/platform-api.mjs";
import { initSessionNav } from "./arcade-session-nav.mjs";
import { initNotificationBell } from "./arcade-notifications.mjs";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  if (isNaN(diff) || diff < 0) return "";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function initials(name) {
  return String(name || "?").trim().slice(0, 2).toUpperCase();
}

function renderConversationItem(conv) {
  const li = document.createElement("li");
  const unreadClass = conv.unreadCount > 0 ? " msg-conv-item--unread" : "";
  li.className = `msg-conv-item${unreadClass}`;
  li.dataset.convId = conv.id;
  li.dataset.otherPlayerId = conv.otherPlayerId;
  li.tabIndex = 0;
  li.setAttribute("role", "button");

  const preview = conv.lastMessagePreview
    ? escapeHtml(conv.lastMessagePreview.slice(0, 60)) + (conv.lastMessagePreview.length > 60 ? "…" : "")
    : "<em>No messages yet</em>";

  const badge = conv.unreadCount > 0
    ? `<span class="msg-unread-badge">${conv.unreadCount > 99 ? "99+" : conv.unreadCount}</span>`
    : "";

  li.innerHTML = `
    <div class="msg-conv-item__avatar">${escapeHtml(initials(conv.otherProfileName))}</div>
    <div class="msg-conv-item__info">
      <p class="msg-conv-item__name">${escapeHtml(conv.otherProfileName || conv.otherPlayerId)}</p>
      <p class="msg-conv-item__preview">${preview}</p>
    </div>
    <div class="msg-conv-item__meta">
      <span class="msg-conv-item__time">${escapeHtml(formatRelativeTime(conv.lastMessageAt))}</span>
      ${badge}
    </div>
  `;

  function openThread() {
    globalThis.location.assign(`conversation/index.html?id=${encodeURIComponent(conv.id)}`);
  }

  li.addEventListener("click", openThread);
  li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") openThread(); });
  return li;
}

async function run() {
  const navEl = document.getElementById("inboxAuthNav");
  const listEl = document.getElementById("convList");
  const flashEl = document.getElementById("inboxFlash");
  const newBtnEl = document.getElementById("newMsgBtn");
  const newPanelEl = document.getElementById("newMsgPanel");
  const newSearchEl = document.getElementById("newMsgSearch");
  const newResultsEl = document.getElementById("newMsgResults");

  const session = await initSessionNav(navEl);
  if (session?.playerId && navEl) {
    initNotificationBell(navEl, session.playerId);
  }

  const api = createMessagesApiClient();
  if (!api.isConfigured) {
    if (flashEl) flashEl.textContent = "Messages require an internet connection.";
    return;
  }

  const conversations = await api.listConversations();
  if (conversations === null) {
    if (flashEl) flashEl.textContent = "Sign in to view your messages.";
    if (newBtnEl) newBtnEl.hidden = true;
    return;
  }

  if (conversations.length === 0) {
    if (listEl) {
      const p = document.createElement("p");
      p.className = "msg-empty";
      p.textContent = "No conversations yet. Start one!";
      listEl.appendChild(p);
    }
  } else {
    for (const conv of conversations) {
      listEl?.appendChild(renderConversationItem(conv));
    }
  }

  // New Message flow
  if (newBtnEl && newPanelEl && newSearchEl && newResultsEl) {
    const platformApi = createPlatformApiClient();

    newBtnEl.addEventListener("click", () => {
      newPanelEl.hidden = !newPanelEl.hidden;
      if (!newPanelEl.hidden) newSearchEl.focus();
    });

    let searchTimer = null;
    newSearchEl.addEventListener("input", () => {
      clearTimeout(searchTimer);
      const q = newSearchEl.value.trim();
      if (q.length < 2) { newResultsEl.innerHTML = ""; return; }
      searchTimer = setTimeout(async () => {
        const players = await platformApi.searchPlayers(q);
        newResultsEl.innerHTML = "";
        if (!players?.length) {
          const li = document.createElement("li");
          li.className = "msg-new-result";
          li.textContent = "No players found.";
          li.style.cursor = "default";
          newResultsEl.appendChild(li);
          return;
        }
        for (const p of players) {
          const li = document.createElement("li");
          li.className = "msg-new-result";
          li.innerHTML = `
            <div class="msg-new-result__avatar">${escapeHtml(initials(p.profileName))}</div>
            <span class="msg-new-result__name">${escapeHtml(p.profileName || p.playerId)}</span>
          `;
          li.addEventListener("click", () => {
            globalThis.location.assign(`conversation/index.html?player=${encodeURIComponent(p.playerId)}&name=${encodeURIComponent(p.profileName || "")}`);
          });
          newResultsEl.appendChild(li);
        }
      }, 280);
    });
  }
}

run();
