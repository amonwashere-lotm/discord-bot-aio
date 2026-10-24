import { createCanvas } from '@napi-rs/canvas';
import { BRAND } from './brand.js';
import { level } from './store.js';
function base(height, title, subtitle, background=null) {
  const canvas = createCanvas(1000,height); const ctx = canvas.getContext('2d');
  ctx.fillStyle='#09090b'; ctx.fillRect(0,0,1000,height);
  if(background) {
    // Center-crop to cover the entire card without stretching the avatar.
    const scale=Math.max(canvas.width/background.width,height/background.height);
    const width=background.width*scale, imageHeight=background.height*scale;
    ctx.drawImage(background,(canvas.width-width)/2,(height-imageHeight)/2,width,imageHeight);
    const shade=ctx.createLinearGradient(0,0,canvas.width,height);
    shade.addColorStop(0,'rgba(9,9,11,0.86)'); shade.addColorStop(1,'rgba(9,9,11,0.55)');
    ctx.fillStyle=shade; ctx.fillRect(0,0,canvas.width,height);
  }
  ctx.strokeStyle='#27272a'; ctx.lineWidth=2; ctx.strokeRect(20,20,960,height-40);
  ctx.fillStyle='#fafafa'; ctx.font='bold 30px sans-serif'; ctx.fillText(title,55,75);
  ctx.fillStyle='#a1a1aa'; ctx.font='18px sans-serif'; ctx.fillText(subtitle,55,108);
  return {canvas,ctx};
}
const clean = name => String(name).replace(/[\x00-\x1f]/g,'').slice(0,28);
export function fitText(ctx,text,width) {
  let value=String(text).replace(/[\x00-\x1f]/g,'');
  if(ctx.measureText(value).width<=width) return value;
  const chars=Array.from(value); while(chars.length&&ctx.measureText(chars.join('')+'…').width>width) chars.pop();
  return chars.join('')+'…';
}
export function rankCard(name, user, rank, avatar=null) {
  const {canvas,ctx}=base(350,`${BRAND.toUpperCase()} · PLAYER PROFILE`,'',avatar);
  if(avatar) {ctx.save();ctx.beginPath();ctx.arc(895,87,40,0,Math.PI*2);ctx.clip();ctx.drawImage(avatar,855,47,80,80);ctx.restore();}
  ctx.fillStyle='#e4e4e7';ctx.font='18px sans-serif';ctx.fillText(fitText(ctx,name,700),55,108);
  const current=level(user.xp), floor=current**2*100, next=(current+1)**2*100;
  ctx.fillStyle='#fafafa'; ctx.font='bold 46px sans-serif';
  ctx.fillText(`LEVEL ${current}`,55,190); ctx.fillText(`#${rank}`,780,190);
  ctx.fillStyle='#27272a'; ctx.fillRect(55,235,890,12);
  ctx.fillStyle='#e4e4e7'; ctx.fillRect(55,235,890*(user.xp-floor)/(next-floor),12);
  ctx.font='18px sans-serif'; ctx.fillText(`${user.xp-floor} / ${next-floor} XP`,55,290);
  ctx.fillStyle='#d4d4d8'; ctx.textAlign='right';ctx.fillText(`${user.xp.toLocaleString()} TOTAL XP`,945,290);
  return canvas.toBuffer('image/png');
}
export function leaderboardCard(rows) {
  const {canvas,ctx}=base(200+rows.length*65,`${BRAND.toUpperCase()} · SERVER LEADERBOARD`,'The community, ranked by experience.');
  rows.forEach((row,i)=>{
    const y=165+i*65; ctx.fillStyle=i===0?'#ffffff':'#a1a1aa'; ctx.font='bold 22px sans-serif';
    ctx.fillText(String(i+1).padStart(2,'0'),55,y); ctx.fillText(fitText(ctx,row.name,540),120,y);
    ctx.font='18px sans-serif'; ctx.fillText(`LVL ${level(row.xp)}`,700,y); ctx.textAlign='right';ctx.fillText(fitText(ctx,`${row.xp.toLocaleString()} XP`,140),945,y);ctx.textAlign='left';
    ctx.strokeStyle='#27272a'; ctx.beginPath(); ctx.moveTo(55,y+20); ctx.lineTo(945,y+20); ctx.stroke();
  });
  if (!rows.length) { ctx.fillStyle='#a1a1aa'; ctx.font='22px sans-serif'; ctx.fillText('Send a message to start the leaderboard.',55,165); }
  return canvas.toBuffer('image/png');
}
