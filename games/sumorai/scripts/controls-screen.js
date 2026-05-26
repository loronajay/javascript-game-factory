function swapBindingForSide(sideBindings, actions, action, code) {
  for (const other of actions) {
    if (other === action) continue;
    if (sideBindings[other] === code) {
      sideBindings[other] = sideBindings[action];
      break;
    }
  }
  sideBindings[action] = code;
}

function createControlsScreen({
  document,
  window,
  actions,
  actionLabels,
  defaultP1,
  defaultP2,
  formatKeyCode,
  getBindings,
  setBindings,
  saveBindings,
  showScreen,
}) {
  let workingBindings = null;
  let listeningState = null;

  function keyBtnEl(side, action) {
    return document.querySelector(`#controls-table-${side} [data-action="${action}"]`);
  }

  function buildControlsTable(side) {
    const table = document.getElementById(`controls-table-${side}`);
    table.innerHTML = '';
    for (const action of actions) {
      const tr = document.createElement('tr');
      const labelTd = document.createElement('td');
      labelTd.className = 'controls-label';
      labelTd.textContent = actionLabels[action];

      const keyTd = document.createElement('td');
      const keyBtn = document.createElement('button');
      keyBtn.className = 'key-btn';
      keyBtn.textContent = formatKeyCode(workingBindings[side][action]);
      keyBtn.dataset.side = side;
      keyBtn.dataset.action = action;
      keyBtn.addEventListener('click', () => startListening(side, action, keyBtn));

      keyTd.appendChild(keyBtn);
      tr.appendChild(labelTd);
      tr.appendChild(keyTd);
      table.appendChild(tr);
    }
  }

  function startListening(side, action, btn) {
    if (listeningState) cancelListening();
    listeningState = { side, action, btn, prevKey: workingBindings[side][action] };
    btn.textContent = '\u2026';
    btn.classList.add('key-btn--listening');
  }

  function cancelListening() {
    if (!listeningState) return;
    const { btn, prevKey } = listeningState;
    btn.textContent = formatKeyCode(prevKey);
    btn.classList.remove('key-btn--listening');
    btn.classList.remove('key-btn--conflict');
    listeningState = null;
  }

  function commitListening(code) {
    if (!listeningState) return;
    const { side, action, btn } = listeningState;

    swapBindingForSide(workingBindings[side], actions, action, code);
    for (const other of actions) {
      const otherBtn = keyBtnEl(side, other);
      if (otherBtn) otherBtn.textContent = formatKeyCode(workingBindings[side][other]);
    }

    btn.classList.remove('key-btn--listening');
    btn.classList.remove('key-btn--conflict');
    listeningState = null;
  }

  function open() {
    const bindings = getBindings();
    workingBindings = { p1: { ...bindings.p1 }, p2: { ...bindings.p2 } };
    buildControlsTable('p1');
    buildControlsTable('p2');
    showScreen('screen-controls');
  }

  function resetSide(side) {
    if (listeningState?.side === side) cancelListening();
    workingBindings[side] = side === 'p1' ? { ...defaultP1 } : { ...defaultP2 };
    buildControlsTable(side);
  }

  function done() {
    if (listeningState) cancelListening();
    saveBindings(workingBindings.p1, workingBindings.p2);
    setBindings({ ...workingBindings });
    workingBindings = null;
    showScreen('screen-menu');
  }

  function wire() {
    window.addEventListener('keydown', (event) => {
      if (!listeningState) return;
      event.preventDefault();
      if (event.code === 'Escape') {
        cancelListening();
        return;
      }
      commitListening(event.code);
    });

    document.getElementById('btn-controls').addEventListener('click', open);
    document.getElementById('controls-reset-p1').addEventListener('click', () => resetSide('p1'));
    document.getElementById('controls-reset-p2').addEventListener('click', () => resetSide('p2'));
    document.getElementById('controls-done').addEventListener('click', done);
  }

  return { wire };
}

export { createControlsScreen, swapBindingForSide };
