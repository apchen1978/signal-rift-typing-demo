import type { LevelData, LevelObject, ObjectType } from './types';

const names = ['Vector Wake','Chromatic Fault','Gravitas Circuit','Orbital Fracture','White Noise Run','Aeroform','Pendulum Logic','Null Horizon','Twin Signal','Razor Protocol','Terminal Overdrive'];
const diffs = ['Demon / Entry','Demon / Sharp','Demon / Gravitas','Demon / Flight','Demon / Wave','Demon / Precision','Demon / Technical','Demon / Insane','Demon / Dual','Demon / Extreme','Extreme Demon / Apex'];
const palette = ['#b8ff3d','#ffbd4a','#4de3ff','#ff6b9d','#a986ff','#5dffb2'];
let uid = 1;
export function obj(type: ObjectType, x: number, y: number, extra: Partial<LevelObject> = {}): LevelObject { return { id: `o${uid++}`, type, x, y, rotation: 0, scale: 1, color: '#b8ff3d', designVariant: 0, layer: 1, opacity: 1, properties: {}, ...extra }; }
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
function addRhythmPatterns(objects: LevelObject[], levelIndex: number) {
  const groundY = 390;
  const color = palette[levelIndex % palette.length];
  const flightLevel = levelIndex === 3 || levelIndex === 4 || levelIndex === 8 || levelIndex === 9;
  const hasPortalCorridor = (x: number) => objects.some(o => o.type.endsWith('Portal') && Math.abs(o.x - x) < 132);
  const groundSpike = (x: number) => objects.push(snapObjectToSurface(obj('spike', x, groundY, { color, designVariant: Math.floor(x / 32) % 3 }), groundY));

  // Give the entry level enough runway to establish the jump cadence before
  // its first hazard. Later levels retain the original immediate pressure.
  for (let x = levelIndex <= 1 ? 620 : 440, beat = 0; x < 6300; x += 360, beat++) {
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
  for (let x = 1040, index = 0; x < 6300; x += 28, index++) {
    if (hasPortalCorridor(x)) continue;
    const chain = index % 3 === 1;
    const floor = obj(chain ? 'chainSaw' : 'spike', x, groundY, { color, designVariant: index % 3 });
    const roof = obj(chain ? 'chainSaw' : 'spike', x, ceilingY, { color, rotation: chain ? 0 : 180, designVariant: (index + 1) % 3, properties: { attachTo: 'ceiling', flightBoundary: true } });
    const lowerRail = obj('chainSaw', x, 300, { color, scale: .82, designVariant: (index + 2) % 3, properties: { attachTo: 'freePlacement', flightBoundary: true } });
    const upperRail = obj('chainSaw', x, 160, { color, scale: .82, designVariant: index % 3, properties: { attachTo: 'freePlacement', flightBoundary: true } });
    objects.push(snapObjectToSurface(floor, groundY), snapObjectToSurface(roof, ceilingY, 'ceiling'), lowerRail, upperRail);
  }
}
function addPortalGates(objects: LevelObject[], levelIndex: number) {
  // The opening level's first portal remains a visual mode cue; gating a
  // Cube-to-Cube transition made the very first route needlessly precise.
  if (levelIndex <= 1) return;
  const color = palette[(levelIndex + 2) % palette.length];
  const portals = objects.filter(o => o.type.endsWith('Portal'));
  for (const portal of portals) {
    const gateTop = portal.y - 32;
    const gateBottom = portal.y + (portal.height || 32);
    for (let x = portal.x - 128; x < portal.x; x += 32) {
      objects.push(obj('spike', x, gateTop, { color, rotation: 180, designVariant: (x / 32) % 3, properties: { attachTo: 'freePlacement', portalGate: true } }));
      objects.push(obj('spike', x, gateBottom, { color, designVariant: (x / 32 + 1) % 3, properties: { attachTo: 'freePlacement', portalGate: true } }));
    }
  }
}
export function makeLevels(): LevelData[] { return names.map((name, i) => { const objects = base(i); const modes: GameDataMode[] = ['cube','cube','ball','ship','wave','ufo','swing','cube','wave','ship','cube']; const mode: GameDataMode = modes[i];
  for (let x = 900; x < 6000; x += 900) { objects.push(obj('modePortal', x, 300, { properties: { mode }, color: '#4de3ff' })); if (i >= 2) objects.push(obj('gravityPortal', x + 280, 250, { color: '#ff6b9d' })); if (i >= 4) objects.push(obj('speedPortal', x + 460, 280, { properties: { speedTier: i >= 8 ? 'FASTER' : 'FAST' }, color: '#ffbd4a' })); if (i >= 5) objects.push(obj('miniPortal', x + 590, 290, { color: '#a986ff' })); if (i >= 8) objects.push(obj('dualPortal', x + 710, 280, { color: '#5dffb2' })); }
  if (i === 1 || i === 3 || i === 6 || i === 9 || i === 10) for (let x = 1200; x < 6000; x += 700) objects.push(obj('platform', x, 240 - (x % 3) * 35, { width: 120, height: 16, color: palette[(i + 2) % palette.length] }));
  addPortalGates(objects, i);
  addGravityRoutes(objects, i);
  addRhythmPatterns(objects, i);
  addFlightBoundaryHazards(objects, i);
  return { id: `official-${i + 1}`, name, difficulty: diffs[i], color: palette[i % palette.length], bpm: 128 + i * 5, speed: 4.2 + i * .22, length: 6800 + i * 180, ground: { y: 390, height: 50, ceilingY: 52 }, objects }; }); }
type GameDataMode = 'cube' | 'ship' | 'ball' | 'ufo' | 'wave' | 'swing';
