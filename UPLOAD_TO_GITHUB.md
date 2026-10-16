# Upload Rink GM entirely through your computer's browser

Use `Rink_GM_Browser_Upload.zip` for this method. It contains the 86 files needed to update the existing EvanDAmours/Rink_GM repository. Unchanged files already on GitHub stay in place. No app or terminal is required.

## 1. Download and unzip

1. Download **Rink_GM_Browser_Upload.zip** and extract it.
   - Windows: right-click the ZIP → **Extract All**.
   - Mac: double-click the ZIP.
2. Open the extracted folder, then open **UPLOAD_THESE**.
3. Inside UPLOAD_THESE you should see folders named **src, docs, scripts, tests, prebuilt**, plus **package.json, README.md, ENGINE_REBUILD_HANDOFF.md, UPLOAD_TO_GITHUB.md, PLAY-RINK-GM.html**.
4. Keep that folder open in Finder/File Explorer. Before updating, export any current franchise from the old game's Settings as a backup.

## 2. Open the correct GitHub upload page

5. Sign in at https://github.com/EvanDAmours/Rink_GM.
6. Select the **Code** tab and confirm the branch selector says **main**.
7. Make sure you are at the repository's TOP LEVEL, where `package.json` and `src` are already listed. Do not open `src` or another subfolder.
8. Above the files, select **Add file → Upload files**. Direct link: https://github.com/EvanDAmours/Rink_GM/upload/main

## 3. Drag the update into GitHub

9. Return to the open **UPLOAD_THESE** folder on your computer.
10. Select EVERYTHING INSIDE it: **Ctrl+A** on Windows or **Cmd+A** on Mac.
11. Drag those selected files AND folders together into the large upload area in your browser. Upload the CONTENTS, not the UPLOAD_THESE folder itself and not the ZIP.
12. Wait for the uploads to finish. There are **86 files**, below GitHub's 100-file upload limit. The largest files are under 2 MiB, below its 25 MiB per-file limit.
13. Check the preview paths before committing. You should see entries such as:
    - `src/App.jsx`
    - `src/ui/clubhouse.css`
    - `src/engine/savePacking.js`
    - `prebuilt/index.html`
    - `package.json`

The preview MUST NOT start with `UPLOAD_THESE/` or `Rink-GM/`. If it does, cancel the upload and repeat from step 9, selecting the contents of UPLOAD_THESE. Existing files are updated at their existing paths; leave the rest of your repository in place.

## 4. Save the update to GitHub

14. In the commit message box, type **Complete Rink GM simulation, franchise and readability update**.
15. Select **Commit directly to the main branch** if offered, then click **Commit changes**. GitHub may show a final confirmation dialog; confirm it.
16. The repository should reopen with your new commit at the top. Open `src/ui/clubhouse.css` to confirm that the new file exists.

If direct commits to main are blocked, choose a new branch named `rink-gm-browser-update`, then **Propose changes → Create pull request**. Merge the pull request into main once its checks pass. The website publishes from main.

## 5. Publish the game

17. In the repository, open **Settings → Pages**.
18. Under **Build and deployment → Source**, choose **GitHub Actions**. Leave the existing `.github/workflows/pages.yml` workflow in place; it is already in your repository and this upload does not change it.
19. Open **Actions → Deploy to GitHub Pages**, then open the newest run. Wait for BOTH **build** and **deploy** to have green check marks. GitHub installs dependencies, runs the tests and builds the site for you.
20. If no run starts, open **Deploy to GitHub Pages → Run workflow**, select **main**, and click **Run workflow**.
21. Open the updated game:
    - Desktop: https://evandamours.github.io/Rink_GM/
    - Phone: https://evandamours.github.io/Rink_GM/mobile/
22. Refresh. In Chrome/Edge, use **Ctrl+Shift+R** (Windows) or **Cmd+Shift+R** (Mac) if the old design remains.
23. Confirm the light clubhouse design, **Your next moves**, **Game plans & reports**, and the **Text size / Reduce interface motion** settings appear.

## Quick fixes

- **GitHub says too many files:** you selected the earlier complete-source ZIP's folder. Use THIS browser packet's UPLOAD_THESE contents: 86 files.
- **The file picker won't let you select folders:** use Finder/File Explorer to drag the selected files and folders into the browser upload area. Keep all folder paths intact.
- **You only see the ZIP on GitHub:** uploading a ZIP does not install it. Extract it on your computer and upload UPLOAD_THESE's contents instead.
- **The website still looks old:** wait for a successful deployment under Actions, then refresh. A repository commit and a website deployment are separate steps.
- **A workflow is red:** open the run, click the failed step and share its error text.

This packet targets the existing repository with the earlier engine update at commit `7e11cd8fe9849f5553aacbf457f4e534ad679465`. It contains all changed source/tests/reports plus refreshed playable HTML. It is an update packet, not a standalone copy of every unchanged source file. Keep the earlier complete-source ZIP if you need the whole project separately.

Official GitHub instructions: https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
