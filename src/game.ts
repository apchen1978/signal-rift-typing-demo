import type { GameMode, LevelData, LevelObject, OrbType, RunMode, SpeedTier } from './types';

export interface GameCallbacks {
  onProgress: (p: number) => void;
  onDeath: (wouldDie: boolean) => void;
  onComplete: () => void;
  onPortal: (mode: GameMode, gravity: boolean, speed: number, mini: boolean, dual: boolean) => void;
  onOrb?: (type: OrbType) => void;
  onSpeedChange?: (from: SpeedTier, to: SpeedTier, multiplier: number) => void;
  onTeaching?: (key: string, text: string) => void;
}

export class GameEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  level: LevelData;
  runMode: RunMode = 'normal';
  callbacks: GameCallbacks;
  running = false;
  debug = false;
  performanceDebug = false;
  private raf = 0;
  private last = 0;
  private camera = 0;
  private checkpoint = 0;
  private checkpointState: Partial<typeof this.player> = {};
  private input = false;
  private justPressed = false;
  private respawn = 0;
  private lastPortalId: string | null = null;
  private orbTriggered = new Set<string>();
  private orbActive = new Set<string>();
  private teachingSeen = new Set<string>();
  private readonly levelStartX = 100;
  private readonly renderObjects: LevelObject[];
  private readonly collisionObjects: LevelObject[];
  private visibleObjectCount = 0;
  private collisionCheckCount = 0;
  private perf = { fps: 0, frameMs: 0, physicsMs: 0, renderMs: 0 };
  private fpsWindowStart = 0;
  private fpsWindowFrames = 0;
  private readonly speedMultipliers: Record<SpeedTier, number> = { SLOW: .75, NORMAL: 1, FAST: 1.35, FASTER: 1.7, MAX: 2 };
  private readonly shipGravity = 1050;
  private readonly shipThrust = 2500;
  private readonly maxShipRiseSpeed = 640;
  private readonly maxShipFallSpeed = 720;
  private get groundY() { return this.level.ground?.y ?? this.level.objects.find(o => o.type === 'ground')?.y ?? 390; }
  private get groundHeight() { return this.level.ground?.height ?? this.level.objects.find(o => o.type === 'ground')?.height ?? 50; }
  private get ceilingY() { return this.level.ground?.ceilingY ?? 52; }
  private get baseWorldSpeed() { return this.level.speed * 60; }
  private get speedMultiplier() { return this.speedMultipliers[this.player.speedTier]; }
  private get worldSpeed() { return this.baseWorldSpeed * this.speedMultiplier; }

  player = { x: 100, y: 362, vy: 0, size: 28, mode: 'cube' as GameMode, gravity: 1, speed: 4.2, speedTier: 'NORMAL' as SpeedTier, mini: false, dual: false, grounded: true, angle: 0 };

  constructor(canvas: HTMLCanvasElement, level: LevelData, callbacks: GameCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.level = level;
    this.callbacks = callbacks;
    this.renderObjects = [...level.objects].sort((a, b) => a.x - b.x);
    this.collisionObjects = level.objects.filter(o => o.type !== 'decoration' && o.type !== 'ground' && o.type !== 'start').sort((a, b) => a.x - b.x);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = Math.max(430, innerHeight * .62) * dpr;
    this.canvas.style.height = `${this.canvas.height / dpr}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setInput(active: boolean) {
    if (active && !this.input) this.justPressed = true;
    this.input = active;
  }

  setDebug(active: boolean) { this.debug = active; }
  toggleDebug() { this.debug = !this.debug; }
  togglePerformanceDebug() { this.performanceDebug = !this.performanceDebug; }

  start(mode: RunMode = this.runMode) {
    this.runMode = mode;
    this.running = true;
    this.last = performance.now();
    this.respawn = 0;
    this.reset(this.runMode === 'practice' ? this.checkpoint : 0, this.runMode === 'practice' ? this.checkpointState : {});
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  reset(distance = 0, state: Partial<typeof this.player> = {}) {
    this.player = { x: this.levelStartX + distance, y: this.groundY - 28, vy: 0, size: 28, mode: 'cube', gravity: 1, speed: this.level.speed, speedTier: 'NORMAL' as SpeedTier, mini: false, dual: false, grounded: true, angle: 0, ...state };
    this.player.size = this.player.mini ? 18 : 28;
    this.camera = Math.max(0, distance - 100);
    this.lastPortalId = null;
    this.orbTriggered.clear();
    this.orbActive.clear();
    this.justPressed = false;
    this.resolvePenetration();
    this.callbacks.onProgress(this.progressPercent());
  }

  setCheckpoint() {
    this.checkpoint = Math.max(0, this.player.x - this.levelStartX);
    this.checkpointState = { gravity: this.player.gravity, mode: this.player.mode, speed: this.player.speed, speedTier: this.player.speedTier, mini: this.player.mini, dual: this.player.dual, angle: this.player.angle };
  }

  private loop = (now: number) => {
    if (!this.running) return;
    const frameStart = performance.now();
    const dt = Math.min(Math.max((now - this.last) / 1000, 0), 0.033);
    this.last = now;
    const physicsStart = performance.now();
    this.update(dt);
    const physicsMs = performance.now() - physicsStart;
    const renderStart = performance.now();
    this.render();
    const renderMs = performance.now() - renderStart;
    const frameMs = performance.now() - frameStart;
    this.recordPerformance(frameMs, physicsMs, renderMs, now);
    this.raf = requestAnimationFrame(this.loop);
  };

  private recordPerformance(frameMs: number, physicsMs: number, renderMs: number, now: number) {
    const alpha = .12;
    this.perf.frameMs += (frameMs - this.perf.frameMs) * alpha;
    this.perf.physicsMs += (physicsMs - this.perf.physicsMs) * alpha;
    this.perf.renderMs += (renderMs - this.perf.renderMs) * alpha;
    if (!this.fpsWindowStart) this.fpsWindowStart = now;
    this.fpsWindowFrames++;
    if (now - this.fpsWindowStart >= 500) { this.perf.fps = this.fpsWindowFrames * 1000 / (now - this.fpsWindowStart); this.fpsWindowFrames = 0; this.fpsWindowStart = now; }
  }

  private update(dt: number) {
    const p = this.player;
    if (this.respawn > 0) {
      this.respawn -= dt;
      if (this.respawn <= 0) this.reset(this.runMode === 'practice' ? this.checkpoint : 0, this.runMode === 'practice' ? this.checkpointState : {});
      return;
    }

    const previousX = p.x;
    const previousY = p.y;
    const press = this.input;
    const justPressed = this.justPressed;
    this.justPressed = false;
    p.x += this.worldSpeed * dt;

    if (p.mode === 'ship') {
      const acceleration = p.gravity * this.shipGravity + (press ? -p.gravity * this.shipThrust : 0);
      p.vy += acceleration * dt;
      p.vy = Math.max(-this.maxShipRiseSpeed, Math.min(this.maxShipFallSpeed, p.vy));
      p.y += p.vy * dt;
      p.grounded = false;
      const targetAngle = Math.max(-0.42, Math.min(0.42, p.vy * 0.00055));
      p.angle += (targetAngle - p.angle) * (1 - Math.exp(-14 * dt));
    } else if (p.mode === 'cube' || p.mode === 'ball' || p.mode === 'ufo' || p.mode === 'swing') {
      if (press && p.grounded) { p.vy = -600 * p.gravity; p.grounded = false; }
      if (p.mode === 'ufo' && press) p.vy = -420 * p.gravity;
      p.vy += 2088 * p.gravity * dt;
      p.y += p.vy * dt;
    } else {
      const waveDirection = press ? -1 : 1;
      p.vy = waveDirection * p.gravity * this.worldSpeed * .95;
      p.y += p.vy * dt;
      p.grounded = false;
      p.angle = Math.atan2(p.vy, this.worldSpeed);
    }

    p.grounded = false;
    if (this.resolveSurfaceCollision(previousX, previousY)) {
      p.vy = 0;
      p.grounded = true;
      if (p.mode === 'cube') p.angle = this.snapAngle(p.angle);
    } else if (p.mode === 'cube' || p.mode === 'ball' || p.mode === 'ufo' || p.mode === 'swing') {
      p.angle += 4.8 * dt;
    }

    this.collisionCheckCount = 0;
    for (const o of this.collisionObjects) {
      if (o.x > p.x + 160) break;
      if (o.x < p.x - 100) continue;
      this.collisionCheckCount++;
      if (o.type.endsWith('Portal') && this.hit(o)) {
        this.teachPortal(o);
        if (o.id !== this.lastPortalId) { this.portal(o); this.lastPortalId = o.id; }
      } else if (this.lastPortalId === o.id && p.x > o.x + (o.width || 32) + p.size) {
        this.lastPortalId = null;
      }

      if (['spike', 'saw', 'chainSaw'].includes(o.type) && this.hazardSweptHit(o, previousX, previousY)) {
        this.callbacks.onDeath(true);
        if (this.runMode !== 'noclip') { this.respawn = 0.36; return; }
      }

      if (o.type === 'jumpOrb') {
        const type = this.orbType(o);
        const activationRadius = Number(o.properties.activationRadius) || 16;
        const playerOverlapsArea = this.hit(o, activationRadius);
        const sweptOverlap = this.sweptHit(o, previousX, previousY, activationRadius);
        if (playerOverlapsArea) { this.orbActive.add(o.id); this.teach('orb', 'ORB READY  Enter the orb, then press Space / Click / Touch.'); } else this.orbActive.delete(o.id);
        if (playerOverlapsArea && sweptOverlap && justPressed && !this.orbTriggered.has(o.id)) this.activateOrb(p, o, type);
      }
      if (o.type === 'jumpPad' && this.sweptHit(o, previousX, previousY) && press) p.vy = -720 * p.gravity;
      if (this.runMode === 'practice' && o.type === 'decoration' && o.properties.checkpoint === true && this.hit(o)) this.setCheckpoint();
    }

    const cameraTarget = Math.max(0, p.x - 180);
    const cameraSmoothing = 1 - Math.exp(-12 * dt);
    this.camera += (cameraTarget - this.camera) * cameraSmoothing;
    const progress = this.progressPercent();
    this.callbacks.onProgress(progress);
    if (progress >= 100) { this.stop(); this.callbacks.onComplete(); }
  }

  private activateOrb(player: typeof this.player, orb: LevelObject, type: OrbType) {
    this.orbTriggered.add(orb.id);
    const impulse = { yellow: 600, pink: 450, red: 780, blue: 560, green: 320, black: -760 }[type];
    if (type === 'blue' || type === 'green') this.toggleGravity();
    if (type === 'black') player.vy = -impulse * player.gravity;
    else player.vy = -impulse * player.gravity;
    if (type === 'green') player.vy += -100 * player.gravity;
    player.grounded = false;
    this.callbacks.onOrb?.(type);
  }

  private toggleGravity() {
    this.player.gravity *= -1;
    this.player.grounded = false;
    this.player.vy = 0;
    this.resolvePenetration();
  }

  private setSpeedTier(tier: SpeedTier) {
    const previous = this.player.speedTier;
    this.player.speedTier = tier;
    if (previous !== tier) this.callbacks.onSpeedChange?.(previous, tier, this.speedMultipliers[tier]);
  }

  private speedTierFromPortal(o: LevelObject): SpeedTier {
    const requested = o.properties.speedTier;
    if (requested === 'SLOW' || requested === 'FAST' || requested === 'FASTER' || requested === 'MAX' || requested === 'NORMAL') return requested;
    const numeric = Number(o.properties.speed);
    if (Number.isFinite(numeric)) {
      const tiers = Object.entries(this.speedMultipliers) as Array<[SpeedTier, number]>;
      return tiers.reduce((best, current) => Math.abs(current[1] - numeric) < Math.abs(best[1] - numeric) ? current : best, tiers[1])[0];
    }
    return 'NORMAL';
  }

  private resolveSurfaceCollision(previousX: number, previousY: number) {
    const p = this.player;
    const previousBottom = previousY + p.size;
    const currentBottom = p.y + p.size;
    const previousTop = previousY;
    const currentTop = p.y;
    const reverse = p.gravity < 0;
    if (!reverse && p.vy >= 0 && currentBottom >= this.groundY && (previousBottom <= this.groundY || currentTop < this.groundY)) { p.y = this.groundY - p.size; return true; }
    if (reverse && p.vy <= 0 && currentTop <= this.ceilingY && (previousTop >= this.ceilingY || currentBottom > this.ceilingY)) { p.y = this.ceilingY; return true; }
    for (const o of this.collisionObjects) {
      if (o.x > Math.max(previousX, p.x) + p.size) break;
      const platformWidth = o.width || 120;
      const sweptHorizontal = Math.max(previousX + p.size, p.x + p.size) >= o.x && Math.min(previousX, p.x) <= o.x + platformWidth;
      if (o.type !== 'platform' || !sweptHorizontal) continue;
      const top = o.y;
      const bottom = o.y + (o.height || 16);
      if (!reverse && p.vy >= 0 && currentBottom >= top && p.y < top && (previousBottom <= top || previousY < top)) { p.y = top - p.size; return true; }
      if (reverse && p.vy <= 0 && currentTop <= bottom && p.y + p.size > bottom && (previousTop >= bottom || previousY > bottom)) { p.y = bottom; return true; }
    }
    return false;
  }

  private resolvePenetration() {
    const p = this.player;
    if (p.gravity > 0 && p.y + p.size > this.groundY) p.y = this.groundY - p.size;
    if (p.gravity < 0 && p.y < this.ceilingY) p.y = this.ceilingY;
    for (const o of this.collisionObjects) {
      if (o.x > p.x + p.size) break;
      if (o.type !== 'platform' || p.x + p.size <= o.x || p.x >= o.x + (o.width || 120)) continue;
      const top = o.y;
      const bottom = o.y + (o.height || 16);
      if (p.y < bottom && p.y + p.size > top) p.y = p.gravity > 0 ? top - p.size : bottom;
    }
  }

  private progressPercent() { const end = Math.max(this.level.length, this.levelStartX + 1); return Math.floor(Math.max(0, Math.min(1, (this.player.x - this.levelStartX) / (end - this.levelStartX))) * 100); }
  private snapAngle(angle: number) { return Math.round(angle / (Math.PI / 2)) * (Math.PI / 2); }
  private orbType(o: LevelObject): OrbType { const value = o.properties.orbType; return value === 'pink' || value === 'red' || value === 'blue' || value === 'green' || value === 'black' ? value : 'yellow'; }
  private hit(o: LevelObject, padding = 0) { const baseW = (o.width || 32) * o.scale, baseH = (o.height || 32) * o.scale, w = baseW + padding * 2, h = baseH + padding * 2; return Math.abs(this.player.x + this.player.size / 2 - (o.x + baseW / 2)) < (this.player.size + w) / 2 && Math.abs(this.player.y + this.player.size / 2 - (o.y + baseH / 2)) < (this.player.size + h) / 2; }
  private sweptHit(o: LevelObject, previousX: number, previousY: number, padding = 0) { if (this.hit(o, padding)) return true; const w = (o.width || 32) * o.scale + padding * 2, h = (o.height || 32) * o.scale + padding * 2; const left = o.x - padding, right = o.x + w + padding, top = o.y - padding, bottom = o.y + h + padding; const minX = Math.min(previousX, this.player.x), maxX = Math.max(previousX + this.player.size, this.player.x + this.player.size), minY = Math.min(previousY, this.player.y), maxY = Math.max(previousY + this.player.size, this.player.y + this.player.size); return maxX >= left && minX <= right && maxY >= top && minY <= bottom; }
  private hazardSweptHit(o: LevelObject, previousX: number, previousY: number) {
    const size = 32 * o.scale;
    // A spike is triangular, so its lethal core must not cover the transparent
    // outer corners of the rendered 32px tile. Keep this narrow while retaining
    // the swept check needed at high forward speed.
    if (o.type === 'spike') return this.sweptRectHit(o.x + size * .28, o.y + size * .30, size * .44, size * .70, previousX, previousY, 5);
    return this.sweptRectHit(o.x + size * .12, o.y + size * .12, size * .76, size * .76, previousX, previousY, 3);
  }
  private sweptRectHit(x: number, y: number, width: number, height: number, previousX: number, previousY: number, playerInset: number) {
    const bodySize = Math.max(1, this.player.size - playerInset * 2);
    const startX = previousX + playerInset;
    const startY = previousY + playerInset;
    const deltaX = this.player.x + playerInset - startX;
    const deltaY = this.player.y + playerInset - startY;
    // Test the body's actual path against the hazard expanded by the body's
    // size. The old union-of-frames test treated the empty corners of a
    // diagonal jump as occupied, causing airborne false-positive deaths.
    const left = x - bodySize, right = x + width;
    const top = y - bodySize, bottom = y + height;
    let enter = 0;
    let exit = 1;
    const clipAxis = (start: number, delta: number, min: number, max: number) => {
      if (Math.abs(delta) < .00001) return start >= min && start <= max;
      const t1 = (min - start) / delta;
      const t2 = (max - start) / delta;
      enter = Math.max(enter, Math.min(t1, t2));
      exit = Math.min(exit, Math.max(t1, t2));
      return enter <= exit;
    };
    return clipAxis(startX, deltaX, left, right) && clipAxis(startY, deltaY, top, bottom) && exit >= 0 && enter <= 1;
  }
  private portal(o: LevelObject) { const p = this.player; if (o.type === 'modePortal') p.mode = (o.properties.mode as GameMode) || 'cube'; if (o.type === 'gravityPortal') this.toggleGravity(); if (o.type === 'speedPortal') this.setSpeedTier(this.speedTierFromPortal(o)); if (o.type === 'miniPortal') { p.mini = !p.mini; p.size = p.mini ? 18 : 28; this.resolvePenetration(); } if (o.type === 'dualPortal') p.dual = !p.dual; this.callbacks.onPortal(p.mode, o.type === 'gravityPortal', this.speedMultiplier, p.mini, p.dual); }
  private teach(key: string, text: string) { if (this.teachingSeen.has(key)) return; this.teachingSeen.add(key); this.callbacks.onTeaching?.(key, text); }
  private teachPortal(o: LevelObject) {
    if (o.type === 'modePortal') this.teach('mode', 'MODE PORTAL  Cross it to change movement mode.');
    if (o.type === 'gravityPortal') this.teach('gravity', 'GRAVITY PORTAL  Cross it to flip the active gravity.');
    if (o.type === 'speedPortal') this.teach('speed', 'SPEED PORTAL  Cross it to change forward speed.');
  }

  private render() {
    const c = this.ctx, w = innerWidth, h = this.canvas.height / (devicePixelRatio || 1);
    c.clearRect(0, 0, w, h);
    this.drawAtmosphere(w, h);
    c.save(); c.translate(-this.camera, 0); this.visibleObjectCount = 0;
    for (const o of this.renderObjects) { if (o.type !== 'ground' && o.x > this.camera + w + 120) break; if (o.type !== 'ground' && o.x < this.camera - 120) continue; this.drawObject(o); this.visibleObjectCount++; }
    this.drawPlayer();
    c.restore();
    if (this.debug) this.drawDebug(h); if (this.performanceDebug) this.drawPerformanceHud();
  }
  private drawAtmosphere(w: number, h: number) {
    const c = this.ctx, horizon = this.groundY;
    const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#0b1621'); sky.addColorStop(.58, '#071019'); sky.addColorStop(1, '#05080e'); c.fillStyle = sky; c.fillRect(0, 0, w, h);
    const bloom = c.createRadialGradient(w * .74, h * .18, 8, w * .74, h * .18, w * .56); bloom.addColorStop(0, 'rgba(77,227,255,.12)'); bloom.addColorStop(1, 'rgba(77,227,255,0)'); c.fillStyle = bloom; c.fillRect(0, 0, w, h);
    c.save(); c.globalAlpha = .34; c.strokeStyle = '#17313a'; c.lineWidth = 1;
    const offset = (this.camera * .18) % 96;
    for (let x = -96 - offset; x < w + 96; x += 96) { c.beginPath(); c.moveTo(w * .5 + (x - w * .5) * .2, 58); c.lineTo(x, horizon); c.stroke(); }
    for (let y = 112; y < horizon; y += 44) { const t = (y - 58) / (horizon - 58); c.beginPath(); c.moveTo(0, 58 + t * t * (horizon - 58)); c.lineTo(w, 58 + t * t * (horizon - 58)); c.stroke(); }
    c.globalAlpha = .8; c.strokeStyle = '#31575a'; c.beginPath(); c.moveTo(0, horizon); c.lineTo(w, horizon); c.stroke(); c.globalAlpha = .7; c.strokeStyle = '#4f8588'; c.beginPath(); c.moveTo(0, this.ceilingY); c.lineTo(w, this.ceilingY); c.stroke(); c.globalAlpha = .22; c.strokeStyle = '#31575a'; c.strokeRect(0, this.ceilingY + 8, w, 14); c.restore();
  }
  private drawPlayer() {
    const c = this.ctx, p = this.player, half = p.size / 2;
    c.save(); c.translate(p.x + half, p.y + half); c.rotate(p.angle); c.fillStyle = '#b8ff3d'; c.strokeStyle = '#efffc4'; c.shadowColor = '#b8ff3d'; c.shadowBlur = 18;
    c.beginPath();
    if (p.mode === 'ship') { c.moveTo(half, 0); c.lineTo(-half, -half * .68); c.lineTo(-half * .48, 0); c.lineTo(-half, half * .68); }
    else if (p.mode === 'wave') { c.moveTo(half, 0); c.lineTo(-half, -half); c.lineTo(-half * .34, 0); c.lineTo(-half, half); }
    else if (p.mode === 'ufo') { c.arc(0, 0, half * .82, Math.PI, 0); c.lineTo(half * .5, half * .58); c.lineTo(-half * .5, half * .58); c.closePath(); }
    else if (p.mode === 'ball') { c.arc(0, 0, half * .78, 0, Math.PI * 2); }
    else { c.moveTo(-half, 0); c.lineTo(0, -half); c.lineTo(half, 0); c.lineTo(0, half); }
    c.closePath(); c.fill(); c.shadowBlur = 0; c.lineWidth = 1.4; c.stroke();
    c.globalAlpha = .55; c.strokeStyle = '#0a241d'; c.beginPath(); c.moveTo(-half * .42, 0); c.lineTo(half * .42, 0); c.stroke(); c.restore();
  }
  private drawPerformanceHud() { const c = this.ctx; const p = this.player; c.save(); c.fillStyle = 'rgba(5,10,14,.9)'; c.fillRect(16, 16, 310, 236); c.fillStyle = '#b8ff3d'; c.font = '11px monospace'; c.fillText(`FPS: ${this.perf.fps.toFixed(0)}`, 28, 36); c.fillText(`Frame: ${this.perf.frameMs.toFixed(2)}ms`, 28, 54); c.fillText(`Physics: ${this.perf.physicsMs.toFixed(2)}ms`, 28, 72); c.fillText(`Render: ${this.perf.renderMs.toFixed(2)}ms`, 28, 90); c.fillText(`Objects: ${this.visibleObjectCount} / ${this.renderObjects.length}`, 28, 108); c.fillText(`Collision: ${this.collisionCheckCount}`, 28, 126); c.fillText(`MODE: ${p.mode.toUpperCase()}`, 28, 152); c.fillText(`WORLD SPEED: ${this.worldSpeed.toFixed(0)}`, 28, 170); c.fillText(`BASE SPEED: ${this.baseWorldSpeed.toFixed(0)}`, 28, 188); c.fillText(`MULTIPLIER: ${this.speedMultiplier.toFixed(2)}  TIER: ${p.speedTier}`, 28, 206); c.fillText(`vy: ${p.vy.toFixed(1)}  gravitySign: ${p.gravity}`, 28, 224); c.fillText(`input: ${this.input ? 'HELD' : 'RELEASED'}`, 28, 242); c.restore(); }
  private drawDebug(h: number) { const c = this.ctx, p = this.player; c.save(); c.translate(-this.camera, 0); c.strokeStyle = '#4de3ff'; c.lineWidth = 2; c.strokeRect(p.x, p.y, p.size, p.size); c.strokeStyle = '#b8ff3d'; c.beginPath(); c.moveTo(this.camera - 20, this.groundY); c.lineTo(this.camera + innerWidth + 20, this.groundY); c.moveTo(this.camera - 20, this.ceilingY); c.lineTo(this.camera + innerWidth + 20, this.ceilingY); c.stroke(); c.strokeStyle = '#ffbd4a'; for (const o of this.level.objects) { if (o.type === 'platform') c.strokeRect(o.x, o.y, o.width || 120, o.height || 16); if (o.type === 'jumpOrb') { const radius = Number(o.properties.activationRadius) || 16; c.beginPath(); c.arc(o.x + 16, o.y + 16, radius + p.size / 2, 0, Math.PI * 2); c.stroke(); } } c.fillStyle = '#eef4ed'; c.font = '11px monospace'; c.fillText(`DEBUG F3  grounded=${p.grounded} gravitySign=${p.gravity} y=${p.y.toFixed(1)}`, this.camera + 18, Math.max(18, h - 18)); c.restore(); }
  private drawObject(o: LevelObject) { const c = this.ctx; c.save(); c.translate(o.x, o.y); c.rotate(o.rotation * Math.PI / 180); c.globalAlpha = o.opacity; const size = 32 * o.scale; c.strokeStyle = o.color; c.fillStyle = o.color; c.shadowColor = o.color; c.shadowBlur = 10;
    if (o.type === 'ground') { const width = o.width || 10000, height = o.height || this.groundHeight; c.shadowBlur = 0; const ground = c.createLinearGradient(0, 0, 0, height); ground.addColorStop(0, '#263a43'); ground.addColorStop(.12, '#172630'); ground.addColorStop(1, '#0d141d'); c.fillStyle = ground; c.fillRect(0, 0, width, height); c.strokeStyle = '#7ad3d0'; c.globalAlpha = .75; c.strokeRect(0, .5, width, 1); c.globalAlpha = .22; c.strokeStyle = '#5e9b9b'; for (let x = 0; x < width; x += 64) { c.beginPath(); c.moveTo(x, 11); c.lineTo(x + 30, 11); c.lineTo(x + 40, 21); c.lineTo(x + 64, 21); c.stroke(); }
    } else if (o.type === 'platform') { const width = o.width || 120, height = o.height || 16; c.shadowBlur = 0; c.fillStyle = '#1a3035'; c.fillRect(0, 0, width, height); c.strokeStyle = o.color; c.globalAlpha = .78; c.strokeRect(0, .5, width, height - 1); c.globalAlpha = .26; for (let x = 10; x < width; x += 22) c.fillRect(x, 5, 12, 2);
    } else if (o.type === 'spike') { c.beginPath(); c.moveTo(0, size); c.lineTo(size / 2, 0); c.lineTo(size, size); c.closePath(); c.fill(); c.strokeStyle = '#efffc4'; c.lineWidth = 1.15; c.stroke(); c.globalAlpha = .35; c.strokeStyle = '#081016'; c.beginPath(); c.moveTo(size / 2, 7); c.lineTo(size / 2, size - 5); c.stroke();
    } else if (o.type === 'saw' || o.type === 'chainSaw') { c.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, r = i % 2 ? size * .38 : size * .58; c.lineTo(Math.cos(a) * r + size / 2, Math.sin(a) * r + size / 2); } c.closePath(); c.fill(); c.strokeStyle = '#f5ffd8'; c.stroke(); c.shadowBlur = 0; c.fillStyle = '#11232a'; c.beginPath(); c.arc(size / 2, size / 2, size * .2, 0, Math.PI * 2); c.fill(); c.strokeStyle = o.color; c.stroke();
    } else if (o.type === 'jumpOrb') { const type = this.orbType(o); const colors: Record<OrbType, string> = { yellow: '#ffd84d', pink: '#ff7ac8', red: '#ff5b61', blue: '#55b8ff', green: '#63f58b', black: '#8e98a5' }; c.strokeStyle = colors[type]; c.shadowBlur = this.orbActive.has(o.id) ? 18 : 10; c.fillStyle = this.orbTriggered.has(o.id) ? '#263039' : colors[type]; c.beginPath(); c.arc(size / 2, size / 2, size * .42, 0, Math.PI * 2); c.fill(); c.stroke(); c.globalAlpha *= .72; c.beginPath(); c.arc(size / 2, size / 2, size * (this.orbActive.has(o.id) ? .78 : .66), 0, Math.PI * 1.6); c.stroke();
    } else if (o.type.endsWith('Portal')) { c.lineWidth = 1.7; c.beginPath(); c.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); c.stroke(); c.globalAlpha *= .55; c.beginPath(); c.arc(size / 2, size / 2, size / 3, .4, Math.PI * 1.85); c.stroke(); c.beginPath(); c.moveTo(size / 2, 2); c.lineTo(size / 2, size - 2); c.stroke();
    } else { c.strokeRect(0, 0, o.width || size, o.height || size); } c.restore(); }
}
