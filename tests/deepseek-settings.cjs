const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../zhiyeyaoshi-beta.user.js'),'utf8').replace(/\}\)\(\);\s*$/,'window.deepseekTest={ask:askAiForAnswer};})();');
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 const errors=[];const page=await browser.newPage({viewport:{width:440,height:900}});page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.setContent('<!doctype html><meta charset="utf-8">');
  await page.addScriptTag({content:`window.dsValues={sclpa_service_active:false,sclpa_background_setup_ack:1};window.dsCalls=[];
  window.GM_getValue=(key,fallback)=>key in dsValues?dsValues[key]:fallback;
  window.GM_setValue=(key,value)=>{dsValues[key]=value;};window.GM_addStyle=css=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);};window.GM_notification=()=>true;
  window.GM_xmlhttpRequest=options=>{const entry={options,aborted:false};dsCalls.push(entry);if(options.method==='POST')options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:'1.A'}}]})});return {abort:()=>{entry.aborted=true;options.onabort?.();}};};`});
  await page.addScriptTag({content:source});await page.locator('.tab-btn[data-tab=settings]').click();
  const input=page.locator('#api-key-input'),status=page.locator('#api-key-status'),select=page.locator('#ai-model-select'),save=page.locator('#api-key-save-btn');
  assert.equal(await select.inputValue(),'deepseek-flash');assert.equal(await page.evaluate(()=>dsCalls.length),0);
  await input.fill('synthetic-draft-a');await input.fill('synthetic-draft-b');await page.waitForFunction(()=>dsCalls.length===1);
  assert.equal(await page.evaluate(()=>dsCalls[0].options.method),'GET');assert.equal(await page.evaluate(()=>dsCalls[0].options.url),'https://api.deepseek.com/models');
  assert.equal(await page.evaluate(()=>dsCalls[0].options.headers.Authorization),'Bearer synthetic-draft-b');assert.equal(await page.evaluate(()=>dsValues.sclpa_deepseek_api_key),undefined);
  const respond=async (data,http=200)=>page.evaluate(({data,http})=>dsCalls.filter(c=>c.options.method==='GET').at(-1).options.onload({status:http,responseText:JSON.stringify(data)}),{data,http});
  const list={data:[{id:'deepseek-v4-pro',output_modalities:['text']},{id:'deepseek-flash',output_modalities:['text']},{id:'deepseek-flash'},{id:'image-only',output_modalities:['image']},{id:'<invalid>'}]};
  await respond(list);assert.equal(await select.inputValue(),'deepseek-flash');assert.equal(await select.locator('option').count(),2);assert.match(await status.innerText(),/鉴权通过/);assert.match(await status.innerText(),/尚未保存/);
  await select.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(require('node:os').tmpdir(),'sclpa-deepseek-settings.png')});
  await select.selectOption('deepseek-v4-pro');await save.click();await respond(list);assert.equal(await page.evaluate(()=>dsValues.sclpa_deepseek_model),'deepseek-v4-pro');assert.equal(await page.evaluate(()=>dsValues.sclpa_deepseek_api_key),'synthetic-draft-b');assert.equal(await page.evaluate(()=>deepseekTest.ask('合成题')),'1.A');assert.equal(await page.evaluate(()=>JSON.parse(dsCalls.filter(c=>c.options.method==='POST').at(-1).options.data).model),'deepseek-v4-pro');
  await select.selectOption('deepseek-flash');await page.evaluate(()=>deepseekTest.ask('合成题'));assert.equal(await page.evaluate(()=>JSON.parse(dsCalls.filter(c=>c.options.method==='POST').at(-1).options.data).model),'deepseek-flash');
  console.log('PASS: debounced automatic official authentication, unique text model options, default Flash, explicit save and actual AI payload model');
  await input.fill('synthetic-old');await save.click();const old=await page.evaluate(()=>dsCalls.length-1);await input.fill('synthetic-new');await save.click();await respond(list);await page.evaluate(i=>dsCalls[i].options.onload({status:401,responseText:'{}'}),old);assert.match(await status.innerText(),/鉴权通过/);assert.equal(await page.evaluate(i=>dsCalls[i].aborted,old),true);
  for(const [http,pattern] of [[401,/无效/],[402,/余额不足/],[403,/拒绝/],[429,/频繁/],[503,/HTTP 503/]]){await save.click();await respond({},http);assert.match(await status.innerText(),pattern);assert.equal(await select.isDisabled(),true);}
  await save.click();await page.evaluate(()=>dsCalls.at(-1).options.onerror({statusText:'synthetic-secret-must-not-echo'}));assert.match(await status.innerText(),/网络/);assert.doesNotMatch(await status.innerText(),/synthetic-secret/);
  await save.click();await page.evaluate(()=>dsCalls.at(-1).options.ontimeout());assert.match(await status.innerText(),/超时/);
  await save.click();await page.evaluate(()=>dsCalls.at(-1).options.onload({status:200,responseText:'invalid-json'}));assert.match(await status.innerText(),/格式异常/);
  await save.click();await respond({data:[]});assert.match(await status.innerText(),/没有返回/);
  await save.click();await respond({data:[{id:'deepseek-v4-pro'}]});assert.equal(await select.inputValue(),'deepseek-v4-pro');assert.match(await status.innerText(),/未提供 deepseek-flash/);
  console.log('PASS: stale response/abort isolation, authentication/permission/quota/rate/server errors, malformed/empty lists, timeout and fallback model');
  await input.fill('synthetic-clear-draft');await input.fill('');assert.equal(await select.isDisabled(),true);await page.waitForTimeout(900);assert.match(await status.innerText(),/已配置/);
  await save.click();await respond(list);assert.match(await status.innerText(),/鉴权通过/);assert.equal(await input.inputValue(),'');
  await input.fill('synthetic-cleanup');await save.click();await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert.equal(await page.evaluate(()=>dsCalls.at(-1).aborted),true);
  assert.deepEqual(errors,[]);console.log('PASS: blank input, narrow settings, no page errors and request cleanup on pagehide');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
