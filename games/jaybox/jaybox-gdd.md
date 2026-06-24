# JAYBOX

**Document Version:** 1.0  
**Status:** Prototype Scope  
**Platform:** Web browser  
**Product Type:** Shared-screen party-game host  

---

## Product Overview

Jaybox is the host product for a collection of browser-based party games. It pairs one shared public display with private phone controllers and provides the session that a selected game runs inside.

Jaybox is the owner of the player relationship. A game may use a temporary match name or identifier, but it must not become the long-term source of profile ownership, social records, or player identity.

Pot of Greed is the first Jaybox game. Its rules and game-specific implementation targets live in [`pot-of-greed/pot-of-greed-gdd.md`](pot-of-greed/pot-of-greed-gdd.md).

---

## Platform Ownership

Jaybox owns the cross-game experience:

- The game catalog and game selection on the shared display.
- Room creation, room codes, host selection, and joining rules.
- Player session identity, display names, and canonical player identity when accounts are introduced.
- The connection between one shared display and each private phone controller.
- Lobby state, roster visibility, host start controls, and roster locking at game launch.
- Connection lifecycle events: connected, disconnected, reconnected, and explicitly left.
- The reconnect window and the transport needed to resume a player session.
- Passing the selected game a locked roster and receiving its display/controller view models.
- Returning the group to a Jaybox-owned post-game/rematch flow.

Jaybox does not own a game's economy, scoring, rules, phases, game-specific timers, or game-specific presentation. Those belong to the selected game.

---

## First Release Catalog

The first release contains one game: Pot of Greed. The shared display shows Jaybox branding, the available game, a short description, and actions to create or join a room.

The catalog must be implemented as a list of game registrations, even while it contains one entry. This keeps the host shell ready for additional games without making Pot of Greed responsible for catalog behavior.

---

## Platform Flow

### Home and Game Selection

The shared display opens to the Jaybox home screen. A host selects a game, then creates a room for that game.

### Room Creation

Jaybox creates a room and generates a five-character room code. The room records the selected game and one host player session.

### Phone Joining

Players join with the room code and a display name. Jaybox establishes a private controller session for each player and keeps the display name with that session.

### Lobby

The shared display shows the room code, selected game, connected players, player count, and a host-controlled Start button. The display itself is never a player and has no game balance, action, or vote.

The selected game supplies its launch requirements, such as valid player-count limits. Jaybox applies those requirements before enabling Start.

### Game Handoff

When the host starts, Jaybox locks joining and player names, then gives the selected game a locked roster, stable player identifiers, the host identity, and public/private transport channels. From this point through final results, the game owns its game-state transitions.

### Post-Game and Rematch

When a game ends, it returns a result model to Jaybox. Jaybox presents the game result surface and may offer a rematch using the current connected roster. A new game instance must not reuse the previous game's authoritative state.

---

## Identity and Connection Lifecycle

Jaybox is the canonical owner of player identity. In the first prototype, a room-scoped display name and session identifier are sufficient; account requirements are out of scope. If persistent profiles are added later, Jaybox migrates or maps these sessions to its canonical identity rather than delegating that ownership to games.

On a lobby disconnect, Jaybox removes the player from the roster and reopens that seat. During a game, Jaybox preserves the player session for a 30-second reconnect window and notifies the game of the connection state. The game decides only its game-rule response after the window expires; it does not delete the player's identity or room membership.

---

## Platform Server Authority

The Jaybox server is authoritative for:

- Game registrations and selected game.
- Room membership and room codes.
- Host identity, player session identity, and display names.
- Lobby state and roster locking.
- Display/controller session binding and connection events.
- Reconnect timing and explicit leave events.

Clients submit joining, reconnecting, and host-start intent. Clients do not authoritatively create rooms, assign player identifiers, or mutate room membership.

---

## Platform State Machine

```text
HOME
GAME_SELECTION
ROOM_CREATION
LOBBY
GAME_HANDOFF
GAME_SESSION
POST_GAME
REMATCH_LOBBY
ENDED
```

`GAME_SESSION` delegates all game-specific state to the selected game. Jaybox observes its lifecycle only to route sessions and move the group to `POST_GAME` when the game reports completion.

---

## Core Platform Interfaces

The shared display requires:

```text
JayboxHome
GameCatalog
GameDetails
RoomCreation
RoomLobby
GameContainer
PostGameActions
```

The phone client requires:

```text
JoinRoomForm
DisplayNameForm
LobbyStatus
ControllerSession
ReconnectScreen
```

The selected game owns the content rendered inside `GameContainer` and the private controls shown after handoff.

---

## Cabinet Contract

Every registered Jaybox game must declare:

- A stable game identifier, title, description, and launch requirements.
- The minimum and maximum player count it accepts.
- A game-session factory that accepts the locked Jaybox roster and host identity.
- Public-display and private-controller view models scoped to that game session.
- Handlers for the connection events Jaybox sends during a game.
- A completion result that Jaybox can render and use to offer a rematch.

Games may derive match-local names or state, but they must use Jaybox-issued player identifiers at the integration boundary and must not replace Jaybox's ownership of player profiles or social data.

---

## Platform Prototype Acceptance Criteria

The platform prototype is complete when:

1. A host can select Pot of Greed, create a room, and receive a five-character code.
2. Players can join from phones and establish private controller sessions.
3. The shared display shows the selected game and connected roster in the lobby.
4. Jaybox enforces the selected game's declared launch requirements before starting.
5. Starting a game locks the roster and hands the game stable player identities plus public/private channels.
6. A player can reconnect within the grace period without losing their session identity.
7. Jaybox routes game completion to a post-game/rematch flow without retaining old game state.
8. A second game can be registered without changing Pot of Greed's rules or room implementation.

---

## Platform Out of Scope for the First Prototype

Do not add:

- Public matchmaking.
- Persistent accounts or profiles.
- Persistent currency or cross-game progression.
- Social feeds, friends, or shared activity records.
- Cosmetics.
- Text or voice chat.
- Audience/spectator systems.
- User-generated games or rule sets.

The first platform release proves the clean handoff from Jaybox to one game, then back to Jaybox.
