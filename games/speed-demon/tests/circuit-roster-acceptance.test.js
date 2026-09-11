// Completion gate for the full-roster art pass. This intentionally fails until
// every canonical garage model has accepted directional artwork.
import { allModels } from "../scripts/assets/car-atlas.js";
import { CIRCUIT_MODELS } from "../scripts/circuit/assets.js";
import { suite, test, assertDeepEqual, finish } from "./harness.js";

suite("full circuit roster — delivery acceptance");
test("all 24 garage models are available with their own directional artwork", () => {
  assertDeepEqual(CIRCUIT_MODELS.map((model) => model.modelId), allModels().map((model) => model.id));
});
finish();
