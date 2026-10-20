import { spawn } from 'node:child_process';
const [from, to, dir, par] = [+process.argv[2], +process.argv[3], process.argv[4], +(process.argv[5] || 10)];
let seed = from, running = 0;
const next = () => {
  while (running < par && seed <= to) {
    const s = seed++; running++;
    const p = spawn('node', ['tools/gen_nn.mjs', String(s), dir], { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('exit', () => { running--; next(); });
  }
};
next();
