import { readFileSync } from 'node:fs';

export const emojiDefaults = Object.freeze({
  home:'🏠', search:'🔎', close:'✖', security:'🛡️', leveling:'📈', economy:'🪙',
  general:'📋', moderation:'🔨', admin:'⚙️', setup:'🧰', verify:'✅', success:'✅', error:'❌',
  bullet:'•', reply:'↳', enabled:'🟢', disabled:'⚫', previous:'◀️', next:'▶️',
  invite:'🔗', coin:'🪙', bank:'🏦'
});
const configured = JSON.parse(readFileSync(new URL('../config/emojis.json', import.meta.url), 'utf8'));
export function parseEmoji(value, key='icon') {
  if (typeof value !== 'string') throw new Error('Use an emoji ID or Discord custom emoji markup.');
  if (/^\d{17,20}$/.test(value)) return `<:${key}:${value}>`;
  if (/^<a?:[A-Za-z0-9_]{2,32}:\d{17,20}>$/.test(value)) return value;
  throw new Error('Use a 17–20 digit emoji ID, <:name:id>, or <a:name:id>.');
}
for (const [key,value] of Object.entries(configured)) {
  if (!Object.hasOwn(emojiDefaults,key)) throw new Error(`Unknown emoji key in config/emojis.json: ${key}`);
  if (value !== null && value !== '') parseEmoji(value,key);
}
export function emoji(key, settings={}) {
  const value=settings.emojis?.[key]??configured[key];
  return value ? parseEmoji(value,key) : emojiDefaults[key];
}
