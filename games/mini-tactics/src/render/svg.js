export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export function createSvgElement(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NAMESPACE, tag);

  for (const [name, value] of Object.entries(attributes)) {
    if (name === "text") {
      element.textContent = value;
    } else {
      element.setAttribute(name, String(value));
    }
  }

  return element;
}
