import {
  createJoinCodeInput,
  focusJoinCodeInput,
  setJoinCodeInputActive,
  syncJoinCodeInputValue,
} from "../scripts/mobile-join-code-input.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}

function makeClassList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    toggle(value, enabled) {
      if (enabled) values.add(value);
      else values.delete(value);
    },
    contains(value) { return values.has(value); },
  };
}

function makeElement(tagName) {
  const listeners = {};
  return {
    tagName,
    id: "",
    className: "",
    type: "",
    value: "",
    hidden: false,
    maxLength: 0,
    inputMode: "",
    autocomplete: "",
    autocapitalize: "",
    spellcheck: true,
    attributes: {},
    listeners,
    classList: makeClassList(),
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    focus() {
      this.focused = true;
    },
    select() {
      this.selected = true;
    },
  };
}

function makeDocument(existing = null) {
  const body = {
    appended: [],
    appendChild(element) {
      this.appended.push(element);
      return element;
    },
  };
  return {
    body,
    createElement: makeElement,
    getElementById(id) {
      return existing?.id === id ? existing : null;
    },
  };
}

test("join code input is a focusable mobile keyboard target", () => {
  const doc = makeDocument();
  const input = createJoinCodeInput({ document: doc });

  assertEqual(input.id, "bird-duty-join-code-input");
  assertEqual(input.type, "text");
  assertEqual(input.inputMode, "text");
  assertEqual(input.maxLength, 6);
  assertEqual(input.autocomplete, "off");
  assertEqual(input.autocapitalize, "characters");
  assertEqual(input.hidden, true);
  assertEqual(doc.body.appended[0], input);
});

test("join code input normalizes typed values for game state", () => {
  let value = "";
  const input = createJoinCodeInput({
    document: makeDocument(),
    onInput(next) {
      value = next;
    },
  });
  input.value = "ab-cd12!";
  input.listeners.input();

  assertEqual(input.value, "ABCD12");
  assertEqual(value, "ABCD12");
});

test("join code input submits and backs out from keyboard controls", () => {
  let submitted = false;
  let escaped = false;
  const input = createJoinCodeInput({
    document: makeDocument(),
    onSubmit() {
      submitted = true;
    },
    onEscape() {
      escaped = true;
    },
  });
  const enter = {
    key: "Enter",
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };
  const escape = {
    key: "Escape",
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };

  input.listeners.keydown(enter);
  input.listeners.keydown(escape);

  assertEqual(submitted, true);
  assertEqual(escaped, true);
  assertEqual(enter.prevented, true);
  assertEqual(escape.prevented, true);
  assertEqual(enter.stopped, true);
  assertEqual(escape.stopped, true);
});

test("join code input activation syncs value and focus", () => {
  const input = createJoinCodeInput({ document: makeDocument() });

  setJoinCodeInputActive(input, true, "AB12");
  assertEqual(input.hidden, false);
  assertEqual(input.value, "AB12");
  assert(input.classList.contains("is-active"), "expected active class");
  assertEqual(focusJoinCodeInput(input), true);
  assertEqual(input.focused, true);
  assertEqual(input.selected, true);

  syncJoinCodeInputValue(input, "ZX90");
  assertEqual(input.value, "ZX90");

  setJoinCodeInputActive(input, false, "ZX90");
  assertEqual(input.hidden, true);
  assertEqual(input.classList.contains("is-active"), false);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
