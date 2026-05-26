# Mobile Drawing Engine Prototype

This is a modular HTML/CSS/JavaScript prototype for a mobile-first drawing engine.

## How to run

Because this version uses ES modules, run it from a local web server instead of opening `index.html` directly from the file system.

Simple options:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

For phone testing, run the server on your computer and open the computer's LAN IP from your phone.

## Current features

- startup canvas setup
- canvas size presets
- floor color presets
- mobile joystick movement
- keyboard movement
- visible drawing anchor
- pencil tool
- brush tool
- spray tool
- eraser tool
- line color picker
- floor color picker
- raw/smooth stroke toggle
- undo
- clear
- full canvas view
- scrolling camera
- minimap

## Important design choices

The visible draw anchor is the actual drawing point. The character's held tool is only visual. This prevents line jumps when the character changes facing direction.

The spray tool is implemented as dense radial-gradient airbrush stamps, not sparse random dots. This is closer to a traditional spray tool and builds color faster.

The visible hurtbox was removed. Collision/hitbox logic can be added later without exposing debug visuals in the prototype UI.

## Project structure

```text
index.html
css/styles.css
js/main.js
js/core/config.js
js/core/state.js
js/core/utils.js
js/systems/input.js
js/systems/player.js
js/systems/camera.js
js/systems/world.js
js/systems/drawingEngine.js
js/systems/renderer.js
js/ui/refs.js
js/ui/controls.js
```

## Notes for agent

This is engine infrastructure, not gameplay. Keep gameplay systems separate from the drawing engine. The likely next seam is:

```text
js/gameplay/
```

Do not mix gameplay win/loss/objective logic into `drawingEngine.js`. The drawing engine should remain responsible for stroke data, tool behavior, undo/clear, and canvas rendering only.
