export function createResolutionGuard(epoch, getCurrentEpoch, bindings = {}) {
  const current = () => epoch === getCurrentEpoch();
  const guardFunction = (fn, fallback = Promise.resolve()) => (...args) => (
    current() ? fn(...args) : fallback
  );
  const effects = new Proxy(bindings.effects ?? {}, {
    get(target, key) {
      const value = target[key];
      return typeof value === "function" ? guardFunction(value.bind(target)) : value;
    },
  });
  const audio = bindings.audio
    ? { ...bindings.audio, play: guardFunction(bindings.audio.play.bind(bindings.audio), undefined) }
    : bindings.audio;
  return {
    current,
    effects,
    audio,
    render: guardFunction(bindings.render ?? (() => {}), undefined),
    revealRoll: guardFunction(bindings.revealRoll ?? (async () => {})),
    playAttackImpactSound: guardFunction(bindings.playAttackImpactSound ?? (() => {}), undefined),
  };
}
