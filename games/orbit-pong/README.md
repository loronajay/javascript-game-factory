# Orbit Pong

Orbit Pong is a two-player circular sports cabinet for the JavaScript Game Factory. Both paddles share the full 360-degree rail, and the last player to return the ball scores when the opponent misses.

## Play

- Single Player: A/D against an interception-predicting CPU. Choose Easy, Normal, or Hard on the title screen.
- Local Multiplayer: Player 1 uses A/D and Player 2 uses Left/Right. Touch devices expose two independent control pairs with real multitouch.
- Online Multiplayer: public search or five-character private rooms through the dedicated server-authoritative `orbit-pong` bridge in `factory-network-server`.

Every mode feeds `{ orbit: -1 | 0 | 1 }` into the same fixed-rate simulation. Online clients send commands only; the server owns the ball, serves, contacts, scores, and match result.

Returns must alternate players. Touching the ball twice consecutively is a double-touch fault that awards the point to the opponent; the CPU deliberately yields after its return so the human gets the next play.

## Development

```text
npm test
```

Press F3 during a desktop match to toggle the simulation overlay.
