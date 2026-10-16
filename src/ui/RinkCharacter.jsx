import React,{useId} from 'react';
// Original code-native illustration; it is a uniformed character, not a player photo.
export default function RinkCharacter({team,player}){
 const id=useId().replace(/:/g,''),main=team.colors[0],trim=team.colors[1],goalie=player?.pos==='G';
 return <svg className="rink-character" viewBox="0 0 300 240" aria-hidden="true">
 <defs><pattern id={id+'fans'} width="24" height="25" patternUnits="userSpaceOnUse"><circle cx="9" cy="6" r="4" fill={main} opacity=".25"/><path d="M2 18Q9 8 16 18" fill={trim} opacity=".5"/></pattern><linearGradient id={id+'ice'} x2="0" y2="1"><stop stopColor="#fff"/><stop offset="1" stopColor="#dceaf7"/></linearGradient></defs>
 <rect x="8" y="20" width="284" height="89" rx="18" fill={`url(#${id}fans)`}/><path d="M14 106Q150 89 286 106L296 214Q150 246 4 214Z" fill={`url(#${id}ice)`}/><path d="M12 115Q150 98 288 115" stroke={trim} strokeWidth="7"/><path d="M18 126Q150 110 282 126" stroke="#bfd0df" strokeWidth="3"/>
 <ellipse cx="146" cy="214" rx="70" ry="12" fill="#6788a5" opacity=".17"/>
 <g className="character-skater"><path d="M121 132 111 181 137 199 149 184 142 146M153 139 162 183 186 198 199 184 175 132" fill={main} stroke="#1c334d" strokeWidth="3"/>
 {goalie&&<><path d="m104 163 30 4 1 42-36-5Z" fill="#fff7e8" stroke={trim} strokeWidth="4"/><path d="m161 161 29-3 11 42-36 7Z" fill="#fff7e8" stroke={trim} strokeWidth="4"/></>}
 <path d="m106 188 25 5 9 14-43 1q-7-10 9-20m58-1 27-2 17 17-41 8q-11-5-3-23" fill="#24364c"/><path d="m95 213 49-2m22 6 46-9" stroke="#738da4" strokeWidth="4" strokeLinecap="round"/>
 <path d="m120 65-30 13-24 44 19 13 26-31-3 48q37 12 73-3l-10-53 23 29 20-15-29-40-25-7Z" fill={main} stroke="#1c334d" strokeWidth="3"/>
 <path d="m78 107 18 12m80-24 18 20M111 132q28 8 65-1" stroke={trim} strokeWidth="10"/>
 <path d="m106 69 31 16 24-18" fill="none" stroke="#f3f4f7" strokeWidth="4"/>
 <text x="142" y="124" fill="#fff" fontSize="36" fontFamily="sans-serif" textAnchor="middle" fontWeight="900">{player?.number || team.abbr}</text>
 <path d="m128 45-3 26 17 11 17-17-2-24" fill="#c68659"/>
 <path d="M118 48q-2-35 24-37 29 0 34 30l-9 20-46-1Z" fill={main} stroke="#1c334d" strokeWidth="3"/><path d="m119 43 52 3-6 16-41-2Z" fill="#263c54"/><path d="m130 47 28 2" stroke="#b8d5e7" strokeWidth="4" strokeLinecap="round"/>
 <path d="m72 124 13 13-8 12-19-13m135-29 15 13 8-7-14-17" fill="#25364b" stroke={trim} strokeWidth="4"/>
 <path d="m65 137 124 69 35-8" stroke="#ad794c" strokeWidth="7" strokeLinecap="round"/><path d="m190 206 39-9" stroke="#23394f" strokeWidth="9" strokeLinecap="round"/>
 </g><ellipse cx="236" cy="214" rx="10" ry="4" fill="#20364d"/><path className="rink-spark" d="m53 61 4 10 11 1-9 7 2 11-8-6-10 5 3-11-8-8 11 1Zm194 72 3 7 8 1-6 5 1 8-7-5-7 3 2-7-5-6 8 1Z" fill={trim}/>
 </svg>;
}
