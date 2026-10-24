import { ActivityType } from 'discord.js';
import { PREFIX } from './brand.js';

export const ROTATION_MS = 15_000;
export const DEFAULT_STREAMING_URL = 'https://www.twitch.tv/kuroo';
export function streamingUrl(value = DEFAULT_STREAMING_URL) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['twitch.tv','www.twitch.tv','youtube.com','www.youtube.com'].includes(url.hostname) || url.username || url.password || url.port || url.pathname === '/') {
    throw new Error('STREAMING_URL must be an HTTPS Twitch or YouTube channel/video URL.');
  }
  return url.href;
}
export function startPresence(client, { url = DEFAULT_STREAMING_URL, schedule = setInterval, cancel = clearInterval } = {}) {
  url = streamingUrl(url);
  let frame = 0;
  const update = () => {
    const guilds = client.guilds.cache;
    const members = [...guilds.values()].reduce((total,guild)=>total+(Number.isSafeInteger(guild.memberCount)?guild.memberCount:0),0);
    const messages = [
      `Indestructible Defence ${PREFIX}help`,
      `Watching over ${guilds.size} servers`,
      `Looking after ${members} users`
    ];
    client.user.setPresence({ status:'online', activities:[{ name:messages[frame], type:ActivityType.Streaming, url }] });
    frame = (frame + 1) % messages.length;
  };
  update();
  const timer = schedule(update,ROTATION_MS);
  timer.unref?.();
  return () => cancel(timer);
}
