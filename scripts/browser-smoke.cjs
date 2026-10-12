const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const qaDir=process.env.NHL_QA_DIR || path.resolve(__dirname,'../tmp/browser-qa');fs.mkdirSync(qaDir,{recursive:true});
const artifact=pathToFileURL(path.resolve(__dirname,'../dist/rink-gm.html')).href;
const {chromium:pw}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const args=process.env.CHROMIUM_SERVERLESS==='1'?require(process.env.CHROMIUM_MODULE || '@sparticuz/chromium').args:[];
(async()=>{
 const browser=await pw.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined,args,headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];page.on("request",r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(artifact);
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>[...document.querySelectorAll('.teamcard img')].every(img=>img.complete && img.naturalWidth>0));
 assert.equal(await page.locator('.teamcard img').count(),32);
 await page.getByRole('button',{name:'East',exact:true}).click();assert.equal(await page.locator('.teamcard').count(),16);await page.getByRole('button',{name:'West',exact:true}).click();assert.equal(await page.locator('.teamcard').count(),16);await page.getByRole('button',{name:'All clubs',exact:true}).click();
 console.log('All 32 embedded logos and conference filters passed');
 await page.getByText('Edmonton Oilers',{exact:true}).first().click();await page.getByRole('button',{name:'Start 2026-27 Season',exact:true}).click();
 await page.waitForFunction(()=>window.scrollY===0);assert.equal(await page.evaluate(()=>window.scrollY),0);
 const nav=async name=>{await page.locator('.nav button').filter({hasText:name}).first().click();await page.waitForTimeout(150);assert.ok(!await page.getByText('This screen could not load',{exact:true}).count());};
 await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search players, teams and screens',exact:true}).fill('McDavid');await page.keyboard.press('Enter');assert.ok(await page.getByRole('dialog',{name:'Connor McDavid',exact:true}).isVisible());
 for(let n=0;n<14;n++)await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.querySelector('[role=dialog]').contains(document.activeElement)));await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
 await nav('Roster');await page.getByLabel('Find roster player',{exact:true}).fill('McDavid');assert.deepEqual(await page.locator('table.t tbody .player-link').allTextContents(),['Connor McDavid']);await page.getByLabel('Find roster player',{exact:true}).fill('');const sort=page.locator('table.t').first().getByRole('columnheader',{name:/^OVR/});await sort.focus();await page.keyboard.press('Enter');assert.equal(await sort.getAttribute('aria-sort'),'ascending');
 await page.getByRole('button',{name:'Club news and inbox',exact:true}).click();assert.ok(await page.getByRole('heading',{name:'Club activity',exact:true}).isVisible());await page.getByRole('button',{name:/^Transactions/}).click();assert.ok(await page.locator('.activity-feed').isVisible());
 console.log('Keyboard search, modal focus/Escape, roster filtering/sorting and club inbox passed');
 await nav('Hockey Operations');
 for(const label of ['Roster & rights','Agents & offers','Development','Career & arena','Events & legacy','Draft lab']){await page.getByRole('button',{name:label,exact:true}).click();assert.ok((await page.locator('.main').innerText()).length>300);console.log('Desktop operations:',label);}
 await page.getByRole('button',{name:'Development',exact:true}).click();await page.getByRole('button',{name:'Run camp battles',exact:true}).click();
 await page.getByRole('button',{name:'Career & arena',exact:true}).click();await page.getByRole('button',{name:'Upgrade',exact:true}).first().click();assert.ok(await page.getByText('Level 1/3',{exact:true}).count());
 await page.screenshot({path:qaDir+'/career-desktop.png',fullPage:true});
 await nav('Trophy Room');await page.waitForTimeout(200);await page.screenshot({path:qaDir+'/cup-desktop.png',fullPage:true});
 const gl=await page.locator('canvas').evaluate(c=>{const g=c.getContext('webgl');return {active:!!g,error:g?.getError(),renderer:g?.getParameter(g.RENDERER)};});assert.ok(gl.active);assert.equal(gl.error,0);console.log('3D Cup:',gl);
 await page.getByRole('button',{name:'Pause rotation',exact:true}).click();await page.getByRole('button',{name:'Rotate Cup',exact:true}).click();
 await nav('Draft & Scouting');await nav('Record Book');await nav('Front Office');await nav('Schedule');await nav('Roster');await nav('Lines');await nav('Settings');
 console.log('Desktop navigation and rendering passed');
 await nav('Settings');await page.getByLabel('Table density',{exact:true}).selectOption('compact');assert.equal(await page.locator('.app').getAttribute('data-density'),'compact');await page.getByRole('button',{name:'Save here',exact:true}).first().click();assert.ok(await page.getByRole('button',{name:'Load',exact:true}).first().isEnabled());console.log('Manual save-slot UI passed');
 await nav('Dashboard');await page.getByRole('button',{name:'Start Season ▶',exact:true}).click();await page.getByRole('button',{name:'▶ Play Live',exact:true}).click();await page.getByRole('button',{name:'⏸ Pause',exact:true}).click();await page.getByRole('button',{name:'Step',exact:true}).click();await page.waitForTimeout(100);assert.ok((await page.locator('.rinkwrap svg .sk text').allTextContents()).some(t=>Number(t)>0));await page.getByRole('button',{name:'Sim to End ⏭',exact:true}).click();await page.getByRole('button',{name:'Continue →',exact:true}).click();console.log('Live game, jersey labels and result completion passed');
 await page.setViewportSize({width:390,height:844});await page.getByLabel('Game navigation',{exact:true}).selectOption('operations');
 await page.getByRole('button',{name:'Draft lab',exact:true}).click();await page.screenshot({path:qaDir+'/draft-mobile.png',fullPage:true});
 for(const id of ['dashboard','roster','lines','schedule','operations','trophies','records','draft','settings']){await page.getByLabel('Game navigation',{exact:true}).selectOption(id);assert.ok(await page.locator('.main').isVisible());}
 console.log('Overflow diagnosis',await page.evaluate(()=>({width:innerWidth,body:document.body.scrollWidth,elements:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,60)})).filter(e=>e.right>innerWidth+2).slice(0,10)})));assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth+2),'Mobile page overflows horizontally');
 await page.getByLabel('Game navigation',{exact:true}).selectOption('dashboard');await page.screenshot({path:qaDir+'/dashboard-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);console.log('Mobile 390px navigation and offline logos/fonts passed; zero JavaScript errors');
 if(fs.existsSync(qaDir+'/draft-save.txt')){
   const save=fs.readFileSync(qaDir+'/draft-save.txt','utf8');await page.evaluate(save=>{localStorage.setItem('rinkgm_save_v1',save);},save);await page.reload();
   const resume=page.getByRole('button',{name:/Continue League/});if(await resume.count())await resume.click();
   await page.getByLabel('Game navigation',{exact:true}).selectOption('draft');
   await page.getByRole('button',{name:'Start clock',exact:true}).click();await page.waitForTimeout(1200);await page.getByRole('button',{name:'Pause clock',exact:true}).click();const clock=await page.locator('.mono').filter({hasText:/^1:5/}).first().innerText();
   await page.getByLabel('Game navigation',{exact:true}).selectOption('operations');await page.getByLabel('Game navigation',{exact:true}).selectOption('draft');assert.equal(await page.locator('.mono').filter({hasText:/^1:5/}).first().innerText(),clock);console.log('Saved draft clock survives navigation:',clock);
 }
 assert.deepEqual(errors,[]);
 // Force unavailable GPU in a fresh context to exercise the original SVG fallback.
 const fallback=page;await fallback.evaluate(()=>localStorage.clear());await fallback.setViewportSize({width:1440,height:1000});await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:original.call(this,type,...args);};});
 await fallback.goto(artifact);await fallback.getByRole('button',{name:'Start 2026-27 Season',exact:true}).click();await fallback.locator('.nav button').filter({hasText:'Trophy Room'}).click();await fallback.waitForTimeout(100);assert.equal(await fallback.locator('canvas').count(),0);assert.ok(await fallback.getByRole('img',{name:'Stanley Cup illustration',exact:true}).count());console.log('Unavailable-GPU Cup fallback passed');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
