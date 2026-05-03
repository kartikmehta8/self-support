# Setup

This service runs a Discord support bot, mirrors each ticket into Slack, and uses a Mastra support agent with searchable local copies of `selfxyz/self` and `selfxyz/self-docs`.

## 1. Install runtime

Use Node.js 22 or newer.

```bash
npm install
```

## 2. Configure env

```bash
cp .env.example .env
```

Fill these values:

- `OPENAI_API_KEY`: model provider key for Mastra.
- `DISCORD_TOKEN`: bot token from the Discord developer portal.
- `DISCORD_CLIENT_ID`: Discord application client ID.
- `DISCORD_GUILD_ID`: guild used for command registration during testing.
- `DISCORD_SUPPORT_CHANNEL_ID`: channel where support ticket threads are created.
- `DISCORD_ADMIN_ROLE_IDS`: comma-separated Discord role IDs allowed to resolve, reopen, or close tickets.
- `SLACK_BOT_TOKEN`: Slack bot token with `chat:write`, `app_mentions:read`, `channels:read`, and `channels:history` as needed.
- `SLACK_SIGNING_SECRET`: Slack app signing secret for request verification.
- `SLACK_SUPPORT_CHANNEL_ID`: internal team channel where mirrored ticket threads are posted.

Detailed key extraction guides:

- Discord: [DISCORD.md](./DISCORD.md)
- Slack: [SLACK.md](./SLACK.md)

For local development, keep `QUEUE_BACKEND=memory`. For production, set `QUEUE_BACKEND=redis` and provide `REDIS_URL`. `SQLITE_PATH` stores support ticket state, while `MASTRA_SQLITE_PATH` stores Mastra memory/runtime data.

## 3. Register Discord commands

```bash
npm run register:discord
```

## 4. Start the service

```bash
npm run dev
```

Expose `http://localhost:4111/slack/events` with ngrok or a public URL and set it as the Slack Events API request URL.

## 5. Discord workflow

- An admin runs `/support-panel` once to post a persistent **Open Ticket** button in the support channel.
- Users click **Open Ticket** to open a modal with title, problem details, expected behavior, environment, and links.
- The bot creates a private support thread under `DISCORD_SUPPORT_CHANNEL_ID`, adds only the requester, mirrors the ticket to Slack, queues the Mastra answer, and posts the answer in the Discord thread.
- New user activity in the Discord ticket thread is mirrored back into Slack at most once per ticket per hour, so the team sees fresh replies or attachments without noisy repeated pings.
- Admin buttons let the team mark tickets resolved, reopen them, close the Discord thread, or request a refreshed answer.

## 6. Slack workflow

Each Discord ticket is mirrored into `SLACK_SUPPORT_CHANNEL_ID`. Team members can discuss in the Slack thread and then mention the bot with the final answer:

```text
@Self Support Your final answer for the Discord user
```

Slack does not support slash commands from thread reply composers. The app mention event includes the Slack thread context, so the service can find the linked Discord ticket without requiring a ticket ID.

## 7. Repository context

On startup, the service clones or pulls:

- `SELF_REPO_URL`
- `SELF_DOCS_REPO_URL`

It rebuilds a local text index and refreshes it every `REPO_REFRESH_CRON_MS`. The Mastra tools use that index to search source files, docs, and targeted file excerpts while answering support tickets.
