export function el(tag, className, attributesOrChildren, maybeChildren) {
  const element = document.createElement(tag);
  if (className) element.className = className;

  const hasAttributes =
    attributesOrChildren &&
    typeof attributesOrChildren === "object" &&
    !Array.isArray(attributesOrChildren) &&
    !(attributesOrChildren instanceof Node);

  if (hasAttributes) {
    Object.entries(attributesOrChildren).forEach(([name, value]) => {
      if (value !== null && value !== undefined) element.setAttribute(name, value);
    });
    appendChildren(element, maybeChildren);
  } else {
    appendChildren(element, attributesOrChildren);
  }

  return element;
}

export function appendChildren(element, children) {
  if (children === null || children === undefined) return;
  if (Array.isArray(children)) {
    children.forEach((child) => appendChildren(element, child));
    return;
  }
  element.append(children instanceof Node ? children : document.createTextNode(String(children)));
}

export function actionButton(label, onClick, attributes = {}) {
  const button = el("button", "scene-button", { type: "button", ...attributes }, label);
  button.addEventListener("click", onClick);
  return button;
}
