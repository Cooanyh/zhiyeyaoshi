const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
let now=0,activeItem=null,items=[],articleOwner=null,navigations=0,reloads=0,loads=0;
const values={},storage={};
const document={hidden:false,readyState:'loading',addEventListener(){},getElementById(){return null},
 querySelector(selector){if(selector==='.image-and-text')return articleOwner?{__vue__:articleOwner}:null;if(selector.includes('active')||selector==='.catalogue-item-ed')return activeItem;return null;},
 querySelectorAll(selector){return selector==='.catalogue-item'||selector==='.open-player-right-content .video-list-item'?items:[];}};
const sandbox={URL,URLSearchParams,console:{info(){},warn(){},error(){},debug(){}},document,navigator:{},crypto:require('node:crypto').webcrypto,performance:{now:()=>now},Blob,Map,Set,AbortController,Promise,Date,Number,Math,JSON,
 sessionStorage:{getItem:key=>storage[key]||null,setItem:(key,value)=>storage[key]=value},GM_getValue:(key,fallback)=>key in values?values[key]:fallback,GM_setValue:(key,value)=>values[key]=value,GM_addStyle(){},
 setTimeout(){return 1},clearTimeout(){},setInterval(){return 1},clearInterval(){},addEventListener(){},location:{hash:'#/openPlayer?courseContId=synthetic',reload(){reloads++;}}};
sandbox.window=sandbox;
const hooks=`window.mediaTest={load:handleVideoLoading,reconcile:reconcileVideoLoadingIndicator,complete:hasConfirmedPublicVideoCompletion,article:handleArticleReadingPage,reset:()=>{resetVideoLoadFailures();isServiceActive=true;isChangingChapter=false;},failures:()=>videoLoadFailures,active:()=>isServiceActive};safeNavigateBackToList=()=>{window.navCount++};safeNavigateAfterCourseCompletion=()=>{window.navCount++};`;
sandbox.navCount=0;
const source=fs.readFileSync(path.join(__dirname,'../zhiyeyaoshi.user.js'),'utf8');
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/,hooks+'})();'),sandbox);
const h=sandbox.mediaTest;
const video={currentTime:0,readyState:0,paused:false,ended:false,error:null,load(){loads++},play(){return Promise.resolve()},closest(){return null}};
function item(title,selected=false,status=''){return {textContent:title,innerText:title,classList:{contains:()=>selected},querySelector(selector){return selector==='.list-item-status'?{innerText:status,textContent:status}:null;},click(){navigations++}};}
h.reset();activeItem=item('当前合成视频',true);items=[activeItem,item('下一合成视频')];
h.load(video);now+=45001;assert.equal(h.load(video),true);assert.equal(loads,1);
now+=45001;h.load(video);assert.equal(reloads,1);
now+=45001;h.load(video);assert.equal(navigations,1);assert.equal(Object.values(h.failures())[0].blocked,true);assert.equal(h.active(),true);
assert.equal(h.complete(),false,'unplayed current video must not be completed');
activeItem=item('当前合成视频',true,'待考试');assert.equal(h.complete(),true);
console.log('PASS: public video two bounded recovery attempts, skip remains incomplete, exact platform completion');
h.reset();now=0;loads=0;reloads=0;navigations=0;sandbox.location.hash='#/majorPlayerPage?courseContId=synthetic';activeItem=item('当前合成章节',true);items=[activeItem,item('后续合成章节')];
h.load(video);for(let i=0;i<3;i++){now+=45001;h.load(video);}assert.equal(loads,1);assert.equal(reloads,1);assert.equal(navigations,1);assert.equal(h.active(),true);
h.reset();now=0;items=[activeItem];h.load(video);for(let i=0;i<3;i++){now+=45001;h.load(video);}assert.equal(h.active(),false,'all failed chapters must pause service');
h.reset();assert.equal(Object.keys(h.failures()).length,0);
console.log('PASS: professional chapter recovery, next chapter, all-failed pause and restart reset');
const owner={$options:{name:'videoPlayer'},loadLoading:true,loadError:false,slideVerifyShow:false,toSeeEl:false,playerEl:{el:()=>({contains:()=>true})}};
const decoded={currentTime:5,error:null,readyState:3,videoWidth:640,videoHeight:360,getVideoPlaybackQuality:()=>({totalVideoFrames:20,droppedVideoFrames:0}),closest:()=>({__vue__:owner})};
h.reconcile(decoded,5);assert.equal(owner.loadLoading,false);
owner.loadLoading=true;owner.slideVerifyShow=true;h.reconcile(decoded,5);assert.equal(owner.loadLoading,true,'captcha must not be dismissed');
owner.slideVerifyShow=false;decoded.error={code:3};h.reconcile(decoded,5);assert.equal(owner.loadLoading,true,'decode failures must retain loading/error surface');
console.log('PASS: stale spinner only cleared with decoded frames, captcha and media errors preserved');
sandbox.location.hash='#/imageAndText?courseContId=synthetic';articleOwner={ImageAndTextInfo:{isWanCheng:false,isTongGuo:false,precossTime:100,totalSeconds:100}};sandbox.navCount=0;
h.article();assert.equal(sandbox.navCount,0,'rounded 100% without platform acknowledgment must wait');articleOwner.ImageAndTextInfo.isWanCheng=true;h.article();assert.equal(sandbox.navCount,1);
console.log('PASS: article completion waits for actual platform acknowledgment');

// Distinct manager sandbox window: article interception must reach the site window.
const normalInterval=()=>42;const cleared=[];const site={setInterval:normalInterval,clearInterval:id=>cleared.push(id)};
const isolated={...sandbox,window:null,unsafeWindow:site,__sclpaScriptInstance:undefined,__sclpaArticleTimingEngine:undefined,__sclpaBackgroundScheduler:undefined};isolated.window=isolated;isolated.location={hash:'#/imageAndText'};
vm.runInNewContext(source,isolated);
assert.equal(isolated.setInterval,sandbox.setInterval,'manager sandbox interval remains unchanged');
assert.notEqual(site.setInterval,normalInterval);
assert.equal(site.setInterval(function(){},100),42);
const articleId=site.setInterval(function(){const ImageAndTextInfo={precossTime:0,totalSeconds:1};ImageAndTextInfo.precossTime++;},100);
assert.ok(articleId<0);assert.equal(isolated.__sclpaArticleTimingEngine.records.size,1);site.clearInterval(articleId);assert.equal(isolated.__sclpaArticleTimingEngine.records.size,0);site.clearInterval(42);assert.deepEqual(cleared,[42]);
console.log('PASS: isolated manager sandbox delegates only article interval/clear to the site window');
