import React,{useId} from 'react';
import {teamLogoUrl} from './logos.js';
import {sweaterFor,ROAD_WHITE} from '../engine/uniforms.js';

// Original SVG hockey sweater artwork. Player sweaters show the name/number on
// the back; a club-only sweater shows the chest crest, as on a real uniform.
const BODY='M49 15 L63 10 Q80 16 97 10 L111 15 Q125 19 137 34 L155 75 L132 88 L118 63 L123 157 Q80 167 37 157 L42 63 L28 88 L5 75 L23 34 Q35 19 49 15 Z';
export default function Jersey({team,player,size=105,decorative=false}){
  const uid=useId().replace(/:/g,''),home=team.uniform?.home!==false;
  // Colours shared with the live rink (engine/uniforms.js): home in the club's colour, road in white.
  const H=sweaterFor(team),R=home?H:sweaterFor(team,{away:true}),main=H.body,trim=H.trim;
  const body=home?main:ROAD_WHITE,ink=R.number,edge=R.edge,style=team.uniform?.style || 0;
  const surname=player?.name?.split(' ').slice(1).join(' ').toUpperCase() || team.abbr;
  const number=player?.number,crest=teamLogoUrl(team.abbr),back=Boolean(player);
  return <svg className="hockey-sweater" width={size} height={size*1.1} viewBox="0 0 160 176" aria-hidden={decorative || undefined} role={decorative?undefined:'img'} aria-label={decorative?undefined:`${team.abbr} ${home?'home':'away'} jersey${player?` · ${player.name} · ${number?`number ${number}`:player.pos}`:''}`}>
    <defs>
      <linearGradient id={uid+'light'} x1="0" x2="1" y2=".3"><stop stopColor="#fff" stopOpacity=".21"/><stop offset=".25" stopColor="#fff" stopOpacity="0"/><stop offset=".55" stopColor="#fff" stopOpacity=".08"/><stop offset="1" stopColor="#000" stopOpacity=".32"/></linearGradient>
      <linearGradient id={uid+'fold'}><stop stopColor="#000" stopOpacity=".3"/><stop offset=".5" stopColor="#fff" stopOpacity=".1"/><stop offset="1" stopColor="#000" stopOpacity="0"/></linearGradient>
      <clipPath id={uid+'cut'}><path d={BODY}/></clipPath>
    </defs>
    <ellipse cx="80" cy="167" rx="40" ry="5" fill="#000" opacity=".22"/>
    <path d={BODY} fill={body} stroke="#ffffff30" strokeWidth="1.4"/>
    <g clipPath={`url(#${uid}cut)`}>
      {[1,2].includes(style) && <path d={style===1?'M18 28 Q80 -4 142 28 L126 43 Q80 23 34 43 Z':'M30 56 H130 V88 H30 Z'} fill={trim}/>}
      <path d="M33 131 H128 V146 H33 Z M9 67 L38 79 L42 68 L14 56 Z M146 56 L118 68 L122 79 L151 67 Z" fill={trim}/>
      <path d="M33 129 H128 M33 148 H128 M12 54 L41 66 M119 66 L148 54" stroke={home?'#f8fafc':main} strokeWidth={style===3?5:2.8}/>
      <path d="M38 156 Q80 166 122 156" fill="none" stroke="#000" strokeOpacity=".22" strokeWidth="6"/>
      <path d="M42 64 Q45 96 40 130 L48 129 Q50 94 45 53 Z M117 64 Q115 96 121 130 L112 129 Q110 94 115 53 Z" fill={`url(#${uid}fold)`}/>
      <path d={BODY} fill={`url(#${uid}light)`}/>
      <path d="M28 32 Q38 36 44 53 M132 32 Q122 36 116 53 M45 53 Q48 95 43 125 M115 53 Q112 95 117 125 M42 154 Q80 161 118 154" fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth=".7" strokeDasharray="1.2 1.5"/>
    </g>
    <path d="M62 11 Q80 18 98 11 L95 23 Q80 30 65 23 Z" fill={trim} stroke="#fff" strokeOpacity=".4" strokeWidth=".9"/>
    <path d="M66 12 Q80 18 94 12 L91 19 Q80 23 69 19 Z" fill="#0a1018"/>
    {back?<>
      <path d="M48 37 Q80 32 112 37 L110 49 Q80 44 50 49 Z" fill={body} stroke="#ffffff18" strokeWidth=".6"/>
      <text x="80" y="44" textAnchor="middle" fill={ink} fontFamily="var(--display),sans-serif" fontSize={surname.length>13?8:10} fontWeight="700" letterSpacing="1" textLength={surname.length>10?59:undefined} lengthAdjust="spacingAndGlyphs">{surname}</text>
      <text x="80" y="115" textAnchor="middle" fill={ink} stroke={edge} strokeWidth="2.3" paintOrder="stroke" fontFamily="var(--display),sans-serif" fontSize="66" fontWeight="800" letterSpacing="1">{number || player.pos}</text>
      {number && <><text transform="translate(25 57) rotate(24)" textAnchor="middle" fill={ink} fontFamily="var(--display),sans-serif" fontSize="14" fontWeight="800">{number}</text><text transform="translate(135 57) rotate(-24)" textAnchor="middle" fill={ink} fontFamily="var(--display),sans-serif" fontSize="14" fontWeight="800">{number}</text></>}
    </>:crest?<image href={crest} x="48" y="51" width="64" height="63"/>:<text x="80" y="92" textAnchor="middle" fill={ink} fontSize="20">{team.abbr}</text>}
  </svg>;
}
