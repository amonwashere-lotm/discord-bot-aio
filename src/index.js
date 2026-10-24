import { Client, GatewayIntentBits as I, Events, MessageFlags, Partials } from 'discord.js';
import { BRAND, PREFIX } from './brand.js';
import { startPresence, streamingUrl } from './presence.js';
import { awardXp } from './progression.js';
import { Store } from './store.js';
import { commands, parseArgs, resolveCommand } from './commands.js';
import { handleHelp, panel } from './ui.js';
import { handleSetup } from './setup.js';
import { handleVerification } from './verification.js';
import { installProtection } from './protection.js';
if(!process.env.DISCORD_TOKEN) throw new Error('Set DISCORD_TOKEN in .env before starting.');
const client=new Client({intents:[I.Guilds,I.GuildMembers,I.GuildMessages,I.MessageContent,I.GuildModeration],partials:[Partials.Message]});
const presenceUrl=streamingUrl(process.env.STREAMING_URL);
let stopPresence=()=>{};
const store=new Store(process.env.DATABASE_PATH);
const moderate=installProtection(client,store);
const cooldowns=new Map();
const cleanup=setInterval(()=>{for(const [key,time] of cooldowns) if(Date.now()-time>3000) cooldowns.delete(key);},60000); cleanup.unref();
async function execute(source, command, args, slash=false) {
  const guild=source.guild, user=slash?source.user:source.author;
  const reply=payload=>slash?source.editReply(payload):source.channel.send({...payload,allowedMentions:{parse:[]}});
  try {
    const member=await guild.members.fetch({user:user.id,force:true});
    const me=await guild.members.fetchMe();
    if(command.permission&&!source.channel.permissionsFor(member)?.has(command.permission)) throw new Error('You do not have permission to use this command.');
    if(command.botPermission&&!source.channel.permissionsFor(me)?.has(command.botPermission)) throw new Error('I am missing the permission needed for this command.');
    const key=`${guild.id}:${user.id}`;
    if(Date.now()-(cooldowns.get(key)??0)<1500) throw new Error('Please wait a moment between commands.');
    cooldowns.set(key,Date.now());
    const target=async(required=false)=>{
      if(!args.user) { if(required) throw new Error('Choose a member.'); return user; }
      const id=typeof args.user==='string'?args.user.replace(/^<@!?(\d+)>$/,'$1'):args.user.id;
      if(!/^\d{17,20}$/.test(id)) throw new Error('Use a member mention or Discord ID.');
      const found=await guild.members.fetch(id).catch(()=>null);
      if(!found) throw new Error('That user is not a member of this server.');
      return found.user;
    };
    const moderationTarget=async capability=>{
      const u=await target(true), victim=await guild.members.fetch(u.id);
      if([user.id,client.user.id,guild.ownerId].includes(u.id)||(capability&&!victim[capability])||(user.id!==guild.ownerId&&member.roles.highest.comparePositionTo(victim.roles.highest)<=0)) throw new Error('This member is protected by the server role hierarchy.');
      return victim;
    };
    await command.run({category:command.category,client,store,guild,user,channel:source.channel,args,target,moderationTarget,reply,reason:()=>`${user.id}: ${args.reason??'No reason provided'}`.slice(0,500)});
  } catch(error) { await reply(panel(`Unable to complete command: ${error.message}`,store.settings(guild.id),'error')).catch(e=>console.error('Reply failed:',e.message)); }
}
client.on(Events.MessageCreate,async message=>{
  if(!message.guild||message.author.bot||message.webhookId) return;
  try {
    if(await moderate(message)) return;
    const mention=new RegExp(`^<@!?${client.user.id}>\\s*`);
    let input;
    if(message.content.startsWith(PREFIX)) input=message.content.slice(PREFIX.length);
    else if(mention.test(message.content)) input=message.content.replace(mention,'')||'help';
    else { await awardXp(message,store); return; }
    const [name,...tokens]=input.trim().split(/\s+/);
    const command=resolveCommand(name);
    if(!command) return;
    let args;
    try { args=parseArgs(command,tokens); } catch(error) { await message.channel.send(panel(error.message,store.settings(message.guild.id),'error')); return; }
    await execute(message,command,args);
  } catch(error) { console.error('Message handler:',error.message); }
});
client.on(Events.MessageUpdate,async (old,message)=>{
  try {
    if(message.partial) message=await message.fetch();
    if(!message.guild||message.author.bot||message.webhookId||old.content===message.content) return;
    await moderate(message,{edited:true});
  } catch(error) { console.error('Edited-message moderation:',error.message); }
});
client.on(Events.InteractionCreate,async interaction=>{
  try {
    if(await handleSetup(interaction,store)) return;
    if(await handleVerification(interaction,store)) return;
    if(await handleHelp(interaction,commands,store)) return;
    if(!interaction.isChatInputCommand()) return;
    if(!interaction.inGuild()) { await interaction.reply({content:'Use this command in a server.',flags:MessageFlags.Ephemeral}); return; }
    const command=resolveCommand(interaction.commandName);
    if(!command) return;
    await interaction.deferReply();
    const args=Object.fromEntries((command.options??[]).map(o=>[o.name,interaction.options.get(o.name)?.value]));
    await execute(interaction,command,args,true);
  } catch(error) {
    console.error('Interaction handler:',error.message);
    if(!interaction.replied&&!interaction.deferred) await interaction.reply({content:'Unable to process this interaction. Try /help again.',flags:MessageFlags.Ephemeral}).catch(()=>{});
  }
});
client.once(Events.ClientReady,async ready=>{
  stopPresence=startPresence(ready,{url:presenceUrl});
  if(ready.user.username!==BRAND) await ready.user.setUsername(BRAND).catch(error=>console.error('Kuroo profile rename failed:',error.message));
  console.log(`Ready as ${ready.user.tag} · ${commands.length} hybrid commands`);
});
client.on(Events.Error,error=>console.error('Discord client:',error.message));
for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>{stopPresence();client.destroy(); store.db.close(); process.exit(0);});
await client.login(process.env.DISCORD_TOKEN);
