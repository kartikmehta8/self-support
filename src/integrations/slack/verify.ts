import { createHmac, timingSafeEqual } from "node:crypto";

const FIVE_MINUTES_IN_SECONDS = 60 * 5;

/**
 * Verifies a Slack request signature.
 *
 * @param signingSecret Slack signing secret.
 * @param timestamp Slack request timestamp header.
 * @param signature Slack signature header.
 * @param rawBody Raw request body.
 * @returns True when the signature is valid and fresh.
 */
export function verifySlackSignature(
  signingSecret: string,
  timestamp: string | undefined,
  signature: string | undefined,
  rawBody: string
): boolean {
  if (!timestamp || !signature) {
    return false;
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > FIVE_MINUTES_IN_SECONDS) {
    return false;
  }

  const base = `v0:${timestamp}:${rawBody}`;
  const digest = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;
  const expected = Buffer.from(digest);
  const actual = Buffer.from(signature);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
