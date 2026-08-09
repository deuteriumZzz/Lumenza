export const CORE_STATES = [
  "idle",
  "listening",
  "routing",
  "thinking",
  "typing",
  "success",
  "error",
] as const;

export type CoreState = (typeof CORE_STATES)[number];

const STATE_PATTERNS: Record<CoreState, string> = {
  idle: "orbit",
  listening: "input-wave",
  routing: "inbound-path",
  thinking: "staggered-nodes",
  typing: "outbound-path",
  success: "resolved-ring",
  error: "interrupted-ring",
};

export function coreStatePattern(state: CoreState): string {
  return STATE_PATTERNS[state];
}

type ChatActivity = Partial<{
  dictating: boolean;
  error: boolean;
  sending: boolean;
  streaming: boolean;
  succeeded: boolean;
  transcribing: boolean;
}>;

export function resolveChatCoreState(activity: ChatActivity): CoreState {
  if (activity.error) return "error";
  if (activity.dictating) return "listening";
  if (activity.transcribing) return "thinking";
  if (activity.streaming) return "typing";
  if (activity.sending) return "routing";
  if (activity.succeeded) return "success";
  return "idle";
}
