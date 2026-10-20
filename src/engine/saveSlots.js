import {saveLeague,saveSummary,hasSave} from "./league.js";
import {SAVE_KEY} from "./constants.js";
import {loadRepairedKey} from "./repair.js";
export const SLOT_COUNT=3;
const key=i=>`rinkgm_slot_${i}`;
const valid=i=>Number.isInteger(i) && i>=0 && i<SLOT_COUNT;
export function saveSlot(league,index){return valid(index) && saveLeague(league,key(index));}
// Slots and the backup are repaired as they're read (repair.js): read* also returns the fixes.
export function readSlot(index){return valid(index)?loadRepairedKey(key(index)):{league:null,fixes:[]};}
export function loadSlot(index){return readSlot(index).league;}
export function listSlots(){return Array.from({length:SLOT_COUNT},(_,i)=>{const lg=loadSlot(i);return {index:i,occupied:hasSave(key(i)),summary:lg?saveSummary(lg):null,savedAt:lg?.savedAt};});}

// The automatic backup: before every phase change the autosave (already compressed and
// packed) is copied to its own key with a label, so a bad off-season can be undone.
// Storage trouble is never fatal: a backup that doesn't fit is simply skipped, and the
// autosave can drop the backup to make room for itself (see dropBackup).
export const BACKUP_KEY="rinkgm_backup";
export const BACKUP_META_KEY="rinkgm_backup_meta";
export function backupSave(league,label){
  try{
    const raw=localStorage.getItem(SAVE_KEY);if(!raw)return false;
    localStorage.setItem(BACKUP_KEY,raw);
    try{localStorage.setItem(BACKUP_META_KEY,JSON.stringify({label,savedAt:Date.now(),...(league?saveSummary(league):{})}));}
    catch{localStorage.removeItem(BACKUP_KEY);localStorage.removeItem(BACKUP_META_KEY);return false;} // a backup without its label is no use
    return true;
  }catch{return false;}
}
export function backupInfo(){
  try{
    if(!localStorage.getItem(BACKUP_KEY))return null;
    const meta=JSON.parse(localStorage.getItem(BACKUP_META_KEY)||"null");
    return meta&&typeof meta==="object"?meta:{label:"an earlier stage"};
  }catch{return null;}
}
export function readBackup(){return loadRepairedKey(BACKUP_KEY);}
export function loadBackup(){return readBackup().league;}
// Put the backup back as the autosave (the crash screen does this before reloading).
export function restoreBackupRaw(){
  try{const raw=localStorage.getItem(BACKUP_KEY);if(!raw)return false;localStorage.setItem(SAVE_KEY,raw);return true;}catch{return false;}
}
export function dropBackup(){
  try{const had=!!localStorage.getItem(BACKUP_KEY);localStorage.removeItem(BACKUP_KEY);localStorage.removeItem(BACKUP_META_KEY);return had;}catch{return false;}
}
