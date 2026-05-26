function createNoopMobileNameInput() {
  return {
    input: null,
    focus() {},
    hide() {},
    setValue() {},
    show() {},
    update() {},
  };
}

function createMobileNameInputBridge(options = {}) {
  const doc = options.document || globalThis.document;
  if (!doc?.body || typeof doc.createElement !== 'function') return createNoopMobileNameInput();

  const input = doc.createElement('input');
  input.id = options.id || 'lovers-lost-mobile-name-input';
  input.type = 'text';
  input.maxLength = 12;
  input.autocomplete = 'nickname';
  input.inputMode = 'text';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Online display name');
  input.setAttribute('aria-hidden', 'true');
  input.style.cssText = [
    'position:fixed',
    'left:50%',
    'top:50%',
    'width:1px',
    'height:1px',
    'font-size:16px',
    'opacity:0.01',
    'border:0',
    'padding:0',
    'background:transparent',
    'color:transparent',
    'z-index:1000001',
  ].join(';');
  doc.body.appendChild(input);

  let active = false;

  function setValue(value) {
    const next = String(value || '').slice(0, 12);
    if (input.value !== next) input.value = next;
  }

  function focus() {
    if (!active) return;
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
  }

  function show(value = '', opts = {}) {
    active = true;
    setValue(value);
    input.setAttribute('aria-hidden', 'false');
    if (opts.focus) focus();
  }

  function hide() {
    if (!active) return;
    active = false;
    input.setAttribute('aria-hidden', 'true');
    input.blur?.();
  }

  function update({ active: shouldBeActive, value = '', focusOnActivate = false } = {}) {
    if (shouldBeActive) {
      const wasActive = active;
      show(value, { focus: focusOnActivate || !wasActive });
    } else {
      hide();
    }
  }

  input.addEventListener('input', () => {
    options.onInput?.(input.value);
  });

  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault?.();
      options.onSubmit?.();
    } else if (event.key === 'Escape') {
      event.preventDefault?.();
      options.onCancel?.();
    }
  });

  return {
    input,
    focus,
    hide,
    setValue,
    show,
    update,
  };
}

export { createMobileNameInputBridge };
