import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../scripts/core/match.js';
import { createFixedStep } from '../scripts/core/fixed-step.js';
test('face-off, goal celebration and opposing serve advance only on the match clock', () => {
    const events = [], match = createMatch({ emit: event => events.push(event) });
    match.start();
    assert.equal(match.state.phase, 'faceoff');
    match.tick(.65);
    assert.equal(match.state.phase, 'live');
    assert.equal(match.score(true), true);
    assert.equal(match.score(true), false);
    assert.equal(match.state.playerScore, 1);
    match.tick(1.05);
    assert.equal(match.state.phase, 'faceoff');
    assert.equal(match.state.servingPlayer, false);
    match.tick(.65);
    assert.equal(match.state.phase, 'live');
    assert.ok(events.some(event => event.type === 'serve' && !event.servingPlayer));
});
test('pause freezes face-offs and celebrations without stranding the round', () => {
    const match = createMatch();
    match.start();
    match.tick(.2);
    match.pause();
    match.tick(30);
    assert.equal(match.state.phase, 'faceoff');
    match.resume();
    match.tick(.45);
    assert.equal(match.state.phase, 'live');
    match.score(false);
    match.pause();
    match.tick(30);
    match.resume();
    match.tick(1.05);
    assert.equal(match.state.phase, 'faceoff');
});
test('first to seven ends once, and restart/menu clear pending rounds', () => {
    const events = [], match = createMatch({ emit: e => events.push(e) });
    match.start();
    for (let i = 0; i < 7; i++) {
        match.tick(.65);
        match.score(true);
        if (i < 6)
            match.tick(1.05);
    }
    assert.equal(match.state.screen, 'result');
    assert.equal(match.state.playerScore, 7);
    match.tick(100);
    assert.equal(match.score(false), false);
    assert.equal(events.filter(e => e.type === 'match-end').length, 1);
    match.start();
    assert.equal(match.state.playerScore, 0);
    match.menu();
    match.tick(100);
    assert.equal(match.state.screen, 'menu');
    assert.equal(match.state.phase, 'idle');
});
test('240 Hz tick count is independent of display refresh rate', () => {
    for (const rate of [30, 60, 120, 144]) {
        let ticks = 0;
        const clock = createFixedStep(() => ticks++);
        for (let i = 0; i < rate; i++)
            clock.advance(1 / rate);
        assert.equal(ticks, 240, `${rate} Hz`);
    }
});
test('long stalls are bounded and resetting discards partial frame time', () => {
    let ticks = 0;
    const clock = createFixedStep(() => ticks++);
    clock.advance(10);
    assert.equal(ticks, 12);
    clock.advance(.002);
    clock.reset();
    clock.advance(.003);
    assert.equal(ticks, 12);
});

test('Circuit matches preserve campaign mode and can return to the tour after a result', () => {
    const events = [], match = createMatch({ emit: event => events.push(event) });
    match.circuit();
    assert.equal(match.state.screen, 'circuit');
    assert.equal(match.state.mode, 'campaign');
    match.config.rivalId = 'rookie';
    match.start();
    for (let i = 0; i < 7; i++) {
        match.tick(.65);
        match.score(true);
        if (i < 6) match.tick(1.05);
    }
    assert.deepEqual(events.findLast(event => event.type === 'match-end'), { type: 'match-end', winner: 'player', mode: 'campaign', rivalId: 'rookie' });
    match.circuit();
    assert.equal(match.state.screen, 'circuit');
});
