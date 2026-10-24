import { PermissionFlagsBits as P, escapeMarkdown } from 'discord.js';
import { commandPanel } from './ui.js';
import { tuning, parseSetting, listKeys } from './settings.js';
import { log } from './protection.js';
import { safeVerifiedRole } from './verification.js';
import { diagnose, emojiHealth } from './diagnostics.js';
const admin={category:'Admin',permission:P.Administrator};
const user={name:'user',description:'Member',type:'user',required:true};
function economy(c) { if(!c.store.settings(c.guild.id).economy) throw new Error('The economy is disabled in this server.'); }
export const extensionCommands=[
  ...['deposit','withdraw'].map(name=>({name,aliases:[name==='deposit'?'dep':'with'],category:'Economy',description:`${name==='deposit'?'Move wallet coins into':'Move bank coins out of'} your bank.`,usage:'<amount>',options:[{name:'amount',description:'Coins (1–1,000,000,000)',type:'integer',required:true,min:1,max:1e9}],run:async c=>{
    economy(c); const ok=c.store.bankMove(c.guild.id,c.user.id,name,c.args.amount);
    await c.reply(commandPanel(c,ok?`${name==='deposit'?'Deposited':'Withdrew'} **${c.args.amount} coins**.`:'Transfer rejected: insufficient funds or destination balance limit.'));
  }})),
  {name:'work',aliases:['job'],category:'Economy',description:'Earn coins with a persistent work cooldown.',run:async c=>{
    economy(c); const s=c.store.settings(c.guild.id), ok=c.store.work(c.guild.id,c.user.id);
    const next=c.store.user(c.guild.id,c.user.id).last_work+s.workCooldownMinutes*60000;
    await c.reply(commandPanel(c,ok?`You earned **${s.workAmount} coins**.`:`Work unavailable: cooldown ends <t:${Math.ceil(next/1000)}:R>, or your wallet has reached its limit.`));
  }},
  {name:'richlist',aliases:['baltop'],category:'Economy',description:'View the top ten wallet and bank totals.',run:async c=>{
    const rows=c.store.rich(c.guild.id);
    await c.reply(commandPanel(c,`### Wealth leaderboard\n${rows.map((r,index)=>`${index+1}. <@${r.id}> · **${(BigInt(r.balance)+BigInt(r.bank)).toLocaleString()} coins**`).join('\n')||'No balances yet.'}`));
  }},
  {name:'warn',aliases:['strike'],category:'Moderation',permission:P.ModerateMembers,description:'Record a persistent member warning.',usage:'@user <reason>',options:[user,{name:'reason',description:'Warning reason',type:'string',required:true}],run:async c=>{
    const member=await c.moderationTarget();
    const id=c.store.warn(c.guild.id,member.id,c.user.id,c.args.reason);
    await log(c.guild,c.store,`Warning #${id}: ${c.user.id} warned ${member.id}: ${c.args.reason}`);
    await c.reply(commandPanel(c,`Warning **#${id}** recorded for ${escapeMarkdown(member.user.username)}.`));
  }},
  {name:'warnings',aliases:['warns'],category:'Moderation',permission:P.ModerateMembers,description:'Show the ten most recent member warnings.',usage:'@user',options:[user],run:async c=>{
    const target=await c.target(true), rows=c.store.warnings(c.guild.id,target.id);
    await c.reply(commandPanel(c,`### Warnings for ${escapeMarkdown(target.username)}\n${rows.map(r=>`**#${r.id}** · <t:${Math.floor(r.created/1000)}:d> · moderator ${r.moderator}\n${escapeMarkdown(r.reason.slice(0,180))}`).join('\n\n')||'No warnings.'}`));
  }},
  {name:'clearwarnings',aliases:['clearwarns'],category:'Moderation',permission:P.ModerateMembers,description:'Clear a member’s warning history.',usage:'@user',options:[user],run:async c=>{
    const member=await c.moderationTarget(), count=c.store.clearWarnings(c.guild.id,member.id);
    await log(c.guild,c.store,`${c.user.id} cleared ${count} warnings for ${member.id}.`); await c.reply(commandPanel(c,`Cleared **${count} warnings**.`));
  }},
  {...admin,name:'tune',aliases:['configure'],description:'View or change protection, reward and verification settings.',usage:'[setting] [value]',options:[{name:'setting',description:'Setting to inspect or change',type:'string',choices:Object.keys(tuning)},{name:'value',description:'New value (on/off, number, mode, or comma-separated words)',type:'string',rest:true}],run:async c=>{
    const s=c.store.settings(c.guild.id);
    if(!c.args.setting) { await c.reply(commandPanel(c,`### Module settings\n${Object.keys(tuning).map(key=>`**${key}:** ${escapeMarkdown(String(s[key]))||'empty'}`).join('\n')}`)); return; }
    if(c.args.value===undefined) { await c.reply(commandPanel(c,`${c.args.setting}: ${escapeMarkdown(String(s[c.args.setting]))}`)); return; }
    const value=parseSetting(c.args.setting,c.args.value);
    c.store.configure(c.guild.id,{[c.args.setting]:value}); await log(c.guild,c.store,`Admin ${c.user.id} changed ${c.args.setting}.`);
    await c.reply(commandPanel(c,`Updated **${c.args.setting}**. New verification settings apply to existing panels immediately.`));
  }},
  {...admin,name:'allowlist',aliases:['exempt'],description:'Manage user, role or channel exemptions.',usage:'<scope> <add|remove|list> [id]',options:[{name:'scope',description:'Exemption scope',type:'string',required:true,choices:Object.keys(listKeys)},{name:'action',description:'Action',type:'string',required:true,choices:['add','remove','list']},{name:'id',description:'User, role, or channel ID/mention',type:'string'}],run:async c=>{
    if(c.args.scope==='antinuke-user'&&c.user.id!==c.guild.ownerId) throw new Error('Only the server owner can manage anti-nuke exemptions.');
    const key=listKeys[c.args.scope]; if(!Object.hasOwn(listKeys,c.args.scope)) throw new Error('Unknown scope.');
    const values=c.store.settings(c.guild.id)[key];
    if(c.args.action==='list') { await c.reply(commandPanel(c,`**${c.args.scope}:** ${values.join(', ')||'None'}`)); return; }
    const id=String(c.args.id??'').replace(/^<[@#][!&]?(\d+)>$/,'$1');
    if(!/^\d{17,20}$/.test(id)) throw new Error('Provide a Discord ID or mention.');
    if(!['add','remove'].includes(c.args.action)) throw new Error('Choose add, remove, or list.');
    const next=c.args.action==='add'?[...new Set([...values,id])]:values.filter(v=>v!==id);
    if(next.length>50) throw new Error('Maximum 50 exemptions per scope.');
    c.store.configure(c.guild.id,{[key]:next}); await log(c.guild,c.store,`Admin ${c.user.id}: ${c.args.action} ${id} in ${c.args.scope}.`);
    await c.reply(commandPanel(c,'Exemption list updated.'));
  }},
  {...admin,name:'levelrole',aliases:['rewardrole'],description:'Set a safe role reward; omit role to remove it.',usage:'<level> [@role]',options:[{name:'level',description:'Required level',type:'integer',required:true,min:1,max:3162},{name:'role',description:'Permissionless reward role',type:'role'}],run:async c=>{
    const levelRoles={...c.store.settings(c.guild.id).levelRoles};
    if(c.args.role) { const role=await safeVerifiedRole(c.guild,c.args.role); levelRoles[c.args.level]=role.id; }
    else delete levelRoles[c.args.level];
    if(Object.keys(levelRoles).length>10) throw new Error('Maximum ten level-role rewards.');
    c.store.configure(c.guild.id,{levelRoles}); await log(c.guild,c.store,`Admin ${c.user.id} changed level ${c.args.level} role reward.`);
    await c.reply(commandPanel(c,'Level role rewards updated. Eligible members receive roles on their next XP award.'));
  }},
  {...admin,name:'emojihealth',aliases:['checkicons'],description:'Check configured emoji IDs against the bot’s caches.',run:async c=>c.reply(commandPanel(c,`### Emoji health\n${await emojiHealth(c.client,c.guild,c.store.settings(c.guild.id))}`))},
  {...admin,name:'diagnose',aliases:['health'],description:'Check module permissions, channels and verification role.',run:async c=>c.reply(commandPanel(c,`### Server diagnostics\n${await diagnose(c.guild,c.store,c.client)}`))}
];
