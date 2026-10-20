// usage: node mkjobs.mjs <par> -- <cmd> <args...> ; each arg list line from stdin is appended
import { spawn } from 'node:child_process';
import readline from 'node:readline';
const par = +process.argv[2];
const base = process.argv.slice(4);
const rl = readline.createInterface({ input: process.stdin });
const jobs = []; rl.on('line', (l) => { if (l.trim()) jobs.push(l.trim().split(/\s+/)); });
rl.on('close', () => {
  let running = 0, i = 0;
  const next = () => { while (running < par && i < jobs.length) { const j = jobs[i++]; running++; spawn(base[0], [...base.slice(1), ...j], { stdio: 'inherit' }).on('exit', () => { running--; next(); }); } };
  next();
});
