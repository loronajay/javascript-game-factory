export const SVG_NS = "http://www.w3.org/2000/svg";

export function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [attribute, value] of Object.entries(attributes)) element.setAttribute(attribute, value);
  return element;
}
