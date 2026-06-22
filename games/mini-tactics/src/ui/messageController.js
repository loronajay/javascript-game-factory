export class MessageController {
  constructor(element) {
    this.element = element;
    this.timer = null;
  }

  show(text, duration = 2300) {
    this.element.textContent = text;
    this.element.classList.add("show");

    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.element.classList.remove("show");
    }, duration);
  }
}
