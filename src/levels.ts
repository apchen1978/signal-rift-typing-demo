import type { LevelData, LevelObject, ObjectType } from './types';

// Jumpverse original level set. Every name, difficulty word and palette color
// below is original to this project (no Geometry Dash official level names or
// the Demon difficulty ladder). World framing: a signal-relay runner hopping
// across broadcast stations.
const names = ['First Signal','Static Bloom','Orbit Hop','Lift Runway','Ripple Sector','Hover Field','Arc Swing','Split Core','Noise Canyon','Carrier Ascent','Final Handshake'];
const diffs = ['Chill','Steady','Bouncy','Brisk','Fast','Frantic','Wild','Intense','Brutal','Furious','Apex'];
// Original warm/teal palette (not the GD neon set). Hazards stay readable on
// the dark blue-green scene while the whole game reads as its own look.
const palette = ['#ffc94d','#ff8a5c','#6ee7d8','#b78bff','#ff6f9c','#8ef07d'];
let uid = 1;
export function obj(type: ObjectType, x: number, y: number, extra: Partial<LevelObject> = {}): LevelObject { return { id: `o${uid++}`, type, x, y, rotation: 0, scale: 1, color: '#ffc94d', designVariant: 0, layer: 1, opacity: 1, properties: {}, ...extra }; }
export function snapObjectToSurface(object: LevelObject, surfaceTop: number, attachTo: 'ground' | 'platform' | 'ceiling' | 'freePlacement' = 'ground') {
  object.properties.attachTo = attachTo;
  if (attachTo === 'freePlacement') return object;
  const size = 32 * object.scale;
  if (attachTo === 'ceiling') object.y = surfaceTop;
  else if (object.type === 'spike') object.y = surfaceTop - size;
  else if (object.type === 'saw' || object.type === 'chainSaw') object.y = surfaceTop - size * 1.08;
  else object.y = surfaceTop - size;
  return object;
}
function base(i: number): LevelObject[] {
  const groundY = 390;
  const o: LevelObject[] = [obj('ground', 0, groundY, { width: 10000, height: 50, color: '#17212a', properties: { attachTo: 'ground' } }), obj('start', 100, groundY - 70, { color: palette[i % palette.length] })];
  const orbTypes = ['yellow', 'pink', 'red', 'blue', 'green', 'black'] as const;
  for (let x = 780; x < 5200; x += 920) { const orbType = orbTypes[Math.floor(x / 920 + i) % orbTypes.length]; o.push(obj('jumpOrb', x, 260 - (i % 2) * 35, { color: orbType === 'yellow' ? '#ffd84d' : orbType === 'pink' ? '#ff7ac8' : orbType === 'red' ? '#ff5b61' : orbType === 'blue' ? '#55b8ff' : orbType === 'green' ? '#63f58b' : '#20242d', properties: { orbType, activationRadius: 48, attachTo: 'freePlacement' } })); }
  return o;
}
function addRhythmPatterns(objects: LevelObject[], levelIndex: number, firstHazardX: number) {
  const groundY = 390;
  const color = palette[levelIndex % palette.length];
  const flightLevel = levelIndex === 3 || levelIndex === 4 || levelIndex === 8 || levelIndex === 9;
  const hasPortalCorridor = (x: number) => objects.some(o => o.type.endsWith('Portal') && Math.abs(o.x - x) < 132);
  const groundSpike = (x: number) => objects.push(snapObjectToSurface(obj('spike', x, groundY, { color, designVariant: Math.floor(x / 32) % 3 }), groundY));

  // First real hazard starts after the level's mode-entry adaptation window
  // (see makeLevels): cube levels keep the classic cadence; non-cube levels
  // wait until the player has switched modes and found their footing.
  for (let x = firstHazardX, beat = 0; x < 6300; x += 360, beat++) {
    if (hasPortalCorridor(x) || hasPortalCorridor(x + 48)) continue;
    if (flightLevel) {
      const high = (beat + levelIndex) % 2 === 0;
      const saw = obj('saw', x, high ? 126 : 286, { color, scale: 0.82, designVariant: beat % 3, properties: { attachTo: 'freePlacement' } });
      objects.push(saw);
      if (beat % 3 === 1) objects.push(obj('saw', x + 78, high ? 228 : 184, { color, scale: 0.68, designVariant: (beat + 1) % 3, properties: { attachTo: 'freePlacement' } }));
      continue;
    }
    switch ((beat + levelIndex) % 4) {
      case 0:
        groundSpike(x);
        break;
      case 1:
        groundSpike(x);
        groundSpike(x + 34);
        break;
      case 2:
        objects.push(snapObjectToSurface(obj('saw', x, groundY, { color, scale: 0.8, designVariant: beat % 3 }), groundY));
        break;
      default: {
        const platform = obj('platform', x, 304, { width: 132, height: 16, color: palette[(levelIndex + 2) % palette.length] });
        objects.push(platform);
        objects.push(snapObjectToSurface(obj('spike', x + 50, platform.y, { color, designVariant: beat % 3 }), platform.y, 'platform'));
      }
    }
  }
}
function addGravityRoutes(objects: LevelObject[], levelIndex: number) {
  if (levelIndex < 2) return;
  const color = palette[(levelIndex + 3) % palette.length];
  const gravityPortals = objects.filter(o => o.type === 'gravityPortal').sort((a, b) => a.x - b.x);
  for (let segment = 0; segment < gravityPortals.length; segment++) {
    const start = gravityPortals[segment].x + 100;
    const end = gravityPortals[segment + 1] ? gravityPortals[segment + 1].x - 100 : 6300;
    const reverseRoute = segment % 2 === 0;
    for (let x = start; x < end; x += 192) {
      if (reverseRoute) {
        objects.push(obj('platform', x, 92, { width: 184, height: 16, color, properties: { attachTo: 'ceiling', gravityRoute: true } }));
      }
      const saw = obj('saw', x + 72, reverseRoute ? 230 : 152, { color, scale: .72, designVariant: segment % 3, properties: { attachTo: 'freePlacement', gravityGuard: true } });
      objects.push(saw);
    }
  }
}
function addFlightBoundaryHazards(objects: LevelObject[], levelIndex: number) {
  const flightLevel = levelIndex === 3 || levelIndex === 4 || levelIndex === 8 || levelIndex === 9;
  if (!flightLevel) return;
  const groundY = 390;
  const ceilingY = 52;
  const color = palette[(levelIndex + 1) % palette.length];
  const hasPortalCorridor = (x: number) => objects.some(o => o.type.endsWith('Portal') && Math.abs(o.x - x) < 132);
  // The dense flight wall starts after the ship/wave adaptation window (mode
  // switch at ~300, rhythm saws 700–1500) instead of right at the first beats.
  for (let x = 1500, index = 0; x < 6300; x += 28, index++) {
    if (hasPortalCorridor(x)) continue;
    const chain = index % 3 === 1;
    const floor = obj(chain ? 'chainSaw' : 'spike', x, groundY, { color, designVariant: index % 3 });
    const roof = obj(chain ? 'chainSaw' : 'spike', x, ceilingY, { color, rotation: chain ? 0 : 180, designVariant: (index + 1) % 3, properties: { attachTo: 'ceiling', flightBoundary: true } });
    const lowerRail = obj('chainSaw', x, 300, { color, scale: .82, designVariant: (index + 2) % 3, properties: { attachTo: 'freePlacement', flightBoundary: true } });
    const upperRail = obj('chainSaw', x, 160, { color, scale: .82, designVariant: index % 3, properties: { attachTo: 'freePlacement', flightBoundary: true } });
    objects.push(snapObjectToSurface(floor, groundY), snapObjectToSurface(roof, ceilingY, 'ceiling'), lowerRail, upperRail);
  }
}
function addPortalGates(objects: LevelObject[], levelIndex: number, firstModeX: number) {
  // The level's first portal(s) are the mode-entry / early-adaptation zone and
  // stay clean: the player switches mode at ~x=300 then faces the first rhythm
  // hazard at x=700 before any spike gate appears. Gates begin only after the
  // entry corridor (first portal + one 900px beat = +600 margin), so a rhythm
  // hazard never lands 72px in front of a gate wall.
  if (levelIndex <= 1) return;
  const color = palette[(levelIndex + 2) % palette.length];
  const portals = objects
    .filter(o => o.type.endsWith('Portal') && o.x > firstModeX + 600)
    .sort((a, b) => a.x - b.x);
  for (const portal of portals) {
    const gateTop = portal.y - 32;
    const gateBottom = portal.y + (portal.height || 32);
    for (let x = portal.x - 128; x < portal.x; x += 32) {
      objects.push(obj('spike', x, gateTop, { color, rotation: 180, designVariant: (x / 32) % 3, properties: { attachTo: 'freePlacement', portalGate: true } }));
      objects.push(obj('spike', x, gateBottom, { color, designVariant: (x / 32 + 1) % 3, properties: { attachTo: 'freePlacement', portalGate: true } }));
    }
  }
}
export function makeLevels(): LevelData[] { return names.map((name, i) => { const objects = base(i); const modes: GameDataMode[] = ['cube','cube','ball','ship','wave','ufo','swing','cube','wave','ship','cube']; const mode: GameDataMode = modes[i]; const nonCube = mode !== 'cube';
  // Mode-entry fix (systemic): non-cube levels activate their theme mode right
  // after spawn (~x=300) instead of making the player fight the first stretch
  // as a cube. The early portal sits in the running band (y≈348, near ground)
  // so a grounded player crosses it automatically — later gated portals stay at
  // y=300 for their jump-through design. Cube levels spawn in cube anyway.
  const firstModeX = nonCube ? 300 : 900;
  const firstModeY = nonCube ? 348 : 300;
  objects.push(obj('modePortal', firstModeX, firstModeY, { properties: { mode }, color: '#6ee7d8' }));
  for (let x = 900; x < 6000; x += 900) { if (x === firstModeX) continue; objects.push(obj('modePortal', x, 300, { properties: { mode }, color: '#6ee7d8' })); if (i >= 2) objects.push(obj('gravityPortal', x + 280, 250, { color: '#ff8a5c' })); if (i >= 4) objects.push(obj('speedPortal', x + 460, 280, { properties: { speedTier: i >= 8 ? 'FASTER' : 'FAST' }, color: '#ffc94d' })); if (i >= 5) objects.push(obj('miniPortal', x + 590, 290, { color: '#b78bff' })); if (i >= 8) objects.push(obj('dualPortal', x + 710, 280, { color: '#8ef07d' })); }
  if (i === 1 || i === 3 || i === 6 || i === 9 || i === 10) for (let x = 1200; x < 6000; x += 700) objects.push(obj('platform', x, 240 - (x % 3) * 35, { width: 120, height: 16, color: palette[(i + 2) % palette.length] }));
  addPortalGates(objects, i, firstModeX);
  addGravityRoutes(objects, i);
  // First real hazard window: after the mode switch the player gets an
  // adaptation runway (~x=300→700+) before the first obstacle. Cube levels
  // keep their original entry cadence (620 for the intro pair, 440 later).
  const firstHazardX = nonCube ? 700 : i <= 1 ? 620 : 440;
  addRhythmPatterns(objects, i, firstHazardX);
  addFlightBoundaryHazards(objects, i);
  return { id: `official-${i + 1}`, name, difficulty: diffs[i], color: palette[i % palette.length], bpm: 128 + i * 5, speed: 4.2 + i * .22, length: 6800 + i * 180, ground: { y: 390, height: 50, ceilingY: 52 }, objects }; }); }
type GameDataMode = 'cube' | 'ship' | 'ball' | 'ufo' | 'wave' | 'swing';
