"""Trains the key classifier (plain numpy, hand-written backprop).

usage: python train_nn.py <data_dir> <out.json> [epochs] [hidden sizes comma separated] [n_features] [file prefix]

Input rows are produced by gen_nn.mjs. The network is a small MLP:
features -> ReLU -> ReLU -> ReLU -> logit. Weights are exported as JSON.
"""
import sys, os, json, glob, time
import numpy as np

data_dir, out_path = sys.argv[1], sys.argv[2]
epochs = int(sys.argv[3]) if len(sys.argv) > 3 else 20
hidden = [int(h) for h in (sys.argv[4] if len(sys.argv) > 4 else "256,128,64").split(",")]
N_FEAT = int(sys.argv[5]) if len(sys.argv) > 5 else 80
PREFIX = sys.argv[6] if len(sys.argv) > 6 else "p"

def load(files):
    xs, ys = [], []
    for f in files:
        x = np.fromfile(f + ".x", dtype=np.float32).reshape(-1, N_FEAT)
        y = np.fromfile(f + ".y", dtype=np.uint8)
        assert len(x) == len(y), f
        xs.append(x); ys.append(y)
    return np.concatenate(xs), np.concatenate(ys).astype(np.float32)

files = sorted(set(p[:-2] for p in glob.glob(os.path.join(data_dir, PREFIX + "*.x"))), key=lambda s: int(os.path.basename(s)[1:]))
n_val = max(5, len(files) // 12)
val_files, train_files = files[-n_val:], files[:-n_val]
print(f"{len(train_files)} train pieces, {len(val_files)} val pieces")
Xtr, ytr = load(train_files)
Xva, yva = load(val_files)
print("train rows", len(Xtr), "pos", int(ytr.sum()), "| val rows", len(Xva), "pos", int(yva.sum()))

mean = Xtr.mean(0)
std = Xtr.std(0) + 1e-6
Xtr = (Xtr - mean) / std
Xva = (Xva - mean) / std

rng = np.random.default_rng(1)
sizes = [N_FEAT] + hidden + [1]
W = [rng.standard_normal((sizes[i], sizes[i + 1])).astype(np.float32) * np.sqrt(2.0 / sizes[i]) for i in range(len(sizes) - 1)]
B = [np.zeros(sizes[i + 1], dtype=np.float32) for i in range(len(sizes) - 1)]
mW = [np.zeros_like(w) for w in W]; vW = [np.zeros_like(w) for w in W]
mB = [np.zeros_like(b) for b in B]; vB = [np.zeros_like(b) for b in B]

def forward(X, keep=False):
    acts = [X]
    h = X
    for i in range(len(W)):
        z = h @ W[i] + B[i]
        h = z if i == len(W) - 1 else np.maximum(z, 0)
        acts.append(h)
    return (acts if keep else h)

def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))

pos_weight = float(os.environ.get("POSW", "4.0"))

def evaluate(X, y):
    z = forward(X)[:, 0]
    p = sigmoid(z)
    eps = 1e-7
    loss = -(pos_weight * y * np.log(p + eps) + (1 - y) * np.log(1 - p + eps)).mean()
    order = np.argsort(-p)
    ys = y[order]
    tp = np.cumsum(ys); fp = np.cumsum(1 - ys)
    prec = tp / (tp + fp); rec = tp / max(1, ys.sum())
    f1 = 2 * prec * rec / (prec + rec + 1e-9)
    ap = float(np.sum(prec * ys) / max(1, ys.sum()))
    k = int(np.argmax(f1))
    return loss, ap, float(f1[k]), float(p[order][k])

batch = 4096
steps_per_epoch = len(Xtr) // batch
total_steps = epochs * steps_per_epoch
step = 0
best = (1e9, None)
t0 = time.time()
for ep in range(epochs):
    perm = rng.permutation(len(Xtr))
    for s in range(steps_per_epoch):
        idx = perm[s * batch:(s + 1) * batch]
        X, y = Xtr[idx], ytr[idx]
        acts = forward(X, keep=True)
        p = sigmoid(acts[-1][:, 0])
        g = ((pos_weight * y * (p - 1) + (1 - y) * p) / len(y))[:, None].astype(np.float32)
        lr = 2e-3 * (0.5 * (1 + np.cos(np.pi * step / total_steps))) + 1e-5
        step += 1
        for i in reversed(range(len(W))):
            gW = acts[i].T @ g
            gB = g.sum(0)
            if i > 0:
                g = (g @ W[i].T) * (acts[i] > 0)
            for (P, G, M, Vv) in ((W[i], gW, mW[i], vW[i]), (B[i], gB, mB[i], vB[i])):
                M *= 0.9; M += 0.1 * G
                Vv *= 0.999; Vv += 0.001 * G * G
                P -= lr * (M / (1 - 0.9 ** step)) / (np.sqrt(Vv / (1 - 0.999 ** step)) + 1e-8)
    vl, ap, f1, th = evaluate(Xva, yva)
    print(f"epoch {ep + 1}/{epochs}  val loss {vl:.4f}  AP {ap:.4f}  best-F1 {f1:.4f} @p={th:.3f}  ({time.time() - t0:.0f}s)", flush=True)
    if vl < best[0]:
        best = (vl, ([w.copy() for w in W], [b.copy() for b in B]))

W, B = best[1]
vl, ap, f1, th = evaluate(Xva, yva)
print(f"final (best val loss) {vl:.4f}  AP {ap:.4f}  F1 {f1:.4f} @ {th:.3f}")
json.dump({
    "sizes": sizes,
    "mean": mean.tolist(), "std": std.tolist(),
    "W": [w.flatten().tolist() for w in W],
    "B": [b.tolist() for b in B],
    "valF1": f1, "valAP": ap, "threshold": th,
}, open(out_path, "w"))
print("saved", out_path)
