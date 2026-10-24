import { level } from './store.js';
import { safeVerifiedRole } from './verification.js';
import { log } from './protection.js';
export async function awardXp(message,store) {
  const settings=store.settings(message.guild.id);
  if(!settings.leveling||settings.levelingChannels.includes(message.channel.id)||message.content.trim().length<3) return false;
  if(!store.xp(message.guild.id,message.author.id)) return false;
  const current=level(store.user(message.guild.id,message.author.id).xp);
  for(const [required,id] of Object.entries(settings.levelRoles)) {
    if(current<Number(required)||message.member?.roles.cache.has(id)) continue;
    try {
      const role=await safeVerifiedRole(message.guild,id);
      const member=await message.guild.members.fetch(message.author.id);
      if(!member.roles.cache.has(id)) await member.roles.add(role,`Level ${required} reward`);
    } catch(error) { await log(message.guild,store,`Level reward failed for ${message.author.id}: ${error.message}`); }
  }
  return true;
}
