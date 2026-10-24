import { ActionRowBuilder, AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags, PermissionFlagsBits as P } from 'discord.js';
import { ChallengeBook, captchaImage } from './challenges.js';
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
  const payload=panel(`## ${emoji('verify',settings)} Kuroo · Verify your membership\nPress **Verify** to receive the Verified role and access member areas. `);
  payload.components[0].addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('aio:verify').setLabel('Verify').setEmoji(emoji('verify',settings)).setStyle(ButtonStyle.Success)));
  return payload;
}
export async function publishVerification(guild, channel, role, settings) {
  await safeVerifiedRole(guild,role.id);
  const me=await guild.members.fetchMe({force:true});
  if (!channel.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,...(settings.verificationMode==='captcha'?[P.AttachFiles]:[])])) throw new Error('I need View Channel, Send Messages, and Attach Files for CAPTCHA in the verification channel.');
  return channel.send(verificationPanel(settings));
}
const challenges=new ChallengeBook();
const timer=setInterval(()=>challenges.sweep(),60000); timer.unref();
function checkAccount(user,settings) {
  if(settings.verifyMinAgeHours>0&&(!Number.isFinite(user.createdTimestamp)||Date.now()-user.createdTimestamp<settings.verifyMinAgeHours*3600000)) throw new Error(`Your account must be at least ${settings.verifyMinAgeHours} hours old.`);
}
async function grantVerified(i,store,expected) {
  const settings=store.settings(i.guild.id);
  if(!settings.verification||settings.verificationMessage!==expected.verificationMessage||settings.verifiedRole!==expected.verifiedRole||settings.verificationMode!==expected.verificationMode) throw new Error('Verification settings changed. Use the current panel.');
  checkAccount(i.user,settings);
  const role=await safeVerifiedRole(i.guild,settings.verifiedRole), member=await i.guild.members.fetch({user:i.user.id,force:true});
  if(member.roles.cache.has(role.id)) return 'You are already verified.';
  const current=store.settings(i.guild.id);
  if(!current.verification||current.verifiedRole!==role.id||current.verificationMessage!==settings.verificationMessage||current.verificationMode!==settings.verificationMode||current.verifyMinAgeHours!==settings.verifyMinAgeHours) throw new Error('Verification settings changed. Use the current panel.');
  await member.roles.add(role,'Member completed verification');
  await log(i.guild,store,`Verification: ${i.user.id} received role ${role.id}.`);
  return 'You are verified. Welcome!';
}
export async function handleVerification(i,store,book=challenges) {
  if(i.customId!=='aio:verify'&&!i.customId?.startsWith('captcha:')) return false;
  if(!i.inGuild()) return true;
  const [,action,id]=i.customId.split(':');
  if(action==='enter') {
    try {
      book.get(id,i.guild.id,i.user.id);
      await i.showModal(new ModalBuilder().setCustomId(`captcha:answer:${id}`).setTitle('Complete verification').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Six characters from the image').setStyle(TextInputStyle.Short).setMinLength(6).setMaxLength(6).setRequired(true))));
    } catch(error) { await i.reply({content:error.message,flags:MessageFlags.Ephemeral}); }
    return true;
  }
  await i.deferReply({flags:MessageFlags.Ephemeral});
  try {
    const settings=store.settings(i.guild.id);
    if(action==='answer') {
      const item=book.answer(id,i.guild.id,i.user.id,i.fields.getTextInputValue('code'));
      await i.editReply(await grantVerified(i,store,{verificationMessage:item.panel,verifiedRole:item.role,verificationMode:'captcha'}));
      return true;
    }
    if(!settings.verification||i.channelId!==settings.verificationChannel||i.message.id!==settings.verificationMessage) throw new Error('This verification panel is inactive. Ask an administrator for the current panel.');
    checkAccount(i.user,settings);
    if(settings.verificationMode==='captcha') {
      const item=book.create(i.guild.id,i.user.id,settings);
      const payload=panel('## Kuroo verification challenge\nEnter the six characters in the image. Expires in 3 minutes; 3 attempts allowed.',settings,'verify');
      payload.components[0].addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://challenge.png'))).addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`captcha:enter:${item.id}`).setLabel('Enter code').setEmoji(emoji('verify',settings)).setStyle(ButtonStyle.Primary)));
      payload.files=[new AttachmentBuilder(captchaImage(item.answer),{name:'challenge.png'})];
      await i.editReply(payload);
    } else await i.editReply(await grantVerified(i,store,settings));
  } catch(error) { await i.editReply(`Verification failed: ${error.message}`); }
  return true;
}
