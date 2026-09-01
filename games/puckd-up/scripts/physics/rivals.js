import { W, L } from '../config.js';

const portrait = id => `./assets/rivals/${id}.jpg`;

export const RIVALS = Object.freeze([
    { id: 'rookie', name: 'Jin', title: 'The Prodigy', style: 'Reactive', color: '#a6d854', accent: '#e7ffad', homeArena: 'hyper_arcade', portrait: portrait('rookie'), speed: 6.2, error: .16, strikePower: .21, design: 'starter', intro: 'Seventeen, scary fast to learn, and still liable to bite on the first fake.', behavior: 'reactive' },
    { id: 'banks', name: 'Banks', title: 'Park Hustler', style: 'Rail shots', color: '#9b5b45', accent: '#f1c27d', homeArena: 'park_jam', portrait: portrait('banks'), speed: 7.1, error: .095, strikePower: .24, design: 'classic', intro: 'He has taken lunch money off three generations at the same park table.', behavior: 'banker' },
    { id: 'brick', name: 'Mack', title: 'The Brick', style: 'Deep defense', color: '#d36b35', accent: '#ffb270', homeArena: 'garage_club', portrait: portrait('brick'), speed: 7.0, error: .075, strikePower: .23, design: 'heavy', intro: 'An electrician by day. After work, nothing gets through his half of the table.', behavior: 'defender' },
    { id: 'viper', name: 'Val', title: 'Viper', style: 'All-out attack', color: '#d43883', accent: '#ff8dc5', homeArena: 'hyper_arcade', portrait: portrait('viper'), speed: 9.1, error: .072, strikePower: .27, design: 'razor', intro: 'A bike courier with no neutral gear and even less patience for a loose puck.', behavior: 'aggressor' },
    { id: 'gambler', name: 'Nico', title: 'The Gambler', style: 'Risky angles', color: '#8c55c7', accent: '#f0c45e', homeArena: 'boardwalk_bash', portrait: portrait('gambler'), speed: 8.5, error: .115, strikePower: .29, design: 'flash', intro: 'He will try the shot nobody sane would take—and somehow make half of them.', behavior: 'gambler' },
    { id: 'cannon', name: 'Tess', title: 'Cannon', style: 'Heavy strikes', color: '#b93a38', accent: '#ff8b6b', homeArena: 'freight_yard', portrait: portrait('cannon'), speed: 8.0, error: .065, strikePower: .38, design: 'power', intro: 'A former amateur boxer who treats every clean contact like a right cross.', behavior: 'power' },
    { id: 'mirror', name: 'Mara', title: 'Mirror', style: 'Position copy', color: '#4b78c2', accent: '#d482ad', homeArena: 'competition_circuit', portrait: portrait('mirror'), speed: 8.9, error: .045, strikePower: .28, design: 'split', intro: 'A choreographer who reads your balance before you know you have shifted it.', behavior: 'mirror' },
    { id: 'switch', name: 'Roxy', title: 'Switch', style: 'Tempo changes', color: '#d75c91', accent: '#ffd3e6', homeArena: 'skyline_rooftop', portrait: portrait('switch'), speed: 9.4, error: .052, strikePower: .30, design: 'gloss', intro: 'Sweet smile, sharp tongue, and a nasty habit of changing pace mid-rally.', behavior: 'switch' },
    { id: 'anchor', name: 'Dale', title: 'Anchor', style: 'Center control', color: '#397d76', accent: '#9bd6c7', homeArena: 'freight_yard', portrait: portrait('anchor'), speed: 9.0, error: .036, strikePower: .31, design: 'solid', intro: 'A dock foreman who owns the middle lane and never wastes a movement.', behavior: 'anchor' },
    { id: 'ghost', name: 'June', title: 'Ghost', style: 'Late reactions', color: '#7d8394', accent: '#d9deea', homeArena: 'garage_club', portrait: portrait('ghost'), speed: 9.8, error: .03, strikePower: .30, design: 'quiet', intro: 'The retired librarian barely seems to move until your shot is already coming back.', behavior: 'ghost' },
    { id: 'orbit', name: 'Dev', title: 'Orbit', style: 'Rebound reads', color: '#2d9cb8', accent: '#8eeaff', homeArena: 'zero_g_arena', portrait: portrait('orbit'), speed: 10.6, error: .022, strikePower: .33, design: 'ring', intro: 'A physics grad student who sees two rebounds ahead and explains none of them.', behavior: 'reader' },
    { id: 'ace', name: 'Sloane', title: 'The Ace', style: 'Complete game', color: '#d5aa38', accent: '#fff0a6', homeArena: 'zero_g_arena', portrait: portrait('ace'), speed: 11.8, error: .012, strikePower: .36, design: 'champion', intro: 'The circuit champion has no obvious weakness. That is the point.', behavior: 'ace' },
]);

export const RIVAL_IDS = Object.freeze(RIVALS.map(rival => rival.id));
const BY_ID = new Map(RIVALS.map(rival => [rival.id, rival]));

export function getRival(id) {
    return BY_ID.get(id) || RIVALS[0];
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function reflectX(x) {
    const min = -W / 2 + .48, max = W / 2 - .48, span = max - min;
    let q = x - min, period = span * 2;
    q = ((q % period) + period) % period;
    return min + (q > span ? period - q : q);
}

function intercept(puck, z = -5.45, rebounds = true) {
    if (puck.vz >= -.15) return puck.x;
    const time = Math.max(0, (z - puck.z) / puck.vz);
    const x = puck.x + puck.vx * time;
    return rebounds ? reflectX(x) : x;
}

export function planRivalMove(id, { cpu, puck, player }, random = Math.random) {
    const rival = getRival(id);
    let x = 0, z = -5.65;
    const incoming = puck.vz < -.15;
    switch (rival.behavior) {
        case 'defender':
            x = incoming ? intercept(puck, -5.55) * .72 : puck.x * .34;
            z = -5.68;
            break;
        case 'aggressor':
            x = puck.x + puck.vx * .08;
            z = puck.z < .15 ? puck.z - .42 : -1.0;
            break;
        case 'banker':
            x = reflectX(puck.x + puck.vx * .48) * -.78;
            z = incoming ? -4.85 : -2.35;
            break;
        case 'power': {
            const setUp = puck.z < -1.0 && puck.vz > -.3;
            x = puck.x - Math.sign(puck.vx || 1) * .18;
            z = setUp ? puck.z - 1.15 : -5.35;
            break;
        }
        case 'mirror':
            x = -player.x * .9;
            z = -4.7 + clamp((player.z - 3.2) * .22, -.45, .45);
            break;
        case 'gambler':
            x = reflectX(puck.x + puck.vx * .68);
            z = puck.z < .8 ? Math.max(-3.1, puck.z - .28) : -.82;
            break;
        case 'switch': {
            const attack = Math.sin((Math.abs(puck.x) + Math.abs(puck.z)) * 1.7) > -.15;
            x = attack ? puck.x + puck.vx * .12 : intercept(puck, -5.4);
            z = attack ? Math.max(-3.5, puck.z - .55) : -5.45;
            break;
        }
        case 'anchor':
            x = clamp(incoming ? intercept(puck, -4.8) : puck.x * .55, -2.65, 2.65);
            z = -4.65;
            break;
        case 'ghost':
            x = incoming && puck.z < -1.2 ? intercept(puck, -5.5) : cpu.x * .9;
            z = incoming && puck.z < -1.2 ? -5.5 : -5.85;
            break;
        case 'reader':
            x = incoming ? intercept(puck, -5.18, true) : reflectX(puck.x + puck.vx * .30);
            z = incoming ? -5.18 : -2.9;
            break;
        case 'ace':
            x = incoming ? intercept(puck, -5.15, true) : puck.x + puck.vx * .18;
            z = incoming ? -5.15 : clamp(puck.z - .75, -4.4, -1.0);
            break;
        default:
            x = incoming ? intercept(puck, -5.48, false) : puck.x * .64;
            z = incoming ? -5.48 : -4.9;
    }
    const error = (random() - .5) * rival.error * 8;
    return {
        x: clamp(x + error, -W / 2 + .82, W / 2 - .82),
        z: clamp(z, -L / 2 + .82, -.72),
        speed: rival.speed,
    };
}
