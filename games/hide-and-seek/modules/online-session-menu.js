// Entering play transfers the lobby to the match; only backing out releases its socket.
export function createSessionMenuHandler({ logic, account, getOnline }) {
  return (screen, previousScreen) => {
    if (screen === logic.SCREENS.ONLINE) {
      account.syncMenu();
      if (account.requireAccount()) getOnline()?.connect();
    } else if (previousScreen === logic.SCREENS.ONLINE && ![logic.SCREENS.PLAYING, logic.SCREENS.CAUGHT].includes(screen)) {
      getOnline()?.disconnect();
    }
  };
}
