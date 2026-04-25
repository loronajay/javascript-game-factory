import { createNotificationsApiClient } from "./platform/api/notifications-api.mjs";

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
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatNotificationText(notif) {
  const actor = notif.actorDisplayName || notif.actorPlayerId || "Someone";
  switch (notif.type) {
    case "thought_reaction":
      return `<strong>${escapeHtml(actor)}</strong> reacted to your thought`;
    case "thought_comment":
      return `<strong>${escapeHtml(actor)}</strong> commented on your thought`;
    case "thought_share":
      return `<strong>${escapeHtml(actor)}</strong> shared your thought`;
    case "friend_request":
      return `<strong>${escapeHtml(actor)}</strong> sent you a friend request`;
    case "friend_accept":
      return `<strong>${escapeHtml(actor)}</strong> accepted your friend request`;
    default:
      return `<strong>${escapeHtml(actor)}</strong> sent you a notification`;
  }
}

function renderNotificationItem(notif, onAccept, onReject) {
  const isFriendRequest = notif.type === "friend_request" && notif.status === "unread";
  const preview = notif.payload?.commentText || notif.payload?.thoughtText || "";
  const unreadClass = notif.status === "unread" ? " notif-item--unread" : "";

  const li = document.createElement("li");
  li.className = `notif-item${unreadClass}`;
  li.dataset.notifId = notif.id;

  li.innerHTML = `
    <p class="notif-item__text">${formatNotificationText(notif)}</p>
    ${preview ? `<p class="notif-item__preview">"${escapeHtml(preview)}"</p>` : ""}
    <p class="notif-item__time">${escapeHtml(formatRelativeTime(notif.createdAt))}</p>
    ${isFriendRequest ? `
      <div class="notif-item__actions">
        <button class="notif-item__action notif-item__action--accept" type="button" data-fr-accept="${escapeHtml(notif.payload?.requestId || notif.id)}">Accept</button>
        <button class="notif-item__action notif-item__action--reject" type="button" data-fr-reject="${escapeHtml(notif.payload?.requestId || notif.id)}">Reject</button>
      </div>
    ` : ""}
  `;

  if (isFriendRequest) {
    li.querySelector("[data-fr-accept]")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.closest(".notif-item__actions").querySelector("[data-fr-reject]").disabled = true;
      await onAccept(btn.dataset.frAccept, li);
    });
    li.querySelector("[data-fr-reject]")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.closest(".notif-item__actions").querySelector("[data-fr-accept]").disabled = true;
      await onReject(btn.dataset.frReject, li);
    });
  }

  return li;
}

export async function initNotificationBell(containerEl, playerId) {
  if (!containerEl || !playerId) return;

  const api = createNotificationsApiClient();
  if (!api.isConfigured) return;

  // build DOM
  const wrap = document.createElement("div");
  wrap.className = "notif-bell-wrap";

  const bell = document.createElement("button");
  bell.className = "notif-bell";
  bell.type = "button";
  bell.setAttribute("aria-label", "Notifications");
  bell.innerHTML = `
    &#x1F514;
    <span class="notif-bell__badge" hidden>0</span>
  `;

  const dropdown = document.createElement("div");
  dropdown.className = "notif-dropdown";
  dropdown.hidden = true;
  dropdown.innerHTML = `
    <div class="notif-dropdown__header">
      <span class="notif-dropdown__title">Notifications</span>
    </div>
    <ul class="notif-dropdown__list" role="list"></ul>
  `;

  wrap.appendChild(bell);
  wrap.appendChild(dropdown);
  containerEl.prepend(wrap);

  const badge = bell.querySelector(".notif-bell__badge");
  const list = dropdown.querySelector(".notif-dropdown__list");

  function setBadge(count) {
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  async function fetchAndRender() {
    const result = await api.listNotifications();
    const notifications = result?.notifications || [];
    setBadge(result?.unreadCount || 0);

    list.innerHTML = "";
    if (notifications.length === 0) {
      const empty = document.createElement("p");
      empty.className = "notif-dropdown__empty";
      empty.textContent = "No notifications yet.";
      list.appendChild(empty);
      return;
    }

    for (const notif of notifications) {
      const item = renderNotificationItem(
        notif,
        async (requestId, itemEl) => {
          const ok = await api.acceptFriendRequest(requestId);
          if (ok) {
            itemEl.querySelector(".notif-item__actions")?.remove();
            const p = itemEl.querySelector(".notif-item__text");
            if (p) p.innerHTML = p.innerHTML.replace("sent you a friend request", "friend request accepted ✓");
          }
        },
        async (requestId, itemEl) => {
          const ok = await api.rejectFriendRequest(requestId);
          if (ok) {
            itemEl.querySelector(".notif-item__actions")?.remove();
            const p = itemEl.querySelector(".notif-item__text");
            if (p) p.innerHTML = p.innerHTML.replace("sent you a friend request", "friend request declined");
          }
        },
      );
      list.appendChild(item);
    }
  }

  // initial unread count on page load (lightweight)
  try {
    const initial = await api.listNotifications();
    setBadge(initial?.unreadCount || 0);
  } catch {
    // silently skip if auth session not available
  }

  bell.addEventListener("click", async (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.hidden;
    if (isOpen) {
      dropdown.hidden = true;
      return;
    }
    dropdown.hidden = false;
    await fetchAndRender();
    // mark all read after a moment
    setTimeout(async () => {
      await api.markAllRead();
      setBadge(0);
    }, 1500);
  });

  // close dropdown on outside click
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) {
      dropdown.hidden = true;
    }
  });
}
