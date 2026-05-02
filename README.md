# Self Helper Bot

Self Helper Bot is a support workflow for Self Labs that connects the places where users ask for help with the places where the team actually resolves it.

Users can open a support ticket from Discord, describe what is going wrong, and continue the conversation in a private thread. At the same time, the ticket is mirrored into Slack so core contributors can see it quickly, discuss it internally, and send a clear answer back without losing the original Discord context.

## Why This Exists

Support for developer products often gets split across too many surfaces. A user asks a detailed question in Discord, the people with the answer are focused elsewhere, and the final response depends on someone manually connecting the dots.

This project is meant to remove that friction.

It gives users a familiar place to ask for help, gives the team a focused internal place to triage it, and uses Self's code and documentation context to help produce better answers faster.

## What It Helps With

- Capturing support requests with enough context to debug them.
- Keeping Discord tickets organized in dedicated threads.
- Giving core developers visibility in Slack without asking them to watch Discord all day.
- Preserving a direct path from internal discussion back to the user.
- Reducing repeated manual investigation by grounding answers in current Self code and docs.

## How It Fits The Team

The bot is designed around the real support flow:

1. A user asks for help in Discord.
2. The request becomes a structured ticket.
3. The ticket is mirrored to Slack for internal review.
4. The bot uses Self repository and documentation context to help draft an answer.
5. The team can review, discuss, resolve, reopen, or close the ticket.

The goal is not to replace the team. It is to keep the busywork out of the way so the team can focus on the judgment calls that actually need a human.

## Project Guides

Setup and operational details live in the `docs/` folder:

- `docs/SETUP.md`
- `docs/DISCORD.md`
- `docs/SLACK.md`
