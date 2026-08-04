import type { CompletionRequest, CompletionResponse, StreamDelta } from "../types";

export type ProviderAdapter = {
  id: string;
  complete: (req: CompletionRequest) => Promise<CompletionResponse>;
  stream: (req: CompletionRequest, onDelta: (delta: StreamDelta) => void) => Promise<CompletionResponse>;
};
