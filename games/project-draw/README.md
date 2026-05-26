# Mobile Drawing Engine Fill Prototype

Modular version of the mobile drawing-engine prototype.

## Files

- `index.html` — page structure and UI markup
- `css/styles.css` — all styling and responsive layout rules
- `js/app.js` — drawing engine, movement, camera, tools, shapes, fill, eraser, undo, and setup menu

## How to run

Open `index.html` in a browser.

For best mobile testing, host the folder with a simple local server or upload it to your site. Opening the file directly can work, but some mobile browsers handle local HTML files inconsistently.

## Included features

- startup canvas setup menu
- canvas size presets
- floor color presets
- joystick movement
- scrolling camera
- full view mode
- visible drawing cursor/anchor
- pencil, brush, spray, eraser
- shape tool: line, rectangle, ellipse, triangle
- fill button using current line color
- undo and clear
- raw/smooth stroke mode


## Patch note

This version fixes fill overlap behavior. Fill regions are now rendered through an alpha-preserving temp canvas instead of using `putImageData()` directly on the main canvas. This prevents one fill region's transparent crop area from clearing another fill.
