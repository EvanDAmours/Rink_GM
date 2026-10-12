import { defineConfig } from "vite";
import {getNhlSchedule} from "./server/nhlSchedule.js";
import react from "@vitejs/plugin-react";

// Relative base so the build works from any static host path (GitHub Pages, itch.io, a local file server).
export default defineConfig({
  plugins: [react(), {
    name:"nhl-schedule-service",
    configureServer(server){installScheduleRoute(server);},
    configurePreviewServer(server){installScheduleRoute(server);},
  }],
  base: process.env.VITE_BASE_PATH || "./",
  build: { outDir: "dist", sourcemap: false, assetsInlineLimit: 1000000 },
});

function installScheduleRoute(server){server.middlewares.use(async(req,res,next)=>{
  const url=new URL(req.url,"http://localhost");if(url.pathname!=="/api/nhl/schedule")return next();
  if(req.method!=="GET"){res.statusCode=405;return res.end();}
  try{const data=await getNhlSchedule(Number(url.searchParams.get("season")));res.setHeader("Content-Type","application/json");res.setHeader("Cache-Control","public, max-age=3600");res.end(JSON.stringify(data));}
  catch{res.statusCode=503;res.setHeader("Content-Type","application/json");res.end(JSON.stringify({error:"NHL schedule currently unavailable"}));}
});}
