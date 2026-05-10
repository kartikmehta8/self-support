# Discord Setup

Use this guide to create a Discord application, invite the bot to your server, and fill the Discord values in `.env`.

## Values You Need

```bash
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DISCORD_SUPPORT_CHANNEL_ID=
DISCORD_ADMIN_ROLE_IDS=
```

## 1. Create The Discord App

1. Open the Discord Developer Portal: https://discord.com/developers/applications
2. Click **New Application**.
3. Name it, for example `Self Support Bot`.
4. Open the application.

## 2. Get `DISCORD_CLIENT_ID`

1. In the app, open **General Information**.
2. Copy **Application ID**.
3. Put it in `.env`:

```bash
DISCORD_CLIENT_ID=123456789012345678
```

Discord also calls this the Client ID.

## 3. Create The Bot And Get `DISCORD_TOKEN`

1. In the app, open **Bot**.
2. Click **Add Bot** if one does not exist yet.
3. Under **Token**, click **Reset Token** or **View Token**.
4. Copy the token immediately.
5. Put it in `.env`:

```bash
DISCORD_TOKEN=your_bot_token_here
```

Keep this secret. If it is pasted into chat, committed, or exposed, reset it in the Developer Portal.

## 4. Gateway Intents

This app uses slash commands, modals, buttons, guilds, channels, threads, and message events inside ticket threads. It only mirrors that new activity happened, and does not read normal message content, so it does not need the privileged **Message Content Intent**.

In **Bot > Privileged Gateway Intents**, leave these off unless you later add features that read normal message content:

- Presence Intent
- Server Members Intent
- Message Content Intent

If you later add features that inspect the actual text of Discord messages, enable **Message Content Intent** and update the Discord client intents in code.

## 5. Invite The Bot To Your Server

1. Open **OAuth2 > URL Generator**.
2. Under **Scopes**, select:
   - `bot`
   - `applications.commands`
3. Under **Bot Permissions**, select:
   - View Channels
   - Send Messages
   - Create Private Threads
   - Send Messages in Threads
   - Manage Threads
   - Read Message History
   - Use Slash Commands
4. Copy the generated URL.
5. Open it in your browser and invite the bot to your Discord server.

If the portal only shows an integer instead of a URL, that integer is the permissions bitfield. Use this manual invite URL instead:

```text
https://discord.com/oauth2/authorize?client_id=DISCORD_CLIENT_ID&permissions=362924805120&integration_type=0&scope=bot+applications.commands
```

Replace `DISCORD_CLIENT_ID` with the Application ID from **General Information**. For example:

```text
https://discord.com/oauth2/authorize?client_id=123456789012345678&permissions=362924805120&integration_type=0&scope=bot+applications.commands
```

`Create Private Threads` keeps new tickets out of the public channel. `Manage Threads` is used so the bot can archive/close support threads.

## 6. Enable Developer Mode

You need Developer Mode to copy server, channel, and role IDs.

1. In Discord, open **User Settings**.
2. Go to **Advanced**.
3. Turn on **Developer Mode**.

## 7. Get `DISCORD_GUILD_ID`

1. In Discord, right-click your server icon.
2. Click **Copy Server ID**.
3. Put it in `.env`:

```bash
DISCORD_GUILD_ID=123456789012345678
```

Discord API docs often call a server a guild.

## 8. Create Support Channel And Get `DISCORD_SUPPORT_CHANNEL_ID`

1. Create or choose a text channel, for example `#support`.
2. Make sure the bot can view the channel and create private threads there.
3. Right-click the channel.
4. Click **Copy Channel ID**.
5. Put it in `.env`:

```bash
DISCORD_SUPPORT_CHANNEL_ID=123456789012345678
```

The bot creates private ticket threads inside this channel and adds only the requester.

## 9. Get `DISCORD_ADMIN_ROLE_IDS`

Admins can click ticket buttons like **Resolved**, **Reopen**, **Refresh Answer**, and **Close**.

1. In Discord, open **Server Settings > Roles**.
2. Right-click the support/admin role.
3. Click **Copy Role ID**.
4. For one role:

```bash
DISCORD_ADMIN_ROLE_IDS=123456789012345678
```

For multiple roles, separate IDs with commas:

```bash
DISCORD_ADMIN_ROLE_IDS=123456789012345678,987654321098765432
```

If you leave `DISCORD_ADMIN_ROLE_IDS` empty, the app currently allows any user to use admin buttons. For real testing, set this value.

## 10. Register Slash Commands

After `.env` is filled:

```bash
npm run register:discord
```

This registers guild commands for the server in `DISCORD_GUILD_ID`.

The app creates:

- `/support-panel`

Guild command registration is fast and useful for testing. Global commands can take longer to propagate, so this project uses guild registration.

## 11. Post The Ticket Button Panel

After the bot is running, an admin should run this once in Discord:

```text
/support-panel
```

The bot posts a persistent **Open Ticket** button in `DISCORD_SUPPORT_CHANNEL_ID`. Users click that button to open the ticket modal, so they do not need to discover or run slash commands.

If you re-register commands after this change, the old `/support` command is removed from the guild command list.

## 12. Start And Test

```bash
npm run dev
```

In Discord:

1. As an admin, run `/support-panel` if the button panel is not already posted.
2. Click **Open Ticket**.
3. Submit the modal.
4. Confirm a new private thread opens for the requester.
5. Confirm the bot posts the ticket details.
6. Confirm image links appear as normal text without Discord embed previews, or attach an image directly in the private ticket thread.
7. Confirm admin buttons appear.
8. Click **Close** as an admin and confirm the thread is archived and locked. Regular users should not be able to send more messages after close.
