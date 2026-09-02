# Horror creature models

Both models were created by **PurplePoint** and are used under the
[Creative Commons Attribution 4.0 International license](https://creativecommons.org/licenses/by/4.0/).

## Gaunt Horror Creature

- Project file: `gaunt-horror.glb`
- Title: “Gaunt Horror Creature – Free Creepy 3D Model”
- Author: [PurplePoint](https://sketchfab.com/Purple_Point)
- Source: [Sketchfab model 22a418d047764a23b73b539686b988c6](https://sketchfab.com/3d-models/gaunt-horror-creature-free-creepy-3d-model-22a418d047764a23b73b539686b988c6)
- SHA-256: `52266f73f0b3012640d5cb72d28eca7514cd6b41e3e2dc302eaeb0028f1f9541`

## Silent Horror Nurse

- Project file: `silent-horror-nurse.glb`
- Title: “Silent Horror Nurse – Stylized Creeping Model”
- Author: [PurplePoint](https://sketchfab.com/Purple_Point)
- Source: [Sketchfab model 59d0fa69d7c4440e8e72d7d616c5fe30](https://sketchfab.com/3d-models/silent-horror-nurse-stylized-creeping-model-59d0fa69d7c4440e8e72d7d616c5fe30)
- SHA-256: `b90994a84e7166281db88c9befd74525b86877e188bbe31ff6a6e4f02a76e537`

The source GLBs are static textured meshes. `tools/rig-horror-models.py` uses Blender 5.1 to create
the derived `*-rigged.glb` files: humanoid armatures, skin weights, hand/knee contact cleanup, and
the reusable `Creature_Idle`, `Creature_Stalk`, and `Creature_Chase` actions. The gaunt creature’s
emissive red eyes are attached to the exported `Head` bone by the game renderer.
