import { Client, Events, GatewayIntentBits } from "discord.js";
import type { AppConfig } from "../../config/env.js";
import type { Ticket } from "../../domain/ticket.js";
import type { TicketRepository } from "../../persistence/ticket-repository.js";
import type { SupportQueue } from "../../queue/support-queue.js";
import type { AppLogger } from "../../utils/logger.js";
import type { SlackNotifier } from "../slack/slack-notifier.js";
import { DiscordInteractionHandler } from "./discord-interactions.js";
import { DiscordTicketService } from "./discord-ticket-service.js";
import { DiscordThreadActivityNotifier } from "./discord-thread-activity.js";

/**
 * Discord adapter for ticket intake and support thread messaging.
 */
export class DiscordBot {
  private readonly client: Client;
  private readonly activity: DiscordThreadActivityNotifier;
  private readonly interactions: DiscordInteractionHandler;
  private readonly tickets: DiscordTicketService;

  /**
   * Creates the Discord bot.
   *
   * @param config Application configuration.
   * @param repository Ticket repository.
   * @param queue Support queue.
   * @param slack Slack notifier.
   * @param logger Application logger.
   */
  constructor(
    private readonly config: AppConfig,
    repository: TicketRepository,
    queue: SupportQueue,
    slack: SlackNotifier,
    private readonly logger: AppLogger
  ) {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
    });
    this.tickets = new DiscordTicketService(this.client, this.config);
    this.activity = new DiscordThreadActivityNotifier(repository, slack, this.logger);
    this.interactions = new DiscordInteractionHandler(
      this.config,
      repository,
      queue,
      slack,
      this.tickets
    );
  }

  /**
   * Logs in and starts listening for Discord interactions.
   *
   * @returns Promise that resolves after login.
   */
  async start(): Promise<void> {
    this.client.once(Events.ClientReady, (readyClient) => {
      this.logger.info({ user: readyClient.user.tag }, "Discord bot is ready");
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          await this.interactions.handleCommand(interaction);
        } else if (interaction.isModalSubmit()) {
          await this.interactions.handleModal(interaction);
        } else if (interaction.isButton()) {
          await this.interactions.handleButton(interaction);
        }
      } catch (error) {
        this.logger.error({ error }, "Discord interaction failed");
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "Something went wrong while handling this support action.",
            ephemeral: true
          });
        }
      }
    });

    this.client.on(Events.MessageCreate, async (message) => {
      try {
        await this.activity.handleMessage(message);
      } catch (error) {
        this.logger.error({ error }, "Discord thread activity mirror failed");
      }
    });

    await this.client.login(this.config.discord.token);
  }

  /**
   * Destroys the Discord client connection.
   *
   * @returns Promise that resolves after shutdown.
   */
  async stop(): Promise<void> {
    await this.client.destroy();
  }

  /**
   * Posts a message into a ticket thread.
   *
   * @param ticket Ticket with Discord thread metadata.
   * @param content Message content.
   * @returns Promise that resolves after posting.
   */
  async postThreadMessage(ticket: Ticket, content: string): Promise<void> {
    await this.tickets.postThreadMessage(ticket, content);
  }

  /**
   * Posts a support answer with admin controls.
   *
   * @param ticket Ticket with Discord thread metadata.
   * @param answer Answer text.
   * @returns Promise that resolves after posting.
   */
  async postAnswer(ticket: Ticket, answer: string): Promise<void> {
    await this.tickets.postAnswer(ticket, answer);
  }

  /**
   * Posts a human answer into the linked Discord thread without extra bot copy.
   *
   * @param ticket Ticket with Discord thread metadata.
   * @param answer Human-provided answer.
   * @returns Promise that resolves after posting.
   */
  async postHumanAnswer(ticket: Ticket, answer: string): Promise<void> {
    await this.tickets.postThreadMessage(ticket, answer);
  }
}
