import {legacyCloudTeam} from './engine/gameIdentity.js';
// Hosting adapters. When Rink GM runs as a published claude.ai page it gets a
// per-player cloud backup (the `db` capability, private to each viewer) and
// file saving through the `downloads` capability. Run anywhere else (vite dev,
// a static host) every helper quietly falls back to plain browser behavior.
import LZString from "lz-string";
import {snapshotRng} from "./engine/rng.js";

const CHUNK = 180000; // characters per cloud document (documents cap at 256 KiB)
let cloudP = null;
const cloudOwners = new WeakMap();

function claudeUse(name) {
  try {
    return window.claude?.use ? window.claude.use(name) : Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
}

// Resolves { db, base } for this viewer's private save area, or null.
export async function cloud() {
  if (!cloudP) cloudP=Promise.all([claudeUse('db'),claudeUse('user')]).then(([db,user])=>db&&user?{db,user}:null).catch(()=>null);
  const capabilities=await cloudP;if(!capabilities)return null;
  const id=await capabilities.user.id();if(!id)return null;
  return {...capabilities,id,base:`data/users/${encodeURIComponent(id)}/rink-gm`,legacyBase:`data/users/${encodeURIComponent(id)}`};
}
const stillCurrent = async c => await c.user.id() === c.id;
async function readCloudMeta(c) {
  if(!c)return null;
  const snap=await c.db.doc(`${c.base}/save`).get();
  if(!await stillCurrent(c))return null;
  if(snap.exists){const m=snap.data();return !m.game || m.game==='rink-gm'?m:null;}
  const legacy=await c.db.doc(`${c.legacyBase}/save`).get();
  if(!legacy.exists || !await stillCurrent(c))return null;
  const m=legacy.data();return (m.game==='rink-gm' || !m.game && legacyCloudTeam(m.team))?{...m,legacy:true}:null;
}

export const cloudStatus = { state: "checking", savedAt: null, error: null };

export async function cloudSave(league) {
  const c = await cloud();
  if (!c) {
    cloudStatus.state = "off";
    return false;
  }
  const owner=cloudOwners.get(league);
  if(owner && owner!==c.id){cloudStatus.state='error';cloudStatus.error='Account changed. Reload before backing up this league.';return false;}
  cloudOwners.set(league,c.id);
  try {
    const packed = LZString.compressToBase64(JSON.stringify({...league,game:"rink-gm",savedRng:snapshotRng()}));
    const saveId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const n = Math.ceil(packed.length / CHUNK);
    const meta = c.db.doc(`${c.base}/save`);
    for (let i = 0; i < n; i++) {
      await meta.collection("chunks").doc(`c${i}`).set({ saveId, i, s: packed.slice(i * CHUNK, (i + 1) * CHUNK) });
    }
    if(!await stillCurrent(c))return false;
    const user = league.teams[league.userTid];
    const savedAt = Date.now();
    await meta.set({ game:"rink-gm", saveId, n, savedAt, team: `${user.city} ${user.name}`, year: league.year, phase: league.phase });
    cloudStatus.state = "on";
    cloudStatus.savedAt = savedAt;
    cloudStatus.error = null;
    return true;
  } catch (e) {
    cloudStatus.state = "error";
    cloudStatus.error = e?.code === "quota_exceeded" ? "Cloud storage is full." : e?.code === "invalid_argument" ? "This view can't save to the cloud." : "Cloud backup failed; will retry.";
    return false;
  }
}

export async function cloudMeta() {
  const c = await cloud();
  if (!c) {
    cloudStatus.state = "off";
    return null;
  }
  try {
    const m = await readCloudMeta(c);
    cloudStatus.state = "on";
    if (!m) return null;
    cloudStatus.savedAt = m.savedAt;
    return m;
  } catch {
    return null;
  }
}

export async function cloudLoad() {
  const c = await cloud();
  const meta = await readCloudMeta(c);
  if (!c || !meta || !Number.isInteger(meta.n) || meta.n<1 || meta.n>256) return null;
  const parts = [];
  for (let i = 0; i < meta.n; i++) {
    const snap = await c.db.doc(`${meta.legacy?c.legacyBase:c.base}/save`).collection("chunks").doc(`c${i}`).get();
    const d = snap.exists ? snap.data() : null;
    if (!d || d.saveId !== meta.saveId) return null;
    parts.push(d.s);
  }
  const json = LZString.decompressFromBase64(parts.join(""));
  if (!json || !await stillCurrent(c))return null;
  const league=JSON.parse(json);cloudOwners.set(league,c.id);return league;
}

// Offer a file to the player. Returns "saved", "declined" or "failed".
export async function saveFile(filename, text) {
  const dl = await claudeUse("downloads");
  if (dl) {
    try {
      await dl.save({ filename, data: new Blob([text]) });
      return "saved";
    } catch (e) {
      return e?.code === "declined" ? "declined" : "failed";
    }
  }
  if (window.claude) return "failed"; // inside a viewer without downloads: links are inert
  try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
    return "saved";
  } catch {
    return "failed";
  }
}

export async function cloudDelete() {
  const c = await cloud();
  const meta = await readCloudMeta(c);
  if (!c || !meta) return;
  try {
    const ref = c.db.doc(`${meta.legacy?c.legacyBase:c.base}/save`);
    for (let i = 0; i < meta.n; i++) await ref.collection("chunks").doc(`c${i}`).delete();
    await ref.delete();
  } catch {
    /* best effort */
  }
}
