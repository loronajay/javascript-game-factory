import { createNotificationsApiClient } from "./platform/api/notifications-api.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { THOUGHT_REACTION_GLYPHS } from "./platform/thoughts/thoughts-schema.mjs";

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

const GESTURE_NOTIFICATION_LABELS = Object.freeze({
  poke: "poked",
  hug: "hugged",
  kick: "kicked",
  blowkiss: "blew you a kiss",
  nudge: "nudged",
  challenge: "challenged",
});

const GESTURE_NOTIFICATION_EMOJIS = Object.freeze({
  poke: "👈",
  hug: "🤗",
  kick: "👟",
  blowkiss: "💋",
  nudge: "👇",
  challenge: "🎮",
});

function formatNotificationText(notif) {
  const actor = notif.actorDisplayName || "Someone";
  switch (notif.type) {
    case "thought_reaction": {
      const reactionId = notif.payload?.reactionId || "";
      const glyph = THOUGHT_REACTION_GLYPHS[reactionId] || "reacted to";
      const verb = reactionId && THOUGHT_REACTION_GLYPHS[reactionId] ? `${glyph}'d` : "reacted to";
      return `<strong>${escapeHtml(actor)}</strong> ${verb} your thought`;
    }
    case "thought_comment":
      return `<strong>${escapeHtml(actor)}</strong> commented on your thought`;
    case "photo_reaction": {
      const reactionId = notif.payload?.reactionId || "";
      const glyph = THOUGHT_REACTION_GLYPHS[reactionId] || "reacted to";
      const verb = reactionId && THOUGHT_REACTION_GLYPHS[reactionId] ? `${glyph}'d` : "reacted to";
      return `<strong>${escapeHtml(actor)}</strong> ${verb} your photo`;
    }
    case "photo_comment":
      return `<strong>${escapeHtml(actor)}</strong> commented on your photo`;
    case "thought_share":
      return `<strong>${escapeHtml(actor)}</strong> shared your thought`;
    case "friend_request":
      return `<strong>${escapeHtml(actor)}</strong> sent you a friend request`;
    case "friend_accept":
      return `<strong>${escapeHtml(actor)}</strong> accepted your friend request`;
    case "player_gesture": {
      const gestureType = notif.payload?.gestureType || "";
      const verb = GESTURE_NOTIFICATION_LABELS[gestureType] || "sent a gesture to";
      const emoji = GESTURE_NOTIFICATION_EMOJIS[gestureType] || "";
      return `<strong>${escapeHtml(actor)}</strong> ${escapeHtml(verb)} you ${emoji}`;
    }
    case "player_challenge": {
      const gameTitle = notif.payload?.gameTitle || notif.payload?.gameSlug || "a game";
      return `<strong>${escapeHtml(actor)}</strong> challenged you to ${escapeHtml(gameTitle)}! 🎮`;
    }
    case "challenge_accepted": {
      const gameTitle = notif.payload?.gameTitle || notif.payload?.gameSlug || "your challenge";
      return `<strong>${escapeHtml(actor)}</strong> accepted your ${escapeHtml(gameTitle)} challenge!`;
    }
    case "challenge_declined": {
      const gameTitle = notif.payload?.gameTitle || notif.payload?.gameSlug || "your challenge";
      return `<strong>${escapeHtml(actor)}</strong> declined your ${escapeHtml(gameTitle)} challenge.`;
    }
    case "new_message":
      return `<strong>${escapeHtml(actor)}</strong> sent you a message 💬`;
    default:
      return `<strong>${escapeHtml(actor)}</strong> sent you a notification`;
  }
}

function buildRootUrl(moduleUrl = import.meta.url) {
  try {
    return new URL("../", moduleUrl);
  } catch {
    return null;
  }
}

export function buildGameHref(slug, options = {}) {
  const rootUrl = buildRootUrl(options?.moduleUrl || import.meta.url);
  if (!rootUrl) return `games/${slug}/index.html`;
  return new URL(`games/${encodeURIComponent(slug)}/index.html`, rootUrl).toString();
}

export function buildHref(path, options = {}) {
  const rootUrl = buildRootUrl(options?.moduleUrl || import.meta.url);
  const normalizedPath = String(path || "").replace(/^\//, "");
  if (!rootUrl) return normalizedPath;
  return new URL(normalizedPath, rootUrl).toString();
}

export function buildNotificationsPageHref(options = {}) {
  return buildHref("notifications/index.html", options);
}

export function shouldHighlightNotificationBell(locationRef = globalThis.location) {
  const pathname = String(locationRef?.pathname || "");
  return /\/notifications(?:\/index\.html)?\/?$/.test(pathname);
}

export function buildNotificationDropdownMarkup({ pageHref = "" } = {}) {
  const pageLink = pageHref
    ? `<a class="notif-dropdown__page-link" href="${escapeHtml(pageHref)}">View all</a>`
    : "";
  return `
    <div class="notif-dropdown__header">
      <span class="notif-dropdown__title">Notifications</span>
      ${pageLink}
    </div>
    <ul class="notif-dropdown__list" role="list"></ul>
  `;
}

export { formatNotificationText };

export function renderNotificationItem(notif, onAccept, onReject, onChallengeAccept, onChallengeDecline) {
  const isFriendRequest = notif.type === "friend_request" && notif.status === "unread";
  const isChallenge = notif.type === "player_challenge" && notif.status === "unread";
  const isMessage = notif.type === "new_message";
  const isPhotoNotif = notif.type === "photo_comment" || notif.type === "photo_reaction";
  const preview = notif.payload?.preview || notif.payload?.commentText || notif.payload?.thoughtText || notif.payload?.photoCaption || "";
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
    ${isMessage && notif.payload?.conversationId ? `
      <a class="notif-item__game-link" href="${escapeHtml(buildHref(`messages/conversation/index.html?id=${notif.payload.conversationId}`))}">View Message →</a>
    ` : ""}
    ${isPhotoNotif && notif.payload?.photoId && notif.payload?.photoOwnerId ? `
      <a class="notif-item__game-link" href="${escapeHtml(buildHref(`gallery/index.html?id=${notif.payload.photoOwnerId}&photo=${notif.payload.photoId}`))}">View Photo →</a>
    ` : ""}
    ${isChallenge ? `
      <div class="notif-item__actions">
        <button class="notif-item__action notif-item__action--accept" type="button" data-ch-accept="${escapeHtml(notif.payload?.challengeId || notif.id)}" data-ch-slug="${escapeHtml(notif.payload?.gameSlug || "")}">Accept</button>
        <button class="notif-item__action notif-item__action--reject" type="button" data-ch-decline="${escapeHtml(notif.payload?.challengeId || notif.id)}">Decline</button>
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

  if (isChallenge) {
    li.querySelector("[data-ch-accept]")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const challengeId = btn.dataset.chAccept;
      const slug = btn.dataset.chSlug;
      btn.disabled = true;
      btn.closest(".notif-item__actions").querySelector("[data-ch-decline]").disabled = true;
      await onChallengeAccept(challengeId, slug, li);
    });
    li.querySelector("[data-ch-decline]")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.closest(".notif-item__actions").querySelector("[data-ch-accept]").disabled = true;
      await onChallengeDecline(btn.dataset.chDecline, li);
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
  bell.className = shouldHighlightNotificationBell(globalThis.location)
    ? "notif-bell notif-bell--current"
    : "notif-bell";
  bell.type = "button";
  bell.setAttribute("aria-label", "Notifications");
  bell.innerHTML = `
    <span class="notif-bell__icon" aria-hidden="true">&#x1F514;</span>
    <span class="notif-bell__label">Alerts</span>
    <span class="notif-bell__badge" hidden>0</span>
  `;

  const dropdown = document.createElement("div");
  dropdown.className = "notif-dropdown";
  dropdown.hidden = true;
  dropdown.innerHTML = buildNotificationDropdownMarkup({
    pageHref: buildNotificationsPageHref(),
  });

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
          const acceptorName = loadFactoryProfile()?.profileName || "";
          const ok = await api.acceptFriendRequest(requestId, acceptorName);
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
        async (challengeId, gameSlug, itemEl) => {
          const ok = await api.acceptChallenge(challengeId);
          itemEl.querySelector(".notif-item__actions")?.remove();
          const p = itemEl.querySelector(".notif-item__text");
          if (ok && gameSlug) {
            if (p) {
              const gameHref = buildGameHref(gameSlug);
              p.innerHTML = `${p.innerHTML} <a class="notif-item__game-link" href="${escapeHtml(gameHref)}">Play Now →</a>`;
            }
            globalThis.location?.assign(buildGameHref(gameSlug));
          } else if (p) {
            p.textContent = p.textContent + " (could not accept)";
          }
        },
        async (challengeId, itemEl) => {
          const ok = await api.declineChallenge(challengeId);
          if (ok) {
            itemEl.querySelector(".notif-item__actions")?.remove();
            const p = itemEl.querySelector(".notif-item__text");
            if (p) p.innerHTML = p.innerHTML.replace("challenged you to", "challenge from").replace("! 🎮", " declined");
          }
        },
      );
      list.appendChild(item);
    }
  }

  // Register event listeners immediately so the bell is responsive before the initial fetch resolves.
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

  // initial unread count on page load (lightweight)
  try {
    const initial = await api.listNotifications();
    setBadge(initial?.unreadCount || 0);
  } catch {
    // silently skip if auth session not available
  }
}
