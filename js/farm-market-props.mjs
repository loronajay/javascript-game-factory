// The Market Square's stalls and order board, drawn from their one description
// in farm-market-square.mts and the farm's own textured primitives
// (farm-materials.mts), so a stall sits in the same world as the barn and
// blocks exactly where it is drawn. Everything else in the square is an
// ordinary farm decor row and is drawn by farm-props.mts.
//
// An open stall's stock is the real goods (farm-item-models.mts): the Produce
// Merchant's crates are heaped with the crops and fruit she buys, the
// Kitchen's counter is set with the dishes Basil buys, and the Sawmill's with
// stacked planks and the furniture Bram buys.
import { canvasPlane } from "./arcade-room-decor-primitives.mjs";
import { farmMaterial, tbox, tcylinder, tsphere } from "./farm-materials.mjs";
import { KITCHEN_STALL_ID, LIVESTOCK_STALL_ID, SAWMILL_STALL_ID } from "./farm-market-square.mjs";
import { LIVESTOCK_CATALOG } from "./farm-catalog/livestock.mjs";
import { createPlankModel } from "./farm-item-models.mjs";
import { createFurniturePiece } from "./farm-props-furniture.mjs";
import { createProduceModel } from "./farm-produce-models.mjs";
import { createDishModel } from "./farm-dish-models.mjs";
import { findRecipe } from "./farm-catalog/recipes.mjs";
const COUNTER_HEIGHT = 1.02;
const POST_HEIGHT = 2.5;
function stripedCanvas(THREE, colors) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    const stripes = 8;
    for (let index = 0; index < stripes; index += 1) {
        context.fillStyle = index % 2 === 0 ? colors[0] : colors[1];
        context.fillRect((index * canvas.width) / stripes, 0, canvas.width / stripes + 1, canvas.height);
    }
    // A little weave so the canvas reads as cloth, not paint.
    context.globalAlpha = 0.07;
    context.fillStyle = "#000";
    for (let y = 0; y < canvas.height; y += 3)
        context.fillRect(0, y, canvas.width, 1);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}
function awningMaterial(THREE, colors) {
    return new THREE.MeshStandardMaterial({ map: stripedCanvas(THREE, colors), roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
}
function drawSign(context, width, height, title, ink, sub) {
    context.fillStyle = "#f4ecd6";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = ink;
    context.lineWidth = 10;
    context.strokeRect(8, 8, width - 16, height - 16);
    context.fillStyle = ink;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `800 ${Math.round(height * (sub ? 0.36 : 0.5))}px Georgia, serif`;
    context.fillText(title.toUpperCase(), width / 2, sub ? height * 0.4 : height / 2, width - 40);
    if (sub) {
        context.font = `600 ${Math.round(height * 0.2)}px Georgia, serif`;
        context.fillText(sub, width / 2, height * 0.76, width - 40);
    }
}
/** A crate heaped with one crop: the crop's own model, laid in rows and a second layer on top. */
function produceCrate(THREE, group, x, z, cropId, y) {
    const wood = farmMaterial(THREE, "wood", { colors: ["#9a7248", "#6e4d2c"] });
    tbox(THREE, group, [0.5, 0.05, 0.36], [x, y + 0.025, z], wood);
    for (const side of [-1, 1]) {
        tbox(THREE, group, [0.5, 0.14, 0.02], [x, y + 0.07, z + side * 0.17], wood);
        tbox(THREE, group, [0.02, 0.14, 0.36], [x + side * 0.24, y + 0.07, z], wood);
    }
    const probe = createProduceModel(THREE, cropId);
    if (!probe)
        return;
    const size = new THREE.Box3().setFromObject(probe).getSize(new THREE.Vector3());
    const stepX = Math.max(0.05, size.x * 1.05);
    const stepZ = Math.max(0.05, size.z * 1.05);
    const columns = Math.max(1, Math.floor(0.44 / stepX));
    const rows = Math.max(1, Math.floor(0.3 / stepZ));
    let turn = 0;
    for (let layer = 0; layer < 2; layer += 1) {
        const layerColumns = Math.max(1, columns - layer);
        const layerRows = Math.max(1, rows - layer);
        for (let column = 0; column < layerColumns; column += 1) {
            for (let row = 0; row < layerRows; row += 1) {
                const item = createProduceModel(THREE, cropId);
                item.position.set(x + (column - (layerColumns - 1) / 2) * stepX, y + 0.05 + layer * size.y * 0.7, z + (row - (layerRows - 1) / 2) * stepZ);
                item.rotation.y = (turn += 2.3);
                group.add(item);
            }
        }
    }
}
/** The Kitchen's counter: plated dishes set out on it and on the shelf behind, as a menu you can see. */
function setDishes(THREE, group, front, back) {
    const counter = [["farm-stew", -1.15], ["cherry-pie", -0.55], ["pumpkin-soup", 0.05], ["roasted-roots", 0.62], ["corn-chowder", 1.15]];
    for (const [recipeId, x] of counter) {
        const recipe = findRecipe(recipeId);
        if (!recipe)
            continue;
        const dish = createDishModel(THREE, recipe, 3);
        dish.position.set(x, COUNTER_HEIGHT + 0.06, front - 0.32);
        dish.scale.setScalar(1.4);
        group.add(dish);
    }
    const shelf = [["tomato-sauce", -1.1], ["berry-preserves", -0.9], ["orange-marmalade", -0.7], ["melon-sorbet", 0.2], ["baked-apples", 0.75], ["peach-cobbler", 1.15]];
    for (const [recipeId, x] of shelf) {
        const recipe = findRecipe(recipeId);
        if (!recipe)
            continue;
        const dish = createDishModel(THREE, recipe, 2);
        dish.position.set(x, 1.275, back + 0.28);
        dish.scale.setScalar(1.3);
        group.add(dish);
    }
}
/** The Sawmill's counter: planks of every wood, a saw on the wall and a few pieces Bram has bought. */
function setSawmill(THREE, group, width, front, back) {
    ["oak", "pine", "birch", "willow"].forEach((speciesId, index) => {
        const stack = createPlankModel(THREE, speciesId);
        stack.position.set(-1.1 + index * 0.55, COUNTER_HEIGHT + 0.06, front - 0.3);
        stack.rotation.y = index % 2 ? 0.2 : -0.15;
        stack.scale.setScalar(1.6);
        group.add(stack);
    });
    const pieces = [
        ["decor.furniture.chair", "furniture-chair", -0.95, 0.14],
        ["decor.furniture.birdhouse", "furniture-birdhouse", 0.05, 0.1],
        ["decor.furniture.stool", "furniture-stool", 0.85, 0.12],
    ];
    for (const [itemId, model, x, scale] of pieces) {
        const piece = createFurniturePiece(THREE, model, itemId, 3);
        piece.position.set(x, 1.3, back + 0.28);
        piece.scale.setScalar(scale * 3.3);
        group.add(piece);
    }
    // A two-man saw hung on the back wall.
    const steel = new THREE.MeshStandardMaterial({ color: "#c3c9ce", roughness: 0.25, metalness: 0.85 });
    tbox(THREE, group, [1.2, 0.14, 0.012], [0, 1.9, back + 0.1], steel, false);
    for (const sx of [-1, 1])
        tcylinder(THREE, group, 0.022, 0.022, 0.2, [sx * 0.66, 1.9, back + 0.12], farmMaterial(THREE, "wood"), 8, false);
    void width;
}
/** The Livestock Dealer's counter: hay and a milk churn, a cowbell and a coiled halter, and today's young stock chalked on a board. */
function setLivestock(THREE, group, width, front, back) {
    const y = COUNTER_HEIGHT + 0.06;
    const straw = farmMaterial(THREE, "straw");
    const twine = new THREE.MeshStandardMaterial({ color: "#8a5a2b", roughness: 0.9 });
    for (const [x, turn] of [[-1.05, 0.1], [-0.5, -0.12]]) {
        const bale = tbox(THREE, group, [0.5, 0.3, 0.34], [x, y + 0.15, front - 0.32], straw);
        bale.rotation.y = turn;
        for (const dx of [-0.12, 0.12]) {
            const band = tbox(THREE, group, [0.025, 0.31, 0.35], [x + dx, y + 0.15, front - 0.32], twine, false);
            band.rotation.y = turn;
        }
    }
    const galvanised = farmMaterial(THREE, "galvanised", { metresPerTile: 0.4 });
    tcylinder(THREE, group, 0.13, 0.16, 0.42, [0.2, y + 0.21, front - 0.3], galvanised, 14);
    tcylinder(THREE, group, 0.08, 0.13, 0.08, [0.2, y + 0.46, front - 0.3], galvanised, 14);
    tcylinder(THREE, group, 0.09, 0.09, 0.05, [0.2, y + 0.52, front - 0.3], galvanised, 14);
    // A brass cowbell on a leather strap, and a coiled rope halter.
    const brass = new THREE.MeshStandardMaterial({ color: "#c9a24a", roughness: 0.35, metalness: 0.8 });
    tcylinder(THREE, group, 0.06, 0.09, 0.14, [0.72, y + 0.07, front - 0.25], brass, 12);
    tbox(THREE, group, [0.2, 0.02, 0.04], [0.72, y + 0.15, front - 0.25], twine, false);
    const rope = new THREE.MeshStandardMaterial({ color: "#c7a472", roughness: 0.95 });
    for (let loop = 0; loop < 3; loop += 1) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.13 - loop * 0.015, 0.018, 8, 20), rope);
        coil.rotation.x = Math.PI / 2;
        coil.position.set(1.12, y + 0.02 + loop * 0.03, front - 0.32);
        group.add(coil);
    }
    // The price board on the back wall, read from the catalog so a price change is one row.
    canvasPlane(THREE, group, 1.9, 0.78, [560, 230], (context, w, h) => {
        context.fillStyle = "#23302a";
        context.fillRect(0, 0, w, h);
        context.strokeStyle = "#8a6440";
        context.lineWidth = 14;
        context.strokeRect(7, 7, w - 14, h - 14);
        context.fillStyle = "#f2efe4";
        context.textAlign = "center";
        context.font = "700 32px Georgia, serif";
        context.fillText("Young stock", w / 2, 46);
        context.font = "26px Georgia, serif";
        LIVESTOCK_CATALOG.forEach((species, index) => {
            const row = 84 + index * 36;
            context.textAlign = "left";
            context.fillText(species.youngTitle, 60, row);
            context.textAlign = "right";
            context.fillText(`${species.price} tickets`, w - 60, row);
        });
    }, [0, 1.68, back + 0.09], false);
    void width;
}
function buildStall(THREE, group, stall, stock) {
    const { width, depth } = stall.footprint;
    const wood = farmMaterial(THREE, "wood", { colors: ["#8a6440", "#5f4128"] });
    const planks = farmMaterial(THREE, "planks", { colors: ["#a07650", "#7a5534", "#5d3f26"] });
    const battens = farmMaterial(THREE, "battens", { colors: ["#8f6a45", "#6b4b2c"] });
    const front = depth / 2;
    const back = -depth / 2;
    // The counter across the front and a bench of shelving at the back.
    tbox(THREE, group, [width, COUNTER_HEIGHT, 0.6], [0, COUNTER_HEIGHT / 2, front - 0.3], planks);
    tbox(THREE, group, [width + 0.1, 0.06, 0.72], [0, COUNTER_HEIGHT + 0.03, front - 0.3], wood);
    tbox(THREE, group, [width, 2.3, 0.08], [0, 1.15, back + 0.04], battens);
    tbox(THREE, group, [width - 0.2, 0.05, 0.4], [0, 1.25, back + 0.28], wood);
    // Corner posts carry the awning.
    for (const sx of [-1, 1]) {
        for (const [z, height] of [[front - 0.06, POST_HEIGHT - 0.3], [back + 0.06, POST_HEIGHT]]) {
            tcylinder(THREE, group, 0.06, 0.07, height, [sx * (width / 2 - 0.06), height / 2, z], wood, 10);
        }
    }
    // The awning: a sloped striped canvas from the back beam out past the counter, with a valance.
    const awning = awningMaterial(THREE, stall.colors);
    const run = depth + 0.5;
    const drop = 0.4;
    const slope = Math.atan2(drop, run);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.3, Math.hypot(run, drop)), awning);
    sheet.rotation.x = -Math.PI / 2 + slope;
    sheet.position.set(0, POST_HEIGHT + 0.05 - drop / 2, back + run / 2);
    sheet.castShadow = true;
    sheet.receiveShadow = true;
    group.add(sheet);
    const valance = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.3, 0.26), awning);
    valance.position.set(0, POST_HEIGHT + 0.05 - drop - 0.13, back + run);
    group.add(valance);
    // The name board stands on the awning's front edge, above the keeper's head and name tag.
    const board = Math.min(width - 0.2, 2.6);
    tbox(THREE, group, [board + 0.12, 0.56, 0.05], [0, POST_HEIGHT - 0.02, front + 0.24], wood);
    canvasPlane(THREE, group, board, 0.48, [640, 118], (context, w, h) => drawSign(context, w, h, stall.title, stall.colors[0], ""), [0, POST_HEIGHT - 0.02, front + 0.27], false);
    if (stall.open && stock) {
        stock(group, { width, front, back, counterHeight: COUNTER_HEIGHT, postHeight: POST_HEIGHT });
        return;
    }
    if (stall.open && stall.id === SAWMILL_STALL_ID) {
        setSawmill(THREE, group, width, front, back);
        return;
    }
    if (stall.open && stall.id === LIVESTOCK_STALL_ID) {
        setLivestock(THREE, group, width, front, back);
        return;
    }
    if (stall.open && stall.id === KITCHEN_STALL_ID) {
        setDishes(THREE, group, front, back);
        // A copper pot and a ladle hang at the corner where the scale would be.
        const copper = new THREE.MeshStandardMaterial({ color: "#b8733a", roughness: 0.35, metalness: 0.8 });
        tcylinder(THREE, group, 0.012, 0.012, 0.4, [width / 2 - 0.35, POST_HEIGHT - 0.65, front - 0.2], copper, 6, false);
        tcylinder(THREE, group, 0.13, 0.11, 0.16, [width / 2 - 0.35, POST_HEIGHT - 0.93, front - 0.2], copper, 16);
        return;
    }
    if (stall.open) {
        // Stock on the counter and on the back shelf: crates of what the merchant buys.
        const y = COUNTER_HEIGHT + 0.06;
        ["tomato", "carrot", "cabbage", "eggplant"].forEach((cropId, index) => produceCrate(THREE, group, [-1.05, -0.35, 0.35, 1.05][index], front - 0.32, cropId, y));
        ["apple", "corn"].forEach((cropId, index) => produceCrate(THREE, group, [-0.8, 0.8][index], back + 0.28, cropId, 1.28));
        // A hanging scale at the corner of the counter.
        const iron = new THREE.MeshStandardMaterial({ color: "#4a4a4a", roughness: 0.4, metalness: 0.7 });
        tcylinder(THREE, group, 0.012, 0.012, 0.5, [width / 2 - 0.35, POST_HEIGHT - 0.7, front - 0.2], iron, 6, false);
        tcylinder(THREE, group, 0.16, 0.12, 0.04, [width / 2 - 0.35, POST_HEIGHT - 0.97, front - 0.2], iron, 16);
        return;
    }
    // Shut: a board shutter over the opening and a notice pinned to it.
    const shutter = farmMaterial(THREE, "planks", { colors: ["#7c5b3c", "#5d4029", "#43301f"] });
    const opening = POST_HEIGHT - 0.3 - COUNTER_HEIGHT - 0.35;
    tbox(THREE, group, [width - 0.16, opening, 0.05], [0, COUNTER_HEIGHT + 0.06 + opening / 2, front - 0.08], shutter);
    canvasPlane(THREE, group, 0.9, 0.5, [360, 200], (context, w, h) => drawSign(context, w, h, "Closed", "#6b4b2c", "opening soon"), [0, COUNTER_HEIGHT + 0.06 + opening / 2, front - 0.05], false);
}
function buildBoard(THREE, group, stall) {
    const { width } = stall.footprint;
    const wood = farmMaterial(THREE, "wood", { colors: ["#8a6440", "#5f4128"] });
    const planks = farmMaterial(THREE, "planks", { colors: ["#a07650", "#7a5534", "#5d3f26"] });
    const shingles = farmMaterial(THREE, "shingles", { colors: ["#6b4b2c", "#4e351e"] });
    for (const sx of [-1, 1])
        tbox(THREE, group, [0.12, 2.5, 0.12], [sx * (width / 2 - 0.06), 1.25, 0], wood);
    tbox(THREE, group, [width - 0.1, 1.3, 0.08], [0, 1.45, 0], planks);
    tbox(THREE, group, [width + 0.3, 0.06, 0.5], [0, 2.52, 0.05], shingles);
    canvasPlane(THREE, group, width - 0.4, 0.34, [640, 110], (context, w, h) => drawSign(context, w, h, stall.title, stall.colors[0], ""), [0, 2.24, 0.05], false);
    if (!stall.open) {
        // An empty board: pins and the one notice that says why.
        canvasPlane(THREE, group, 1.2, 0.8, [420, 280], (context, w, h) => drawSign(context, w, h, "No orders", "#6b4b2c", "contracts open soon"), [0, 1.4, 0.05], false);
        return;
    }
    // Open: five notices pinned up, a little askew — the three produce tiers, then the
    // kitchen's two. What they ask for is read at the board (E); the model only says there is work here.
    const pin = new THREE.MeshStandardMaterial({ color: "#b8452f", roughness: 0.4, metalness: 0.2 });
    const headings = stall.notices ?? ["Wanted", "Wanted", "Wanted", "Kitchen", "Kitchen"];
    const notices = [[-0.98, 1.48, 0.05], [-0.49, 1.52, -0.04], [0, 1.46, 0.03], [0.49, 1.5, -0.05], [0.98, 1.47, 0.04]]
        .map(([x, y, tilt], index) => [x, y, tilt, headings[index % headings.length]]);
    for (const [x, y, tilt, title] of notices) {
        const note = canvasPlane(THREE, group, 0.44, 0.6, [192, 256], (context, w, h) => drawNotice(context, w, h, title), [x, y, 0.05], false);
        if (note?.rotation)
            note.rotation.z = tilt;
        tsphere(THREE, group, 0.025, [x, y + 0.26, 0.07], pin, 8, 6);
    }
}
/** A handwritten-looking paper notice: a title and a few scrawled lines. */
function drawNotice(context, width, height, title) {
    context.fillStyle = "#f6efd9";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#3d2a18";
    context.textAlign = "center";
    context.font = `800 ${Math.round(height * 0.12)}px Georgia, serif`;
    context.fillText(title.toUpperCase(), width / 2, height * 0.2, width - 20);
    context.strokeStyle = "rgba(61,42,24,.55)";
    context.lineWidth = 3;
    for (let line = 0; line < 5; line += 1) {
        const y = height * (0.36 + line * 0.11);
        context.beginPath();
        context.moveTo(width * 0.16, y);
        context.lineTo(width * (0.84 - (line % 2) * 0.18), y);
        context.stroke();
    }
}
/** One stall's group, posed in the square. */
export function createMarketStallModel(THREE, stall, stock) {
    const group = new THREE.Group();
    group.name = `market-stall-${stall.id}`;
    if (stall.kind === "board")
        buildBoard(THREE, group, stall);
    else
        buildStall(THREE, group, stall, stock);
    group.position.set(stall.x, 0, stall.z);
    group.rotation.y = stall.rotationY;
    return group;
}
