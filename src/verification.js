import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags, PermissionFlagsBits as P } from 'discord.js';
import { panel } from './ui.js';
import { emoji } from './emojis.js';
import { log } from './protection.js';

export async function textChannel(guild, value) {
  const id=String(value).replace(/^<#(\d+)>$/,'$1');
  const channel=await guild.channels.fetch(id,{force:true}).catch(()=>null);
  if (!channel || channel.type!==ChannelType.GuildText) throw new Error('Choose a text channel in this server.');
  return channel;
}
export async function safeVerifiedRole(guild, value) {
  const id=String(value).replace(/^<@&(\d+)>$/,'$1');
  const role=await guild.roles.fetch(id,{force:true}).catch(()=>null);
  const me=await guild.members.fetchMe({force:true});
  if (!role || role.id===guild.id || role.managed || role.permissions.bitfield!==0n || !me.permissions.has(P.ManageRoles) || me.roles.highest.comparePositionTo(role)<=0) {
    throw new Error('Verified role must have no server permissions, be unmanaged, and be below my role. I need Manage Roles.');
  }
  // Permissionless roles can still carry moderation grants in channel overrides.
  await guild.channels.fetch();
  const dangerous=P.ManageChannels|P.ManageRoles|P.ManageMessages|P.ManageWebhooks|P.MentionEveryone|P.ModerateMembers|P.BanMembers|P.KickMembers|P.Administrator|P.ManageGuild|P.MuteMembers|P.DeafenMembers|P.MoveMembers|P.ManageThreads|P.ManageEvents|P.ManageGuildExpressions|P.ManageNicknames;
  for (const channel of guild.channels.cache.values()) {
    if ((channel.permissionOverwrites?.cache.get(role.id)?.allow.bitfield??0n)&dangerous) throw new Error('Verified role has a privileged channel override. Choose a role used only for member access.');
  }
  return role;
}
export function verificationPanel(settings={}) {
  const payload=panel(`## ${emoji('verify',settings)} Verify your membership\nPress **Verify** to receive the Verified role and access member areas. `);
  payload.components[0].addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('aio:verify').setLabel('Verify').setEmoji(emoji('verify',settings)).setStyle(ButtonStyle.Success)));
  return payload;
}
export async function publishVerification(guild, channel, role, settings) {
  await safeVerifiedRole(guild,role.id);
  const me=await guild.members.fetchMe({force:true});
  if (!channel.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages])) throw new Error('I need View Channel and Send Messages in the verification channel.');
  return channel.send(verificationPanel(settings));
}
export async function handleVerification(i,store) {
  if (i.customId!=='aio:verify') return false;
  if (!i.inGuild()) return true;
  await i.deferReply({flags:MessageFlags.Ephemeral});
  try {
    const settings=store.settings(i.guild.id);
    if (!settings.verification || i.channelId!==settings.verificationChannel || i.message.id!==settings.verificationMessage) throw new Error('This verification panel is inactive. Ask an administrator for the current panel.');
    const role=await safeVerifiedRole(i.guild,settings.verifiedRole);
    const member=await i.guild.members.fetch({user:i.user.id,force:true});
    if (member.roles.cache.has(role.id)) { await i.editReply('You are already verified.'); return true; }
    // Configuration may have changed while Discord role/channel checks were in flight.
    const current=store.settings(i.guild.id);
    if (!current.verification || current.verifiedRole!==role.id || current.verificationMessage!==i.message.id) throw new Error('Verification settings changed. Please use the current panel.');
    await member.roles.add(role,'Member completed the verification button');
    await i.editReply('You are verified. Welcome!');
    await log(i.guild,store,`Verification: ${i.user.id} received role ${role.id}.`);
  } catch(error) { await i.editReply(`Verification failed: ${error.message}`); }
  return true;
}
