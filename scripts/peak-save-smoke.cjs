// Run after the 20-season audit to check a full current season and actual browser storage.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const qaDir=process.env.NHL_QA_DIR || path.resolve(__dirname,'../tmp/browser-qa');
(async()=>{
 const L=await import('../src/engine/league.js'),LZ=(await import('lz-string')).default;
 let lg=L.deserializeLeague(fs.readFileSync(qaDir+'/career-checkpoint.txt','utf8'));assert.ok(lg && lg.history.length>=20);
 const years=lg.history.length;L.startRegularSeason(lg);L.simRestOfSeason(lg);
 const packed=L.serializeLeague(lg),round=L.deserializeLeague(L.exportLeagueText(lg));
 assert.deepEqual(JSON.parse(JSON.stringify(round.players)),JSON.parse(JSON.stringify(lg.players)));
 assert.deepEqual(round.retirementArchive,lg.retirementArchive);
 const legacyBytes=LZ.compressToUTF16(JSON.stringify(lg)).length*2;assert.ok(packed.length*2<5*1024*1024);
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright'),args=process.env.CHROMIUM_SERVERLESS==='1'?require(process.env.CHROMIUM_MODULE || '@sparticuz/chromium').args:[];
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined,args,headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));await page.goto(pathToFileURL(path.resolve(__dirname,'../dist/rink-gm.html')).href);
 await page.evaluate(save=>{localStorage.clear();localStorage.setItem('rinkgm_save_v1',save);},packed);await page.reload();await page.getByRole('button',{name:/Continue League/}).click();await page.getByLabel('Game navigation',{exact:true}).selectOption('roster');assert.ok(await page.getByRole('heading',{name:/ roster$/i}).isVisible());await page.evaluate(()=>window.__rinkgm.flush());
 const stored=await page.evaluate(()=>localStorage.getItem('rinkgm_save_v1'));assert.ok(stored);assert.ok(L.deserializeLeague(stored));assert.deepEqual(errors,[]);await browser.close();
 const result={completed:true,priorCareerSeasons:years,additionalRegularGames:lg.schedule.filter(g=>g.played).length,phase:lg.phase,packedUtf16Bytes:packed.length*2,legacyEquivalentUtf16Bytes:legacyBytes,reductionPct:Number((100*(1-packed.length*2/legacyBytes)).toFixed(2)),allPlayerAndRetirementFieldsRoundTrip:true,actualChromiumLocalStorageWriteReloadFlush:true,javascriptErrors:errors};
 fs.writeFileSync(qaDir+'/peak-save-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exit(1);});
