(function () {
  if (window.PixelText) return;

  const glyphs = {
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    G: ["01111", "10000", "10000", "10011", "10001", "10001", "01110"],
    H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
    K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
    X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "'": ["1", "1", "1", "0", "0", "0", "0"],
    ".": ["0", "0", "0", "0", "0", "1", "1"],
    " ": ["000", "000", "000", "000", "000", "000", "000"],
  };

  function getGlyph(character) {
    return glyphs[character] || glyphs[" "];
  }

  function buildPixelSvg(text) {
    const letters = Array.from(text.toUpperCase(), getGlyph);
    const totalWidth = letters.reduce((sum, glyph, index) => {
      return sum + glyph[0].length + (index < letters.length - 1 ? 1 : 0);
    }, 0);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + Math.max(totalWidth, 1) + " 7");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.classList.add("pixel-text__svg");

    let cursorX = 0;
    letters.forEach((glyph, glyphIndex) => {
      glyph.forEach((row, y) => {
        Array.from(row).forEach((cell, x) => {
          if (cell !== "1") {
            return;
          }

          const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          rect.setAttribute("x", String(cursorX + x));
          rect.setAttribute("y", String(y));
          rect.setAttribute("width", "1");
          rect.setAttribute("height", "1");
          rect.setAttribute("class", "pixel-text__pixel");
          svg.appendChild(rect);
        });
      });

      cursorX += glyph[0].length;
      if (glyphIndex < letters.length - 1) {
        cursorX += 1;
      }
    });

    return svg;
  }

  function renderElement(element) {
    if (!element) return;

    const label = element.textContent.trim();
    element.setAttribute("aria-label", label);
    element.textContent = "";

    const srText = document.createElement("span");
    srText.className = "pixel-text__sr";
    srText.textContent = label;

    element.append(srText, buildPixelSvg(label));
  }

  function renderAll(root = document) {
    root.querySelectorAll(".pixel-text").forEach(renderElement);
  }

  renderAll();

  window.PixelText = {
    render: renderElement,
    renderAll,
  };
}());
