import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P, PermissionsBitField, ChannelType } from 'discord.js';
import { Store } from '../src/store.js';
import { commands, resolveCommand, parseArgs } from '../src/commands.js';
import { emoji, parseEmoji } from '../src/emojis.js';
import { help, handleHelp } from '../src/ui.js';
import { handleHoneypot } from '../src/protection.js';
import { safeVerifiedRole, handleVerification } from '../src/verification.js';
import { startSetup, handleSetup, applySetup } from '../src/setup.js';

import { ids, fixture } from './support/discord.js';
test('admin adjustments stay nonnegative, isolated, bounded and preserve cooldowns',()=>{
  const s=new Store(':memory:'); s.daily('g','u',100000000); s.xp('g','u',100000000);
  assert.equal(s.adjust('g','u','xp','add',90),110);
  assert.equal(s.adjust('g','u','xp','remove',200),0);
  assert.equal(s.adjust('g','u','balance','set',123),123);
  assert.equal(s.adjust('g','u','balance','reset'),0);
  assert.equal(s.user('g','u').last_daily,100000000);
  assert.equal(s.user('other','u').xp,0);
  for(const n of [-1,1.5,NaN,Infinity,1e9+1]) assert.throws(()=>s.adjust('g','u','xp','set',n));
  assert.throws(()=>s.adjust('g','u','last_daily','set',0));
  s.db.prepare('UPDATE users SET balance=? WHERE guild=? AND id=?').run(Number.MAX_SAFE_INTEGER,'g','u');
  assert.throws(()=>s.adjust('g','u','balance','add',1));
  assert.equal(s.adjust('g','u','balance','reset'),0);
  s.resetDaily('g','u'); assert.equal(s.daily('g','u',100000001),true); s.db.close();
});
test('new administration handlers require Administrator and have aliases',()=>{
  for(const name of ['addxp','removexp','setxp','resetxp','addbalance','removebalance','setbalance','resetbalance','setlevel','resetdaily','setemoji','emojis','honeypot','verification','setup','leveling','economy']) {
    const c=resolveCommand(name); assert.equal(c.permission,P.Administrator); assert.ok(c.aliases.length);
  }
  assert.throws(()=>parseArgs(resolveCommand('honeypot'),['on','123','invalid']));
  assert.deepEqual(parseArgs(resolveCommand('verification'),['on','<#123>','<@&456>']),{state:'on',channel:'<#123>',role:'<@&456>'});
});
test('admin command handlers update XP, level, coins, cooldown and module flags',async()=>{
  const f=fixture(), target={id:ids.user,username:'tester'};
  const c={store:f.store,guild:f.guild,user:{id:'admin'},target:async()=>target,reply:async()=>{}};
  for(const [name,args] of [['addxp',{amount:100}],['setlevel',{level:5}],['addbalance',{amount:500}],['removebalance',{amount:200}],['leveling',{state:'off'}],['economy',{state:'off'}]]) await resolveCommand(name).run({...c,args});
  assert.equal(f.store.user(ids.guild,ids.user).xp,2500); assert.equal(f.store.user(ids.guild,ids.user).balance,300);
  assert.equal(f.store.settings(ids.guild).leveling,false); assert.equal(f.store.settings(ids.guild).economy,false);
  for(const name of ['daily','pay']) await assert.rejects(resolveCommand(name).run({...c,args:{}}),/disabled/);
  f.store.db.close();
});
test('emoji IDs and animated markup render and clearing restores the default',async()=>{
  assert.equal(parseEmoji(ids.role,'home'),`<:home:${ids.role}>`);
  assert.equal(parseEmoji(`<a:wave:${ids.role}>`),`<a:wave:${ids.role}>`);
  for(const value of ['bad','<:bad:1>','@everyone','123']) assert.throws(()=>parseEmoji(value));
  const f=fixture(), c={store:f.store,guild:f.guild,reply:async()=>{}};
  await resolveCommand('setemoji').run({...c,args:{key:'home',value:ids.role}});
  assert.equal(emoji('home',f.store.settings(ids.guild)),`<:home:${ids.role}>`);
  const rendered=JSON.stringify(help(commands,{id:ids.user,username:'test'},'home','',ids.bot,f.store.settings(ids.guild)));
  assert.ok(rendered.includes(ids.role));
  await resolveCommand('setemoji').run({...c,args:{key:'home',value:'clear'}});
  assert.equal(emoji('home',f.store.settings(ids.guild)),'🏠');
  await assert.rejects(resolveCommand('setemoji').run({...c,args:{key:'unknown',value:ids.role}}));
  f.store.db.close();
});
test('help pagination retains every command and page navigation stays owner scoped',async()=>{
 const user={id:ids.user,username:'test'}, names=[];
 for(let page=0;page<Math.ceil(commands.length/6);page++) {
   const data=help(commands,user,'all','',ids.bot,{},page).components[0].toJSON();
   const contents=data.components.filter(c=>c.type===10).map(c=>c.content).join('\n');
   assert.ok(contents.length<4000);
   names.push(...[...contents.matchAll(/\*\*\?(\w+)/g)].map(m=>m[1]));
 }
 assert.deepEqual(names,commands.map(c=>c.name));
 let updated;
 await handleHelp({customId:`help:page:${ids.user}:all:1`,user,client:{user:{id:ids.bot}},update:async p=>{updated=JSON.stringify(p);}},commands);
 assert.ok(updated.includes('Page 2/'));
});
test('honeypot punishes once, exempts administrators and ignores other channels',async()=>{
 const f=fixture(); f.store.configure(ids.guild,{honeypot:true,honeypotChannel:ids.channel});
 const recent=new Map(); f.member.permissions.has=()=>false;
 const message={guild:f.guild,channel:{id:ids.channel},author:{id:ids.user},member:f.member,delete:async()=>f.events.push(['delete'])};
 assert.equal(await handleHoneypot(message,f.store,recent),true); assert.ok(f.events.some(e=>e[0]==='timeout'&&e[1]===3600000));
 await handleHoneypot(message,f.store,recent); assert.equal(f.events.filter(e=>e[0]==='timeout').length,1);
 f.member.permissions.has=()=>true; assert.equal(await handleHoneypot(message,f.store,recent),false);
 message.channel.id='elsewhere'; assert.equal(await handleHoneypot(message,f.store,recent),false); f.store.db.close();
});
test('honeypot supports kick/ban and reports hierarchy failures',async()=>{
 for(const action of ['kick','ban']) {
   const f=fixture(); f.member.permissions.has=()=>false; const logs=f.channel();
   f.store.configure(ids.guild,{honeypot:true,honeypotChannel:ids.channel,honeypotAction:action,logChannel:logs.id});
   const message={guild:f.guild,channel:{id:ids.channel},author:{id:ids.user},member:f.member,delete:async()=>{}};
   await handleHoneypot(message,f.store); assert.ok(f.events.some(e=>e[0]===action));
   f.member[action==='ban'?'bannable':'kickable']=false;
   await handleHoneypot(message,f.store); assert.equal(f.events.filter(e=>e[0]===action).length,1);
   assert.ok(f.events.some(e=>e[2]?.content?.includes('role hierarchy'))); f.store.db.close();
 }
});
test('verified role checks reject privileged, managed, everyone, high and overridden roles',async()=>{
 const f=fixture(), r=f.role(); assert.equal(await safeVerifiedRole(f.guild,r.id),r);
 r.permissions.bitfield=P.Administrator; await assert.rejects(safeVerifiedRole(f.guild,r.id)); r.permissions.bitfield=0n;
 r.id=ids.guild; await assert.rejects(safeVerifiedRole(f.guild,ids.role)); r.id=ids.role;
 r.managed=true; await assert.rejects(safeVerifiedRole(f.guild,r.id)); r.managed=false;
 f.me.roles.highest.comparePositionTo=()=>0; await assert.rejects(safeVerifiedRole(f.guild,r.id)); f.me.roles.highest.comparePositionTo=()=>1;
 const ch=f.channel(); ch.permissionOverwrites.cache.set(r.id,{allow:{bitfield:P.ManageMessages}});
 await assert.rejects(safeVerifiedRole(f.guild,r.id)); f.store.db.close();
});
test('verification grants only the configured safe role from the active panel',async()=>{
 const f=fixture(), role=f.role(); f.store.configure(ids.guild,{verification:true,verificationChannel:ids.channel,verificationMessage:'panel',verifiedRole:role.id});
 let reply;
 const interaction={customId:'aio:verify',inGuild:()=>true,guild:f.guild,channelId:ids.channel,message:{id:'old'},user:{id:ids.user},deferReply:async()=>{},editReply:async text=>{reply=text;}};
 await handleVerification(interaction,f.store); assert.match(reply,/inactive/); assert.equal(f.events.filter(e=>e[0]==='addRole').length,0);
 interaction.message.id='panel'; await handleVerification(interaction,f.store); assert.ok(f.events.some(e=>e[0]==='addRole'&&e[1]===role.id));
 f.member.roles.cache.set(role.id,role); await handleVerification(interaction,f.store); assert.match(reply,/already/);
 f.store.configure(ids.guild,{verification:false}); await handleVerification(interaction,f.store); assert.match(reply,/inactive/);
 f.store.db.close();
});
test('setup previews, rechecks admin permission, cancels without mutation and expires safely',async()=>{
 const f=fixture(); let payload=startSetup(ids.guild,ids.user,f.store.settings(ids.guild));
 const getId=()=>payload.components[0].toJSON().components.at(-1).components[1].custom_id;
 const interaction={customId:getId(),inGuild:()=>true,guild:f.guild,user:{id:'intruder'},reply:async p=>{f.events.push(['reply',p]);},followUp:async p=>{f.events.push(['reply',p]);},deferUpdate:async()=>{},editReply:async p=>{payload=p;}};
 await handleSetup(interaction,f.store); assert.ok(f.events.at(-1)[1].content.includes('Only'));
 interaction.user.id=ids.user; f.member.permissions.has=()=>false; await handleSetup(interaction,f.store); assert.ok(f.events.at(-1)[1].content.includes('Administrator'));
 f.member.permissions.has=()=>true; await handleSetup(interaction,f.store); assert.ok(JSON.stringify(payload).includes('2/5'));
 interaction.customId=interaction.customId.replace(/:next$/,':cancel'); await handleSetup(interaction,f.store); assert.ok(JSON.stringify(payload).includes('cancelled'));
 assert.equal(f.store.settings(ids.guild).setupCompleted,undefined);
 await handleSetup(interaction,f.store); assert.ok(f.events.at(-1)[1].content.includes('expired')); f.store.db.close();
});
test('setup creates only enabled resources, commits once ready and preserves emojis/XP',async()=>{
 const f=fixture(); f.store.adjust(ids.guild,ids.user,'xp','set',100); f.store.configure(ids.guild,{emojis:{home:ids.role}});
 const patch=await applySetup(f.guild,f.store,{...f.store.settings(ids.guild),automod:true,antinuke:true,honeypot:true,verification:true},'admin');
 const settings=f.store.settings(ids.guild);
 assert.ok(settings.setupCompleted&&settings.verificationMessage&&settings.verifiedRole&&settings.honeypotChannel&&settings.logChannel);
 assert.equal(f.events.filter(e=>e[0]==='createChannel').length,4); assert.equal(f.events.filter(e=>e[0]==='createRole').length,1);
 assert.deepEqual(settings.emojis,{home:ids.role}); assert.equal(f.store.user(ids.guild,ids.user).xp,100);
 assert.equal(patch.honeypotAction,'timeout');
 assert.ok(settings.memberChannel);
 const gate=f.guild.channels.cache.get(settings.memberChannel);
 assert.ok(gate.permissionOverwrites.cache.get(ids.guild).deny.has(P.ViewChannel));
 assert.ok(gate.permissionOverwrites.cache.get(settings.verifiedRole).allow.has(P.ViewChannel));
 await applySetup(f.guild,f.store,settings,'admin');
 assert.equal(f.events.filter(e=>e[0]==='createChannel').length,4);
 assert.equal(f.events.filter(e=>e[0]==='createRole').length,1);
 assert.ok(f.events.some(e=>e[0]==='createChannel'&&e[1].permissionOverwrites[0].deny.includes(P.ViewChannel)));
 f.store.db.close();
});
test('setup validates selected resources before writes and rolls back created channels on failure',async()=>{
 const f=fixture(), existing=f.channel(ids.channel);
 await assert.rejects(applySetup(f.guild,f.store,{...f.store.settings(ids.guild),logChannel:existing.id,honeypot:true,honeypotChannel:existing.id},'admin'),/different channels/);
 assert.equal(f.events.length,0);
 f.guild.roles.create=async()=>{throw new Error('Discord unavailable');};
 await assert.rejects(applySetup(f.guild,f.store,{...f.store.settings(ids.guild),verification:true},'admin'),/Discord unavailable/);
 assert.ok(f.events.some(e=>e[0]==='deleteChannel')); assert.equal(f.store.settings(ids.guild).setupCompleted,undefined); f.store.db.close();
});

test('setup walks all steps, reuses selections and applies once through its interaction handler',async()=>{
 const f=fixture(), logs=f.channel(), trap=f.channel(), verify=f.channel(), role=f.role();
 let payload=startSetup(ids.guild,ids.user,f.store.settings(ids.guild));
 const id=payload.components[0].toJSON().components.at(-1).components[1].custom_id.split(':')[1];
 const i={inGuild:()=>true,guild:f.guild,user:{id:ids.user},deferUpdate:async()=>{},editReply:async p=>{payload=p;},followUp:async()=>{},reply:async()=>{}};
 async function act(action,values=[]) { i.customId=`setup:${id}:${action}`; i.values=values; await handleSetup(i,f.store); payload.components[0].toJSON(); }
 await act('features',['leveling','economy','honeypot','verification']);
 await act('next'); await act('logs',[logs.id]);
 await act('next'); await act('honeypot',[trap.id]); await act('action',['kick']);
 await act('next'); await act('verification',[verify.id]); await act('role',[role.id]); await act('memberarea',['off']);
 await act('next'); assert.ok(JSON.stringify(payload).includes('5/5'));
 assert.equal(f.store.settings(ids.guild).setupCompleted,undefined);
 await act('apply'); assert.ok(JSON.stringify(payload).includes('Setup complete'));
 const settings=f.store.settings(ids.guild);
 assert.equal(settings.honeypotAction,'kick'); assert.equal(settings.verifiedRole,role.id); assert.equal(settings.automod,false); assert.equal(settings.logChannel,logs.id);
 assert.equal(f.events.filter(e=>e[0].startsWith('create')).length,0);
 const sent=f.events.filter(e=>e[0]==='send').length; await act('apply'); assert.equal(f.events.filter(e=>e[0]==='send').length,sent);
 f.store.db.close();
});
test('setup disables features without creating their resources and rejects missing permissions first',async()=>{
 const f=fixture(), draft=f.store.settings(ids.guild);
 f.me.permissions.has=()=>false;
 await assert.rejects(applySetup(f.guild,f.store,draft,'admin'),/missing required permissions/);
 assert.equal(f.events.length,0);
 f.me.permissions.has=()=>true;
 await applySetup(f.guild,f.store,draft,'admin');
 assert.equal(f.events.filter(e=>e[0]==='createChannel').length,1);
 assert.equal(f.events.filter(e=>e[0]==='createRole').length,0);
 f.store.db.close();
});
test('setup removes posted panels and created resources when configuration commit fails',async()=>{
 const f=fixture(), oldSettings=f.store.settings(ids.guild);
 f.store.configure=()=>{throw new Error('Disk full');};
 await assert.rejects(applySetup(f.guild,f.store,{...oldSettings,verification:true,honeypot:true},'admin'),/Disk full/);
 assert.equal(f.events.filter(e=>e[0]==='deleteChannel').length,4);
 assert.equal(f.events.filter(e=>e[0]==='deleteRole').length,1);
 assert.equal(f.events.filter(e=>e[0]==='deleteMessage').length,2);
 assert.equal(f.store.settings(ids.guild).verificationMessage,null); f.store.db.close();
});
test('verification IDs and emoji settings survive a database restart and legacy settings get defaults',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs'); const {tmpdir}=await import('node:os'); const {join}=await import('node:path');
 const directory=mkdtempSync(join(tmpdir(),'aio-settings-')), path=join(directory,'bot.sqlite');
 try {
   let s=new Store(path);
   s.db.prepare('INSERT INTO settings VALUES (?,?)').run('legacy',JSON.stringify({automod:true}));
   assert.equal(s.settings('legacy').leveling,true); assert.equal(s.settings('legacy').verification,false);
   const settings={verification:true,verifiedRole:ids.role,verificationChannel:ids.channel,verificationMessage:'persistent',emojis:{home:ids.role}};
   s.configure(ids.guild,settings); s.db.close(); s=new Store(path);
   for(const [key,value] of Object.entries(settings)) assert.deepEqual(s.settings(ids.guild)[key],value);
   s.db.close();
 } finally {rmSync(directory,{recursive:true,force:true});}
});
