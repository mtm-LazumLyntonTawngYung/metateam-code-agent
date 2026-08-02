// ponytail: minimal deterministic property runner — no fast-check dep needed.
// Fixed seed = reproducible runs; LCG covers random input spread for these parsers.
export function prop(iterations = 100, fn: (rand: () => number) => void): void {
  let seed = 0xc0ffee;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let i = 0; i < iterations; i++) fn(rand);
}

export function randInt(rand: () => number, max: number): number {
  return Math.floor(rand() * max);
}

export function randStr(rand: () => number, len: number, chars: string): string {
  let s = "";
  for (let i = 0; i < len; i++) s += chars[randInt(rand, chars.length)];
  return s;
}
