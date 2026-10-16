import React from 'react';
import {useGame} from './common.jsx';
import Icon from './Icon.jsx';
export default function ClubhouseMoves({issues,points,phase}){
 const {go}=useGame();
 const moves=[
  issues.length?{icon:'roster',tag:'Needs a look',title:'Your lineup needs you',detail:issues[0],action:'Review roster',to:'roster',tone:'attention'}:{icon:'lines',tag:'Behind the bench',title:phase==='preseason'?'Get the lines humming':'Make your next game count',detail:phase==='preseason'?'Set your combinations before the puck drops.':'Choose a plan for the team on the other bench.',action:phase==='preseason'?'Set your lines':'Set a game plan',to:phase==='preseason'?'lines':'analysis',tone:'blue'},
  {icon:'draft',tag:'The next generation',title:'Find a future fan favourite',detail:`${points} scouting points ready to put to work.`,action:'Open draft room',to:'draft',tone:'gold'},
  {icon:'operations',tag:'The club office',title:'A little work. A bigger future.',detail:'Check your prospects, player roles and latest game report.',action:'Open planning & reports',to:'analysis',tone:'green'},
 ];
 return <section className="clubhouse-moves" aria-label="Your next moves"><div className="move-section-title"><h2>Your next moves</h2><span>One good decision at a time.</span></div><div className="move-cards">{moves.map(m=><button key={m.tag} className={`move-card move-${m.tone}`} onClick={()=>go(m.to)}><span className="move-icon"><Icon name={m.icon} size={24}/></span><span className="move-copy"><small>{m.tag}</small><strong>{m.title}</strong><span>{m.detail}</span><b>{m.action} <Icon name="arrow" size={15}/></b></span></button>)}</div></section>;
}
