import { PermissionFlagsBits as P, PermissionsBitField, ChannelType } from 'discord.js';
import { Store } from '../../src/store.js';
export const ids={guild:'100000000000000001',role:'100000000000000002',channel:'100000000000000003',bot:'100000000000000004',user:'100000000000000005'};
export function fixture() {
  const store=new Store(':memory:');
  const events=[], channels=new Map(), roles=new Map(); let counter=100;
  const me={id:ids.bot,permissions:{has:()=>true},roles:{highest:{comparePositionTo:()=>1}}};
  const guild={id:ids.guild,ownerId:'owner',channels:{cache:channels},roles:{},members:{fetchMe:async()=>me}};
  function channel(id=String(counter++)) {
    const ch={id,name:`channel-${id}`,type:ChannelType.GuildText,permissionOverwrites:{cache:new Map()},permissionsFor:()=>({has:()=>true}),isTextBased:()=>true,
      send:async payload=>{events.push(['send',id,payload]);return {id:String(counter++),delete:async()=>events.push(['deleteMessage',id])};},
      delete:async()=>{events.push(['deleteChannel',id]);channels.delete(id);}};
    channels.set(id,ch); return ch;
  }
  function role(id=ids.role) {
    const value={id,managed:false,permissions:{bitfield:0n},delete:async()=>{events.push(['deleteRole',id]);roles.delete(id);}};
    roles.set(id,value); return value;
  }
  guild.channels.fetch=async id=>id?channels.get(id):channels;
  guild.channels.create=async data=>{events.push(['createChannel',data]);const ch=channel(); for(const overwrite of data.permissionOverwrites??[]) ch.permissionOverwrites.cache.set(overwrite.id,{allow:new PermissionsBitField(overwrite.allow??[]),deny:new PermissionsBitField(overwrite.deny??[])}); return ch;};
  guild.roles.fetch=async id=>roles.get(id);
  guild.roles.create=async data=>{events.push(['createRole',data]);return role(String(counter++));};
  const member={permissions:{has:()=>true},roles:{cache:new Map(),add:async r=>events.push(['addRole',r.id])},moderatable:true,kickable:true,bannable:true,
    timeout:async ms=>events.push(['timeout',ms]),kick:async()=>events.push(['kick']),ban:async()=>events.push(['ban'])};
  guild.members.fetch=async()=>member;
  return {store,events,guild,channel,role,me,member};
}
