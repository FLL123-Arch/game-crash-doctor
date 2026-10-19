import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'collect.ps1');

/**
 * Run the Windows collector and return its JSON payload.
 * @param {{hours?: number, timeoutMs?: number, signal?: AbortSignal}} [options]
 * @returns {Promise<object>}
 */
export function collect(options = {}) {
  const hours = clampHours(options.hours ?? 24);
  const timeoutMs = options.timeoutMs ?? 90_000;
  if (process.platform !== 'win32') {
    return Promise.reject(new Error('game-crash-doctor: only Windows is supported'));
  }
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', SCRIPT,
        '-Hours', String(hours),
      ],
      {
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        timeout: timeoutMs,
        signal: options.signal,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = (stderr || stdout || error.message || '').trim().slice(0, 800);
          reject(new Error(`game-crash-doctor: event log collector failed: ${detail}`));
          return;
        }
        const text = String(stdout || '').replace(/^\uFEFF/, '').trim();
        if (!text) {
          reject(new Error('game-crash-doctor: collector returned no output'));
          return;
        }
        try {
          const parsed = JSON.parse(text);
          if (parsed && parsed.ok === false) {
            reject(new Error(`game-crash-doctor: collector error: ${parsed.error || 'unknown'}`));
            return;
          }
          resolve(parsed);
        } catch (parseError) {
          reject(new Error(`game-crash-doctor: invalid collector JSON: ${parseError.message}`));
        }
      },
    );
  });
}

export function clampHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 24;
  return Math.max(1, Math.min(168, Math.round(n)));
}
