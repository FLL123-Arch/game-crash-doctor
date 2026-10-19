const CODE_INFO = {
  '0xc0000005': ['ACCESS_VIOLATION', '非法内存访问（读/写无效地址）'],
  '0xc0000006': ['IN_PAGE_ERROR', '页面文件/磁盘读取失败'],
  '0xc0000008': ['INVALID_HANDLE', '使用了无效句柄'],
  '0xc000001d': ['ILLEGAL_INSTRUCTION', 'CPU 执行了非法指令'],
  '0xc0000022': ['ACCESS_DENIED', '访问被拒绝'],
  '0xc000007b': ['INVALID_IMAGE_FORMAT', 'DLL 位数/格式不匹配'],
  '0xc0000094': ['INTEGER_DIVIDE_BY_ZERO', '整数除零'],
  '0xc0000096': ['PRIVILEGED_INSTRUCTION', '执行了特权指令'],
  '0xc00000fd': ['STACK_OVERFLOW', '栈溢出'],
  '0xc0000135': ['DLL_NOT_FOUND', '找不到依赖 DLL'],
  '0xc0000374': ['HEAP_CORRUPTION', '堆内存被破坏'],
  '0xc0000409': ['STACK_BUFFER_OVERRUN', '栈缓冲区溢出/安全快速失败'],
  '0xc0000428': ['INVALID_IMAGE_HASH', '模块签名校验失败'],
  '0xc0000602': ['FAIL_FAST_EXCEPTION', '进程主动快速失败'],
  '0x80000003': ['BREAKPOINT', '断点异常（调试器/反作弊/注入）'],
  '0xe06d7363': ['CPP_EXCEPTION', 'C++ 未处理异常'],
  '0xe0434352': ['DOTNET_EXCEPTION', '.NET 未处理异常'],
  '0x887a0005': ['DXGI_ERROR_DEVICE_REMOVED', '显卡设备被移除'],
  '0x887a0006': ['DXGI_ERROR_DEVICE_HUNG', '显卡设备无响应'],
  '0x887a0020': ['DXGI_ERROR_DRIVER_INTERNAL_ERROR', '显卡驱动内部错误'],
};

const BUGCHECK_INFO = {
  '0xa': ['IRQL_NOT_LESS_OR_EQUAL', '驱动或内存访问了错误的中断级别'],
  '0x1a': ['MEMORY_MANAGEMENT', '内存管理错误（内存条/超频/驱动）'],
  '0x50': ['PAGE_FAULT_IN_NONPAGED_AREA', '非分页内存页错误（内存/驱动）'],
  '0x7e': ['SYSTEM_THREAD_EXCEPTION_NOT_HANDLED', '系统线程异常（驱动/内存）'],
  '0x9f': ['DRIVER_POWER_STATE_FAILURE', '驱动电源状态失败'],
  '0x101': ['CLOCK_WATCHDOG_TIMEOUT', 'CPU 看门狗超时（超频/散热/CPU）'],
  '0x116': ['VIDEO_TDR_ERROR', '显卡驱动超时'],
  '0x117': ['VIDEO_TDR_TIMEOUT_DETECTED', '显卡驱动超时'],
  '0x124': ['WHEA_UNCORRECTABLE_ERROR', '硬件不可纠正错误（CPU/内存/电源/散热）'],
  '0x133': ['DPC_WATCHDOG_VIOLATION', 'DPC 看门狗超时（驱动/SSD）'],
  '0x139': ['KERNEL_SECURITY_CHECK_FAILURE', '内核安全检查失败（内存/驱动）'],
  '0xef': ['CRITICAL_PROCESS_DIED', '关键系统进程终止'],
};

const LIKELIHOOD_CN = { high: '高', medium: '中', low: '低' };

export function normalizeCode(value) {
  if (value === null || value === undefined) return null;
  let text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (/^-?\d+$/.test(text)) {
    text = (Number(text) >>> 0).toString(16);
  } else {
    text = text.replace(/^0x/, '');
  }
  if (!/^[0-9a-f]+$/.test(text)) return null;
  return `0x${text.padStart(8, '0').slice(-8)}`;
}

export function codeInfo(value) {
  const code = normalizeCode(value);
  if (!code) return null;
  const known = CODE_INFO[code];
  return known
    ? { code, name: known[0], desc: known[1] }
    : { code, name: 'UNKNOWN_EXCEPTION', desc: '未知异常代码' };
}

export function moduleKind(module) {
  const m = String(module || '').toLowerCase();
  if (!m) return 'unknown';
  if (/(nvwgf2umx|nvlddmkm|nvd3dum|nvapi|atio6axx|atidxx|amdvlk|igxelpicd|igd10iumd|igc64)/.test(m)) return 'gpu-driver';
  if (/(easyanticheat|beservice|beclient|vgc|vgk|ace-|tenprotect|anti.?cheat|xigncode)/.test(m)) return 'anticheat';
  if (/(unityplayer|gameassembly)/.test(m)) return 'unity';
  if (/(ue4|ue5|unreal)/.test(m)) return 'unreal';
  if (/(d3d11|d3d12|dxgi|vulkan|opengl32)/.test(m)) return 'graphics-api';
  if (/(xaudio|fmodex|wwise|audio)/.test(m)) return 'audio';
  if (/(ntdll|kernelbase|kernel32|user32|gdi32)/.test(m)) return 'system';
  return 'game';
}

export function isCrashEvent(entry) {
  return ['crash', 'hang', 'dotnet', 'wer'].includes(entry?.type);
}

export function isSystemSignal(entry) {
  return ['tdr', 'power', 'bugcheck', 'shutdown'].includes(entry?.kind);
}

export function isGameLike(entry) {
  const app = String(entry?.app || '').toLowerCase();
  const appPath = String(entry?.appPath || entry?.wer?.appPath || '').toLowerCase();
  const module = String(entry?.module || entry?.wer?.module || '').toLowerCase();

  if (/(steamapps[\\/]common|epic games|gog games|ubisoft game launcher|riot games|battle\.net|wegameapps|hoyoverse|mihoyo|wuthering|\\games\\|\\game\\)/.test(appPath)) return true;
  if (/(unityplayer|gameassembly|ue4-|ue5-|unreal|d3d11|d3d12|dxgi|vulkan)/.test(module)) return true;
  if (/(shipping|client-win64|gameassembly|unityplayer)/.test(app)) return true;
  if (/^(steam|epicgameslauncher|battle\.net|riotclientservices|explorer|svchost|chrome|msedge|firefox|code|devenv|node|python|powershell|cmd|teams|discord|searchhost|runtimebroker|dllhost)\.exe$/.test(app)) return false;
  return false;
}

function timestamp(iso) {
  const n = Date.parse(iso || '');
  return Number.isFinite(n) ? n : NaN;
}

function bugcheckInfo(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const key = `0x${normalized.slice(2).replace(/^0+/, '')}`;
  return BUGCHECK_INFO[key] || null;
}

function bugcheckText(entry) {
  const info = bugcheckInfo(entry?.bugcheckCode);
  const label = info ? `（${info[0]}：${info[1]}）` : '';
  const dump = entry?.dumpPath ? `，转储：${entry.dumpPath}` : '';
  return `BugCheck ${entry?.bugcheckCode || '未知'}${label}${dump}`;
}

function crashFromEvent(event) {
  const type = event?.type;
  let eventType = event?.eventType;
  if (!eventType) {
    if (type === 'hang') eventType = 'APPHANG';
    else if (type === 'dotnet') eventType = 'CLR';
    else eventType = 'APPCRASH';
  }
  if (type === 'wer' && !/APPCRASH|APPHANG|BEX|CLR|MoApp|AppHang|Crash/i.test(eventType)) return null;
  const app = event?.app || event?.wer?.app || 'unknown';
  const code = codeInfo(event?.exceptionCode || event?.wer?.exceptionCode);
  const module = event?.module || event?.wer?.module || null;
  return {
    time: event?.time || null,
    app,
    appPath: event?.appPath || event?.wer?.appPath || null,
    module,
    moduleVersion: event?.moduleVersion || event?.wer?.moduleVersion || null,
    modulePath: event?.modulePath || null,
    code,
    eventType,
    source: type,
    recordId: event?.recordId ?? null,
    reportPath: event?.reportPath || null,
    bucket: event?.bucket || event?.wer?.bucket || null,
    message: event?.message || null,
    wer: event?.wer || null,
    isGame: false,
  };
}

function mergeCrash(target, other) {
  for (const key of ['appPath', 'modulePath', 'reportPath', 'bucket', 'message']) {
    if (!target[key] && other[key]) target[key] = other[key];
  }
  if (!target.code && other.code) target.code = other.code;
  if (!target.module && other.module) target.module = other.module;
  if (!target.moduleVersion && other.moduleVersion) target.moduleVersion = other.moduleVersion;
  if (!target.wer && other.wer) target.wer = other.wer;
}

function mergeCrashes(events) {
  const crashes = [];
  const ordered = [...events].sort((a, b) => timestamp(a.time) - timestamp(b.time));
  for (const event of ordered) {
    const crash = crashFromEvent(event);
    if (!crash) continue;
    const t = timestamp(crash.time);
    const twin = crashes.find((existing) => {
      if (existing.app !== crash.app) return false;
      if (existing.code?.code !== crash.code?.code) return false;
      if (existing.module !== crash.module) return false;
      const other = timestamp(existing.time);
      return Number.isFinite(t) && Number.isFinite(other) && Math.abs(t - other) < 180_000;
    });
    if (twin) mergeCrash(twin, crash);
    else crashes.push(crash);
  }
  return crashes;
}

function relatedSignals(signals, crash) {
  const t = timestamp(crash.time);
  const near = (list) => list.filter((entry) => {
    const other = timestamp(entry.time);
    if (!Number.isFinite(t) || !Number.isFinite(other)) return true;
    return Math.abs(t - other) <= 15 * 60_000;
  });
  return {
    tdr: near(signals.tdr),
    power: near(signals.power),
    bugchecks: near(signals.bugchecks),
    liveKernel: near(signals.liveKernel),
  };
}

function buildCauses(crash, related, stats, hours) {
  const causes = [];
  const add = (title, likelihood, why) => {
    if (!causes.some((entry) => entry.title === title)) causes.push({ title, likelihood, why });
  };
  const code = crash.code?.code || null;
  const kind = moduleKind(crash.module);

  if (crash.eventType === 'APPHANG') {
    add('游戏主线程无响应（挂起）', 'high', '窗口停止响应但进程没有退出，常见于驱动卡顿、覆盖层注入、资源加载死锁或反作弊扫描');
  }
  if (crash.eventType === 'CLR') {
    add('.NET 运行时未处理异常', 'high', '游戏或启动器的 .NET 代码抛出异常，通常是安装损坏、运行库版本不匹配或模组导致');
  }

  if (related.tdr.length) {
    add('显卡驱动超时（TDR）', 'high', `崩溃前后系统记录了 ${related.tdr.length} 次“显示驱动停止响应并已恢复”（事件 4101），说明 GPU 侧先出问题`);
  }
  if (related.power.length) {
    add('异常断电/系统死机', 'high', 'Kernel-Power 41：系统没有正常关机，常见于电源、过热、超频不稳或直接死机');
  }
  if (related.bugchecks.length) {
    const first = related.bugchecks[0];
    add(`蓝屏/内核错误 ${first.bugcheckCode || ''}`.trim(), 'high', bugcheckText(first));
  }
  if (related.liveKernel.length) {
    add('GPU 内核错误（LiveKernelReport）', 'high', '系统保存了显卡相关的内核转储，通常指向显卡驱动、供电或显存问题');
  }

  switch (code) {
    case '0xc0000005':
      add('程序或模组访问了非法内存地址', 'high', 'ACCESS_VIOLATION：常见于模组/补丁越界、文件损坏、内存不稳或驱动注入');
      if (kind === 'system') add('系统 DLL 内崩溃，驱动或注入嫌疑较大', 'medium', '故障落在 ntdll/KERNELBASE 等系统模块时，往往不是游戏本身写错，而是驱动、覆盖层或内存问题');
      break;
    case '0xe06d7363':
      add('游戏抛出了未处理的 C++ 异常', 'high', 'C++ 异常没有被游戏捕获，常见于游戏代码 bug、模组/补丁不兼容、资源损坏或反作弊注入');
      add('游戏文件/资源损坏或模组不兼容', 'medium', '校验文件后仍复现时，优先回退最近安装的模组、补丁或汉化');
      break;
    case '0xe0434352':
      add('.NET 未处理异常', 'high', '托管代码异常，常见于启动器/游戏运行库损坏或版本不匹配');
      break;
    case '0xc0000374':
      add('堆内存被破坏', 'high', 'HEAP_CORRUPTION：越界写、内存超频/XMP 不稳或驱动写坏内存');
      break;
    case '0xc0000409':
      add('栈溢出/安全快速失败', 'high', 'STACK_BUFFER_OVERRUN：常见于注入 DLL、反作弊、恶意覆盖层或内存损坏');
      break;
    case '0xc00000fd':
      add('栈溢出', 'high', '递归过深或模组脚本死循环');
      break;
    case '0xc000001d':
      add('CPU 执行了非法指令', 'high', '多见于 CPU 超频/降压不稳，或游戏使用了当前 CPU 不支持的指令集');
      break;
    case '0xc0000006':
      add('页面文件/磁盘读取失败', 'medium', '游戏文件或磁盘出现 I/O 错误，可能是文件损坏、坏道或页面文件不足');
      break;
    case '0xc0000135':
      add('缺少依赖 DLL', 'high', '通常缺少 Microsoft Visual C++ 运行库或游戏自带运行库');
      break;
    case '0xc000007b':
      add('DLL 位数/格式不匹配', 'high', '混用了 32/64 位 DLL，或运行库/模组文件损坏');
      break;
    case '0x887a0005':
    case '0x887a0006':
    case '0x887a0020':
      add('显卡设备丢失/无响应', 'high', 'DXGI 设备移除或挂起，通常由显卡驱动、超频、供电或温度引起');
      break;
    case '0x80000003':
      add('断点异常', 'medium', '调试器、反作弊或注入的 DLL 主动触发断点');
      break;
    default:
      if (code) add(`异常代码 ${code}`, 'medium', crash.code.desc);
      break;
  }

  if (kind === 'gpu-driver') {
    add('崩溃发生在显卡驱动模块', 'high', `${crash.module} 是显卡驱动组件，优先排查驱动版本、超频、供电和温度`);
  }
  if (kind === 'anticheat') {
    add('崩溃发生在反作弊组件', 'high', `${crash.module} 属于反作弊/保护模块，常见于反作弊更新、调试器、加速器或系统补丁冲突`);
  }

  const signatureCount = stats.get(`${crash.app}|${code}|${crash.module}`) || 1;
  if (signatureCount >= 2) {
    add('同一崩溃反复出现', 'high', `最近 ${hours} 小时内相同签名出现 ${signatureCount} 次，说明问题可复现，优先按下面建议逐项排除`);
  }

  if (causes.length === 0) {
    add('未能在事件日志中定位明确原因', 'low', '只看到应用层崩溃记录，没有对应的内核/驱动错误；可能是游戏自身 bug 或缺少足够信息');
  }

  const order = { high: 0, medium: 1, low: 2 };
  causes.sort((a, b) => order[a.likelihood] - order[b.likelihood]);
  return causes.slice(0, 5);
}

function buildSuggestions(crash, related, causes) {
  const suggestions = [];
  const push = (text) => {
    if (text && !suggestions.includes(text)) suggestions.push(text);
  };
  const code = crash.code?.code || null;
  const kind = moduleKind(crash.module);

  if (kind === 'gpu-driver' || ['0x887a0005', '0x887a0006', '0x887a0020'].includes(code) || related.tdr.length) {
    push('用 DDU 在安全模式下彻底卸载显卡驱动，再安装厂商最新稳定版');
    push('把显卡/CPU/内存恢复到默认频率，关闭超频、降压和 XMP/EXPO 后复测');
    push('检查显卡供电线是否插紧、GPU 温度和机箱散热');
  }
  if (related.power.length) {
    push('检查电源功率与老化情况，更新主板 BIOS，关闭超频后复测');
  }
  if (related.bugchecks.length) {
    const info = bugcheckInfo(related.bugchecks[0].bugcheckCode);
    if (info?.[0] === 'WHEA_UNCORRECTABLE_ERROR') push('WHEA 属于硬件错误：优先检查 CPU/内存/电源和散热，更新 BIOS');
    else push('按 BugCheck 代码排查对应驱动；先关闭超频并运行内存测试');
  }
  if (code === '0xc0000005' || code === '0xe06d7363') {
    push('验证游戏/程序文件完整性；如果最近装过模组/补丁，先全部移除再复测');
    push('关闭 Discord、GeForce Experience、RTSS、MSI Afterburner 等覆盖层/注入工具');
  }
  if (code === '0xc0000374' || code === '0xc0000409' || code === '0xc000001d') {
    push('关闭内存 XMP/EXPO 与 CPU/显卡超频，运行 Windows 内存诊断或 MemTest86');
  }
  if (code === '0xc0000135' || code === '0xc000007b') {
    push('安装最新 Microsoft Visual C++ Redistributable（x64 和 x86），并修复游戏运行库');
  }
  if (kind === 'anticheat' || code === '0x80000003') {
    push('关闭调试器、加速器、模拟器；修复或重装游戏反作弊组件');
  }
  if (crash.eventType === 'APPHANG') {
    push('卡住时先等 30 秒；关闭覆盖层并更新显卡驱动后复测');
  }

  push('更新游戏和反作弊到最新版本');
  push('打开事件查看器 → Windows 日志 → 应用程序，查看 WER 报告与转储文件');
  return suggestions.slice(0, 6);
}

function headlineFor(crash) {
  const code = crash.code ? `${crash.code.name}（${crash.code.code}）` : crash.eventType;
  const action = crash.eventType === 'APPHANG' ? '无响应' : '崩溃';
  return `${crash.app} ${action}：${code}${crash.module ? ` @ ${crash.module}` : ''}`;
}

function attachDump(crash, dumps) {
  const app = String(crash.app || '').replace(/\.exe$/i, '').toLowerCase();
  const t = timestamp(crash.time);
  return dumps.find((dump) => {
    const p = String(dump.path || '').toLowerCase();
    const dt = timestamp(dump.time);
    return p.includes(app) && (!Number.isFinite(t) || !Number.isFinite(dt) || Math.abs(t - dt) < 15 * 60_000);
  }) || null;
}

function systemTitle(entry) {
  switch (entry.kind) {
    case 'tdr': return '显卡驱动停止响应并恢复（TDR 4101）';
    case 'power': return `系统异常断电/死机（Kernel-Power 41${entry.bugcheckCode ? `，${entry.bugcheckCode}` : ''}）`;
    case 'bugcheck': return `蓝屏/内核错误 ${entry.bugcheckCode || ''}`.trim();
    case 'shutdown': return '系统意外关机（6008）';
    default: return `系统事件 ${entry.id}`;
  }
}

export function fmtTime(iso) {
  if (!iso) return '未知时间';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function analyze(raw, options = {}) {
  const hours = options.hours ?? raw?.hours ?? 24;
  const gameFilter = String(options.game || '').trim().toLowerCase();
  const events = Array.isArray(raw?.events) ? raw.events : [];
  const rawSystem = Array.isArray(raw?.system) ? raw.system : [];
  const rawDumps = Array.isArray(raw?.dumps) ? raw.dumps : [];

  let crashes = mergeCrashes(events);
  if (gameFilter) {
    crashes = crashes.filter((crash) => `${crash.app} ${crash.appPath || ''}`.toLowerCase().includes(gameFilter));
  }

  for (const crash of crashes) {
    crash.isGame = isGameLike(crash);
  }

  const stats = new Map();
  for (const crash of crashes) {
    const key = `${crash.app}|${crash.code?.code || ''}|${crash.module || ''}`;
    stats.set(key, (stats.get(key) || 0) + 1);
  }

  const signals = { tdr: [], power: [], bugchecks: [], liveKernel: [] };
  for (const entry of rawSystem) {
    if (entry.kind === 'tdr') signals.tdr.push(entry);
    else if (entry.kind === 'power') signals.power.push(entry);
    else if (entry.kind === 'bugcheck') signals.bugchecks.push(entry);
  }
  for (const dump of rawDumps) {
    if (dump.kind === 'livekernel') signals.liveKernel.push(dump);
  }

  const dumps = rawDumps.map((dump) => ({
    ...dump,
    timeText: fmtTime(dump.time),
  }));

  for (const crash of crashes) {
    const related = relatedSignals(signals, crash);
    crash.causes = buildCauses(crash, related, stats, hours);
    crash.suggestions = buildSuggestions(crash, related, crash.causes);
    crash.confidence = crash.causes.some((cause) => cause.likelihood === 'high')
      ? 'high'
      : crash.causes.some((cause) => cause.likelihood === 'medium') ? 'medium' : 'low';
    crash.headline = headlineFor(crash);
    crash.primaryCause = crash.causes[0]?.title || '原因不明';
    crash.dump = attachDump(crash, dumps);
  }

  crashes.sort((a, b) => timestamp(b.time) - timestamp(a.time));

  const system = rawSystem
    .map((entry) => ({
      ...entry,
      timeText: fmtTime(entry.time),
      title: systemTitle(entry),
      detail: entry.kind === 'bugcheck' ? bugcheckText(entry) : (entry.message || ''),
    }))
    .sort((a, b) => timestamp(b.time) - timestamp(a.time));

  const report = {
    ok: true,
    generatedAt: raw?.generatedAt || new Date().toISOString(),
    windowStart: raw?.windowStart || null,
    hours,
    gameFilter: gameFilter || null,
    summary: {
      crashCount: crashes.length,
      hangCount: crashes.filter((crash) => crash.eventType === 'APPHANG').length,
      gameCrashCount: crashes.filter((crash) => crash.isGame).length,
      systemEventCount: system.length,
      dumpCount: dumps.length,
    },
    crashes,
    system,
    dumps,
    watcher: options.watcher || null,
  };
  report.text = renderText(report);
  return report;
}

export function renderText(report) {
  const s = report.summary;
  const lines = [];
  lines.push(`游戏崩溃诊断（最近 ${report.hours} 小时）`);
  lines.push(`生成时间：${fmtTime(report.generatedAt)}`);
  if (report.gameFilter) lines.push(`筛选关键词：${report.gameFilter}`);
  lines.push(`扫描结果：${s.crashCount} 起崩溃 / ${s.hangCount} 起卡死 / ${s.systemEventCount} 条系统异常 / ${s.dumpCount} 个转储`);

  if (report.watcher) {
    const w = report.watcher;
    lines.push(`后台监控：${w.enabled ? `开启（每 ${w.pollSeconds} 秒）` : '关闭'}${w.lastCheckAt ? `，上次检查 ${fmtTime(w.lastCheckAt)}` : ''}`);
  }

  if (report.crashes.length === 0) {
    lines.push('');
    lines.push('没有找到应用崩溃记录。');
    lines.push('如果游戏是“直接闪退/断电/蓝屏”，可能不会写应用崩溃事件：');
    lines.push('  - 把 hours 调到 168 再扫一次');
    lines.push('  - 检查系统日志的 Kernel-Power 41 / BugCheck 1001 / 显示驱动 4101');
    lines.push('  - 确认 Windows Error Reporting Service 没有被禁用');
  }

  report.crashes.forEach((crash, index) => {
    lines.push('');
    lines.push(`■ ${index + 1}. ${crash.app}${crash.isGame ? '' : '（非游戏进程）'}`);
    lines.push(`  时间：${fmtTime(crash.time)}`);
    if (crash.appPath) lines.push(`  路径：${crash.appPath}`);
    lines.push(`  异常：${crash.code ? `${crash.code.name}（${crash.code.code}）` : crash.eventType}`);
    if (crash.module) lines.push(`  模块：${crash.module}${crash.moduleVersion ? `（${crash.moduleVersion}）` : ''}`);
    lines.push(`  判断：${crash.headline}`);
    lines.push(`  置信度：${LIKELIHOOD_CN[crash.confidence] || crash.confidence}`);
    lines.push('  可能原因：');
    for (const cause of crash.causes) {
      lines.push(`   - [${LIKELIHOOD_CN[cause.likelihood]}] ${cause.title}：${cause.why}`);
    }
    lines.push('  建议：');
    crash.suggestions.forEach((suggestion, i) => lines.push(`   ${i + 1}. ${suggestion}`));
    if (crash.reportPath) lines.push(`  WER 报告：${crash.reportPath}`);
    if (crash.dump) lines.push(`  转储：${crash.dump.path}（${crash.dump.sizeMB} MB）`);
  });

  if (report.system.length) {
    lines.push('');
    lines.push('■ 系统事件');
    for (const entry of report.system) {
      const detail = entry.detail ? `：${entry.detail}` : '';
      lines.push(`  - ${entry.timeText} ${entry.title}${detail}`);
    }
  }

  if (report.dumps.length) {
    lines.push('');
    lines.push('■ 转储文件');
    for (const dump of report.dumps) {
      lines.push(`  - ${dump.timeText} ${dump.path}（${dump.sizeMB} MB，${dump.kind}）`);
    }
  }

  return lines.join('\n');
}

export function renderNotification(report) {
  const crash = report.crashes[0];
  if (!crash) {
    const first = report.system[0];
    if (!first) return null;
    return [
      '【系统异常】检测到与游戏相关的系统事件',
      `时间：${first.timeText}`,
      `事件：${first.title}`,
      '需要的话让我运行 diagnose_game_crash 看完整分析。',
    ].join('\n');
  }
  return [
    `【游戏崩溃】${crash.app}`,
    `时间：${fmtTime(crash.time)}`,
    `异常：${crash.code ? `${crash.code.name}（${crash.code.code}）` : crash.eventType}${crash.module ? ` @ ${crash.module}` : ''}`,
    `判断：${crash.primaryCause}（置信度：${LIKELIHOOD_CN[crash.confidence] || crash.confidence}）`,
    `建议：${crash.suggestions.slice(0, 3).join('；')}`,
    '完整报告：让我运行 diagnose_game_crash。',
  ].join('\n');
}
