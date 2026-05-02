import { REST, Routes, SlashCommandBuilder } from "discord.js";
import type { AppConfig } from "../../config/env.js";

/**
 * Registers Discord slash commands for the support bot.
 *
 * @param config Application configuration.
 * @returns Promise that resolves after commands are registered.
 */
export async function registerDiscordCommands(config: AppConfig): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discord.token);
  await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), {
    body: buildDiscordCommands().map((command) => command.toJSON())
  });
}

/**
 * Builds command definitions used by registration and docs.
 *
 * @returns Slash command builders.
 */
export function buildDiscordCommands(): Array<{ toJSON(): unknown }> {
  return [
    new SlashCommandBuilder()
      .setName("support-panel")
      .setDescription("Post the Self support ticket button panel")
  ];
}
