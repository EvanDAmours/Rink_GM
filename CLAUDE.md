# Claude project instructions

Read `CLAUDE_HANDOFF.md` before changes. This is an already implemented NHL franchise game. The immediate objective is to import and publish it in `EvanDAmours/Rink_GM`, with working desktop and `/mobile/` links. Preserve its engine, features, saves, embedded assets and sourced ratings. Do not replace it with a prototype, recreate it from screenshots, or port it to another framework just to deploy it.

Use `npm ci`, `npm test`, `npm run test:render`, and `npm run build:pages`. Copy package contents to the repository root and retain `.github/workflows/pages.yml`. `prebuilt/` and `PLAY-RINK-GM.html` are supplied ready-built outputs; the source build remains authoritative after any source changes.

McDavid's published baseline is 99 OVR, number 97, slapshot power 92. Use `src/engine/verifiedData.js` and its snapshot; never regenerate published individual attributes to force a computed OVR. Preserve save migrations, injury-off healing, and the reviewed automatic waiver-assignment behavior.

GitHub Pages cannot execute the schedule backend. Retain the labelled fallback; server-mediated live refresh requires a separately deployed endpoint using `server/nhlSchedule.js`.

Report actual push/PR/deployment outcomes and verify both live routes before calling publication complete. Do not report a predicted URL as already live.
