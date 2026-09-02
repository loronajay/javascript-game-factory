// The hall around the table.
//
// Floor, walls, pictures and the three pendant lamps. None of it is ever
// collided with or read by the sim — it exists to give the table somewhere to
// be, and to put the warm pool of light over it that the whole look depends on.
//
// It is a separate module from `table-view.js` for a reason that will pay later:
// the room is the part a second venue would replace. Everything here is built
// from one options object, so a second hall is a second call rather than a
// second file full of copied box meshes.

/** The default hall: dark walnut panelling, warm pendants, a cold rim from the window. */
export const DEFAULT_ROOM = Object.freeze({
  wall: 0x17181b,
  sideWall: 0x121316,
  warmLight: 0xffdfac,
  coolRim: 0x6f8fc0,
  amberRim: 0xd7aa79,
  art: Object.freeze([0x223243, 0x3f2c22, 0x1f3128]),
});

export function buildRoom(THREE, scene, { floorTexture, options = DEFAULT_ROOM } = {}) {
  const group = new THREE.Group();
  scene.add(group);

  // --- lights ------------------------------------------------------------
  // A hemisphere for the ambient bounce, one warm point over the table doing all
  // the real work, and two dim rims so the rails read against the dark.
  //
  // The hemisphere is kept LOW and only faintly blue. It is the light that hits
  // every surface from every direction, so it is also the light that flattens a
  // room: at the intensity a bright interior would use it lifted the navy cloth
  // to a pale grey-blue and erased the pendants' pool of warm light entirely,
  // which is the whole look. The hall is dark and lit from one fixture; the
  // ambient exists to keep the shadows from going to pure black, nothing more.
  const ambient = new THREE.HemisphereLight(0x7d90a8, 0x100b07, 0.34);
  scene.add(ambient);

  // Intensity is in candela and falls off with the square of the distance, so
  // this number is not a brightness slider — it is how strong the bulb is two
  // metres above the cloth. Turned well down from the demo's: at the old value
  // the specular highlight on every surface swamped its own colour.
  const key = new THREE.PointLight(options.warmLight, 30, 6, 2);
  key.position.set(0, 2.35, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);

  const coolRim = new THREE.PointLight(options.coolRim, 16, 5, 2);
  coolRim.position.set(-2.6, 1.5, -1.7);
  scene.add(coolRim);

  const amberRim = new THREE.PointLight(options.amberRim, 12, 4, 2);
  amberRim.position.set(2.3, 1.3, 1.5);
  scene.add(amberRim);

  // --- surfaces ----------------------------------------------------------
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.9, metalness: 0.02 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.72;
  floor.receiveShadow = true;
  group.add(floor);

  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 4.4),
    new THREE.MeshStandardMaterial({ color: options.wall, roughness: 0.96 }),
  );
  backWall.position.set(0, 1.45, -3.3);
  group.add(backWall);

  const sideWall = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 4.4),
    new THREE.MeshStandardMaterial({ color: options.sideWall, roughness: 1 }),
  );
  sideWall.rotation.y = Math.PI / 2;
  sideWall.position.set(-4, 1.45, 0);
  group.add(sideWall);

  // --- pictures ----------------------------------------------------------
  options.art.forEach((color, index) => {
    const x = (index - 1) * 1.55;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.93, 0.66, 0.035),
      new THREE.MeshStandardMaterial({ color: 0x2d2118, roughness: 0.55 }),
    );
    frame.position.set(x, 1.42, -3.26);
    group.add(frame);

    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.58), new THREE.MeshStandardMaterial({ color, roughness: 0.75 }));
    art.position.set(x, 1.42, -3.245);
    group.add(art);
  });

  // --- the fixture -------------------------------------------------------
  // Three shades on a bar, with an unlit emissive sphere in each. The spheres do
  // not light anything — the single point light above does — because three real
  // shadow-casting lights over a table of sixteen shadow casters is a frame-rate
  // decision, not a lighting one.
  //
  // It is its own group for one reason: it hangs between the overhead camera and
  // the table, and from straight up the shades fill the screen. `scene.js` hides
  // this group in the overhead shot. Only the geometry goes — the point light
  // above stays lit, so the pool of warm light and every shadow under it are
  // exactly the same in both views.
  const fixture = new THREE.Group();
  group.add(fixture);

  const barMaterial = new THREE.MeshStandardMaterial({ color: 0x242629, metalness: 0.65, roughness: 0.32 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.07, 0.14), barMaterial);
  bar.position.y = 2.12;
  bar.castShadow = true;
  fixture.add(bar);

  for (const x of [-0.48, 0, 0.48]) {
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.25, 0.18, 32, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.58, roughness: 0.34, side: THREE.DoubleSide }),
    );
    shade.position.set(x, 1.98, 0);
    shade.castShadow = true;
    fixture.add(shade);

    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffe0a8 }));
    bulb.position.set(x, 1.91, 0);
    fixture.add(bulb);
  }

  return { group, key, ambient, fixture };
}
