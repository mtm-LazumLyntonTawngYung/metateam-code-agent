let cleanupFn: (() => void) | null = null;

export function registerCleanup(fn: () => void) {
  cleanupFn = fn;
}

export function cleanExit(): never {
  if (cleanupFn) cleanupFn();
  process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
  process.exit(0);
}
