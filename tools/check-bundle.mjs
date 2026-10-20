import fs from 'node:fs';
const html = fs.readFileSync(process.argv[2] || 'dist/web/index.html', 'utf8');
const BS = String.fromCharCode(92);
const re = /<script( type="text\/plain" id="worker-src")?>([\s\S]*?)<\/script>/g;
let m, i = 0;
while ((m = re.exec(html))) {
  const code = m[2].split('<' + BS + '/').join('</');
  try { new Function(code); console.log(`script ${i} (${m[1] ? 'worker' : 'app'}) compiles, ${(code.length / 1024).toFixed(0)} KB`); }
  catch (e) { console.log(`script ${i} ERROR: ${e.message}`); }
  i++;
}
