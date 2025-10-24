#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');

function hasFile(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

console.log('[doctor] scanning for ../../lib/ imports...');
const grepCmd = `grep -R "../../lib/" -n admin-api/src 2>/dev/null | cut -d: -f1 | sort -u || true`;
const files = execSync(grepCmd, { stdio: ['ignore','pipe','inherit'] }).toString().trim().split('\n').filter(Boolean);
const libs = new Set();

for (const f of files) {
  if (!hasFile(f)) continue;
  const txt = fs.readFileSync(f,'utf8');
  const m = [...txt.matchAll(/['"]\.\.\/\.\.\/lib\/([^'"]+)['"]/g)].map(x=>x[1]);
  m.forEach(n => libs.add(n));
}

const expectedLibs = [...libs].map(n => n.replace(/\.js$/, ''));
const missingLibs = expectedLibs.filter(n => !hasFile(`admin-api/lib/${n}.js`));

console.log('[doctor] expected libs:', expectedLibs.join(', ') || '(none)');
console.log('[doctor] missing libs:', missingLibs.join(', ') || '(none)');

console.log('[doctor] DB_URL:', process.env.DB_URL ? 'present' : 'missing (will default to mysql://root@127.0.0.1:3306/slimy)');

try {
  const out = execSync('curl -s -o /dev/null -w "%{http_code}\\n" http://127.0.0.1:3080/', { timeout: 2000 }).toString().trim();
  console.log('[doctor] local :3080 HTTP status =>', out);

  if (out === '200' || out === '404' || out === '302') {
    console.log('[doctor] ✓ Admin API appears to be responding');
  } else {
    console.log('[doctor] ⚠ Unexpected status code');
  }
} catch (e) {
  console.log('[doctor] ⚠ :3080 not reachable yet or curl failed');
  console.log('[doctor] Error:', e.message);
}

if (missingLibs.length === 0) {
  console.log('[doctor] ✓ All required lib modules are present');
  process.exit(0);
} else {
  console.log('[doctor] ✗ Some lib modules are missing');
  process.exit(1);
}
