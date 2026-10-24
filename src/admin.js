import { PermissionFlagsBits as P } from 'discord.js';
import { panel } from './ui.js';
import { emoji, emojiDefaults, parseEmoji } from './emojis.js';
import { startSetup } from './setup.js';
import { textChannel, safeVerifiedRole, publishVerification } from './verification.js';
import { log } from './protection.js';

const admin={category:'Admin',permission:P.Administrator};
const user={name:'user',description:'Member to update',type:'user',required:true};
const amount={name:'amount',description:'Amount (0–1,000,000,000)',type:'integer',required:true,min:0,max:1e9};
const state={name:'state',description:'Enable or disable',type:'string',required:true,choices:['on','off']};
export function settingsText(s) {
  return `### Server settings\n${['automod','antinuke','leveling','economy','honeypot','verification'].map(key=>`**${key}:** ${s[key]?'On':'Off'}`).join('\n')}\n**Logs:** ${s.logChannel?`<#${s.logChannel}>`:'Not configured'}\n**Honeypot channel:** ${s.honeypotChannel?`<#${s.honeypotChannel}>`:'Not configured'}\n**Honeypot action:** ${s.honeypotAction}\n**Verification channel:** ${s.verificationChannel?`<#${s.verificationChannel}>`:'Not configured'}\n**Verified role:** ${s.verifiedRole?`<@&${s.verifiedRole}>`:'Not configured'}\n**Member area:** ${s.memberChannel?`<#${s.memberChannel}>`:'Not configured'}\n\nUse /setup for the guided wizard, /setemoji for icons, or browse the Admin category in /help.`;
}
export const adminCommands=[
  ...['xp','balance'].flatMap(field=>['add','remove','set','reset'].map(operation=>({
    ...admin,name:`${operation}${field}`,aliases:[`${operation}${field==='xp'?'exp':'coins'}`],
    description:`${operation[0].toUpperCase()+operation.slice(1)} a member’s ${field==='xp'?'XP':'coin balance'}.`,
    usage:`@user${operation==='reset'?'':' <amount>'}`, options:operation==='reset'?[user]:[user,amount],
    run:async c=>{
      const target=await c.target(true);
      const value=c.store.adjust(c.guild.id,target.id,field,operation,c.args.amount??0);
      await log(c.guild,c.store,`Admin ${c.user.id}: ${operation} ${field} ${c.args.amount??0} for ${target.id}; result ${value}.`);
      await c.reply(panel(`${emoji('success',c.store.settings(c.guild.id))} Updated ${target.username}: **${value.toLocaleString()} ${field==='xp'?'XP':'coins'}**.`));
    }
  }))),
  {...admin,name:'setlevel',aliases:['setlvl'],description:'Set a member’s level at its starting XP.',usage:'@user <level>',options:[user,{name:'level',description:'Level (0–3162)',type:'integer',required:true,min:0,max:3162}],run:async c=>{
    const target=await c.target(true), xp=c.store.adjust(c.guild.id,target.id,'xp','set',c.args.level**2*100);
    await log(c.guild,c.store,`Admin ${c.user.id}: set level ${c.args.level} (${xp} XP) for ${target.id}.`);
    await c.reply(panel(`Set ${target.username} to **level ${c.args.level}** (${xp} XP).`));
  }},
  {...admin,name:'resetdaily',aliases:['resetclaim'],description:'Reset a member’s daily reward cooldown.',usage:'@user',options:[user],run:async c=>{
    const target=await c.target(true); c.store.resetDaily(c.guild.id,target.id);
    await log(c.guild,c.store,`Admin ${c.user.id}: reset daily cooldown for ${target.id}.`);
    await c.reply(panel(`Reset the daily cooldown for ${target.username}.`));
  }},
  ...['leveling','economy'].map(name=>({...admin,name,aliases:[name==='leveling'?'xp-system':'eco'],description:`Enable or disable the ${name} system.`,usage:'<on|off>',options:[state],run:async c=>{
    if(!['on','off'].includes(c.args.state)) throw new Error('Choose on or off.');
    c.store.configure(c.guild.id,{[name]:c.args.state==='on'});
    await log(c.guild,c.store,`Admin ${c.user.id}: ${name} ${c.args.state}.`);
    await c.reply(panel(`${name} is now **${c.args.state}**. Stored XP and balances are preserved.`));
  }})),
  {...admin,name:'setemoji',aliases:['emoji'],description:'Set or clear a guild emoji override by key.',usage:'<key> <id|markup|clear>',options:[{name:'key',description:'Icon to configure',type:'string',required:true,choices:Object.keys(emojiDefaults)},{name:'value',description:'Emoji ID, <:name:id>, <a:name:id>, or clear',type:'string',required:true}],run:async c=>{
    if(!Object.hasOwn(emojiDefaults,c.args.key)) throw new Error(`Choose an emoji key: ${Object.keys(emojiDefaults).join(', ')}.`);
    const value=c.args.value==='clear'?null:parseEmoji(c.args.value,c.args.key);
    const emojis={...c.store.settings(c.guild.id).emojis};
    if(value===null) delete emojis[c.args.key]; else emojis[c.args.key]=value;
    const settings=c.store.configure(c.guild.id,{emojis});
    await c.reply(panel(`Updated **${c.args.key}**: ${emoji(c.args.key,settings)}. Existing messages update when reopened or republished.`));
  }},
  {...admin,name:'emojis',aliases:['icons'],description:'Preview all configured UI emoji keys.',run:async c=>c.reply(panel(`### UI emojis\n${Object.keys(emojiDefaults).map(key=>`${emoji(key,c.store.settings(c.guild.id))} · **${key}**`).join('\n')}\n\nUse /setemoji or edit config/emojis.json and restart.`))},
  {...admin,name:'honeypot',aliases:['trap'],description:'Configure the trap channel and punishment.',usage:'<on|off> [#channel] [timeout|kick|ban]',options:[state,{name:'channel',description:'Trap text channel',type:'channel'},{name:'action',description:'Punishment (default: 1-hour timeout)',type:'string',choices:['timeout','kick','ban']}],run:async c=>{
    if(!['on','off'].includes(c.args.state)) throw new Error('Choose on or off.');
    if(c.args.state==='off') { c.store.configure(c.guild.id,{honeypot:false}); await c.reply(panel('Honeypot disabled.')); return; }
    const settings=c.store.settings(c.guild.id), id=c.args.channel??settings.honeypotChannel;
    if(!id) throw new Error('Select a dedicated honeypot channel, or use /setup.');
    const channel=await textChannel(c.guild,id), action=c.args.action??settings.honeypotAction;
    if(!['timeout','kick','ban'].includes(action)) throw new Error('Choose timeout, kick, or ban.');
    if([settings.logChannel,settings.verificationChannel].includes(channel.id)) throw new Error('Honeypot must use a separate channel from logs and verification.');
    const me=await c.guild.members.fetchMe(), needed=[P.ViewChannel,P.SendMessages,P.ManageMessages,{timeout:P.ModerateMembers,kick:P.KickMembers,ban:P.BanMembers}[action]];
    if(!channel.permissionsFor(me)?.has(needed)) throw new Error('I am missing channel access, Manage Messages, or the punishment permission.');
    await channel.send({content:`Do not send messages here. This is a honeypot. Posting triggers ${action==='timeout'?'a 1-hour timeout':`a ${action}`}. Administrators are exempt.`,allowedMentions:{parse:[]}});
    c.store.configure(c.guild.id,{honeypot:true,honeypotChannel:channel.id,honeypotAction:action});
    await log(c.guild,c.store,`Admin ${c.user.id}: enabled honeypot in ${channel.id} with ${action}.`);
    await c.reply(panel(`Honeypot enabled in <#${channel.id}> with **${action}**.`));
  }},
  {...admin,name:'verification',aliases:['verifyconfig'],description:'Enable or disable a Verified-role button panel.',usage:'<on|off> [#channel] [@role]',options:[state,{name:'channel',description:'Verification text channel',type:'channel'},{name:'role',description:'Permissionless Verified role',type:'role'}],run:async c=>{
    if(!['on','off'].includes(c.args.state)) throw new Error('Choose on or off.');
    if(c.args.state==='off') { c.store.configure(c.guild.id,{verification:false}); await c.reply(panel('Verification disabled. Existing role assignments are preserved.')); return; }
    const s=c.store.settings(c.guild.id), channel=await textChannel(c.guild,c.args.channel??s.verificationChannel), role=await safeVerifiedRole(c.guild,c.args.role??s.verifiedRole);
    if([s.honeypotChannel,s.logChannel].includes(channel.id)) throw new Error('Verification must use a separate channel from logs and honeypot.');
    const message=await publishVerification(c.guild,channel,role,s);
    c.store.configure(c.guild.id,{verification:true,verificationChannel:channel.id,verifiedRole:role.id,verificationMessage:message.id});
    await log(c.guild,c.store,`Admin ${c.user.id}: verification panel ${message.id}, channel ${channel.id}, role ${role.id}.`);
    await c.reply(panel(`Verification panel posted in <#${channel.id}>. The previous panel is inactive. Gate member channels using this role in channel/category permissions.`));
  }},
  {...admin,name:'setup',aliases:['wizard'],description:'Configure all systems in a guided setup wizard.',run:async c=>c.reply(startSetup(c.guild.id,c.user.id,c.store.settings(c.guild.id)))},
  {name:'untimeout',aliases:['unmute'],category:'Moderation',description:'Remove a member’s active timeout.',permission:P.ModerateMembers,botPermission:P.ModerateMembers,usage:'@user [reason]',options:[user,{name:'reason',description:'Audit reason',type:'string'}],run:async c=>{
    const target=await c.moderationTarget('moderatable'); await target.timeout(null,c.reason()); await c.reply(panel(`Removed the timeout for ${target.user.username}.`));
  }},
  {name:'unban',aliases:['pardon'],category:'Moderation',description:'Unban a user by Discord ID.',permission:P.BanMembers,botPermission:P.BanMembers,usage:'<id> [reason]',options:[{name:'id',description:'Banned user ID',type:'string',required:true},{name:'reason',description:'Audit reason',type:'string'}],run:async c=>{
    if(!/^\d{17,20}$/.test(c.args.id)) throw new Error('Provide a valid Discord user ID.');
    await c.guild.members.unban(c.args.id,c.reason()); await c.reply(panel(`Unbanned user ${c.args.id}.`));
  }}
];
