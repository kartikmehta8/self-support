export interface SlackUrlVerificationEvent {
  type: "url_verification";
  challenge: string;
}

export interface SlackAppMentionContext {
  eventKey: string;
  channelId: string;
  threadTs: string | undefined;
  text: string;
}

interface SlackEventCallback {
  type: "event_callback";
  event_id?: string;
  event?: {
    type?: string;
    channel?: string;
    thread_ts?: string;
    event_ts?: string;
    text?: string;
    user?: string;
  };
}

type SlackEventPayload = SlackUrlVerificationEvent | SlackEventCallback | { type?: string };

/**
 * Parses a Slack Events API request body.
 *
 * @param rawBody Raw request body.
 * @returns Parsed Slack event payload.
 */
export function parseSlackEventPayload(rawBody: string): SlackEventPayload {
  return JSON.parse(rawBody) as SlackEventPayload;
}

/**
 * Extracts an app mention answer from a Slack event callback payload.
 *
 * @param payload Parsed Slack event payload.
 * @returns Slack app mention context or undefined for unsupported events.
 */
export function parseSlackAppMentionContext(
  payload: SlackEventPayload
): SlackAppMentionContext | undefined {
  if (!isSlackEventCallback(payload)) {
    return undefined;
  }

  const event = payload.event;
  if (event?.type !== "app_mention" || !event.channel) {
    return undefined;
  }

  return {
    eventKey: eventKeyFor(payload),
    channelId: event.channel,
    threadTs: event.thread_ts,
    text: normalizeMentionText(event.text ?? "")
  };
}

function isSlackEventCallback(payload: SlackEventPayload): payload is SlackEventCallback {
  return payload.type === "event_callback" && "event" in payload;
}

function eventKeyFor(payload: SlackEventCallback): string {
  const event = payload.event;
  return (
    payload.event_id ??
    [event?.channel, event?.thread_ts, event?.event_ts, event?.text].filter(Boolean).join(":")
  );
}

function normalizeMentionText(text: string): string {
  return text
    .replace(/<@[^>]+>/g, "")
    .trim()
    .replace(/^(?:answer|reply)\s*:?\s*/i, "")
    .trim();
}
