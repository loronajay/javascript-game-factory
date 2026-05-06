export class EventLog {
  constructor(root) {
    this.root = root;
  }

  add(message) {
    const item = document.createElement("li");
    item.textContent = message;
    this.root.prepend(item);
  }

  clear() {
    this.root.innerHTML = "";
  }
}
