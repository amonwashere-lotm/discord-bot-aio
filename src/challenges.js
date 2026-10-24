import { randomBytes, randomInt } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export class ChallengeBook {
  constructor() { this.items=new Map(); this.recent=new Map(); }
  create(guild,user,settings,now=Date.now()) {
    this.sweep(now); const key=`${guild}:${user}`;
    if(this.recent.has(key)&&now-this.recent.get(key)<30000) throw new Error('Wait 30 seconds before requesting another challenge.');
    if(this.items.size>=5000) throw new Error('Verification is busy. Try again shortly.');
    for(const [id,item] of this.items) if(item.guild===guild&&item.user===user) this.items.delete(id);
    const id=randomBytes(16).toString('hex'), answer=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');
    const item={id,answer,guild,user,panel:settings.verificationMessage,role:settings.verifiedRole,expires:now+180000,attempts:0};
    this.items.set(id,item); this.recent.set(key,now); return item;
  }
  get(id,guild,user,now=Date.now()) {
    const item=this.items.get(id);
    if(!item||item.expires<=now) { this.items.delete(id); throw new Error('Challenge expired or used. Press Verify for a new one.'); }
    if(item.guild!==guild||item.user!==user) throw new Error('This challenge belongs to another member.');
    return item;
  }
  answer(id,guild,user,value,now=Date.now()) {
    const item=this.get(id,guild,user,now);
    if(String(value).trim().toUpperCase()!==item.answer) {
      item.attempts++;
      if(item.attempts>=3) this.items.delete(id);
      throw new Error(item.attempts>=3?'Three incorrect attempts. Request a new challenge.':`Incorrect code. ${3-item.attempts} attempts remain.`);
    }
    this.items.delete(id); return item;
  }
  sweep(now=Date.now()) {
    for(const [id,item] of this.items) if(item.expires<=now) this.items.delete(id);
    for(const [id,time] of this.recent) if(now-time>180000) this.recent.delete(id);
  }
}
export function captchaImage(code) {
  const canvas=createCanvas(360,120), ctx=canvas.getContext('2d');
  ctx.fillStyle='#111114'; ctx.fillRect(0,0,360,120);
  for(let i=0;i<60;i++) {ctx.fillStyle='#52525b';ctx.fillRect(randomInt(360),randomInt(120),2,2);}
  ctx.font='bold 38px sans-serif'; ctx.textBaseline='middle';
  for(let index=0;index<code.length;index++) {
    ctx.save();ctx.translate(35+index*53,60+randomInt(-8,9));ctx.rotate(randomInt(-15,16)*Math.PI/180);ctx.fillStyle='#fafafa';ctx.fillText(code[index],0,0);ctx.restore();
  }
  for(let i=0;i<4;i++) {ctx.beginPath();ctx.strokeStyle='#71717a';ctx.moveTo(0,randomInt(120));ctx.lineTo(360,randomInt(120));ctx.stroke();}
  return canvas.toBuffer('image/png');
}
