import type { SessionEvent } from "./types";

type EventHandler = (event: SessionEvent) => void;

const handlers = new Map<string, Set<EventHandler>>();
const globalHandlers = new Set<EventHandler>();

export function subscribe(sessionId: string, handler: EventHandler): () => void {
  if (!handlers.has(sessionId)) {
    handlers.set(sessionId, new Set());
  }
  handlers.get(sessionId)!.add(handler);

  return () => {
    const sessionHandlers = handlers.get(sessionId);
    if (sessionHandlers) {
      sessionHandlers.delete(handler);
      if (sessionHandlers.size === 0) {
        handlers.delete(sessionId);
      }
    }
  };
}

export function subscribeGlobal(handler: EventHandler): () => void {
  globalHandlers.add(handler);
  return () => {
    globalHandlers.delete(handler);
  };
}

export function broadcastSessionEvent(event: SessionEvent): void {
  const sessionHandlers = handlers.get(event.sessionId);
  if (sessionHandlers) {
    for (const handler of sessionHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error("Event handler error:", err);
      }
    }
  }

  for (const handler of globalHandlers) {
    try {
      handler(event);
    } catch (err) {
      console.error("Global event handler error:", err);
    }
  }
}

export function getSubscriberCount(sessionId: string): number {
  return handlers.get(sessionId)?.size ?? 0;
}

export function clearAllHandlers(): void {
  handlers.clear();
  globalHandlers.clear();
}
