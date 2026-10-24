import { createCanvas } from '@napi-rs/canvas';
import { level } from './store.js';
function base(height, title, subtitle) {
  const canvas = createCanvas(1000,height); const ctx = canvas.getContext('2d');
  ctx.fillStyle='#09090b'; ctx.fillRect(0,0,1000,height);
  ctx.strokeStyle='#27272a'; ctx.lineWidth=2; ctx.strokeRect(20,20,960,height-40);
  ctx.fillStyle='#fafafa'; ctx.font='bold 30px sans-serif'; ctx.fillText(title,55,75);
  ctx.fillStyle='#a1a1aa'; ctx.font='18px sans-serif'; ctx.fillText(subtitle,55,108);
  return {canvas,ctx};
}
const clean = name => String(name).replace(/[\x00-\x1f]/g,'').slice(0,28);
export function rankCard(name, user, rank) {
  const {canvas,ctx}=base(350,'PLAYER PROFILE',clean(name));
  const current=level(user.xp), floor=current**2*100, next=(current+1)**2*100;
  ctx.fillStyle='#fafafa'; ctx.font='bold 46px sans-serif';
  ctx.fillText(`LEVEL ${current}`,55,190); ctx.fillText(`#${rank}`,780,190);
  ctx.fillStyle='#27272a'; ctx.fillRect(55,235,890,12);
  ctx.fillStyle='#e4e4e7'; ctx.fillRect(55,235,890*(user.xp-floor)/(next-floor),12);
  ctx.font='18px sans-serif'; ctx.fillText(`${user.xp-floor} / ${next-floor} XP`,55,290);
  ctx.fillStyle='#71717a'; ctx.fillText(`${user.xp} TOTAL XP`,730,290);
  return canvas.toBuffer('image/png');
}
export function leaderboardCard(rows) {
  const {canvas,ctx}=base(200+rows.length*65,'SERVER LEADERBOARD','The community, ranked by experience.');
  rows.forEach((row,i)=>{
    const y=165+i*65; ctx.fillStyle=i===0?'#ffffff':'#a1a1aa'; ctx.font='bold 22px sans-serif';
    ctx.fillText(String(i+1).padStart(2,'0'),55,y); ctx.fillText(clean(row.name),120,y);
    ctx.font='18px sans-serif'; ctx.fillText(`LVL ${level(row.xp)}`,700,y); ctx.fillText(`${row.xp} XP`,820,y);
    ctx.strokeStyle='#27272a'; ctx.beginPath(); ctx.moveTo(55,y+20); ctx.lineTo(945,y+20); ctx.stroke();
  });
  if (!rows.length) { ctx.fillStyle='#a1a1aa'; ctx.font='22px sans-serif'; ctx.fillText('Send a message to start the leaderboard.',55,165); }
  return canvas.toBuffer('image/png');
}
