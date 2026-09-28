// A person's keys, tick by tick, on their way to the server.
//
// Every fixed tick records the input it played locally with a rising sequence
// number. Inputs go out in small batches (a message every couple of ticks
// rather than sixty a second); the server takes exactly one per tick and each
// snapshot says the last one it took. What the server has not yet taken is
// `pending` — the inputs a client replays over the server's word to predict
// its own pet. Pure: no socket, no clock.

export function createInputStream({ read = (input) => input, batchTicks = 2, maxPending = 240 } = {}) {
  let seq = 0;
  let acked = 0;
  let pending = [];
  let outbox = [];

  return {
    /** Record this tick's input; returns its sequence number. */
    record(input) {
      seq += 1;
      const entry = { seq, input: read(input) };
      pending.push(entry);
      outbox.push(entry);
      // A server that has stopped acknowledging is not worth an unbounded replay.
      if (pending.length > maxPending) pending = pending.slice(-maxPending);
      return seq;
    },
    /** The inputs to send now, or null until a batch has built up (`force` sends whatever is waiting). */
    takeBatch(force = false) {
      if (!outbox.length || (!force && outbox.length < batchTicks)) return null;
      const inputs = outbox;
      outbox = [];
      return { inputs };
    },
    /** The server took everything up to `ack`. */
    acknowledge(ack) {
      const value = Math.floor(Number(ack) || 0);
      if (value <= acked) return;
      acked = value;
      let drop = 0;
      while (drop < pending.length && pending[drop].seq <= acked) drop += 1;
      if (drop) pending = pending.slice(drop);
    },
    /** Inputs played locally that the server has not taken yet, oldest first. */
    pendingInputs() {
      return pending.map((entry) => entry.input);
    },
    reset() {
      seq = 0;
      acked = 0;
      pending = [];
      outbox = [];
    },
    get seq() { return seq; },
    get acked() { return acked; },
  };
}
