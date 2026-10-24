import { ContainerBuilder, SectionBuilder, ThumbnailBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, escapeMarkdown } from 'discord.js';
import { BRAND, PREFIX } from './brand.js';
import { emoji } from './emojis.js';
const text = value => new TextDisplayBuilder().setContent(value);
export function panel(content,settings={},icon) {
  if(icon) content=String(content).replace(/^(#{1,3} )?/,(_,heading='')=>`${heading}${emoji(icon,settings)} `);
  return { flags:MessageFlags.IsComponentsV2, components:[new ContainerBuilder().setAccentColor(0x18181b).addTextDisplayComponents(text(content))], allowedMentions:{parse:[]} }; }
export function commandPanel(context,content) {
  return panel(content,context.store.settings(context.guild.id),context.category?.toLowerCase()??'general');
}
export function helpProfile(client) {
  return {avatarUrl:client.user.displayAvatarURL?.({extension:'png',size:256,forceStatic:true}),bannerUrl:client.user.bannerURL?.({extension:'png',size:1024,forceStatic:true})};
}
export function help(commands, user, category='home', query='', clientId, settings={}, page=0, profile={}) {
  const categories=[...new Set(commands.map(c=>c.category))];
  query=query.toLowerCase().trim();
  const list=commands.filter(c=>category==='all'||c.category===category||category==='search'&&(c.name.includes(query)||c.aliases.some(alias=>alias.includes(query))||c.description.toLowerCase().includes(query)));
  if(category==='search') {
    const exact=command=>command.name===query||command.aliases.includes(query);
    list.sort((a,b)=>Number(exact(b))-Number(exact(a)));
  }
  const pageSize=6;
  const pages=Math.max(1,Math.ceil(list.length/pageSize));
  page=category==='search'?0:Math.max(0,Math.min(pages-1,Number.isInteger(page)?page:0));
  const visible=list.slice(page*pageSize,(page+1)*pageSize);
  const heading=category==='home'?'Home':category==='search'?'Search results':category;
  const inviteUrl=clientId?`https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=1099780435094`:null;
  const container=new ContainerBuilder().setAccentColor(0x18181b);
  const title=category==='home'
    ? `# ${emoji('home',settings)} Hey, I'm ${BRAND}\nA multipurpose bot with security, moderation, leveling & economy.\n${emoji('security',settings)} **Indestructible Defence**`
    : `# ${emoji(category==='search'?'search':category==='all'?'general':category.toLowerCase(),settings)} ${BRAND} — Help\n${heading} · for ${escapeMarkdown(user.username)} · Page ${page+1}/${category==='search'?1:pages}`;
  if(category==='home'&&profile.avatarUrl) container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(text(title)).setThumbnailAccessory(new ThumbnailBuilder().setURL(profile.avatarUrl).setDescription('Kuroo avatar')));
  else container.addTextDisplayComponents(text(title));
  container.addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(text(category==='home'
      ? `${emoji('bullet',settings)} My Prefix is \`${PREFIX}\`\n${emoji('bullet',settings)} Total Commands: **${commands.length}**\n${emoji('bullet',settings)} Choose a module below. Use slash commands or mention me too.\n\n${categories.map(c=>`${emoji(c.toLowerCase(),settings)} ${emoji('reply',settings)} **${c}**`).join('\n')}\n\n### ${emoji('invite',settings)} Links\n${inviteUrl?`[Invite Kuroo](${inviteUrl})\n`:''}${emoji('setup',settings)} **/setup** · Configure your server\n${emoji('search',settings)} Search by command, alias or keyword.`
      : (visible.map(c=>`${emoji('reply',settings)} **${PREFIX}${c.name}${c.usage?' '+c.usage:''}** · /${c.name}\n${c.description}\n${emoji('bullet',settings)} Aliases: ${c.aliases.map(alias=>`\`${alias}\``).join(', ')}`).join('\n\n')||'No matching commands.')+(category==='search'&&list.length>pageSize?'\n\nMore matches exist. Refine your search to find a specific command.':'')))
    .addSeparatorComponents(new SeparatorBuilder());
  if(category==='home'&&profile.bannerUrl) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(profile.bannerUrl).setDescription('Kuroo banner')));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`help:category:${user.id}`).setPlaceholder('Select Module From Here').addOptions([{label:'Home',value:'home',emoji:emoji('home',settings)},{label:'All commands',value:'all',emoji:emoji('general',settings)},...categories.map(c=>({label:c,value:c,emoji:emoji(c.toLowerCase(),settings)}))])))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`help:home:${user.id}`).setLabel('Home').setEmoji(emoji('home',settings)).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`help:search:${user.id}`).setLabel('Search').setEmoji(emoji('search',settings)).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`help:close:${user.id}`).setLabel('Close').setEmoji(emoji('close',settings)).setStyle(ButtonStyle.Danger),
      ...(clientId?[new ButtonBuilder().setLabel('Invite Kuroo').setEmoji(emoji('invite',settings)).setStyle(ButtonStyle.Link).setURL(`https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=1099780435094`)]:[])));
  if(category!=='home'&&category!=='search'&&pages>1) container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`help:page:${user.id}:${category}:${page-1}`).setLabel('Previous').setEmoji(emoji('previous',settings)).setStyle(ButtonStyle.Secondary).setDisabled(page===0),
    new ButtonBuilder().setCustomId(`help:page:${user.id}:${category}:${page+1}`).setLabel('Next').setEmoji(emoji('next',settings)).setStyle(ButtonStyle.Secondary).setDisabled(page===pages-1)));
  container.addSeparatorComponents(new SeparatorBuilder()).addTextDisplayComponents(text(`-# Powered by ${BRAND} · /help · ${PREFIX}help`));
  return {flags:MessageFlags.IsComponentsV2,components:[container],allowedMentions:{parse:[]}};
}
export async function handleHelp(i, commands, store) {
  if (!i.customId?.startsWith('help:')) return false;
  const [,action,owner]=i.customId.split(':');
  if (owner!==i.user.id) { await i.reply({content:'Open your own menu with /help or ?help.',flags:MessageFlags.Ephemeral}); return true; }
  if (action==='search') {
    await i.showModal(new ModalBuilder().setCustomId(`help:query:${owner}`).setTitle('Find a command').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('query').setLabel('Command name or keyword').setStyle(TextInputStyle.Short).setMaxLength(40).setRequired(true))));
  } else if (action==='close') await i.update(panel('Kuroo help closed. Use **/help** or **?help** to reopen.',store?.settings(i.guildId)??{},'close'));
  else {
    const category=action==='category'?i.values[0]:action==='query'?'search':action==='page'?i.customId.split(':')[3]:'home';
    const query=action==='query'?i.fields.getTextInputValue('query').toLowerCase().trim():'';
    await i.update(help(commands,i.user,category,query,i.client.user.id,store?.settings(i.guildId)??{},action==='page'?Number(i.customId.split(':')[4]):0,helpProfile(i.client)));
  }
  return true;
}
