/* PaperTrail 核心逻辑可重复测试：node tests/run-tests.mjs */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const samples = require('../web/js/data/samples.js');
const parser = require('../web/js/core/parser.js');
const engine = require('../web/js/core/engine.js');
const exporter = require('../web/js/core/exporter.js');
const selftest = require('../web/js/core/selftest.js');

const results = selftest.run({ samples, parser, engine, exporter });
let failed = 0;
for (const r of results) {
  const mark = r.pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${r.name}${r.pass ? '' : ' — ' + r.message}`);
  if (!r.pass) failed++;
}
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);