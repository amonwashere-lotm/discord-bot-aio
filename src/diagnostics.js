import { PermissionFlagsBits as P, GatewayIntentBits as I } from 'discord.js';
import { safeVerifiedRole } from './verification.js';
import { emoji, emojiDefaults } from './emojis.js';

export async function diagnose(guild,store,client) {
  const s=store.settings(guild.id), me=await guild.members.fetchMe({force:true});
  const checks=[];
  const required=[['View channels',P.ViewChannel],['Send messages',P.SendMessages],['Attach rank/CAPTCHA images',P.AttachFiles]];
  if(s.automod||s.honeypot) required.push(['Delete filtered messages',P.ManageMessages]);
  if(s.automod||s.honeypot&&s.honeypotAction==='timeout') required.push(['Timeout members',P.ModerateMembers]);
  if(s.honeypot&&s.honeypotAction==='kick') required.push(['Kick trap users',P.KickMembers]);
  if(s.honeypot&&s.honeypotAction==='ban') required.push(['Ban trap users',P.BanMembers]);
  if(s.antinuke) required.push(['Read audit log',P.ViewAuditLog],['Ban attackers',P.BanMembers]);
  if(s.verification||Object.keys(s.levelRoles).length) required.push(['Grant member roles',P.ManageRoles]);
  for(const [label,permission] of required) checks.push(`${me.permissions.has(permission)?'✓':'✗'} ${label}`);
  if(client?.options?.intents) checks.push(`${client.options.intents.has(I.MessageContent)?'✓':'✗'} Message Content requested (also enable it in the Developer Portal)`);
  for(const [label,id] of [['Logs',s.logChannel],['Honeypot',s.honeypot?s.honeypotChannel:null],['Verification',s.verification?s.verificationChannel:null],['Member area',s.memberChannel]]) {
    if(!id) { if(label==='Logs'||label==='Honeypot'&&s.honeypot||label==='Verification'&&s.verification) checks.push(`✗ ${label} channel not configured`); continue; }
    const channel=await guild.channels.fetch(id).catch(()=>null);
    checks.push(`${channel?.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages])?'✓':'✗'} ${label} channel access`);
  }
  if(s.verification) {
    try { await safeVerifiedRole(guild,s.verifiedRole); checks.push('✓ Verification role safety'); }
    catch(error) { checks.push(`✗ Verification: ${error.message}`); }
  }
  checks.push('Role hierarchy and enabled portal intents still require a live server check.');
  return checks.join('\n');
}
export async function emojiHealth(client,guild,settings) {
  await guild.emojis?.fetch().catch(()=>null);
  await client.application?.emojis?.fetch().catch(()=>null);
  return Object.keys(emojiDefaults).map(key=>{
    const value=emoji(key,settings), id=value.match(/:(\d+)>$/)?.[1];
    if(!id) return `${key}: standard icon`;
    const found=client.emojis?.cache.get(id)??client.application?.emojis?.cache.get(id);
    return `${key}: ${found?`${found.animated?'animated':'static'} · ${found.available===false?'unavailable':'known to bot'}`:'not found in bot/application cache; check access'} (${id})`;
  }).join('\n');
}
