# Slack Setup

Use this guide to create a Slack app, collect the Slack keys, configure event subscriptions, and connect internal Slack threads back to Discord support tickets.

## Values You Need

```bash
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_SUPPORT_CHANNEL_ID=
```

## 1. Create The Slack App

1. Open https://api.slack.com/apps
2. Click **Create New App**.
3. Choose **From scratch**.
4. Name it, for example `Self Support Bot`.
5. Pick the workspace where Self core devs will discuss support tickets.
6. Click **Create App**.

## 2. Get `SLACK_SIGNING_SECRET`

Slack uses the Signing Secret to verify event and command requests. Do not use the old verification token.

1. In your Slack app, open **Basic Information**.
2. Find **App Credentials**.
3. Copy **Signing Secret**.
4. Put it in `.env`:

```bash
SLACK_SIGNING_SECRET=your_signing_secret_here
```

This app verifies `x-slack-signature` and `x-slack-request-timestamp` in `src/integrations/slack/verify.ts`.

## 3. Add Bot Token Scopes

1. Open **OAuth & Permissions**.
2. Scroll to **Scopes**.
3. Under **Bot Token Scopes**, add:
   - `chat:write`
   - `app_mentions:read`
   - `channels:read`
   - `channels:history`

If your support channel is private, also add:

- `groups:read`
- `groups:history`

Why these scopes:

- `chat:write`: post mirrored Discord tickets and status updates.
- `app_mentions:read`: receive threaded app mentions used to post team answers.
- `channels:read`: see public channel metadata.
- `channels:history`: access public channel/thread context if needed.
- `groups:*`: same idea for private channels.

## 4. Install App And Get `SLACK_BOT_TOKEN`

1. Still in **OAuth & Permissions**, click **Install to Workspace**.
2. Approve the app.
3. After installation, return to **OAuth & Permissions**.
4. Copy **Bot User OAuth Token**.
5. Put it in `.env`:

```bash
SLACK_BOT_TOKEN=xoxb-your-token-here
```

Slack bot tokens usually start with `xoxb-`.

If you change scopes later, reinstall the app so the token receives the new permissions.

## 5. Create Or Choose The Internal Support Channel

Create a channel for mirrored Discord tickets, for example:

```text
#self-support-triage
```

Invite the app to the channel:

```text
/invite @Self Support Bot
```

The bot must be a member of the channel before it can post there.

The app posts each mirrored ticket and the support answer into the internal Slack thread. It disables Slack link previews/unfurls for mirrored Discord links and bot replies, so Slack should show plain message content without expanding previews.

When the Discord requester adds new messages or attachments in the ticket thread, the app posts a compact activity notice into the linked Slack thread. These notices are throttled to once per ticket per hour.

## 6. Get `SLACK_SUPPORT_CHANNEL_ID`

1. Open the Slack channel.
2. Click the channel name at the top.
3. Scroll or open **About**.
4. Copy **Channel ID**.
5. Put it in `.env`:

```bash
SLACK_SUPPORT_CHANNEL_ID=C0123456789
```

Public channel IDs often start with `C`. Private channel IDs often start with `G`.

## 7. Expose Your Local Server

Slack needs a public HTTPS URL for event subscriptions.

For local testing:

```bash
ngrok http 4111
```

Copy the HTTPS forwarding URL, for example:

```text
https://abc123.ngrok-free.app
```

The Slack event endpoint in this app is:

```text
https://abc123.ngrok-free.app/slack/events
```

Keep the terminal running. If you stop and restart free ngrok, the URL may change and you must update Slack again.

## 8. Subscribe To Threaded App Mentions

Slack does not support slash commands in thread reply composers. This app uses threaded bot mentions instead, which lets core devs answer from the mirrored Slack ticket thread without typing a ticket ID.

1. In the Slack app, open **Event Subscriptions**.
2. Turn **Enable Events** on.
3. Set **Request URL** to `https://your-ngrok-url/slack/events`.
4. Under **Subscribe to bot events**, add `app_mention`.
5. Save changes and reinstall the app if Slack asks.

Example Request URL:

```text
https://abc123.ngrok-free.app/slack/events
```

Usage:

```text
@Self Support The issue is caused by...
```

Run this mention inside the mirrored Slack ticket thread. The app uses the Slack channel and thread timestamp to find the linked ticket, then posts the answer into the Discord thread.

## 9. Update The Slack Event URL After Ngrok Changes

If ngrok gives you a new URL:

1. Open https://api.slack.com/apps
2. Select your `Self Support Bot` app.
3. Open **Event Subscriptions**.
4. Replace **Request URL** with:

```text
https://NEW_NGROK_URL/slack/events
```

5. Click **Save Changes**.

The event subscription must point to this endpoint:

```text
/slack/events
```

## 10. Restart The App

After editing `.env`:

```bash
npm run dev
```

Open:

```text
http://localhost:4111/health
```

You should see:

```json
{ "ok": true }
```

## 11. End-To-End Test

1. Open Discord.
2. Click **Open Ticket**.
3. Submit the modal.
4. Confirm a Slack message appears in `SLACK_SUPPORT_CHANNEL_ID`.
5. In Slack, reply in the thread if the team needs discussion.
6. Mention the bot with the final answer:

```text
@Self Support Final answer from the team...
```

7. Confirm the answer appears in the Discord ticket thread.
8. Add another message or attachment in the Discord ticket thread and confirm Slack receives one new activity notice.
