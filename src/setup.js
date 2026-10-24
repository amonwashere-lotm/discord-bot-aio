import { randomUUID } from 'node:crypto';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder, ChannelType, MessageFlags, PermissionFlagsBits as P } from 'discord.js';
import { applyPreset, tuning } from './settings.js';
import { panel } from './ui.js';
import { textChannel, safeVerifiedRole, publishVerification } from './verification.js';
import { emoji } from './emojis.js';
import { log } from './protection.js';

const sessions=new Map(), applying=new Set();
const features=['automod','antinuke','leveling','economy','honeypot','verification'];
const lifetime=15*60*1000;
const timer=setInterval(()=>{for(const [id,s] of sessions) if(Date.now()>s.expires) sessions.delete(id);},60000); timer.unref();
const row=component=>new ActionRowBuilder().addComponents(component);
const channelSelect=(id,label,selected)=>{
  const menu=new ChannelSelectMenuBuilder().setCustomId(id).setPlaceholder(label).setChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(1);
  if(selected) menu.setDefaultChannels(selected);
  return row(menu);
};
function wizard(id,s) {
  const draft=s.draft, prefix=`setup:${id}:`;
  const descriptions=[
    'Select the features to enable. Unselected features will be disabled when you apply.',
    'Choose a log channel, or leave empty to create a private #kuroo-logs channel.',
    'Choose a honeypot channel and action. Leave the channel empty to create #honeypot. Messages in it trigger the selected action; administrators are exempt.',
    'Choose a verification channel and a permissionless Verified role, or leave empty to create them. The button grants this role. Optionally create a gated #members channel for verified members; existing channels are preserved.',
    `Review before applying.\n\n${features.map(key=>`${emoji(draft[key]?'enabled':'disabled',draft)} **${key}:** ${draft[key]?'On':'Off'}`).join('\n')}\n**Logs:** ${draft.logChannel?`<#${draft.logChannel}>`:'Create private #kuroo-logs'}\n**Honeypot:** ${draft.honeypotChannel?`<#${draft.honeypotChannel}>`:'Create #honeypot'} · ${draft.honeypotAction}\n**Verification:** ${draft.verificationChannel?`<#${draft.verificationChannel}>`:'Create #verify'}\n**Verified role:** ${draft.verifiedRole?`<@&${draft.verifiedRole}>`:'Create Verified'}\n**Gated member area:** ${draft.memberArea?'Create or reuse #members':'Off'}\n**Verification mode:** ${draft.verificationMode} · account age ${draft.verifyMinAgeHours}h\n**Anti-nuke:** ${draft.antinukeCount} events / ${draft.antinukeWindowSeconds}s\n**Spam:** ${draft.spamCount} messages / ${draft.spamWindowSeconds}s · duplicates ${draft.duplicateCount}\n**XP:** ${draft.xpAmount} every ${draft.xpCooldownSeconds}s · daily ${draft.dailyAmount} coins\n\nNew channels are created only for enabled features. Custom emoji IDs can be set in config/emojis.json or with /setemoji. Existing XP, coins, and emoji overrides are preserved.`
  ];
  const payload=panel(`## ${emoji('setup',draft)} Kuroo setup · ${s.step+1}/5\n${descriptions[s.step]}\n\nThis menu expires after 15 minutes.`);
  const box=payload.components[0];
  if(s.step===0) box.addActionRowComponents(row(new StringSelectMenuBuilder().setCustomId(prefix+'features').setPlaceholder('Enabled features').setMinValues(0).setMaxValues(features.length).addOptions(features.map(key=>({label:key,value:key,emoji:emoji(({automod:'security',antinuke:'security',honeypot:'security',verification:'verify'})[key]??key,draft),default:!!draft[key]})))));
  if(s.step===0) box.addActionRowComponents(row(new StringSelectMenuBuilder().setCustomId(prefix+'preset').setPlaceholder('Optional security preset').addOptions([{label:'Keep current tuning',value:'keep'},{label:'Balanced defaults',value:'balanced'},{label:'Strict: CAPTCHA, 24h account age, lower thresholds',value:'strict'}])));
  if(s.step===1) box.addActionRowComponents(channelSelect(prefix+'logs','Log channel (empty = create)',draft.logChannel));
  if(s.step===2) box.addActionRowComponents(channelSelect(prefix+'honeypot','Honeypot channel (empty = create)',draft.honeypotChannel),row(new StringSelectMenuBuilder().setCustomId(prefix+'action').setPlaceholder('Honeypot action').addOptions(['timeout','kick','ban'].map(value=>({label:value,value,default:draft.honeypotAction===value})))));
  if(s.step===3) {
    const roleMenu=new RoleSelectMenuBuilder().setCustomId(prefix+'role').setPlaceholder('Verified role (empty = create)').setMinValues(0).setMaxValues(1);
    if(draft.verifiedRole) roleMenu.setDefaultRoles(draft.verifiedRole);
    box.addActionRowComponents(row(new StringSelectMenuBuilder().setCustomId(prefix+'mode').setPlaceholder('Verification mode').addOptions(['button','captcha'].map(value=>({label:value,value,default:draft.verificationMode===value})))));
    box.addActionRowComponents(channelSelect(prefix+'verification','Verification channel (empty = create)',draft.verificationChannel),row(roleMenu),row(new StringSelectMenuBuilder().setCustomId(prefix+'memberarea').setPlaceholder('Gated member area').addOptions([{label:'Create or reuse a gated #members channel',value:'on',default:!!draft.memberArea},{label:'Configure my own member channel permissions',value:'off',default:!draft.memberArea}])));
  }
  box.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(prefix+'back').setLabel('Back').setEmoji(emoji('previous',draft)).setStyle(ButtonStyle.Secondary).setDisabled(s.step===0),
    new ButtonBuilder().setCustomId(prefix+(s.step===4?'apply':'next')).setLabel(s.step===4?'Apply setup':'Next').setEmoji(emoji(s.step===4?'success':'next',draft)).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(prefix+'cancel').setLabel('Cancel').setEmoji(emoji('close',draft)).setStyle(ButtonStyle.Danger)));
  return payload;
}
export function startSetup(guildId,owner,settings) {
  for(const [id,s] of sessions) if(s.guildId===guildId&&s.owner===owner) sessions.delete(id);
  const id=randomUUID();
  const draft={...settings};
  if(!settings.setupCompleted) for(const key of features) draft[key]=true;
  const session={guildId,owner,draft,step:0,expires:Date.now()+lifetime};
  sessions.set(id,session);
  return wizard(id,session);
}
export async function applySetup(guild,store,draft,actor) {
  if(applying.has(guild.id)) throw new Error('Another setup is being applied. Please wait.');
  applying.add(guild.id);
  const created=[], sent=[];
  try {
    const me=await guild.members.fetchMe({force:true});
    const needed=[P.ViewChannel,P.SendMessages];
    if(draft.automod||draft.honeypot) needed.push(P.ManageMessages);
    if(draft.automod||(draft.honeypot&&draft.honeypotAction==='timeout')) needed.push(P.ModerateMembers);
    if(draft.antinuke) needed.push(P.ViewAuditLog,P.BanMembers);
    if(draft.honeypot&&draft.honeypotAction==='ban') needed.push(P.BanMembers);
    if(draft.honeypot&&draft.honeypotAction==='kick') needed.push(P.KickMembers);
    if(draft.verification) needed.push(P.ManageRoles);
    if(draft.verification&&draft.verificationMode==='captcha') needed.push(P.AttachFiles);
    if(!me.permissions.has(needed)) throw new Error('I am missing required permissions. Grant the enabled features’ permissions and retry.');
    const patch=Object.fromEntries(features.map(key=>[key,!!draft[key]]));
    patch.honeypotAction=draft.honeypotAction;
    patch.memberArea=!!draft.memberArea;
    for(const key of Object.keys(tuning)) patch[key]=draft[key];
    if(!['timeout','kick','ban'].includes(patch.honeypotAction)) throw new Error('Choose a valid honeypot action.');
    // Validate all supplied resources before making changes in Discord.
    let logs=draft.logChannel?await textChannel(guild,draft.logChannel):null;
    let trap=draft.honeypot&&draft.honeypotChannel?await textChannel(guild,draft.honeypotChannel):null;
    let verification=draft.verification&&draft.verificationChannel?await textChannel(guild,draft.verificationChannel):null;
    let role=draft.verification&&draft.verifiedRole?await safeVerifiedRole(guild,draft.verifiedRole):null;
    let memberChannel=null;
    if(draft.verification&&draft.memberArea&&draft.memberChannel&&draft.memberRole===role?.id) {
      memberChannel=await textChannel(guild,draft.memberChannel).catch(()=>null);
      const everyone=memberChannel?.permissionOverwrites?.cache.get(guild.id);
      const verified=memberChannel?.permissionOverwrites?.cache.get(role.id);
      if(!everyone?.deny.has(P.ViewChannel)||!verified?.allow.has(P.ViewChannel)) memberChannel=null;
    }
    const ids=[logs?.id,trap?.id,verification?.id,memberChannel?.id].filter(Boolean);
    if(new Set(ids).size!==ids.length) throw new Error('Use different channels for logs, honeypot, and verification.');
    const mustCreate=!logs||(draft.honeypot&&!trap)||(draft.verification&&!verification)||(draft.verification&&draft.memberArea&&!memberChannel);
    if(mustCreate&&!me.permissions.has(P.ManageChannels)) throw new Error('I need Manage Channels to create missing channels.');
    for(const channel of [logs,trap,verification].filter(Boolean)) {
      const permissions=[P.ViewChannel,P.SendMessages];
      if(channel===verification&&draft.verificationMode==='captcha') permissions.push(P.AttachFiles);
      if(channel===trap) permissions.push(P.ManageMessages);
      if(!channel.permissionsFor(me)?.has(permissions)) throw new Error(`Missing View Channel, Send Messages or Manage Messages in ${channel.name}.`);
    }
    async function createChannel(name,privateChannel=false,readOnly=false) {
      const channel=await guild.channels.create({name,type:ChannelType.GuildText,topic:name==='honeypot'?'Do not send messages here. This is an automated spam trap.':undefined,permissionOverwrites:[
        {id:guild.id,deny:privateChannel?[P.ViewChannel]:readOnly?[P.SendMessages]:[],allow:privateChannel?[]:[P.ViewChannel]},
        {id:me.id,allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,...(me.permissions.has(P.AttachFiles)?[P.AttachFiles]:[]),...(me.permissions.has(P.ManageMessages)?[P.ManageMessages]:[])]}
      ],reason:`Kuroo setup by ${actor}`});
      created.push(channel); return channel;
    }
    logs??=await createChannel('kuroo-logs',true);
    patch.logChannel=logs.id;
    if(draft.honeypot) {
      trap??=await createChannel('honeypot');
      patch.honeypotChannel=trap.id;
      sent.push(await trap.send({content:`Do not send messages in this channel. This is a honeypot. Posting here triggers ${draft.honeypotAction==='timeout'?`a ${draft.honeypotTimeoutMinutes}-minute timeout`:`a ${draft.honeypotAction}`}. Administrators are exempt.`,allowedMentions:{parse:[]}}));
    }
    if(draft.verification) {
      if(!role) { role=await guild.roles.create({name:'Verified',permissions:[],reason:`Kuroo setup by ${actor}`}); created.push(role); }
      verification??=await createChannel('verify',false,true);
      const message=await publishVerification(guild,verification,role,{...store.settings(guild.id),...draft});
      sent.push(message);
      Object.assign(patch,{verificationChannel:verification.id,verifiedRole:role.id,verificationMessage:message.id});
      if(draft.memberArea) {
        if(!memberChannel) {
          memberChannel=await guild.channels.create({name:'members',type:ChannelType.GuildText,permissionOverwrites:[
            {id:guild.id,deny:[P.ViewChannel]},
            {id:role.id,allow:[P.ViewChannel,P.SendMessages]},
            {id:me.id,allow:[P.ViewChannel,P.SendMessages]}
          ],reason:`Kuroo verified member area by ${actor}`});
          created.push(memberChannel);
        }
        Object.assign(patch,{memberChannel:memberChannel.id,memberRole:role.id});
      }
    }
    // Commit configuration only after Discord resources and panels are ready.
    store.configure(guild.id,{...patch,setupCompleted:true});
    return patch;
  } catch(error) {
    const cleanupFailures=[];
    for(const item of [...sent,...created.reverse()]) await item.delete('Kuroo setup rollback').catch(()=>cleanupFailures.push(item.id));
    if(cleanupFailures.length) error.message+=` Setup could not remove created resources/messages: ${cleanupFailures.join(', ')}. Remove them manually.`;
    throw error;
  } finally { applying.delete(guild.id); }
}
export async function handleSetup(i,store) {
  if(!i.customId?.startsWith('setup:')) return false;
  const [,id,action]=i.customId.split(':'), s=sessions.get(id);
  if(!s||s.expires<Date.now()) { sessions.delete(id); await i.reply({content:'Setup expired. Run /setup again.',flags:MessageFlags.Ephemeral}); return true; }
  if(!i.inGuild()||s.guildId!==i.guild.id||s.owner!==i.user.id) { await i.reply({content:'Only the administrator who opened this setup can use it.',flags:MessageFlags.Ephemeral}); return true; }
  if(s.busy) { await i.reply({content:'Setup is processing. Please wait.',flags:MessageFlags.Ephemeral}); return true; }
  s.busy=true;
  try {
    // Acknowledge before network checks so a slow permission fetch cannot expire the interaction.
    await i.deferUpdate();
    const member=await i.guild.members.fetch({user:i.user.id,force:true});
    if(!member.permissions.has(P.Administrator)) { await i.followUp({content:'Administrator permission is required.',flags:MessageFlags.Ephemeral}); return true; }
    if(action==='cancel') { sessions.delete(id); await i.editReply(panel('Setup cancelled. Configuration was not changed.',s.draft,'close')); return true; }
    if(action==='apply'&&s.step===4) {
      try { await applySetup(i.guild,store,s.draft,i.user.id); }
      catch(error) { await i.followUp({content:`Setup failed: ${error.message}`.slice(0,1900),flags:MessageFlags.Ephemeral}); return true; }
      sessions.delete(id);
      await log(i.guild,store,`Setup completed by ${i.user.id}.`);
      await i.editReply(panel('## Kuroo · Setup complete\nUse /settings to inspect the configuration, /setemoji to configure icons, and /help for commands. The optional #members channel is gated by the Verified role. To restrict other existing channels, allow that role and deny @everyone access in their channel/category permissions.',store.settings(i.guild.id),'success'));
      return true;
    }
    if(action==='features'&&s.step===0) for(const key of features) s.draft[key]=i.values.includes(key);
    else if(action==='preset'&&s.step===0) applyPreset(s.draft,i.values[0]);
    else if(action==='mode'&&s.step===3) s.draft.verificationMode=i.values[0];
    else if(action==='logs'&&s.step===1) s.draft.logChannel=i.values[0]??null;
    else if(action==='honeypot'&&s.step===2) s.draft.honeypotChannel=i.values[0]??null;
    else if(action==='action'&&s.step===2) s.draft.honeypotAction=i.values[0];
    else if(action==='verification'&&s.step===3) s.draft.verificationChannel=i.values[0]??null;
    else if(action==='role'&&s.step===3) s.draft.verifiedRole=i.values[0]??null;
    else if(action==='memberarea'&&s.step===3) s.draft.memberArea=i.values[0]==='on';
    else if(action==='next') s.step=Math.min(4,s.step+1);
    else if(action==='back') s.step=Math.max(0,s.step-1);
    await i.editReply(wizard(id,s));
  } finally { s.busy=false; }
  return true;
}
