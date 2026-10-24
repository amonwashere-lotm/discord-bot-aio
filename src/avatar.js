import { loadImage } from '@napi-rs/canvas';
// Only discord.js generated Discord CDN avatar URLs are accepted. No redirects or arbitrary hosts.
export function isAvatarUrl(value) {
  try {
    const url=new URL(value);
    return url.protocol==='https:'&&['cdn.discordapp.com','media.discordapp.net'].includes(url.hostname)&&!url.username&&!url.password&&!url.port&&/^\/(?:avatars\/\d{17,20}\/[a-zA-Z0-9_]+|embed\/avatars\/\d+)\.(?:png|webp)$/.test(url.pathname);
  } catch { return false; }
}
export async function avatarFor(user,fetcher=fetch) {
  const url=user.displayAvatarURL?.({extension:'png',size:512,forceStatic:true});
  if(!isAvatarUrl(url)) return null;
  try {
    const response=await fetcher(url,{signal:AbortSignal.timeout(5000),redirect:'error'});
    if(!response.ok||!response.headers.get('content-type')?.startsWith('image/')) return null;
    let size=0; const chunks=[];
    for await(const chunk of response.body) {size+=chunk.length;if(size>1024*1024) throw new Error('Avatar too large');chunks.push(chunk);}
    const image=await loadImage(Buffer.concat(chunks));
    return image.width<=512&&image.height<=512?image:null;
  } catch { return null; }
}
