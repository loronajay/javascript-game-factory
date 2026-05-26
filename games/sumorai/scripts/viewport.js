function setupCanvasViewport({ canvas, window, viewportWidth, viewportHeight, setScaleFactor }) {
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const scale = Math.min(canvas.width / viewportWidth, canvas.height / viewportHeight);
    setScaleFactor(scale);
  }

  window.addEventListener('resize', resize);
  resize();

  return { resize };
}

export { setupCanvasViewport };
