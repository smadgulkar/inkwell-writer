// Word-level comparison of two versions of a scene, for snapshots.
// Paragraphs are aligned first (cheap), then changed paragraphs are compared word by word.

export type Op = { t: 'same' | 'add' | 'del'; s: string };

function lcsOps<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): { t: 'same' | 'add' | 'del'; a?: T; b?: T }[] {
  const n = a.length;
  const m = b.length;
  // Trim common prefix and suffix to keep the table small.
  let pre = 0;
  while (pre < n && pre < m && eq(a[pre], b[pre])) pre++;
  let suf = 0;
  while (suf < n - pre && suf < m - pre && eq(a[n - 1 - suf], b[m - 1 - suf])) suf++;
  const A = a.slice(pre, n - suf);
  const B = b.slice(pre, m - suf);
  const out: { t: 'same' | 'add' | 'del'; a?: T; b?: T }[] = a.slice(0, pre).map((x, i) => ({ t: 'same' as const, a: x, b: b[i] }));
  if (A.length * B.length > 4_000_000) {
    // Too big to align precisely: show as a replacement.
    A.forEach((x) => out.push({ t: 'del', a: x }));
    B.forEach((y) => out.push({ t: 'add', b: y }));
  } else {
    const W = B.length + 1;
    const dp = new Uint32Array((A.length + 1) * W);
    for (let i = A.length - 1; i >= 0; i--)
      for (let j = B.length - 1; j >= 0; j--) dp[i * W + j] = eq(A[i], B[j]) ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    let i = 0;
    let j = 0;
    while (i < A.length && j < B.length) {
      if (eq(A[i], B[j])) {
        out.push({ t: 'same', a: A[i], b: B[j] });
        i++;
        j++;
      } else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) out.push({ t: 'del', a: A[i++] });
      else out.push({ t: 'add', b: B[j++] });
    }
    while (i < A.length) out.push({ t: 'del', a: A[i++] });
    while (j < B.length) out.push({ t: 'add', b: B[j++] });
  }
  a.slice(n - suf).forEach((x, k) => out.push({ t: 'same', a: x, b: b[m - suf + k] }));
  return out;
}

const words = (p: string) => p.match(/\s+|[^\s]+/g) ?? [];

function mergeOps(ops: Op[]): Op[] {
  const out: Op[] = [];
  for (const o of ops) {
    const last = out[out.length - 1];
    if (last && last.t === o.t) last.s += o.s;
    else out.push({ ...o });
  }
  return out;
}

/**
 * Make edits readable: a rewritten phrase reads as one deletion then one insertion,
 * instead of confetti around the spaces and short words the two versions happen to share.
 */
export function cleanupOps(ops: Op[]): Op[] {
  const out: Op[] = [];
  let i = 0;
  const small = (s: string) => !s.trim() || (s.trim().length <= 3 && !/\s/.test(s.trim()));
  while (i < ops.length) {
    if (ops[i].t === 'same') {
      out.push(ops[i++]);
      continue;
    }
    let del = '';
    let add = '';
    let j = i;
    while (j < ops.length) {
      const o = ops[j];
      if (o.t === 'del') del += o.s;
      else if (o.t === 'add') add += o.s;
      else {
        // Absorb a tiny shared run only if more changes follow it.
        const more = ops.slice(j + 1).findIndex((x) => x.t !== 'same');
        if (!small(o.s) || more !== 0) break;
        del += o.s;
        add += o.s;
      }
      j++;
    }
    // Shared leading/trailing whitespace belongs outside the change.
    const lead = /^\s*/.exec(del)![0].length && /^\s*/.exec(add)![0] === /^\s*/.exec(del)![0] ? /^\s*/.exec(del)![0] : '';
    if (lead) {
      out.push({ t: 'same', s: lead });
      del = del.slice(lead.length);
      add = add.slice(lead.length);
    }
    const tailD = /\s*$/.exec(del)![0];
    const tail = tailD && /\s*$/.exec(add)![0] === tailD ? tailD : '';
    if (tail) {
      del = del.slice(0, -tail.length);
      add = add.slice(0, -tail.length);
    }
    if (del) out.push({ t: 'del', s: del });
    if (add) out.push({ t: 'add', s: add });
    if (tail) out.push({ t: 'same', s: tail });
    i = j;
  }
  return mergeOps(out);
}

/** Diff two plain-text documents. Returns one list of operations per paragraph. */
export function diffText(before: string, after: string): Op[][] {
  const pa = before.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pb = after.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const paras = lcsOps(pa, pb, (x, y) => x === y);
  const result: Op[][] = [];
  for (let k = 0; k < paras.length; k++) {
    const p = paras[k];
    if (p.t === 'same') {
      result.push([{ t: 'same', s: p.a! }]);
      continue;
    }
    // Pair a deleted paragraph with the next added one as an edit.
    const next = paras[k + 1];
    if (p.t === 'del' && next?.t === 'add') {
      const ops = lcsOps(words(p.a!), words(next.b!), (x, y) => x === y).map((o) => ({ t: o.t, s: (o.t === 'add' ? o.b : o.a) as string }));
      result.push(cleanupOps(mergeOps(ops)));
      k++;
      continue;
    }
    result.push([{ t: p.t, s: (p.t === 'add' ? p.b : p.a) as string }]);
  }
  return result;
}

export function diffStats(ops: Op[][]) {
  let added = 0;
  let removed = 0;
  const count = (s: string) => s.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  for (const p of ops) for (const o of p) if (o.t === 'add') added += count(o.s);
    else if (o.t === 'del') removed += count(o.s);
  return { added, removed };
}
