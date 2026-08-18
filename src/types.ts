export type GameMode = 'cube' | 'ship' | 'ball' | 'ufo' | 'wave' | 'swing';
export type RunMode = 'normal' | 'practice' | 'noclip';
export type OrbType = 'yellow' | 'pink' | 'red' | 'blue' | 'green' | 'black';
export type SpeedTier = 'SLOW' | 'NORMAL' | 'FAST' | 'FASTER' | 'MAX';
export type ObjectType = 'ground' | 'platform' | 'spike' | 'saw' | 'chainSaw' | 'decoration' | 'jumpPad' | 'jumpOrb' | 'modePortal' | 'gravityPortal' | 'speedPortal' | 'miniPortal' | 'dualPortal' | 'start';

export interface LevelObject { id: string; type: ObjectType; x: number; y: number; width?: number; height?: number; rotation: number; scale: number; color: string; designVariant: number; layer: number; opacity: number; properties: Record<string, string | number | boolean>; }
export interface GroundConfig { y: number; height: number; ceilingY: number; }
export interface LevelData { id: string; name: string; difficulty: string; color: string; bpm: number; speed: number; length: number; objects: LevelObject[]; ground?: GroundConfig; }
export interface ProgressRecord { best: number; completed: boolean; }
