// Dev helper: serves a local audio file to a browser page that decodes it with
// WebAudio (22.05 kHz mono) and posts the PCM back, so Node tests can use real recordings.
import http from 'node:http';
import fs from 'node:fs';
const file = process.argv[2], out = process.argv[3], port = +(process.argv[4] || 8765);
const page = `<!doctype html><meta charset=utf8><body style="font:14px sans-serif"><pre id=s>loading…</pre><script>
(async()=>{const s=document.getElementById('s');
const buf=await (await fetch('/audio')).arrayBuffer(); s.textContent='decoding '+buf.byteLength;
const ctx=new OfflineAudioContext(1,1,22050); const ab=await ctx.decodeAudioData(buf);
const n=ab.length, ch=ab.numberOfChannels, mono=new Float32Array(n);
for(let c=0;c<ch;c++){const d=ab.getChannelData(c);for(let i=0;i<n;i++)mono[i]+=d[i]/ch;}
s.textContent='posting '+n+' samples @'+ab.sampleRate+' ch='+ch;
await fetch('/pcm?sr='+ab.sampleRate,{method:'POST',body:mono.buffer}); s.textContent='done '+(n/ab.sampleRate).toFixed(1)+'s';})();
</script>`;
http.createServer((req, res) => {
  if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end(page); }
  else if (req.url === '/audio') { res.setHeader('content-type', 'audio/mpeg'); fs.createReadStream(file).pipe(res); }
  else if (req.url.startsWith('/pcm')) { const ch = []; req.on('data', d => ch.push(d)); req.on('end', () => { fs.writeFileSync(out, Buffer.concat(ch)); console.log('saved', out, req.url); res.end('ok'); }); }
  else res.end('');
}).listen(port, () => console.log('listening', port));
