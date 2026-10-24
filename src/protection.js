import { BRAND } from './brand.js';
import { emoji } from './emojis.js';
import { createHash } from 'node:crypto';
import { AuditLogEvent, PermissionFlagsBits as P } from 'discord.js';
export class WindowCounter {
  constructor(windowMs, limit) { this.windowMs=windowMs; this.limit=limit; this.entries=new Map(); }
  hit(key,now=Date.now(),windowMs=this.windowMs,limit=this.limit) {
    const times=(this.entries.get(key)??[]).filter(t=>now-t<windowMs); times.push(now); this.entries.set(key,times.slice(-limit));
    return times.length>=limit;
  }
  sweep(now=Date.now()) { for(const [key,times] of this.entries) if(now-times.at(-1)>=this.windowMs) this.entries.delete(key); }
}
export async function log(guild,store,message) {
  try { store.incident?.(guild.id,message); } catch(error) { console.error('Incident persistence failed:',error.message); }
  const settings=store.settings(guild.id), id=settings.logChannel;
  if(!id) { console.warn(`[security:${guild.id}] ${message}`); return; }
  const channel=await guild.channels.fetch(id).catch(()=>null);
  if(channel?.isTextBased()) await channel.send({content:`${emoji('security',settings)} **${BRAND}** · ${message.slice(0,1800)}`,allowedMentions:{parse:[]}}).catch(e=>console.error('Security log delivery failed:',e.message));
}
export async function handleHoneypot(message,store,recent=new Map()) {
  const settings=store.settings(message.guild.id);
  if(!settings.honeypot||settings.honeypotChannel!==message.channel.id) return false;
  if(message.author.bot||message.webhookId||message.author.id===message.guild.ownerId) return false;
  const member=message.member??await message.guild.members.fetch(message.author.id).catch(()=>null);
  if(settings.honeypotUsers.includes(message.author.id)||member?.permissions.has(P.Administrator)) return false;
  try { await message.delete(); } catch(error) { await log(message.guild,store,`Honeypot deletion failed: ${error.message}`); }
  const key=`${message.guild.id}:${message.author.id}`;
  if(Date.now()-(recent.get(key)??0)<60000) return true;
  recent.set(key,Date.now());
  try {
    if(!member) throw new Error('Member is unavailable.');
    const action=settings.honeypotAction;
    const capability={timeout:'moderatable',kick:'kickable',ban:'bannable'}[action];
    if(!capability||!member[capability]) throw new Error('Cannot punish this member. Check permissions and role hierarchy.');
    const reason='Honeypot: posted in the configured trap channel';
    if(action==='timeout') await member.timeout(settings.honeypotTimeoutMinutes*60000,reason);
    else if(action==='kick') await member.kick(reason);
    else await member.ban({reason});
    await log(message.guild,store,`Honeypot: ${action} applied to ${message.author.id} in ${message.channel.id}.`);
  } catch(error) { await log(message.guild,store,`Honeypot action failed for ${message.author.id}: ${error.message}`); }
  return true;
}
export const dangerousPermissions=P.Administrator|P.ManageGuild|P.ManageChannels|P.ManageRoles|P.ManageWebhooks|P.BanMembers|P.KickMembers|P.MentionEveryone;
export async function dangerousAudit(entry,guild) {
  const actions=new Set([AuditLogEvent.ChannelDelete,AuditLogEvent.ChannelCreate,AuditLogEvent.RoleDelete,AuditLogEvent.RoleCreate,AuditLogEvent.MemberBanAdd,AuditLogEvent.MemberKick,AuditLogEvent.MemberPrune,AuditLogEvent.BotAdd,AuditLogEvent.WebhookCreate,AuditLogEvent.WebhookDelete]);
  if(actions.has(entry.action)) return true;
  if(entry.action===AuditLogEvent.RoleUpdate) {
    const change=entry.changes?.find(c=>c.key==='permissions');
    if(!change||change.new===undefined||change.old===undefined) return false;
    try { return !!((BigInt(change.new)&~BigInt(change.old))&dangerousPermissions); } catch { return false; }
  }
  if(entry.action===AuditLogEvent.MemberRoleUpdate) {
    const added=entry.changes?.find(c=>c.key==='$add')?.new;
    if(!Array.isArray(added)) return false;
    for(const addedRole of added.slice(0,25)) {
      const role=await guild.roles.fetch(addedRole.id).catch(()=>null);
      if(role&&(role.permissions.bitfield&dangerousPermissions)) return true;
    }
  }
  return false;
}
export const normalizeContent=text=>String(text??'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\s+/g,' ').trim();
export class MessageScanner {
  constructor() { this.history=new Map(); }
  scan(message,s,now=Date.now(),edited=false) {
    const key=`${message.guild.id}:${message.author.id}`, text=normalizeContent(message.content), lower=text.toLowerCase();
    const digest=createHash('sha256').update(lower).digest('hex');
    const rows=(this.history.get(key)??[]).filter(r=>now-r.time<120000);
    const prior=message.id?rows.find(r=>r.id===message.id):null;
    if(prior) prior.digest=digest;
    else if(!edited) rows.push({id:message.id,time:now,digest});
    this.history.set(key,rows.slice(-64));
    if(rows.filter(r=>now-r.time<s.spamWindowSeconds*1000).length>=s.spamCount) return {reason:'Message spam',timeout:true};
    if(lower.length>=3&&rows.filter(r=>r.digest===digest&&now-r.time<s.duplicateWindowSeconds*1000).length>=s.duplicateCount) return {reason:'Repeated messages',timeout:true};
    if(s.blockInvites&&/(?:discord\.gg|discord(?:app)?\.com\/invite)\s*\/\s*[\w-]+/i.test(text)) return {reason:'Discord invite'};
    if(s.blockLinks&&/(?:https?:\/\/|www\.)[^\s]+/i.test(text)) return {reason:'External link'};
    if((message.mentions?.users.size??0)+(message.mentions?.roles?.size??0)>=s.mentionLimit||message.mentions?.everyone) return {reason:'Mass mentions'};
    const words=lower.match(/[\p{L}\p{N}_]+/gu)??[];
    if(s.blockedWords.some(word=>word.includes(' ')?` ${words.join(' ')} `.includes(` ${word} `):words.includes(word))) return {reason:'Blocked word or phrase'};
    const letters=text.match(/[A-Za-z]/g)??[];
    if(s.capsPercent>0&&letters.length>=12&&letters.filter(c=>c===c.toUpperCase()).length/letters.length*100>=s.capsPercent) return {reason:'Excessive capitals'};
    return null;
  }
  sweep(now=Date.now()) { for(const [key,rows] of this.history) if(!rows.length||now-rows.at(-1).time>=120000) this.history.delete(key); }
}
export function installProtection(client,store) {
  const scanner=new MessageScanner(), destruction=new WindowCounter(60000,3), seen=new Map(), locked=new Set(), trapped=new Map(), punished=new Map();
  const timer=setInterval(()=>{
    scanner.sweep(); destruction.sweep();
    for(const map of [trapped,punished,seen]) for(const [key,time] of map) if(Date.now()-time>=120000) map.delete(key);
  },60000); timer.unref();
  client.on('guildAuditLogEntryCreate',async (entry,guild)=>{
    try {
      const s=store.settings(guild.id), age=Date.now()-entry.createdTimestamp;
      if(!s.antinuke||!entry.executorId||!Number.isFinite(age)||age>s.antinukeWindowSeconds*1000||age< -5000||seen.has(entry.id)) return;
      if([guild.ownerId,client.user.id,...s.antinukeUsers].includes(entry.executorId)) return;
      seen.set(entry.id,Date.now());
      if(!await dangerousAudit(entry,guild)) return;
      const key=`${guild.id}:${entry.executorId}`;
      if(!destruction.hit(key,Date.now(),s.antinukeWindowSeconds*1000,s.antinukeCount)||locked.has(key)||Date.now()-(punished.get(key)??0)<60000) return;
      locked.add(key); punished.set(key,Date.now());
      try {
        const member=await guild.members.fetch(entry.executorId).catch(()=>null);
        if(!member?.bannable) { await log(guild,store,`Anti-nuke: detected destructive activity by ${entry.executorId}, but cannot ban this member. Check role hierarchy and Ban Members permission.`); return; }
        await member.ban({reason:`Anti-nuke: ${s.antinukeCount} sensitive audit events within ${s.antinukeWindowSeconds} seconds`});
        await log(guild,store,`Anti-nuke: banned ${entry.executorId} after ${s.antinukeCount} sensitive audit events in ${s.antinukeWindowSeconds} seconds. Review the audit log; changed or deleted resources are not restored.`);
      } finally { locked.delete(key); }
    } catch(error) { await log(guild,store,`Anti-nuke failed: ${error.message}`); }
  });
  return async (message,{edited=false}={})=>{
    if(await handleHoneypot(message,store,trapped)) return true;
    const s=store.settings(message.guild.id);
    if(!s.automod||message.member?.permissions.has(P.ManageMessages)||s.automodUsers.includes(message.author.id)||s.automodChannels.includes(message.channel.id)||s.automodRoles.some(id=>message.member?.roles.cache.has(id))) return false;
    const violation=scanner.scan(message,s,Date.now(),edited); if(!violation) return false;
    try { await message.delete(); } catch(error) { await log(message.guild,store,`Automod could not delete a message: ${error.message}`); }
    const key=`am:${message.guild.id}:${message.author.id}`;
    if(violation.timeout&&s.automodTimeoutSeconds>0&&message.member?.moderatable&&Date.now()-(punished.get(key)??0)>=60000) {
      punished.set(key,Date.now());
      await message.member.timeout(s.automodTimeoutSeconds*1000,`Automod: ${violation.reason}`).catch(error=>log(message.guild,store,`Automod timeout failed: ${error.message}`));
    }
    await log(message.guild,store,`Automod: ${violation.reason} by ${message.author.id} in channel ${message.channel.id}.`);
    return true;
  };
}
