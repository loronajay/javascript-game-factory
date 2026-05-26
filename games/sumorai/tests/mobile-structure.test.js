import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL  ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function read(file) {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8');
}

console.log('\nmobile-structure');

test('index mounts the shared mobile controller before game init', () => {
  const source = read('index.html');
  assert(source.includes("from '../../js/mobile-controller.mjs'"), 'expected shared mobile controller import');
  assert(source.includes("from './scripts/mobile-ui.js'"), 'expected Sumorai mobile UI import');
  assert(source.includes("id: 'sumorai-touch'"), 'expected Sumorai-specific mobile profile');
  assert(
    source.indexOf("id: 'attack'") < source.indexOf("id: 'dash'") &&
      source.indexOf("id: 'dash'") < source.indexOf("id: 'throw'"),
    'expected default Sumorai mobile button order: attack, dash, throw',
  );
  assert(source.includes('forceMobileControls'), 'expected desktop QA force switch');
  const gateCall = source.indexOf('initMobileLandscapeGate({ force: forceMobileControls })');
  const controllerCall = source.indexOf('mountMobileController({ profile: SUMORAI_MOBILE_PROFILE, force: forceMobileControls })');
  const initCall = source.indexOf('initGame();');
  assert(
    gateCall >= 0 && controllerCall >= 0 && initCall >= 0 &&
      gateCall < controllerCall && controllerCall < initCall,
    'expected gate/controller setup before game initialization',
  );
});

test('mobile styles include landscape gate and shared controller overrides', () => {
  const source = read('style.css');
  assert(source.includes('.mobile-landscape-gate'), 'expected mobile landscape gate styles');
  assert(source.includes('.mobile-play-gated .shell'), 'expected game shell dimming while gated');
  assert(source.includes('(pointer: coarse)'), 'expected touch-specific media query');
  assert(source.includes('data-mobile-controller-root="sumorai-touch"'), 'expected Sumorai controller overrides');
  assert(source.includes('env(safe-area-inset-bottom)'), 'expected safe-area inset handling');
});

test('game routes mounted mobile controller events through the default P1 input profile', () => {
  const source = read('game.js');
  assert(source.includes('isMobileControllerMounted(document)'), 'expected mobile controller detection in tickActive');
  assert(source.includes('getHumanInputBindings'), 'expected shared input routing helper');
  assert(source.includes('defaultMobileBindings: DEFAULT_P1'), 'expected fixed mobile key profile matching the mounted controller');
});

if (failed > 0) {
  console.error(`\n${failed} failing, ${passed} passing`);
  process.exit(1);
}

console.log(`\n${passed} passing`);
