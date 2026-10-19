import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const BASE = process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local');
export const STATE_DIR = path.join(BASE, 'dsh-game-crash-doctor');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

const EMPTY = {
  version: 1,
  initialized: false,
  applicationRecordId: 0,
  systemRecordId: 0,
  notifyTimes: [],
  lastCheckAt: null,
  lastCrashAt: null,
};

export function loadState() {
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return { ...EMPTY, ...parsed, notifyTimes: Array.isArray(parsed.notifyTimes) ? parsed.notifyTimes : [] };
  } catch {
    return { ...EMPTY };
  }
}

export function saveState(state) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    const tmp = `${STATE_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    renameSync(tmp, STATE_FILE);
  } catch {
    // The watcher is best-effort; a read-only profile must not break the tool.
  }
}
