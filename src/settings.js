// Validated configuration shared by admin commands, runtime modules and setup.
export const tuning = Object.freeze({
  spamCount:{default:6,min:2,max:30}, spamWindowSeconds:{default:8,min:2,max:60},
  duplicateCount:{default:4,min:2,max:20}, duplicateWindowSeconds:{default:30,min:5,max:120},
  mentionLimit:{default:5,min:2,max:50}, capsPercent:{default:0,min:0,max:100},
  blockInvites:{default:true,type:'boolean'}, blockLinks:{default:false,type:'boolean'},
  blockedWords:{default:[],type:'words'}, automodTimeoutSeconds:{default:60,min:0,max:86400},
  antinukeCount:{default:3,min:2,max:20}, antinukeWindowSeconds:{default:15,min:5,max:60},
  xpAmount:{default:20,min:1,max:1000}, xpCooldownSeconds:{default:60,min:10,max:3600},
  dailyAmount:{default:500,min:1,max:100000}, dailyCooldownMinutes:{default:1440,min:60,max:10080},
  workAmount:{default:200,min:1,max:10000}, workCooldownMinutes:{default:60,min:5,max:1440},
  verificationMode:{default:'button',choices:['button','captcha']}, verifyMinAgeHours:{default:0,min:0,max:8760},
  honeypotTimeoutMinutes:{default:60,min:1,max:40320}
});
export const listKeys=Object.freeze({'automod-user':'automodUsers','automod-role':'automodRoles','automod-channel':'automodChannels','antinuke-user':'antinukeUsers','honeypot-user':'honeypotUsers','leveling-channel':'levelingChannels'});
export function defaults() {
  return {...Object.fromEntries(Object.entries(tuning).map(([key,s])=>[key,Array.isArray(s.default)?[]:s.default])),...Object.fromEntries(Object.values(listKeys).map(key=>[key,[]])),levelRoles:{}};
}
export function parseSetting(key,input) {
  const spec=tuning[key]; if(!Object.hasOwn(tuning,key)) throw new Error('Unknown setting. Use /tune to list settings.');
  const value=String(input).trim();
  if(spec.type==='boolean') { if(!['on','off','true','false'].includes(value)) throw new Error('Use on or off.'); return ['on','true'].includes(value); }
  if(spec.type==='words') {
    if(value==='clear') return [];
    const words=[...new Set(value.split(',').map(w=>w.trim().normalize('NFKC').toLowerCase()).filter(Boolean))];
    if(words.length>25||words.some(w=>w.length>40)||!words.length) throw new Error('Use up to 25 comma-separated words/phrases, each up to 40 characters, or clear.');
    return words;
  }
  if(spec.choices) { if(!spec.choices.includes(value)) throw new Error(`Use ${spec.choices.join(' or ')}.`); return value; }
  const number=Number(value);
  if(!Number.isSafeInteger(number)||number<spec.min||number>spec.max) throw new Error(`Use an integer from ${spec.min} to ${spec.max}.`);
  return number;
}
export function applyPreset(draft,preset) {
  if(preset==='keep') return;
  if(!['balanced','strict'].includes(preset)) throw new Error('Unknown preset.');
  Object.assign(draft,{spamCount:preset==='strict'?4:6,spamWindowSeconds:8,duplicateCount:preset==='strict'?3:4,duplicateWindowSeconds:30,mentionLimit:preset==='strict'?3:5,antinukeCount:preset==='strict'?2:3,antinukeWindowSeconds:15,verificationMode:preset==='strict'?'captcha':'button',verifyMinAgeHours:preset==='strict'?24:0});
}
