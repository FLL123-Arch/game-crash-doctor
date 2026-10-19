import { defineTool } from '@deepseek-ai/dsh-tools';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { clampHours, collect } from './collect.js';
import { analyze, isCrashEvent, isGameLike, isSystemSignal, renderNotification } from './diagnose.js';
import { loadState, saveState } from './state.js';

export const name = 'game-crash-doctor';
export const inject = ['tools', 'agents'];

const DEFAULTS = {
  notify: true,
  pollSeconds: 45,
  gameOnly: true,
  notifyAllSessions: false,
  maxNotificationsPerHour: 3,
};

function normalizeConfig(config) {
  const source = config && typeof config === 'object' ? config : {};
  const poll = Number(source.pollSeconds);
  const max = Number(source.maxNotificationsPerHour);
  return {
    notify: source.notify !== false,
    pollSeconds: Number.isFinite(poll) ? Math.max(15, Math.min(600, Math.round(poll))) : DEFAULTS.pollSeconds,
    gameOnly: source.gameOnly !== false,
    notifyAllSessions: source.notifyAllSessions === true,
    maxNotificationsPerHour: Number.isFinite(max) ? Math.max(1, Math.min(20, Math.round(max))) : DEFAULTS.maxNotificationsPerHour,
  };
}

export function apply(ctx, config) {
  const cfg = normalizeConfig(config);
  const state = loadState();
  let running = false;
  let disposed = false;

  const watcherStatus = () => ({
    enabled: cfg.notify,
    pollSeconds: cfg.pollSeconds,
    gameOnly: cfg.gameOnly,
    lastCheckAt: state.lastCheckAt || null,
    lastCrashAt: state.lastCrashAt || null,
  });

  async function notify(raw) {
    if (!cfg.notify || disposed) return;
    const report = analyze(raw, { hours: 2, watcher: watcherStatus() });
    const text = renderNotification(report);
    if (!text) return;

    const now = Date.now();
    const crash = report.crashes[0];
    const signature = crash ? `${crash.app}|${crash.code?.code || ''}|${crash.module || ''}` : 'system';
    state.recentSignatures = (Array.isArray(state.recentSignatures) ? state.recentSignatures : [])
      .filter((entry) => entry && Number.isFinite(entry.at) && now - entry.at < 300_000);
    if (state.recentSignatures.some((entry) => entry.key === signature)) return;

    state.notifyTimes = (Array.isArray(state.notifyTimes) ? state.notifyTimes : []).filter((at) => now - at < 3_600_000);
    if (state.notifyTimes.length >= cfg.maxNotificationsPerHour) return;

    const roots = typeof ctx.agents?.roots === 'function' ? ctx.agents.roots() : [];
    const targets = cfg.notifyAllSessions ? roots : roots.slice(-1);
    if (targets.length === 0) return;

    let delivered = false;
    for (const agent of targets) {
      try {
        const summary = String(crash?.headline || '检测到新的系统异常').slice(0, 118);
        agent.followup(createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'plugin', plugin: name, form: 'notice', summary },
        }));
        delivered = true;
      } catch (error) {
        ctx.logger?.warn?.(`game-crash-doctor: failed to deliver crash notice: ${error.message}`);
      }
    }
    if (delivered) {
      state.notifyTimes.push(now);
      state.recentSignatures.push({ key: signature, at: now });
      state.lastCrashAt = crash?.time || new Date(now).toISOString();
      saveState(state);
    }
  }

  async function tick() {
    if (running || disposed) return;
    running = true;
    try {
      const raw = await collect({ hours: 2, timeoutMs: 60_000 });
      const events = (raw.events || []).filter(isCrashEvent);
      const system = (raw.system || []).filter(isSystemSignal);
      const appMax = Number(raw.maxRecordIds?.Application) || 0;
      const sysMax = Number(raw.maxRecordIds?.System) || 0;
      state.lastCheckAt = new Date().toISOString();

      if (!state.initialized) {
        state.initialized = true;
        state.applicationRecordId = appMax;
        state.systemRecordId = sysMax;
        saveState(state);
        const recent = events.filter((entry) => {
          if (!Number.isFinite(Date.parse(entry.time || ''))) return false;
          return Date.now() - Date.parse(entry.time) < 10 * 60_000 && (!cfg.gameOnly || isGameLike(entry));
        });
        if (recent.length > 0) await notify({ ...raw, events: recent, system: [] });
        return;
      }

      const newEvents = events.filter((entry) => Number(entry.recordId) > (state.applicationRecordId || 0));
      const newSystem = system.filter((entry) => Number(entry.recordId) > (state.systemRecordId || 0));
      state.applicationRecordId = Math.max(state.applicationRecordId || 0, appMax);
      state.systemRecordId = Math.max(state.systemRecordId || 0, sysMax);
      saveState(state);

      if (newEvents.length === 0 && newSystem.length === 0) return;
      const interesting = cfg.gameOnly ? newEvents.filter(isGameLike) : newEvents;
      if (interesting.length === 0 && newSystem.length === 0) return;
      await notify({ ...raw, events: interesting, system: newSystem });
    } catch (error) {
      ctx.logger?.warn?.(`game-crash-doctor: watcher skipped a cycle: ${error.message}`);
    } finally {
      running = false;
    }
  }

  ctx.tools.register(defineTool({
    name: 'diagnose_game_crash',
    description:
      'Diagnose recent game/application crashes on Windows. Reads Event Log (Application Error 1000, WER 1001, ' +
      'hang 1002, .NET 1026), System events (GPU TDR 4101, Kernel-Power 41, BugCheck 1001), WER report files and ' +
      'crash dumps, then explains likely causes and concrete fixes. Use when the user asks why a game crashed, ' +
      'why it keeps crashing, or how to stop it.',
    parameters: {
      hours: {
        type: 'number',
        description: 'How many hours back to scan (1-168, default 24).',
      },
      game: {
        type: 'string',
        description: 'Only include crashes whose executable name or path contains this text (case-insensitive).',
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: String(value?.text || '') }],
    },
    execute: async (args, exec) => {
      const hours = clampHours(args?.hours ?? 24);
      const raw = await collect({ hours, signal: exec?.signal });
      return analyze(raw, { hours, game: args?.game, watcher: watcherStatus() });
    },
    timeoutMs: 90_000,
  }));

  if (cfg.notify) {
    ctx.effect(() => {
      const boot = setTimeout(() => { void tick(); }, 4_000);
      const timer = setInterval(() => { void tick(); }, cfg.pollSeconds * 1_000);
      return () => {
        disposed = true;
        clearTimeout(boot);
        clearInterval(timer);
      };
    }, 'game-crash-doctor: crash watcher');
  }
}
