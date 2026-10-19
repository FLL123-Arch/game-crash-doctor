import { collect } from '../lib/collect.js';
import { analyze } from '../lib/diagnose.js';

const hours = Number(process.argv[2] || 72);
const raw = await collect({ hours });
console.log('--- raw summary ---');
console.log(JSON.stringify({
  events: raw.events?.length,
  system: raw.system?.length,
  dumps: raw.dumps?.length,
  maxRecordIds: raw.maxRecordIds,
}, null, 2));
console.log('--- report ---');
const report = analyze(raw, { hours });
console.log(report.text);
