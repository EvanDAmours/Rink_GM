import viewports from '../assets/team-logos/bounds.json';
import manifest from '../assets/team-logos/manifest.json';
// Original NHL CDN artwork remains unchanged on disk. Tight display viewports
// remove the CDN's thumbnail margins while preserving a small protective border.
const sources=import.meta.glob('../assets/team-logos/*.svg',{eager:true,query:'?raw',import:'default'});
const hashes=Object.fromEntries(manifest.logos.map(item=>[item.abbr,item.sha256]));
const logos=Object.fromEntries(Object.entries(sources).map(([path,svg])=>{
 const abbr=path.split('/').at(-1).replace('.svg',''),bounds=viewports[abbr];
 const display=bounds?.sha256===hashes[abbr]?svg.replace(/viewBox="[^"]*"/,`viewBox="${bounds.viewBox}"`):svg;
 return [abbr,`data:image/svg+xml,${encodeURIComponent(display)}`];
}));
export const teamLogoUrl=abbr=>logos[abbr] || null;
export const logoCount=Object.keys(logos).length;
