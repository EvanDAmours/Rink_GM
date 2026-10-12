import {saveLeague,loadLeague,saveSummary,hasSave} from "./league.js";
export const SLOT_COUNT=3;
const key=i=>`rinkgm_slot_${i}`;
const valid=i=>Number.isInteger(i) && i>=0 && i<SLOT_COUNT;
export function saveSlot(league,index){return valid(index) && saveLeague(league,key(index));}
export function loadSlot(index){return valid(index)?loadLeague(key(index)):null;}
export function listSlots(){return Array.from({length:SLOT_COUNT},(_,i)=>{const lg=loadSlot(i);return {index:i,occupied:hasSave(key(i)),summary:lg?saveSummary(lg):null,savedAt:lg?.savedAt};});}
