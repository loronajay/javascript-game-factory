// Local adapter deliberately mirrors the room-adapter shape that online mode will use later.
// It is a same-device rules harness, not the final multiplayer transport.
export function createLocalAdapter() {
  const cb = {
    onInput: null,
    onMatchStart: null,
    onError: null,
  };

  function startMatch(settings) {
    cb.onMatchStart?.(settings);
  }

  function sendInput(input) {
    cb.onInput?.(input);
  }

  function disconnect() {}

  return { startMatch, sendInput, disconnect, cb };
}
