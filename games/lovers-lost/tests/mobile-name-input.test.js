import { createMobileNameInputBridge } from '../scripts/mobile-name-input.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL  ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function assertEq(a, b, message) {
  if (a !== b) throw new Error(message || `expected ${JSON.stringify(a)} === ${JSON.stringify(b)}`);
}

function makeDocument() {
  const appended = [];
  function createElement(tag) {
    const listeners = {};
    return {
      tagName: tag.toUpperCase(),
      value: '',
      style: {},
      attributes: {},
      focusCalls: 0,
      blurCalls: 0,
      addEventListener(type, handler) {
        listeners[type] = handler;
      },
      dispatch(type, event = {}) {
        listeners[type]?.(event);
      },
      focus() {
        this.focusCalls++;
      },
      blur() {
        this.blurCalls++;
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      getAttribute(name) {
        return this.attributes[name];
      },
    };
  }
  return {
    appended,
    body: {
      appendChild(node) {
        appended.push(node);
      },
    },
    createElement,
  };
}

console.log('\nmobile-name-input');

test('creates a focusable text input for mobile keyboard entry', () => {
  const doc = makeDocument();
  const bridge = createMobileNameInputBridge({ document: doc });
  assertEq(doc.appended.length, 1);
  assertEq(bridge.input.type, 'text');
  assertEq(bridge.input.maxLength, 12);
  assertEq(bridge.input.inputMode, 'text');
  assertEq(bridge.input.getAttribute('aria-hidden'), 'true');
});

test('show syncs the name and focuses when requested', () => {
  const doc = makeDocument();
  const bridge = createMobileNameInputBridge({ document: doc });
  bridge.show('Star Crossed', { focus: true });
  assertEq(bridge.input.value, 'Star Crossed');
  assertEq(bridge.input.getAttribute('aria-hidden'), 'false');
  assertEq(bridge.input.focusCalls, 1);
});

test('update focuses on activation and hides on deactivation', () => {
  const doc = makeDocument();
  const bridge = createMobileNameInputBridge({ document: doc });
  bridge.update({ active: true, value: 'Leo' });
  assertEq(bridge.input.focusCalls, 1);
  bridge.update({ active: false });
  assertEq(bridge.input.getAttribute('aria-hidden'), 'true');
  assertEq(bridge.input.blurCalls, 1);
});

test('input events publish typed value', () => {
  const doc = makeDocument();
  let value = '';
  const bridge = createMobileNameInputBridge({
    document: doc,
    onInput(next) {
      value = next;
    },
  });
  bridge.input.value = 'Nova';
  bridge.input.dispatch('input');
  assertEq(value, 'Nova');
});

test('keydown stops duplicate bubbling and Enter submits', () => {
  const doc = makeDocument();
  let submitted = false;
  let stopped = false;
  let prevented = false;
  const bridge = createMobileNameInputBridge({
    document: doc,
    onSubmit() {
      submitted = true;
    },
  });
  bridge.input.dispatch('keydown', {
    key: 'Enter',
    stopPropagation() { stopped = true; },
    preventDefault() { prevented = true; },
  });
  assertEq(submitted, true);
  assertEq(stopped, true);
  assertEq(prevented, true);
});

test('missing DOM returns a safe no-op bridge', () => {
  const bridge = createMobileNameInputBridge({ document: {} });
  assertEq(bridge.input, null);
  bridge.update({ active: true, value: 'Nobody' });
});

if (failed > 0) {
  console.error(`\n${failed} failing, ${passed} passing`);
  process.exit(1);
}

console.log(`\n${passed} passing`);
