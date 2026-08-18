import type { LevelData, LevelObject, ObjectType } from './types';
import { obj } from './levels';
export class LevelEditor { level: LevelData; selected: string | null = null; undoStack: LevelData[] = []; redoStack: LevelData[] = []; grid = 32; snap = true; zoom = 1; constructor(level: LevelData) { this.level = structuredClone(level); }
  private snapshot() { this.undoStack.push(structuredClone(this.level)); if (this.undoStack.length > 30) this.undoStack.shift(); this.redoStack = []; }
  add(type: ObjectType, x = 300, y = 300) { this.snapshot(); const item = obj(type, this.snap ? Math.round(x / this.grid) * this.grid : x, this.snap ? Math.round(y / this.grid) * this.grid : y, { color: '#b8ff3d' }); this.level.objects.push(item); this.selected = item.id; }
  remove() { if (!this.selected) return; this.snapshot(); this.level.objects = this.level.objects.filter(o => o.id !== this.selected); this.selected = null; }
  duplicate() { const found = this.level.objects.find(o => o.id === this.selected); if (!found) return; this.snapshot(); const copy = structuredClone(found); copy.id = `${copy.id}-copy-${Date.now()}`; copy.x += this.grid; this.level.objects.push(copy); this.selected = copy.id; }
  move(dx: number, dy: number) { const found = this.level.objects.find(o => o.id === this.selected); if (!found) return; this.snapshot(); found.x += dx; found.y += dy; }
  undo() { const previous = this.undoStack.pop(); if (!previous) return; this.redoStack.push(structuredClone(this.level)); this.level = previous; }
  redo() { const next = this.redoStack.pop(); if (!next) return; this.undoStack.push(structuredClone(this.level)); this.level = next; }
  serialize() { return JSON.stringify(this.level, null, 2); }
  load(json: string) { try { const next = JSON.parse(json) as LevelData; if (next.objects) this.level = next; } catch { /* keep current editor data */ } }
}
