// Note-level evaluation in the style of mir_eval: a detected note matches a
// reference note when the pitch is equal and the onset is within `tol` seconds.

export function evaluate(ref, est, tol = 0.05) {
  const used = new Set();
  let tp = 0, tpOff = 0;
  const onErr = [];
  const missed = [];
  const sortedEst = est.map((e, i) => ({ ...e, i }));
  for (const r of ref) {
    let best = -1, bd = Infinity;
    for (const e of sortedEst) {
      if (used.has(e.i) || e.pitch !== r.pitch) continue;
      const d = Math.abs(e.start - r.start);
      if (d <= tol && d < bd) { bd = d; best = e.i; }
    }
    if (best >= 0) {
      used.add(best);
      tp++;
      onErr.push(sortedEst[best].start - r.start);
      const e = sortedEst[best];
      const offTol = Math.max(0.05, 0.2 * (r.end - r.start));
      if (Math.abs(e.end - r.end) <= offTol) tpOff++;
    } else missed.push(r);
  }
  const extra = est.filter((_, i) => !used.has(i));
  const prec = est.length ? tp / est.length : 0;
  const rec = ref.length ? tp / ref.length : 0;
  const f1 = prec + rec ? (2 * prec * rec) / (prec + rec) : 0;
  const p2 = est.length ? tpOff / est.length : 0;
  const r2 = ref.length ? tpOff / ref.length : 0;
  const f1off = p2 + r2 ? (2 * p2 * r2) / (p2 + r2) : 0;
  onErr.sort((a, b) => a - b);
  const med = onErr.length ? onErr[Math.floor(onErr.length / 2)] : 0;
  const mae = onErr.length ? onErr.reduce((s, v) => s + Math.abs(v), 0) / onErr.length : 0;
  return { usedSet: used, precision: prec, recall: rec, f1, f1off, tp, nRef: ref.length, nEst: est.length, medianOnsetErr: med, meanAbsOnsetErr: mae, missed, extra };
}
