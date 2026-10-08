const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const fixture=fs.readFileSync(path.join(__dirname,'native-background.cjs'),'utf8').match(/let fixtureSource=`([\s\S]*?)`;/)[1];
const source=fs.readFileSync(path.join(__dirname,'../zhiyeyaoshi-beta.user.js'),'utf8').replace(/\}\)\(\);\s*$/,'window.backgroundTest={phase:()=>allInOnePhase,run:()=>{isAllInOneMode=true;allInOnePhase="public-video";allInOneTransitionPending=false;GM_setValue("sclpa_public_target","video");setRuntimeServiceActive(true);},guards:()=>backgroundPlaybackGuards.size};})();');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://zyys.ihehang.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><div id="fixture"></div><script>'+fixture+'</script><script>'+source+'</script>'}));
  await page.goto('https://zyys.ihehang.com/#/publicDemand');
  await page.waitForFunction(()=>window.backgroundTest);await page.evaluate(()=>backgroundTest.run());
  for(let i=0;i<45;i++){
   await page.waitForTimeout(2000);
   const state=await page.evaluate(()=>({phase:backgroundTest.phase(),active:GM_getValue('sclpa_service_active',false),entered,returned,done:articleDone,jobs:__sclpaBackgroundScheduler.pending}));
   if(i%5===0)console.log('PHASE FLOW '+JSON.stringify(state));
   if(state.done&&!state.active)break;
  }
  const final=await page.evaluate(()=>({done:articleDone,entered,returned,active:GM_getValue('sclpa_service_active',false),guards:backgroundTest.guards(),articleTimers:__sclpaArticleTimingEngine.records.size}));
  assert.deepEqual(final,{done:true,entered:1,returned:1,active:false,guards:0,articleTimers:0});
  assert.deepEqual(errors,[]);
  console.log('PASS: full same-route phase flow, article acknowledgment and return, both empty exam phases, completion release (headless fixture)');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
