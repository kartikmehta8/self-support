export interface SlackCommandContext {
  command: string | undefined;
  text: string;
  channelId: string | undefined;
  threadTs: string | undefined;
}

/**
 * Extracts the fields this service needs from a Slack slash command payload.
 *
 * @param form Parsed Slack command form body.
 * @returns Normalized Slack command context.
 */
export function parseSlackCommandContext(form: URLSearchParams): SlackCommandContext {
  return {
    command: form.get("command") ?? undefined,
    text: form.get("text")?.trim() ?? "",
    channelId: form.get("channel_id") ?? undefined,
    threadTs: form.get("thread_ts") ?? undefined
  };
}
