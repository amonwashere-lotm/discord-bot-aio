import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { ActivityType } from 'discord.js';
import { startPresence, streamingUrl, ROTATION_MS } from '../src/presence.js';
import { rankCard, leaderboardCard } from '../src/cards.js';
import { help, handleHelp, helpProfile, commandPanel } from '../src/ui.js';
import { commands, slashData, resolveCommand } from '../src/commands.js';
import { emojiDefaults } from '../src/emojis.js';
import { startSetup } from '../src/setup.js';
import { verificationPanel } from '../src/verification.js';
import { log } from '../src/protection.js';
import { ids, fixture } from './support/discord.js';

test('streaming rotation sends all three messages every 15 seconds with fresh counts and stops cleanly',()=>{
  const frames=[], guilds=new Map([['a',{memberCount:15}],['b',{memberCount:25}]]);
  const client={guilds:{cache:guilds},user:{setPresence:frame=>frames.push(frame)}};
  let tick, delay, stopped, unref=false;
  const timer={unref:()=>{unref=true;}};
  const stop=startPresence(client,{url:'https://www.twitch.tv/kuroo',schedule:(fn,ms)=>{tick=fn;delay=ms;return timer;},cancel:value=>{stopped=value;}});
  assert.equal(delay,15_000);assert.equal(delay,ROTATION_MS);assert.equal(unref,true);
  assert.equal(frames[0].activities[0].name,'Indestructible Defence ?help');
  guilds.set('c',{memberCount:10});tick();
  assert.equal(frames[1].activities[0].name,'Watching over 3 servers');
  guilds.get('a').memberCount=20;tick();
  assert.equal(frames[2].activities[0].name,'Looking after 55 users');
  tick();assert.equal(frames[3].activities[0].name,'Indestructible Defence ?help');
  for(const frame of frames) {
    assert.equal(frame.status,'online');assert.equal(frame.activities.length,1);
    assert.equal(frame.activities[0].type,ActivityType.Streaming);
    assert.equal(frame.activities[0].url,'https://www.twitch.tv/kuroo');
  }
  stop();assert.equal(stopped,timer);
});

test('streaming links accept supported providers and reject invalid profile links',()=>{
  assert.equal(streamingUrl(),'https://www.twitch.tv/kuroo');
  assert.equal(streamingUrl('https://www.youtube.com/watch?v=example'),'https://www.youtube.com/watch?v=example');
  for(const url of ['garbage','http://www.twitch.tv/kuroo','https://example.com/kuroo','https://www.twitch.tv/','https://user@www.twitch.tv/kuroo','https://www.twitch.tv:123/kuroo']) assert.throws(()=>streamingUrl(url));
});

test('rank avatar covers all edges with center cropping, readable overlay, and black fallback',async()=>{
  const avatar=createCanvas(200,100), ctx=avatar.getContext('2d');
  ctx.fillStyle='#ff0000';ctx.fillRect(0,0,200,100);
  // These edge stripes disappear under cover cropping but remain under stretching.
  ctx.fillStyle='#0000ff';ctx.fillRect(0,0,200,10);ctx.fillRect(0,90,200,10);
  const image=await loadImage(rankCard('Kuroo test',{xp:650},2,avatar));
  assert.equal(image.width,1000);assert.equal(image.height,350);
  const canvas=createCanvas(1000,350), result=canvas.getContext('2d');result.drawImage(image,0,0);
  for(const [x,y] of [[0,0],[999,0],[0,349],[999,349]]) {
    const [red,green,blue,alpha]=result.getImageData(x,y,1,1).data;
    assert.ok(red>25&&red>green*3&&red>blue*3,'avatar fills and crops at the card edge');
    assert.ok(red<180,'dark overlay remains visible');assert.equal(alpha,255);
  }
  const fallback=await loadImage(rankCard('No avatar',{xp:0},1));result.clearRect(0,0,1000,350);result.drawImage(fallback,0,0);
  assert.deepEqual([...result.getImageData(0,0,1,1).data],[9,9,11,255]);
});

test('custom emoji placements reach help text, dropdowns, command rows and navigation',()=>{
  const emojis=Object.fromEntries(Object.keys(emojiDefaults).map((key,i)=>[key,`<:${key}:${100000000000001000n+BigInt(i)}>`]));
  const settings={emojis}, user={id:ids.user,username:'tester'};
  const home=JSON.stringify(help(commands,user,'home','',ids.bot,settings));
  for(const key of ['home','security','general','reply','setup']) assert.ok(home.includes(emojis[key]));
  assert.match(home,/Hey, I'm Kuroo/);assert.match(home,/Invite Kuroo/);
  const page=help(commands,user,'all','',ids.bot,settings).components[0].toJSON();
  const body=page.components.filter(c=>c.type===10).map(c=>c.content).join('\n');
  assert.ok(body.includes(emojis.reply));assert.ok(body.includes(emojis.bullet));
  const controls=page.components.filter(c=>c.type===1).flatMap(row=>row.components);
  for(const key of ['home','search','close','invite','previous','next']) assert.ok(controls.some(c=>c.emoji?.id===emojis[key].match(/:(\d+)>/)[1]));
  assert.ok(controls.find(c=>c.type===3).options.every(option=>option.emoji));
  assert.ok(Object.keys(emojiDefaults).length<=25);assert.ok(slashData(resolveCommand('setemoji')).options[0].choices.length<=25);
});

test('guild emoji overrides reach commands, setup, verification and security alerts',async()=>{
  const f=fixture(), emojis={admin:`<:admin:${ids.role}>`,next:`<a:next:${ids.role}>`,verify:`<:verify:${ids.role}>`,security:`<:security:${ids.role}>`,coin:`<:coin:${ids.role}>`,bank:`<:bank:${ids.role}>`};
  const settings=f.store.configure(ids.guild,{emojis,logChannel:ids.channel});
  assert.ok(JSON.stringify(commandPanel({category:'Admin',guild:f.guild,store:f.store},'### Updated')).includes(`### ${emojis.admin} Updated`));
  assert.ok(JSON.stringify(startSetup(ids.guild,ids.user,settings)).includes('"animated":true'));
  assert.ok(JSON.stringify(verificationPanel(settings)).includes(emojis.verify));
  let payload;await resolveCommand('balance').run({guild:f.guild,store:f.store,target:async()=>({id:ids.user,username:'tester'}),reply:async p=>{payload=p;},category:'Economy'});
  assert.ok(JSON.stringify(payload).includes(emojis.coin));assert.ok(JSON.stringify(payload).includes(emojis.bank));
  f.channel(ids.channel);await log(f.guild,f.store,'Test incident');
  assert.match(f.events.at(-1)[2].content,/Kuroo/);assert.ok(f.events.at(-1)[2].content.startsWith(emojis.security));
  f.store.db.close();
});


test('leaderboard fills its edges with the server icon and retains its no-icon fallback',async()=>{
  const icon=createCanvas(512,512),ctx=icon.getContext('2d');
  ctx.fillStyle='#00ff00';ctx.fillRect(0,0,512,512);
  for(const rows of [[],[{name:'Member',xp:500}],Array.from({length:10},(_,i)=>({name:`Member ${i}`,xp:500-i}))]) {
    const image=await loadImage(leaderboardCard(rows,icon));
    const canvas=createCanvas(image.width,image.height),out=canvas.getContext('2d');out.drawImage(image,0,0);
    assert.equal(image.height,200+rows.length*65);
    for(const [x,y] of [[0,0],[999,0],[0,image.height-1],[999,image.height-1]]) {
      const [r,g,b,a]=out.getImageData(x,y,1,1).data;
      assert.ok(g>25&&g>r*3&&g>b*3&&g<180);assert.equal(a,255);
    }
  }
  const fallback=await loadImage(leaderboardCard([]));
  const canvas=createCanvas(1000,200),out=canvas.getContext('2d');out.drawImage(fallback,0,0);
  assert.deepEqual([...out.getImageData(0,0,1,1).data],[9,9,11,255]);
});

test('guild icon loader accepts only Discord icons and falls back on missing or failed downloads',async()=>{
  const {iconFor,isGuildIconUrl}=await import('../src/avatar.js');
  const url=`https://cdn.discordapp.com/icons/${ids.guild}/abc.png?size=512`;
  assert.equal(isGuildIconUrl(url),true);
  for(const value of [null,'https://evil.test/icons/a.png',`https://cdn.discordapp.com/avatars/${ids.user}/abc.png`,`https://user@cdn.discordapp.com/icons/${ids.guild}/abc.png`]) assert.equal(isGuildIconUrl(value),false);
  let options;
  const guild={iconURL:opts=>{options=opts;return url;}};
  const png=createCanvas(512,512).toBuffer('image/png');
  const image=await iconFor(guild,async(actual,opts)=>{assert.equal(actual,url);assert.equal(opts.redirect,'error');return new Response(png,{headers:{'content-type':'image/png'}});});
  assert.equal(image.width,512);assert.equal(options.forceStatic,true);
  assert.equal(await iconFor({iconURL:()=>null},()=>{throw new Error('must not fetch');}),null);
  assert.equal(await iconFor(guild,async()=>{throw new Error('offline');}),null);
  assert.equal(await iconFor(guild,async()=>new Response(Buffer.alloc(1024*1024+1),{headers:{'content-type':'image/png'}})),null);
});

test('reference help shows a profile thumbnail, actual command count, module picker and preserves them on navigation',async()=>{
  const client={user:{id:ids.bot,displayAvatarURL:()=>`https://cdn.discordapp.com/embed/avatars/0.png`,bannerURL:()=>null}};
  const user={id:ids.user,username:'tester'},profile=helpProfile(client);
  const home=help(commands,user,'home','',ids.bot,{},0,profile).components[0].toJSON();
  const section=home.components.find(c=>c.type===9);
  assert.equal(section.accessory.media.url,profile.avatarUrl);
  const content=JSON.stringify(home);
  assert.ok(content.includes(`Total Commands: **${commands.length}**`));
  assert.ok(content.includes('Select Module From Here'));assert.ok(content.includes('Powered by Kuroo'));
  for(const category of new Set(commands.map(c=>c.category))) assert.ok(content.includes(`**${category}**`));
  let updated;
  await handleHelp({customId:`help:home:${user.id}`,user,client,update:async p=>{updated=p;}},commands);
  assert.equal(updated.components[0].toJSON().components.find(c=>c.type===9).accessory.media.url,profile.avatarUrl);
});
