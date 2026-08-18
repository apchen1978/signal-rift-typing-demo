import type { LevelData, ProgressRecord } from './types';

const PROGRESS_KEY = 'signal-rift-progress-v1';
const CUSTOM_KEY = 'signal-rift-custom-levels-v1';
export function loadProgress(): Record<string, ProgressRecord> { try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch { return {}; } }
export function saveProgress(data: Record<string, ProgressRecord>) { localStorage.setItem(PROGRESS_KEY, JSON.stringify(data)); }
export function loadCustomLevels(): LevelData[] { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch { return []; } }
export function saveCustomLevels(levels: LevelData[]) { localStorage.setItem(CUSTOM_KEY, JSON.stringify(levels)); }
