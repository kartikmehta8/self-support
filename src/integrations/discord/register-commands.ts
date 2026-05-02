import { loadConfig } from "../../config/env.js";
import { registerDiscordCommands } from "./discord-commands.js";

const config = loadConfig();
await registerDiscordCommands(config);
console.log("Discord commands registered.");
