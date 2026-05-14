import { wireOnlineConfig } from "./lobby.js";
import { wireSinglePlayerConfig } from "./single-player-setup.js";

function qs(id) {
  return document.getElementById(id);
}

function setJoinRoomError(message = "") {
  const errorEl = qs("join-room-error");
  if (!errorEl) return;
  if (!message) {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
    return;
  }
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

export function wireGameButtons({
  onCreatePublic,
  onFindPublic,
  onPrivate,
  onShowMenu,
  onJoinPrivate,
  onResetToMenu,
  onStartOnlineNow,
  onStartSinglePlayer,
} = {}) {
  const onlineConfig = wireOnlineConfig({
    onCreatePublic,
    onFindPublic,
    onPrivate,
    onBack: onShowMenu,
  });
  wireSinglePlayerConfig({
    onStart: onStartSinglePlayer,
    onBack: onShowMenu,
  });

  qs("btn-online-multiplayer")?.addEventListener("click", () => onShowMenu?.("onlineMenu"));
  qs("btn-single-player")?.addEventListener("click", () => onShowMenu?.("singlePlayerConfig"));
  qs("btn-create-public")?.addEventListener("click", () => onlineConfig.configure("create-public"));
  qs("btn-public")?.addEventListener("click", () => onlineConfig.findPublic());
  qs("btn-private")?.addEventListener("click", () => onlineConfig.configure("private"));
  qs("btn-join-private")?.addEventListener("click", () => onShowMenu?.("joinRoom"));
  qs("btn-online-menu-back")?.addEventListener("click", () => onShowMenu?.("menu"));

  qs("btn-submit-private-join")?.addEventListener("click", () => {
    const code = qs("join-room-code")?.value?.trim().toUpperCase();
    if (!code || code.length < 4) {
      setJoinRoomError("Enter a valid room code.");
      return;
    }
    setJoinRoomError("");
    onJoinPrivate?.(code);
  });

  qs("btn-cancel-private-join")?.addEventListener("click", () => onShowMenu?.("menu"));
  qs("btn-online-leave")?.addEventListener("click", () => onResetToMenu?.());
  qs("btn-online-start-now")?.addEventListener("click", () => onStartOnlineNow?.());
  qs("btn-exit")?.addEventListener("click", () => onResetToMenu?.());
  qs("btn-ended-menu")?.addEventListener("click", () => onResetToMenu?.());
}
