// Opt-in test against a separately launched, isolated native browser.
// Never connect this test to a personal/default browser profile.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const endpoint=process.env.TEST_CDP_URL;
if(!endpoint || !/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint))throw Error('Set TEST_CDP_URL to an owned isolated test browser');
let source=fs.readFileSync(path.join(__dirname,'../zhiyeyaoshi.user.js'),'utf8');
let fixtureSource=`
window.entered=0;window.returned=0;window.articleDone=false;window.articleTab=false;window.notifications=0;
window.mockValues={sclpa_service_active:false,sclpa_playback_rate:8};
window.GM_getValue=(key,fallback)=>key in mockValues?mockValues[key]:fallback;
window.GM_setValue=(key,value)=>mockValues[key]=value;
window.GM_addStyle=css=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);};
window.GM_notification=()=>{notifications++;return true;};
function renderFixture(){
 const root=document.getElementById('fixture');
 if(location.hash.includes('imageAndText')){
  root.innerHTML='<div class="image-and-text"><div class="action-btn"><span class="label">阅读中 100%</span></div></div>';
  const ImageAndTextInfo={precossTime:0,totalSeconds:20000,isWanCheng:false,isTongGuo:false};
  const owner={ImageAndTextInfo,countdown:null};root.firstChild.__vue__=owner;
  owner.countdown=setInterval(function(){
   ImageAndTextInfo.precossTime+=100;
   if(ImageAndTextInfo.precossTime>=ImageAndTextInfo.totalSeconds){clearInterval(owner.countdown);ImageAndTextInfo.isWanCheng=true;articleDone=true;}
  },100);
 }else if(/onlineExam|openOnlineExam/.test(location.hash)){
  root.innerHTML='<div class="radio-tab-tag radio-tab-tag-ed">待考试</div><div class="el-table__empty-text">暂无数据</div>';
 }else{
  root.innerHTML='<div class="radioTab"><div class="radio-tab-tag">视频课程</div><div class="radio-tab-tag">文章资讯</div></div><div class="tabsList"><div class="radioBodx"><div class="radio-tab-tag radio-tab-tag-ed">政治理论</div></div><div class="radio-box"><div class="radio-tab-tag radio-tab-tag-ed">未完成</div></div></div>';
  const tabs=root.querySelectorAll('.radioTab > .radio-tab-tag');
  tabs[articleTab?1:0].classList.add('radio-tab-tag-ed');
  tabs.forEach((tab,i)=>tab.onclick=()=>{articleTab=i===1;renderFixture();});
  if(articleTab&&!articleDone){const card=document.createElement('div');card.className='information-card';card.innerHTML='<span class="status">未完成</span>合成文章';card.onclick=()=>{entered++;location.hash='/imageAndText?courseContId=synthetic';};root.append(card);}
 }
}
addEventListener('hashchange',()=>{if(articleDone&&location.hash.includes('publicDemand'))returned++;renderFixture();});
renderFixture();
`;
const server=http.createServer((request,response)=>{
 response.setHeader('Content-Type','text/html; charset=utf-8');
 response.end('<!doctype html><meta charset="utf-8"><div id="fixture"></div><script>'+fixtureSource+'</script><script>'+source+'</script>');
});
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 source=source.replaceAll('https://zyys.ihehang.com',origin).replace(/\}\)\(\);\s*$/,'window.backgroundTest={service:setRuntimeServiceActive,phase:()=>allInOnePhase,run:()=>{isAllInOneMode=true;allInOnePhase="public-video";allInOneTransitionPending=false;GM_setValue("sclpa_public_target","video");setRuntimeServiceActive(true);},guards:()=>backgroundPlaybackGuards.size};})();');
 const tabs=await(await fetch(endpoint+'/json/list')).json();
 const target=tabs.find(tab=>tab.type==='page'&&tab.url==='about:blank');
 assert.ok(target,'isolated browser must contain an unused about:blank test tab');
 const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 const pending=new Map();let seq=0;
 socket.onmessage=event=>{const message=JSON.parse(event.data);const item=pending.get(message.id);if(item){pending.delete(message.id);message.error?item.reject(Error(message.error.message)):item.resolve(message.result);}};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async(expression)=>{
  const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
  return result.result.value;
 };
 try{
  await call('Page.enable');await call('Page.navigate',{url:origin+'/#/publicDemand'});
  for(let i=0;i<30;i++){if(await evaluate('Boolean(window.backgroundTest)'))break;await delay(200);}
  const {windowId}=await call('Browser.getWindowForTarget',{targetId:target.id});
  await call('Browser.setWindowBounds',{windowId,bounds:{windowState:'minimized'}});
  for(let i=0;i<20;i++){if(await evaluate('document.hidden'))break;await delay(200);}
  assert.equal(await evaluate('document.hidden'),true,'must test native hidden state');
  await evaluate('backgroundTest.run()');
  const started=Date.now();let last;
  for(let i=0;i<60;i++){
   await delay(2000);
   last=await evaluate('({hidden:document.hidden,phase:backgroundTest.phase(),active:GM_getValue("sclpa_service_active",false),entered,returned,done:articleDone,jobs:__sclpaBackgroundScheduler.pending,mode:__sclpaBackgroundScheduler.mode,guards:backgroundTest.guards()})');
   assert.equal(last.hidden,true,'automation must not require foreground focus');
   if(i%5===0)console.log('BACKGROUND '+Math.round((Date.now()-started)/1000)+'s '+JSON.stringify(last));
   if(last.done&&!last.active)break;
  }
  assert.equal(last.done,true);assert.equal(last.entered,1);assert.equal(last.returned,1);assert.equal(last.active,false);assert.equal(last.guards,0);
  assert.equal(await evaluate('__sclpaArticleTimingEngine.records.size'),0);
  console.log('PASS: native hidden browser, same-route video-to-article phase, 8x article, completion acknowledgment, return, both empty exam phases and automatic release');
 }finally{await call('Page.navigate',{url:'about:blank'}).catch(()=>{});socket.close();server.close();}
})().catch(error=>{server.close();console.error(error);process.exitCode=1;});
