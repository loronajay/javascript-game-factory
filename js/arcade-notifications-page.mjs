import { createNotificationsApiClient } from "./platform/api/notifications-api.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { initSessionNav } from "./arcade-session-nav.mjs";
import { renderNotificationItem } from "./arcade-notifications.mjs";

async function run() {
  const navEl = document.getElementById("notifPageNav");
  const listEl = document.getElementById("notifPageList");
  const flashEl = document.getElementById("notifPageFlash");

  const session = await initSessionNav(navEl);

  const api = createNotificationsApiClient();
  if (!api.isConfigured) {
    if (flashEl) flashEl.textContent = "Notifications require an internet connection.";
    return;
  }

  if (!session?.playerId) {
    if (flashEl) flashEl.textContent = "Sign in to view your notifications.";
    return;
  }

  const result = await api.listNotifications();
  const notifications = result?.notifications || [];

  if (notifications.length === 0) {
    const p = document.createElement("p");
    p.className = "notif-page__empty";
    p.textContent = "No notifications yet.";
    listEl?.appendChild(p);
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
          const depth = globalThis.location?.pathname?.replace(/\/[^/]*$/, "").split("/").filter(Boolean).length || 0;
          const prefix = depth > 0 ? "../".repeat(depth) : "";
          const href = `${prefix}games/${gameSlug}/index.html`;
          if (p) p.innerHTML = `${p.innerHTML} <a class="notif-item__game-link" href="${href}">Play Now →</a>`;
          globalThis.location?.assign(href);
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
    listEl?.appendChild(item);
  }

  // Mark all read after a moment
  setTimeout(async () => {
    await api.markAllRead();
  }, 1500);
}

run();
