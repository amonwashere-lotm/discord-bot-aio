import { PermissionFlagsBits as P, AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import { help, commandPanel } from './ui.js';
import { rankCard, leaderboardCard } from './cards.js';
import { extensionCommands } from './extensions.js';
import { emoji } from './emojis.js';
import { avatarFor } from './avatar.js';
import { adminCommands, settingsText } from './admin.js';
const userOption={name:'user',description:'Member',type:'user'};
export const commands=[
  ...adminCommands,
  ...extensionCommands,
  {name:'help',aliases:['h','commands'],category:'General',description:'Browse and search all commands.',usage:'[query]',options:[{name:'query',description:'Command name, alias or keyword',type:'string',rest:true}],run:async c=>c.reply(help(commands,c.user,c.args.query?'search':'home',c.args.query??'',c.client.user.id,c.store.settings(c.guild.id)))},
  {name:'ping',aliases:['latency'],category:'General',description:'Check the bot connection.',run:async c=>c.reply(commandPanel(c,`Pong · **${Math.max(0,c.client.ws.ping)} ms**`))},
  {name:'rank',aliases:['level','lvl'],category:'Leveling',description:'View your rank with a full avatar background.',options:[userOption],usage:'[@user]',run:async c=>{const u=await c.target(); await c.reply({files:[new AttachmentBuilder(rankCard(u.username,c.store.user(c.guild.id,u.id),c.store.rank(c.guild.id,u.id),await avatarFor(u)),{name:'rank.png'})]});}},
  {name:'leaderboard',aliases:['lb','top'],category:'Leveling',description:'View the top 10 members as an image.',run:async c=>{
    const rows=await Promise.all(c.store.top(c.guild.id).map(async r=>({...r,name:(await c.client.users.fetch(r.id).catch(()=>null))?.username??'Unknown member'})));
    await c.reply({files:[new AttachmentBuilder(leaderboardCard(rows),{name:'leaderboard.png'})]});}},
  {name:'balance',aliases:['bal','wallet'],category:'Economy',description:'Check a member’s coin balance.',options:[userOption],usage:'[@user]',run:async c=>{const u=await c.target(); await c.reply(commandPanel(c,`### Wallet\n${u.username}: ${emoji('coin',c.store.settings(c.guild.id))} **${c.store.user(c.guild.id,u.id).balance.toLocaleString()} wallet coins** · ${emoji('bank',c.store.settings(c.guild.id))} **${c.store.user(c.guild.id,u.id).bank.toLocaleString()} bank coins**`));}},
  {name:'daily',aliases:['claim'],category:'Economy',description:'Claim 500 coins every 24 hours.',run:async c=>{if(!c.store.settings(c.guild.id).economy) throw new Error('The economy is disabled in this server.'); const s=c.store.settings(c.guild.id), ok=c.store.daily(c.guild.id,c.user.id); await c.reply(commandPanel(c,ok?`You collected **${s.dailyAmount} coins**.`:`Your next daily is <t:${Math.ceil((c.store.user(c.guild.id,c.user.id).last_daily+s.dailyCooldownMinutes*60000)/1000)}:R>.`));}},
  {name:'pay',aliases:['give','transfer'],category:'Economy',description:'Send coins to another member.',usage:'@user <amount>',options:[{...userOption,required:true},{name:'amount',description:'Coins to send',type:'integer',required:true,min:1,max:1e9}],run:async c=>{
    if(!c.store.settings(c.guild.id).economy) throw new Error('The economy is disabled in this server.');
    const u=await c.target(true); if(u.bot) throw new Error('Choose a human member.');
    const ok=c.store.transfer(c.guild.id,c.user.id,u.id,c.args.amount); await c.reply(commandPanel(c,ok?`Sent **${c.args.amount} coins** to ${u.username}.`:'Transfer rejected. Check the amount and your balance; you cannot pay yourself.'));}},
  {name:'settings',aliases:['config'],category:'Security',description:'View server protection settings.',permission:P.ManageGuild,run:async c=>c.reply(commandPanel(c,settingsText(c.store.settings(c.guild.id))))},
  ...['automod','antinuke'].map(name=>({name,aliases:name==='automod'?['am']:['an'],category:'Security',description:`Enable or disable ${name}.`,permission:P.Administrator,usage:'<on|off>',options:[{name:'state',description:'Protection state',type:'string',required:true,choices:['on','off']}],run:async c=>{
    if(!['on','off'].includes(c.args.state)) throw new Error('Choose on or off.');
    c.store.configure(c.guild.id,{[name]:c.args.state==='on'}); await c.reply(commandPanel(c,`**${name}** is now **${c.args.state}**.`));}})),
  {name:'logchannel',aliases:['setlogs'],category:'Security',description:'Set the current channel for security alerts.',permission:P.Administrator,run:async c=>{const s=c.store.settings(c.guild.id); if(c.channel.id===s.honeypotChannel||c.channel.id===s.verificationChannel) throw new Error('Use a separate channel for security logs.'); c.store.configure(c.guild.id,{logChannel:c.channel.id}); await c.reply(commandPanel(c,'Security alerts will be sent here.'));}},
  {name:'purge',aliases:['clear'],category:'Moderation',description:'Delete up to 100 recent messages (under 14 days old).',permission:P.ManageMessages,botPermission:P.ManageMessages,usage:'<amount>',options:[{name:'amount',description:'Number of messages',type:'integer',required:true,min:1,max:100}],run:async c=>{
    if(!c.channel.bulkDelete) throw new Error('This channel does not support bulk deletion.');
    const deleted=await c.channel.bulkDelete(c.args.amount,true); await c.reply(commandPanel(c,`Deleted **${deleted.size}** messages.`));}},
  {name:'timeout',aliases:['mute'],category:'Moderation',description:'Temporarily stop a member from interacting.',permission:P.ModerateMembers,botPermission:P.ModerateMembers,usage:'@user <minutes> [reason]',options:[{...userOption,required:true},{name:'minutes',description:'Duration in minutes',type:'integer',required:true,min:1,max:40320},{name:'reason',description:'Audit reason',type:'string'}],run:async c=>{
    const target=await c.moderationTarget('moderatable'); await target.timeout(c.args.minutes*60000,c.reason()); await c.reply(commandPanel(c,`Timed out ${target.user.username} for ${c.args.minutes} minutes.`));}},
  {name:'kick',aliases:['boot'],category:'Moderation',description:'Remove a member from the server.',permission:P.KickMembers,botPermission:P.KickMembers,usage:'@user [reason]',options:[{...userOption,required:true},{name:'reason',description:'Audit reason',type:'string'}],run:async c=>{const target=await c.moderationTarget('kickable'); await target.kick(c.reason()); await c.reply(commandPanel(c,`Kicked ${target.user.username}.`));}},
  {name:'ban',aliases:['exile'],category:'Moderation',description:'Ban a member from the server.',permission:P.BanMembers,botPermission:P.BanMembers,usage:'@user [reason]',options:[{...userOption,required:true},{name:'reason',description:'Audit reason',type:'string'}],run:async c=>{const target=await c.moderationTarget('bannable'); await target.ban({reason:c.reason()}); await c.reply(commandPanel(c,`Banned ${target.user.username}.`));}}
];
export function resolveCommand(name) {
  const normalized=name.toLowerCase();
  return commands.find(command=>command.name===normalized||command.aliases.includes(normalized));
}
export function slashCommands() {
  return commands.flatMap(command=>[command.name,...command.aliases].map(name=>slashData(command,name)));
}
export function slashData(command, name=command.name) {
  const data=new SlashCommandBuilder().setName(name).setDescription(command.description).setDMPermission(false);
  if(command.permission) data.setDefaultMemberPermissions(command.permission);
  for(const option of command.options??[]) {
    const method={user:'addUserOption',integer:'addIntegerOption',string:'addStringOption',channel:'addChannelOption',role:'addRoleOption'}[option.type];
    data[method](o=>{
      o.setName(option.name).setDescription(option.description).setRequired(!!option.required);
      if(option.type==='channel') o.addChannelTypes(0);
      if(option.type==='string') o.setMaxLength(option.name==='reason'?500:1000);
      if(option.min!==undefined) o.setMinValue(option.min).setMaxValue(option.max);
      if(option.choices) o.addChoices(...option.choices.map(v=>({name:v,value:v})));
      return o;
    });
  }
  return data.toJSON();
}
export function parseArgs(command, tokens) {
  const result={};
  for (const option of command.options??[]) {
    const raw=(option.name==='reason'||option.rest)?tokens.splice(0).join(' '):tokens.shift();
    if(!raw) { if(option.required) throw new Error(`Missing ${option.name}. Usage: ?${command.name} ${command.usage??''}`); continue; }
    const value=option.type==='integer'?Number(raw):raw;
    if(option.choices&&!option.choices.includes(value)) throw new Error(`${option.name} must be one of: ${option.choices.join(', ')}.`);
    if(option.type==='integer'&&(!Number.isSafeInteger(value)||value<option.min||value>option.max)) throw new Error(`${option.name} must be an integer from ${option.min} to ${option.max}.`);
    result[option.name]=value;
  }
  return result;
}
