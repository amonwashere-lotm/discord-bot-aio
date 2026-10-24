import { AuditLogEvent, PermissionFlagsBits as P } from 'discord.js';
export class WindowCounter {
  constructor(windowMs, limit) { this.windowMs=windowMs; this.limit=limit; this.entries=new Map(); }
  hit(key,now=Date.now()) {
    const times=(this.entries.get(key)??[]).filter(t=>now-t<this.windowMs); times.push(now); this.entries.set(key,times);
    return times.length>=this.limit;
  }
  sweep(now=Date.now()) { for(const [key,times] of this.entries) if(now-times.at(-1)>=this.windowMs) this.entries.delete(key); }
}
export async function log(guild,store,message) {
  const id=store.settings(guild.id).logChannel;
  if(!id) { console.warn(`[security:${guild.id}] ${message}`); return; }
  const channel=await guild.channels.fetch(id).catch(()=>null);
  if(channel?.isTextBased()) await channel.send({content:message.slice(0,1900),allowedMentions:{parse:[]}}).catch(e=>console.error('Security log delivery failed:',e.message));
}
export async function handleHoneypot(message,store,recent=new Map()) {
  const settings=store.settings(message.guild.id);
  if(!settings.honeypot||settings.honeypotChannel!==message.channel.id) return false;
  if(message.author.bot||message.webhookId||message.author.id===message.guild.ownerId) return false;
  const member=message.member??await message.guild.members.fetch(message.author.id).catch(()=>null);
  if(member?.permissions.has(P.Administrator)) return false;
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
    if(action==='timeout') await member.timeout(3600000,reason);
    else if(action==='kick') await member.kick(reason);
    else await member.ban({reason});
    await log(message.guild,store,`Honeypot: ${action} applied to ${message.author.id} in ${message.channel.id}.`);
  } catch(error) { await log(message.guild,store,`Honeypot action failed for ${message.author.id}: ${error.message}`); }
  return true;
}
export function installProtection(client,store) {
  const spam=new WindowCounter(8000,6), destruction=new WindowCounter(15000,3), seen=new Map(), locked=new Set(), trapped=new Map();
  const timer=setInterval(()=>{spam.sweep(); destruction.sweep(); for(const [key,time] of trapped) if(Date.now()-time>=60000) trapped.delete(key); for(const [id,time] of seen) if(Date.now()-time>60000) seen.delete(id);},60000); timer.unref();
  const actions=new Set([AuditLogEvent.ChannelDelete,AuditLogEvent.RoleDelete,AuditLogEvent.MemberBanAdd,AuditLogEvent.MemberKick,AuditLogEvent.WebhookCreate]);
  client.on('guildAuditLogEntryCreate',async (entry,guild)=>{
    try {
      if(!store.settings(guild.id).antinuke||!actions.has(entry.action)||!entry.executorId||Date.now()-entry.createdTimestamp>15000||seen.has(entry.id)) return;
      seen.set(entry.id,Date.now());
      if([guild.ownerId,client.user.id].includes(entry.executorId)) return;
      const key=`${guild.id}:${entry.executorId}`;
      if(!destruction.hit(key)||locked.has(key)) return;
      locked.add(key);
      try {
        const member=await guild.members.fetch(entry.executorId).catch(()=>null);
        if(!member?.bannable) { await log(guild,store,`Anti-nuke: detected destructive activity by ${entry.executorId}, but cannot ban this member. Check role hierarchy and Ban Members permission.`); return; }
        await member.ban({reason:'Anti-nuke: 3 destructive audit events within 15 seconds'});
        await log(guild,store,`Anti-nuke: banned ${entry.executorId} after 3 destructive audit events in 15 seconds. Review the audit log; deleted resources are not restored.`);
      } finally { locked.delete(key); }
    } catch(error) { await log(guild,store,`Anti-nuke failed: ${error.message}`); }
  });
  return async message=>{
    if(await handleHoneypot(message,store,trapped)) return true;
    if(!store.settings(message.guild.id).automod||message.member?.permissions.has(P.ManageMessages)) return false;
    const flood=spam.hit(`${message.guild.id}:${message.author.id}`);
    const invite=/(?:discord\.gg|discord(?:app)?\.com\/invite)\s*\/\s*[\w-]+/i.test(message.content);
    const mentions=message.mentions.users.size>=5||message.mentions.everyone;
    if(!flood&&!invite&&!mentions) return false;
    const reason=flood?'Message spam':invite?'Discord invite':'Mass mentions';
    try { await message.delete(); } catch(error) { await log(message.guild,store,`Automod could not delete a message: ${error.message}`); }
    if(flood&&message.member?.moderatable) await message.member.timeout(60000,'Automod: message spam').catch(error=>log(message.guild,store,`Automod timeout failed: ${error.message}`));
    await log(message.guild,store,`Automod: ${reason} by ${message.author.id} in channel ${message.channel.id}.`);
    return true;
  };
}
