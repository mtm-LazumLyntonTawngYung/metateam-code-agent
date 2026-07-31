import { Readable } from "node:stream";

export type WheelEvent = { direction: "up" | "down"; x: number; y: number };

type WheelListener = (event: WheelEvent) => void;

const wheelListeners = new Set<WheelListener>();

export function onWheel(listener: WheelListener): () => void {
  wheelListeners.add(listener);
  return () => wheelListeners.delete(listener);
}

function emitWheel(event: WheelEvent): void {
  for (const listener of wheelListeners) listener(event);
}

const MOUSE_SEQUENCE_RE = /^(\x1b\[<\d+;\d+;\d+[Mm])/;
const MOUSE_PREFIX_RE = /^\x1b\[<\d*(;\d*)*[Mm]?$/;
const CSI_FINAL_BYTE_RE = /[\x40-\x7e]/;

function escapeSequenceLength(data: string, start: number): number {
  if (data[start] !== "\x1b") return 0;
  if (data[start + 1] === "[" || data[start + 1] === "O") {
    const end = CSI_FINAL_BYTE_RE.exec(data.slice(start + 2));
    return end ? end.index + 3 : data.length - start;
  }
  return data[start + 1] ? 2 : 1;
}

export class MouseInputStream extends Readable {
  private source: NodeJS.ReadableStream;
  private buffer = "";
  private cleanup: (() => void) | null = null;

  constructor(source: NodeJS.ReadableStream) {
    super();
    this.source = source;
    (this as unknown as { isTTY: boolean }).isTTY = Boolean(
      (source as { isTTY?: boolean }).isTTY,
    );
    const onData = (chunk: Buffer | string) => this.onData(String(chunk));
    source.on("data", onData);
    this.cleanup = () => {
      source.removeListener("data", onData);
    };
  }

  override _read(): void {}

  onData(chunk: string): void {
    this.buffer += chunk;
    this.scan();
  }

  private scan(): void {
    let data = this.buffer;
    this.buffer = "";
    let i = 0;
    while (i < data.length) {
      const nextEsc = data.indexOf("\x1b", i);
      if (nextEsc === -1) {
        this.push(data.slice(i));
        break;
      }
      if (nextEsc > i) {
        this.push(data.slice(i, nextEsc));
        i = nextEsc;
      }
      if (data[i + 1] === "[" && data[i + 2] === "<") {
        const m = MOUSE_SEQUENCE_RE.exec(data.slice(i));
        if (m) {
          this.handleSequence(m[1]);
          i += m[1].length;
          continue;
        }
        if (MOUSE_PREFIX_RE.test(data.slice(i))) {
          this.buffer = data.slice(i);
          return;
        }
      }
      const escLen = escapeSequenceLength(data, i);
      const incomplete = escLen > data.length - i;
      if (incomplete) {
        this.buffer = data.slice(i);
        return;
      }
      this.push(data.slice(i, i + escLen));
      i += escLen;
    }
  }

  private handleSequence(sequence: string): void {
    const m = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/.exec(sequence);
    if (!m || m[4] !== "M") return;
    const button = Number(m[1]);
    if ((button & 0x40) === 0) return;
    emitWheel({
      direction: (button & 0x01) !== 0 ? "down" : "up",
      x: Number(m[2]),
      y: Number(m[3]),
    });
  }

  setRawMode(mode: boolean): void {
    (this.source as { setRawMode?: (m: boolean) => void }).setRawMode?.(mode);
  }

  setEncoding(encoding: BufferEncoding) {
    (this.source as { setEncoding?: (e: BufferEncoding) => unknown }).setEncoding?.(encoding);
    return this;
  }

  ref(): this {
    (this.source as { ref?: () => void }).ref?.();
    return this;
  }

  unref(): this {
    (this.source as { unref?: () => void }).unref?.();
    return this;
  }

  override destroy(error?: Error): this {
    this.cleanup?.();
    return super.destroy(error);
  }
}

export function enableMouseMode(): void {
  process.stdout.write("\x1b[?1000h\x1b[?1006h");
}

export function disableMouseMode(): void {
  process.stdout.write("\x1b[?1000l\x1b[?1006l");
}
