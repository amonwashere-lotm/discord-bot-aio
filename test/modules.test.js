import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditLogEvent as A, PermissionFlagsBits as P } from 'discord.js';
import { createCanvas } from '@napi-rs/canvas';
import { Store } from '../src/store.js';
import { defaults,parseSetting,applyPreset } from '../src/settings.js';
import { MessageScanner,dangerousAudit,installProtection,handleHoneypot } from '../src/protection.js';
import { ChallengeBook,captchaImage } from '../src/challenges.js';
import { handleVerification } from '../src/verification.js';
import { resolveCommand,parseArgs,slashCommands } from '../src/commands.js';
import { diagnose,emojiHealth } from '../src/diagnostics.js';
import { awardXp } from '../src/progression.js';
import { avatarFor,isAvatarUrl } from '../src/avatar.js';
import { rankCard,fitText } from '../src/cards.js';
import { startSetup,handleSetup } from '../src/setup.js';
import { fixture,ids } from './support/discord.js';

test('existing database upgrades retain balances, XP, settings and new columns across restarts',()=>{
 const dir=mkdtempSync(join(tmpdir(),'aio-migrate-')),path=join(dir,'bot.sqlite');
 try {
  const db=new DatabaseSync(path); db.exec("CREATE TABLE users(guild TEXT,id TEXT,xp INTEGER DEFAULT 0,balance INTEGER DEFAULT 0,last_xp INTEGER DEFAULT 0,last_daily INTEGER DEFAULT 0,PRIMARY KEY(guild,id)); CREATE TABLE settings(guild TEXT PRIMARY KEY,value TEXT); INSERT INTO users VALUES ('g','u',900,700,100,200); INSERT INTO settings VALUES ('g','{\"automod\":true}');"); db.close();
  let s=new Store(path); assert.equal(s.user('g','u').balance,700); assert.equal(s.user('g','u').bank,0); assert.equal(s.user('g','u').xp,900); assert.equal(s.settings('g').automod,true); s.db.close();
  s=new Store(path); assert.equal(s.user('g','u').last_work,0); assert.equal(s.settings('g').xpAmount,20); s.db.close();
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('bank operations conserve money, reject invalid/overflow moves and isolate guilds',()=>{
 const s=new Store(':memory:'); s.adjust('g','u','balance','set',1000);
 assert.ok(s.bankMove('g','u','deposit',600)); assert.equal(s.user('g','u').bank,600); assert.equal(s.user('g','u').balance,400);
 assert.equal(s.bankMove('g','u','withdraw',601),false); assert.ok(s.bankMove('g','u','withdraw',100));
 for(const amount of [-1,0,1.1,NaN,Infinity,1e9+1]) assert.equal(s.bankMove('g','u','deposit',amount),false);
 assert.equal(s.user('other','u').bank,0); s.configure('g',{economy:false}); assert.equal(s.bankMove('g','u','deposit',1),false); s.configure('g',{economy:true});
 s.db.prepare('UPDATE users SET bank=? WHERE guild=? AND id=?').run(Number.MAX_SAFE_INTEGER,'g','u');
 assert.equal(s.bankMove('g','u','deposit',1),false); assert.equal(s.user('g','u').balance,500); s.db.close();
});
test('configured rewards have durable cooldowns and safe balance boundaries',()=>{
 const s=new Store(':memory:'); s.configure('g',{xpAmount:50,xpCooldownSeconds:10,dailyAmount:20,dailyCooldownMinutes:60,workAmount:90,workCooldownMinutes:5});
 assert.ok(s.xp('g','u',100000000)); assert.equal(s.xp('g','u',100009999),false); assert.ok(s.xp('g','u',100010000));
 assert.ok(s.daily('g','u',100000000)); assert.equal(s.daily('g','u',100000001),false); assert.ok(s.daily('g','u',103600000));
 assert.ok(s.work('g','u',100000000)); assert.equal(s.work('g','u',100299999),false); assert.ok(s.work('g','u',100300000));
 assert.equal(s.user('g','u').balance,220); assert.equal(s.user('g','u').xp,100);
 s.configure('g',{economy:false,leveling:false}); assert.equal(s.work('g','u',200000000),false); assert.equal(s.xp('g','u',200000000),false); s.db.close();
});
test('warnings and bounded incident history are durable and server scoped',()=>{
 const s=new Store(':memory:'); const id=s.warn('g','u','mod','Repeated disruption',100000); assert.equal(s.warnings('g','u')[0].id,id); assert.equal(s.warnings('other','u').length,0);
 assert.throws(()=>s.warn('g','u','mod','')); assert.throws(()=>s.warn('g','u','mod','x'.repeat(501)));
 for(let i=0;i<1005;i++) s.incident('g',`Synthetic incident ${i}`);
 assert.equal(s.db.prepare('SELECT count(*) AS n FROM incidents WHERE guild=?').get('g').n,1000);
 assert.equal(s.clearWarnings('other','u'),0); assert.equal(s.clearWarnings('g','u'),1); s.db.close();
});
test('all tuning fields enforce ranges and prefix values retain spaces',()=>{
 assert.equal(parseSetting('blockLinks','off'),false); assert.equal(parseSetting('verificationMode','captcha'),'captcha');
 assert.deepEqual(parseSetting('blockedWords','badword, bad phrase,badword'),['badword','bad phrase']);
 for(const [key,value] of [['xpAmount','-1'],['spamCount','1'],['dailyAmount','NaN'],['verificationMode','fake'],['__proto__','oops']]) assert.throws(()=>parseSetting(key,value));
 const c=resolveCommand('tune'); assert.deepEqual(parseArgs(c,['blockedWords','bad','phrase,','other']),{setting:'blockedWords',value:'bad phrase, other'});
 const draft=defaults();applyPreset(draft,'strict');assert.equal(draft.verificationMode,'captcha');assert.equal(draft.verifyMinAgeHours,24);
 assert.ok(slashCommands().length<=100);
});
const msg=(id,content)=>({id,content,guild:{id:'g'},channel:{id:'c'},author:{id:'u'},mentions:{users:new Map(),roles:new Map(),everyone:false}});
test('automod catches normalized invites, role mentions, blocked phrases, links and caps',()=>{
 const scanner=new MessageScanner(),s=defaults();
 assert.match(scanner.scan(msg('1','discord.\u200bgg/test'),s,100000).reason,/invite/);
 const mention=msg('2','hello'); mention.mentions.roles=new Map(Array.from({length:5},(_,i)=>[i,true])); assert.match(scanner.scan(mention,s,110000).reason,/mentions/);
 assert.match(scanner.scan(msg('3','very BAD PHRASE here'),{...s,blockedWords:['bad phrase']},120000).reason,/Blocked/);
 assert.equal(scanner.scan(msg('4','class'),{...s,blockedWords:['ass']},130000),null);
 assert.match(scanner.scan(msg('5','https://example.test'),{...s,blockLinks:true},140000).reason,/link/);
 assert.match(scanner.scan(msg('6','THIS IS A LONG LOUD MESSAGE'),{...s,capsPercent:70},150000).reason,/capitals/);
});
test('duplicate detection covers channels and edits without counting the same message twice',()=>{
 const scanner=new MessageScanner(),s=defaults();
 for(let i=0;i<3;i++) assert.equal(scanner.scan(msg(String(i),'repeat text'),s,100000+i*9000),null);
 assert.match(scanner.scan({...msg('3','repeat text'),channel:{id:'other'}},s,127001).reason,/Repeated/);
 const fresh=new MessageScanner(); for(let i=0;i<20;i++) assert.equal(fresh.scan(msg('one','same message'),s,100000+i,true),null);
 assert.match(fresh.scan(msg('one','discord.gg/new'),s,200000,true).reason,/invite/);
 fresh.sweep(400000);assert.equal(fresh.history.size,0);
});
test('audit classification detects sensitive creates and dangerous grants, not harmless edits',async()=>{
 const guild={roles:{fetch:async()=>({permissions:{bitfield:P.Administrator}})}};
 for(const action of [A.ChannelCreate,A.BotAdd,A.MemberPrune]) assert.equal(await dangerousAudit({action},guild),true);
 assert.equal(await dangerousAudit({action:A.RoleUpdate,changes:[{key:'permissions',old:'0',new:String(P.Administrator)}]},guild),true);
 assert.equal(await dangerousAudit({action:A.RoleUpdate,changes:[{key:'permissions',old:String(P.Administrator),new:'0'}]},guild),false);
 assert.equal(await dangerousAudit({action:A.RoleUpdate,changes:[{key:'name',old:'a',new:'b'}]},guild),false);
 assert.equal(await dangerousAudit({action:A.MemberRoleUpdate,changes:[{key:'$add',new:[{id:'r'}]}]},guild),true);
});
test('anti-nuke trust, stale/future events, thresholds and repeat suppression are enforced',async()=>{
 const f=fixture();f.store.configure(ids.guild,{antinuke:true,antinukeCount:2,antinukeUsers:['trusted']});let handler;
 installProtection({user:{id:ids.bot},on:(name,fn)=>{handler=fn;}},f.store);
 const entry=(id,executorId='attacker',age=0)=>({id,executorId,createdTimestamp:Date.now()-age,action:A.ChannelCreate});
 await handler(entry('a','trusted'),f.guild);await handler(entry('b','trusted'),f.guild);await handler(entry('c','attacker',60000),f.guild);await handler(entry('d','attacker',-60000),f.guild);assert.equal(f.events.filter(e=>e[0]==='ban').length,0);
 await handler(entry('1'),f.guild);await handler(entry('2'),f.guild);await handler(entry('3'),f.guild);assert.equal(f.events.filter(e=>e[0]==='ban').length,1);f.store.db.close();
});
test('anti-nuke exemptions require owner and tuning/exemptions remain server scoped',async()=>{
 const f=fixture(),c={guild:f.guild,user:{id:ids.user},store:f.store,reply:async()=>{},args:{scope:'antinuke-user',action:'add',id:ids.user}};
 await assert.rejects(resolveCommand('allowlist').run(c),/owner/);
 await resolveCommand('allowlist').run({...c,user:{id:f.guild.ownerId}});assert.deepEqual(f.store.settings(ids.guild).antinukeUsers,[ids.user]);assert.deepEqual(f.store.settings('other').antinukeUsers,[]);
 await resolveCommand('tune').run({...c,args:{setting:'xpAmount',value:'40'}});assert.equal(f.store.settings(ids.guild).xpAmount,40);f.store.db.close();
});
test('CAPTCHA challenges bind identity, expire, limit attempts and consume correct answers once',()=>{
 const b=new ChallengeBook(),s={verificationMessage:'p',verifiedRole:'r'},a=b.create('g','u',s,100000);
 assert.throws(()=>b.get(a.id,'g','other',100001),/another/);assert.throws(()=>b.create('g','u',s,100001),/30 seconds/);
 assert.equal(b.answer(a.id,'g','u',a.answer.toLowerCase(),100002).role,'r');assert.throws(()=>b.answer(a.id,'g','u',a.answer,100003),/used/);
 const wrong=b.create('g','u',s,140000);for(let i=0;i<3;i++) assert.throws(()=>b.answer(wrong.id,'g','u','000000',140001+i));assert.throws(()=>b.get(wrong.id,'g','u',140005));
 const exp=b.create('g','u',s,180000);assert.throws(()=>b.get(exp.id,'g','u',360000),/expired/);
 assert.equal(captchaImage('ABC234').subarray(1,4).toString(),'PNG');
});
test('verification role is granted only after CAPTCHA; stale modes and young accounts fail',async()=>{
 const f=fixture(),role=f.role(),book=new ChallengeBook();f.store.configure(ids.guild,{verification:true,verifiedRole:role.id,verificationChannel:ids.channel,verificationMessage:'panel',verificationMode:'captcha'});
 let payload;const i={customId:'aio:verify',guild:f.guild,inGuild:()=>true,channelId:ids.channel,message:{id:'panel'},user:{id:ids.user,createdTimestamp:Date.now()-86400000},deferReply:async()=>{},editReply:async p=>{payload=p;}};
 await handleVerification(i,f.store,book);assert.equal(f.events.filter(e=>e[0]==='addRole').length,0);assert.ok(payload.files.length);
 const item=[...book.items.values()][0];assert.ok(!JSON.stringify(payload.components).includes(item.answer));
 i.customId=`captcha:answer:${item.id}`;i.fields={getTextInputValue:()=>item.answer};await handleVerification(i,f.store,book);assert.equal(f.events.filter(e=>e[0]==='addRole').length,1);
 await handleVerification(i,f.store,book);assert.equal(f.events.filter(e=>e[0]==='addRole').length,1);
 f.store.configure(ids.guild,{verifyMinAgeHours:48,verificationMode:'button'});i.customId='aio:verify';await handleVerification(i,f.store,book);assert.match(payload,/48 hours/);f.store.db.close();
});
test('level rewards grant only safe roles on eligible XP awards and respect exclusions',async()=>{
 const f=fixture(),role=f.role();f.store.configure(ids.guild,{xpAmount:100,levelRoles:{1:role.id}});
 const message={guild:f.guild,channel:{id:ids.channel},author:{id:ids.user},content:'an eligible message',member:f.member};
 await awardXp(message,f.store);assert.ok(f.events.some(e=>e[0]==='addRole'&&e[1]===role.id));
 f.store.configure(ids.guild,{levelingChannels:[ids.channel]});assert.equal(await awardXp(message,f.store),false);f.store.db.close();
});
test('avatar loader limits hosts, redirects and bytes, and cards handle wide names',async()=>{
 assert.ok(isAvatarUrl(`https://cdn.discordapp.com/avatars/${ids.user}/abc.png?size=256`));
 for(const url of ['http://localhost/x.png','https://evil.test/a.png','https://cdn.discordapp.com/../x.png','https://x@cdn.discordapp.com/embed/avatars/1.png']) assert.equal(isAvatarUrl(url),false);
 const canvas=createCanvas(32,32),png=canvas.toBuffer('image/png'),user={displayAvatarURL:()=>`https://cdn.discordapp.com/embed/avatars/1.png`};
 let options;const avatar=await avatarFor(user,async (_url,opts)=>{options=opts;return new Response(png,{headers:{'content-type':'image/png'}});});assert.equal(options.redirect,'error');assert.ok(avatar);
 assert.equal(await avatarFor(user,async()=>new Response(Buffer.alloc(1024*1024+1),{headers:{'content-type':'image/png'}})),null);
 const ctx=canvas.getContext('2d');ctx.font='22px sans-serif';assert.ok(ctx.measureText(fitText(ctx,'Ｗ'.repeat(50),100)).width<=100);
 assert.equal(rankCard('Ｗ'.repeat(50),{xp:500},1,avatar).subarray(1,4).toString(),'PNG');
});
test('diagnostics and emoji checks report actionable missing access',async()=>{
 const f=fixture();f.me.permissions.has=()=>false;f.store.configure(ids.guild,{verification:true,honeypot:true});
 const output=await diagnose(f.guild,f.store,{});assert.match(output,/✗ Grant member roles/);assert.match(output,/Verification channel not configured/);
 const icons=await emojiHealth({},f.guild,{emojis:{home:ids.role}});assert.match(icons,/not found/);f.store.db.close();
});
test('strict wizard preset persists CAPTCHA and tuned thresholds only after apply',async()=>{
 const f=fixture();let payload=startSetup(ids.guild,ids.user,f.store.settings(ids.guild));const id=payload.components[0].toJSON().components.at(-1).components[1].custom_id.split(':')[1];
 const i={inGuild:()=>true,guild:f.guild,user:{id:ids.user},deferUpdate:async()=>{},editReply:async p=>{payload=p;},reply:async()=>{},followUp:async p=>{throw new Error(p.content);}};
 async function act(action,values=[]) {i.customId=`setup:${id}:${action}`;i.values=values;await handleSetup(i,f.store);payload.components[0].toJSON();}
 await act('preset',['strict']);assert.equal(f.store.settings(ids.guild).verificationMode,'button');
 for(let j=0;j<4;j++) await act('next');assert.match(JSON.stringify(payload),/captcha/);await act('apply');assert.equal(f.store.settings(ids.guild).verificationMode,'captcha');assert.equal(f.store.settings(ids.guild).antinukeCount,2);f.store.db.close();
});

test('changing verification mode invalidates an outstanding CAPTCHA before any role grant',async()=>{
 const f=fixture(),role=f.role(),book=new ChallengeBook();
 const s=f.store.configure(ids.guild,{verification:true,verifiedRole:role.id,verificationMessage:'panel',verificationMode:'captcha'});
 const item=book.create(ids.guild,ids.user,s);f.store.configure(ids.guild,{verificationMode:'button'});
 let reply;
 const i={customId:`captcha:answer:${item.id}`,inGuild:()=>true,guild:f.guild,user:{id:ids.user},fields:{getTextInputValue:()=>item.answer},deferReply:async()=>{},editReply:async value=>{reply=value;}};
 await handleVerification(i,f.store,book);assert.match(reply,/settings changed/);assert.equal(f.events.filter(e=>e[0]==='addRole').length,0);f.store.db.close();
});
