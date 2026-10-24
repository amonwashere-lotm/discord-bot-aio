import { REST, Routes } from 'discord.js';
import { slashCommands } from './commands.js';
if(!process.env.DISCORD_TOKEN||!process.env.CLIENT_ID) throw new Error('Set DISCORD_TOKEN and CLIENT_ID in .env.');
const route=process.env.GUILD_ID?Routes.applicationGuildCommands(process.env.CLIENT_ID,process.env.GUILD_ID):Routes.applicationCommands(process.env.CLIENT_ID);
const data=slashCommands();
await new REST().setToken(process.env.DISCORD_TOKEN).put(route,{body:data});
console.log(`Registered ${data.length} slash commands (including aliases).`);
