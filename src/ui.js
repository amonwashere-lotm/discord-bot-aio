import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, escapeMarkdown } from 'discord.js';
import { BRAND, PREFIX } from './brand.js';
import { emoji } from './emojis.js';
const text = value => new TextDisplayBuilder().setContent(value);
export function panel(content,settings={},icon) {
  if(icon) content=String(content).replace(/^(#{1,3} )?/,(_,heading='')=>`${heading}${emoji(icon,settings)} `);
  return { flags:MessageFlags.IsComponentsV2, components:[new ContainerBuilder().setAccentColor(0x18181b).addTextDisplayComponents(text(content))], allowedMentions:{parse:[]} }; }
export function commandPanel(context,content) {
  return panel(content,context.store.settings(context.guild.id),context.category?.toLowerCase()??'general');
}
export function help(commands, user, category='home', query='', clientId, settings={}, page=0) {
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
  const container=new ContainerBuilder().setAccentColor(0x18181b)
    .addTextDisplayComponents(text(`# ${emoji(category==='home'?'home':category==='search'?'search':category.toLowerCase()==='all'?'general':category.toLowerCase(),settings)} ${BRAND} — Help\n${heading} · for ${escapeMarkdown(user.username)}${category!=='home'?` · Page ${page+1}/${category==='search'?1:pages}`:''}`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(text(category==='home'
      ? `### ${emoji('security',settings)} Indestructible Defence\nModeration, security, leveling & economy.\nRun commands with **\`?\`**, **/**, or mention me.\n\n### ${emoji('search',settings)} How to use this menu\nChoose a category below or search for a command. Commands are discovered automatically from the registry.\n\n### ${emoji('general',settings)} Browse by category\n${categories.map(c=>`${emoji('reply',settings)} ${emoji(c.toLowerCase(),settings)} **${c}**`).join('\n')}\n\n### ${emoji('setup',settings)} Set it up\nUse **/setup** or **?setup** to configure security, leveling, economy, honeypot, and verification in one wizard. Configure custom icons with **/setemoji**.`
      : (visible.map(c=>`${emoji('reply',settings)} **${PREFIX}${c.name}${c.usage?' '+c.usage:''}** · /${c.name}\n${c.description}\n${emoji('bullet',settings)} Aliases: ${c.aliases.map(alias=>`\`${alias}\``).join(', ')}`).join('\n\n')||'No matching commands.')+(category==='search'&&list.length>pageSize?'\n\nMore matches exist. Refine your search to find a specific command.':'')))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`help:category:${user.id}`).setPlaceholder('Select a category…').addOptions([{label:'Home',value:'home',emoji:emoji('home',settings)},{label:'All commands',value:'all',emoji:emoji('general',settings)},...categories.map(c=>({label:c,value:c,emoji:emoji(c.toLowerCase(),settings)}))])))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`help:home:${user.id}`).setLabel('Home').setEmoji(emoji('home',settings)).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`help:search:${user.id}`).setLabel('Search').setEmoji(emoji('search',settings)).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`help:close:${user.id}`).setLabel('Close').setEmoji(emoji('close',settings)).setStyle(ButtonStyle.Danger),
      ...(clientId?[new ButtonBuilder().setLabel('Invite Kuroo').setEmoji(emoji('invite',settings)).setStyle(ButtonStyle.Link).setURL(`https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=1099780435094`)]:[])));
  if(category!=='home'&&category!=='search'&&pages>1) container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`help:page:${user.id}:${category}:${page-1}`).setLabel('Previous').setEmoji(emoji('previous',settings)).setStyle(ButtonStyle.Secondary).setDisabled(page===0),
    new ButtonBuilder().setCustomId(`help:page:${user.id}:${category}:${page+1}`).setLabel('Next').setEmoji(emoji('next',settings)).setStyle(ButtonStyle.Secondary).setDisabled(page===pages-1)));
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
    await i.update(help(commands,i.user,category,query,i.client.user.id,store?.settings(i.guildId)??{},action==='page'?Number(i.customId.split(':')[4]):0));
  }
  return true;
}
