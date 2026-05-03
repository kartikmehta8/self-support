const DEFAULT_TTL_MS = 10 * 60 * 1000;

/**
 * Tracks recently handled Slack event IDs to ignore retries.
 */
export class SlackEventDeduper {
  private readonly events = new Map<string, number>();

  /**
   * Creates a Slack event deduper.
   *
   * @param ttlMs Time to keep handled event IDs.
   */
  constructor(private readonly ttlMs = DEFAULT_TTL_MS) {}

  /**
   * Marks an event as seen if it has not been handled recently.
   *
   * @param eventKey Stable Slack event key.
   * @returns True when this is the first recent sighting.
   */
  markFirstSeen(eventKey: string): boolean {
    this.prune();
    if (this.events.has(eventKey)) {
      return false;
    }

    this.events.set(eventKey, Date.now());
    return true;
  }

  private prune(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [eventKey, seenAt] of this.events) {
      if (seenAt < cutoff) {
        this.events.delete(eventKey);
      }
    }
  }
}
