// Offline play, as in the football game: the published game keeps itself on this device (see
// public/sw.js) so it runs with no connection, like on a plane. This panel shows whether it's
// ready, saves it on demand (plus your club's player photos), and explains how to install it as
// an app. The service worker is registered only where build-artifact.mjs marked the page with
// <meta name="rink-sw">: the desktop page and /mobile/ on GitHub Pages, never the single-file
// copy or a claude.ai artifact.
import React, { useEffect, useState } from "react";
import { headshotId, headshotUrl } from "./Headshot.jsx";

const hasDoc = typeof window !== "undefined" && typeof document !== "undefined";

// Where the worker lives and which pages it looks after (this page's folder).
export function swInfo() {
  if (!hasDoc) return null;
  const src = document.querySelector('meta[name="rink-sw"]')?.getAttribute("content");
  if (!src || !("serviceWorker" in navigator) || window.claude) return null;
  try {
    const url = new URL(src, window.location.href);
    const scope = new URL("./", window.location.href);
    if (url.origin !== window.location.origin) return null;
    return { url: url.href, scope: scope.href, scopePath: scope.pathname, root: new URL("./", url).href };
  } catch { return null; }
}
const cacheName = (info) => `rink-gm-v1 ${info.scopePath}`;

let regP = null;
export function registerServiceWorker() {
  const info = swInfo();
  if (!info) return Promise.resolve(null);
  if (!regP) regP = navigator.serviceWorker.register(info.url, { scope: info.scope }).catch(() => null);
  return regP;
}

// The browser's "install this app" offer (Chrome, Edge, Android) is caught early in main.jsx.
const installPrompt = () => (hasDoc ? window.__installPrompt || null : null);
const isInstalled = () => hasDoc && (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);
const isIOS = () => hasDoc && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export function useOnline() {
  const [on, setOn] = useState(!hasDoc || navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return on;
}

// A small "Offline" tag for the top bar.
export function OfflineChip() {
  const on = useOnline();
  if (on) return null;
  return <span className="rk-offchip" title="No connection. Everything works; your league saves on this device.">Offline</span>;
}

async function readyInfo(info) {
  try {
    if (!info || !("caches" in window)) return null;
    const hit = await caches.match(`${info.scopePath}__offline-ready`, { cacheName: cacheName(info) });
    return hit ? await hit.json() : null;
  } catch { return null; }
}

// Your club's player photos (the NHL's headshots), saved so the roster has faces offline too.
function teamPhotoUrls(league) {
  if (!league) return [];
  const t = league.teams[league.userTid];
  const ids = new Set();
  for (const id of [...t.roster, ...(t.prospects || [])]) { const hid = headshotId(league.players[id]); if (hid) ids.add(hid); }
  return [...ids].map(headshotUrl);
}

export default function OfflinePanel({ league }) {
  const online = useOnline();
  const info = swInfo();
  const supported = !!info && "caches" in window;
  const [ready, setReady] = useState(null); // { version, at, total } once saved
  const [latest, setLatest] = useState(null); // the version on the site now
  const [prog, setProg] = useState(null); // { done, total } while saving
  const [photos, setPhotos] = useState(null); // null | "saving" | "done"
  const [canInstall, setCanInstall] = useState(!!installPrompt());

  useEffect(() => {
    if (!supported) return undefined;
    readyInfo(info).then(setReady);
    if (navigator.onLine) fetch(new URL("offline.json", info.root), { cache: "no-store" }).then((r) => r.ok && r.json()).then((d) => d && setLatest(d.version)).catch(() => {});
    const onMsg = (e) => {
      if (e.data?.type === "offline" && e.data.scope === info.scopePath) {
        setProg(e.data.ready ? null : { done: e.data.done, total: e.data.total });
        if (e.data.ready) readyInfo(info).then(setReady);
      }
      if (e.data?.type === "saved-urls") setPhotos("done");
    };
    const onPrompt = () => setCanInstall(true);
    navigator.serviceWorker.addEventListener("message", onMsg);
    window.addEventListener("rk-install-ready", onPrompt);
    return () => { navigator.serviceWorker.removeEventListener("message", onMsg); window.removeEventListener("rk-install-ready", onPrompt); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const worker = async () => {
    await registerServiceWorker();
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
    return reg?.active || null;
  };
  const saveNow = async () => {
    if (!supported) return;
    setProg({ done: 0, total: 1 });
    const sw = await worker();
    if (!sw) { setProg(null); return; }
    sw.postMessage({ type: "save-all", scope: info.scopePath });
  };
  const savePhotos = async () => {
    const urls = teamPhotoUrls(league);
    const sw = urls.length ? await worker() : null;
    if (!sw) return;
    setPhotos("saving");
    sw.postMessage({ type: "save-urls", urls });
  };
  const install = async () => {
    const p = installPrompt();
    if (!p) return;
    p.prompt();
    try { await p.userChoice; } catch { /* dismissed */ }
    window.__installPrompt = null; setCanInstall(false);
  };

  const current = ready && (!latest || ready.version === latest);
  const nPhotos = teamPhotoUrls(league).length;
  const status = !supported ? "This copy of the game can't keep itself for offline play"
    : prog ? `Saving the game to this device… ${Math.round((prog.done / Math.max(1, prog.total)) * 100)}%`
    : current ? "✓ Ready to play with no connection"
    : ready ? "Saved, but there's a newer version: save it again"
    : "Not saved for offline yet";

  return (
    <div className="panel rk-offline" id="rk-offline">
      <div className="rk-off-top">
        <span className="rk-off-ico" aria-hidden="true">✈️</span>
        <div className="rk-off-txt">
          <div className="rk-off-k">Offline play <OfflineChip /></div>
          <div className={`rk-off-status${current ? " ok" : ""}`}>{status}</div>
        </div>
        {supported && online && !prog && <button className={current ? "" : "primary"} onClick={saveNow}>{current ? "Save again" : "Get ready for offline"}</button>}
      </div>
      {prog && <div className="rk-off-bar"><i style={{ width: `${(prog.done / Math.max(1, prog.total)) * 100}%` }} /></div>}
      {supported ? (
        <ol className="rk-off-steps">
          <li><span>While you're online, open the game once (on most browsers that's all it takes: it saves itself), or press <b>Get ready for offline</b> to be sure. It's about 3 MB.</span></li>
          <li><span>{isInstalled() ? "It's installed as an app on this device. Open it from your home screen or app list."
            : canInstall ? <>Install it as an app so it opens like one, even in airplane mode: <button className="small primary" onClick={install}>Install app</button></>
            : isIOS() ? <>On iPhone or iPad: tap Safari's <b>Share</b> button, then <b>Add to Home Screen</b>. Open it from there.</>
            : <>Install it as an app: in Chrome or Edge, use the install icon in the address bar (or the menu: <b>Install Rink GM</b>). On Android: menu ⋮ → <b>Add to Home screen</b>.</>}</span></li>
          <li><span>Offline, open the game from that icon (or the same web address in the same browser). Your league lives on this device and keeps working; export a league file from Settings to back it up or move it to another device.</span></li>
        </ol>
      ) : (
        <p className="muted small">Offline play works in the published web version of the game, opened in a browser like Safari or Chrome. The single-file copy (PLAY-RINK-GM.html) also runs with no connection once it's saved on your device.</p>
      )}
      {supported && (
        <p className="muted small rk-off-note">
          Offline you miss only the online extras: refreshing the NHL schedule, the cloud backup, and player photos you haven't seen yet (the club sweater stands in until then).
          {online && nPhotos > 0 && <> {photos === "done" ? <b className="rk-off-done">Your club's player photos are saved ✓</b> : <button className="link rk-off-link" disabled={photos === "saving"} onClick={savePhotos}>{photos === "saving" ? "Saving your club's photos…" : `Save your club's ${nPhotos} player photos now`}</button>}</>}
        </p>
      )}
    </div>
  );
}
