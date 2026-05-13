export function shouldQuitMatchOnKey(phase, key) {
  return key === 'Escape' && (phase === 'playing' || phase === 'countdown');
}
