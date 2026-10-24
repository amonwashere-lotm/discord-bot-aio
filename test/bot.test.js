import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, level } from '../src/store.js';
import { rankCard, leaderboardCard } from '../src/cards.js';
import { commands, slashData, parseArgs, resolveCommand, slashCommands } from '../src/commands.js';
import { help, handleHelp } from '../src/ui.js';
import { WindowCounter } from '../src/protection.js';
test('daily cooldown, guild isolation, and atomic transfers',()=>{
 const s=new Store(':memory:');
 assert.equal(s.daily('g','a',100000000),true); assert.equal(s.daily('g','a',100000001),false);
 assert.equal(s.transfer('g','a','b',501),false); assert.equal(s.user('g','a').balance,500);
 assert.equal(s.transfer('g','a','b',100),true); assert.equal(s.user('g','a').balance,400); assert.equal(s.user('g','b').balance,100);
 for(const amount of [-1,0,1.2,NaN,Infinity]) assert.equal(s.transfer('g','a','b',amount),false);
 assert.equal(s.transfer('g','a','a',1),false); assert.equal(s.user('other','a').balance,0);
 assert.equal(s.daily('g','a',186400000),true); s.db.close();
});
test('XP cooldown, rank ordering and level boundaries',()=>{
 const s=new Store(':memory:'); assert.equal(s.xp('g','a',100000),true); assert.equal(s.xp('g','a',159999),false); assert.equal(s.xp('g','a',160000),true);
 s.xp('g','b',200000); assert.equal(s.rank('g','a'),1); assert.equal(s.rank('g','b'),2); assert.equal(s.top('g')[0].xp,40);
 assert.equal(level(99),0); assert.equal(level(100),1); assert.equal(level(400),2); s.db.close();
});
test('all commands serialize for Discord and help discovers each category',()=>{
 for(const c of commands) assert.equal(slashData(c).name,c.name);
 const payload=help(commands,{id:'123',username:'tester'});
 const json=JSON.stringify(payload); for(const category of new Set(commands.map(c=>c.category))) assert.ok(json.includes(category));
 for(const c of commands) {
   const page=Math.floor(commands.filter(other=>other.category===c.category).indexOf(c)/6);
   assert.ok(JSON.stringify(help(commands,{id:'123',username:'tester'},c.category,'',undefined,{},page)).includes(c.description));
 }
});
test('prefix arguments enforce numeric bounds and retain reasons',()=>{
 const timeout=commands.find(c=>c.name==='timeout');
 assert.deepEqual(parseArgs(timeout,['<@123>','10','test','reason']),{user:'<@123>',minutes:10,reason:'test reason'});
 assert.throws(()=>parseArgs(timeout,['123','40321'])); assert.throws(()=>parseArgs(timeout,['123']));
});
test('help rejects interactions from other users',async()=>{
 let replied=false; await handleHelp({customId:'help:close:123',user:{id:'456'},reply:async()=>{replied=true;}},commands); assert.ok(replied);
});
test('security windows expire and isolate executors',()=>{
 const c=new WindowCounter(100,3); assert.equal(c.hit('a',0),false); assert.equal(c.hit('a',1),false); assert.equal(c.hit('b',2),false); assert.equal(c.hit('a',3),true); assert.equal(c.hit('a',103),false); c.sweep(300); assert.equal(c.entries.size,0);
});
test('rank and leaderboard produce real PNG buffers',()=>{
 for(const buffer of [rankCard('Test',{xp:250},1),leaderboardCard([{name:'Test',xp:250}]),leaderboardCard([])]) {
 assert.equal(buffer.subarray(1,4).toString(),'PNG'); assert.ok(buffer.length>1000);
 }
});

test('automod blocks invites and exempts moderators',async()=>{
 const {installProtection}=await import('../src/protection.js'); const s=new Store(':memory:'); s.configure('g',{automod:true,logChannel:'logs'});
 const alerts=[]; const moderate=installProtection({on(){},user:{id:'bot'}},s);
 const guild={id:'g',channels:{fetch:async()=>({isTextBased:()=>true,send:async p=>alerts.push(p)})}};
 let deleted=0;
 const m={guild,channel:{id:'channel'},author:{id:'u'},member:{permissions:{has:()=>false}},mentions:{users:new Map(),everyone:false},content:'join discord.gg/example',delete:async()=>{deleted++;}};
 assert.equal(await moderate(m),true); assert.equal(deleted,1); assert.equal(alerts.length,1);
 m.member.permissions.has=()=>true; assert.equal(await moderate(m),false); assert.equal(deleted,1); s.db.close();
});
test('anti-nuke deduplicates audit entries, exempts owner and acts at threshold',async()=>{
 const {installProtection}=await import('../src/protection.js'); const {AuditLogEvent}=await import('discord.js');
 const s=new Store(':memory:'); s.configure('g',{antinuke:true,logChannel:'logs'});
 let handler, bans=0; const logs=[];
 installProtection({on:(name,fn)=>{handler=fn;},user:{id:'bot'}},s);
 const guild={id:'g',ownerId:'owner',members:{fetch:async()=>({bannable:true,ban:async()=>{bans++;}})},channels:{fetch:async()=>({isTextBased:()=>true,send:async p=>logs.push(p)})}};
 const entry=(id,executorId='u')=>({id,executorId,createdTimestamp:Date.now(),action:AuditLogEvent.ChannelDelete});
 await handler(entry('owner1','owner'),guild); await handler(entry('owner2','owner'),guild); await handler(entry('owner3','owner'),guild); assert.equal(bans,0);
 await handler(entry('1'),guild); await handler(entry('1'),guild); await handler(entry('2'),guild); assert.equal(bans,0);
 await handler(entry('3'),guild); assert.equal(bans,1); assert.equal(logs.length,1); s.db.close();
});


test('all aliases are unique and resolve to the same command and permissions',()=>{
 const names=new Set();
 for(const command of commands) {
   assert.ok(command.aliases.length>0,`${command.name} needs an alias`);
   for(const name of [command.name,...command.aliases]) {
     assert.match(name,/^[a-z][a-z0-9-]{0,31}$/);
     assert.ok(!names.has(name),`Duplicate command name: ${name}`); names.add(name);
     assert.equal(resolveCommand(name),command);
     assert.equal(resolveCommand(name.toUpperCase()),command);
   }
 }
 assert.equal(resolveCommand('unknown'),undefined);
});
test('slash aliases preserve options and permissions of their original commands',()=>{
 const registered=slashCommands();
 assert.ok(registered.length<=100);
 assert.equal(registered.length,commands.reduce((sum,c)=>sum+c.aliases.length+1,0));
 for(const command of commands) {
   const original=slashData(command);
   for(const alias of command.aliases) {
     const data=registered.find(c=>c.name===alias);
     assert.deepEqual({...data,name:command.name},original);
   }
 }
});
test('help displays and searches every alias without duplicate command entries',()=>{
 const user={id:'123',username:'tester'};
 for(const command of commands) {
   const page=Math.floor(commands.filter(other=>other.category===command.category).indexOf(command)/6);
   const category=JSON.stringify(help(commands,user,command.category,'',undefined,{},page));
   for(const alias of command.aliases) {
     assert.ok(category.includes(alias));
     const payload=help(commands,user,'search',alias.toUpperCase());
     const content=payload.components[0].toJSON().components.filter(c=>c.type===10).map(c=>c.content).join('\n');
     assert.ok(content.includes(`**?${command.name}`));
     assert.equal(content.split('\n').filter(line=>line.startsWith(`**?${command.name}**`)||line.startsWith(`**?${command.name} `)).length,1);
   }
 }
 const container=help(commands,user,'all').components[0].toJSON();
 const textLength=container.components.filter(c=>c.type===10).reduce((sum,c)=>sum+c.content.length,0);
 assert.ok(textLength<=4000);
});
