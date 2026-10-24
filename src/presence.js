import { ActivityType } from 'discord.js';
import { PREFIX } from './brand.js';

export const ROTATION_MS = 15_000;
export const DEFAULT_STREAMING_URL = 'https://www.twitch.tv/kuroo';
export function streamingUrl(value = DEFAULT_STREAMING_URL) {
  const url = new URL(value?.trim() || DEFAULT_STREAMING_URL);
  if (url.protocol !== 'https:' || !['twitch.tv','www.twitch.tv','youtube.com','www.youtube.com'].includes(url.hostname) || url.username || url.password || url.port || url.pathname === '/') {
    throw new Error('STREAMING_URL must be an HTTPS Twitch or YouTube channel/video URL.');
  }
  return url.href;
}
// Used for both the IDENTIFY handshake and subsequent presence updates.
export function streamingPresence(name=`Indestructible Defence ${PREFIX}help`,url=DEFAULT_STREAMING_URL) {
  return {status:'online',activities:[{name,type:ActivityType.Streaming,url:streamingUrl(url)}]};
}
export function presenceDiagnostic(client) {
  const activity=client?.user?.presence?.activities?.find(activity=>activity.type===ActivityType.Streaming);
  let valid=false;
  try { valid=!!activity?.url&&!!streamingUrl(activity.url); } catch {}
  return `${valid?'✓':'✗'} Local Streaming activity (type 1): ${valid?'configured':'missing or invalid URL'} · bot ID ${client?.user?.id??'unavailable'}\nLocal presence is not confirmation of Discord displaying the purple indicator. Stop other processes using this bot token and check the running deployment if it is absent.`;
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
    client.user.setPresence(streamingPresence(messages[frame],url));
    frame = (frame + 1) % messages.length;
  };
  update();
  const timer = schedule(update,ROTATION_MS);
  timer.unref?.();
  return () => cancel(timer);
}
