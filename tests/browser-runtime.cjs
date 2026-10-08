// All fixtures are synthetic. No study account, real exam or AI service is used.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const source = fs.readFileSync(path.join(__dirname, '../zhiyeyaoshi.user.js'), 'utf8');
const instrumented = source.replace(/\}\)\(\);\s*$/, `
window.testRuntime = {
  service: setRuntimeServiceActive,
  speed: rate => { currentPlaybackRate = rate; CONFIG.VIDEO_PLAYBACK_RATE = rate; GM_setValue('sclpa_playback_rate', rate); refreshVideoSpeedEngine?.(); },
  initialize: initializeEnhancedVideoSpeedEngine,
  guards: () => backgroundPlaybackGuards.size,
  answers: parseAndSelectAllAnswers,
  examList: handleExamListPage,
  start: startAllInOneMode,
  phase: () => allInOnePhase,
  phaseSet: phase => { isAllInOneMode = true; allInOnePhase = phase; allInOneTransitionPending = false; },
  article: handleArticleReadingPage,
  helper: createManualAiHelper,
  submit: handleNextQuestionOrSubmitExam,
  show: showAutomationNotice
};})();`);
const shim = `
window.mockValues = {sclpa_service_active: false};
window.GM_getValue = (key, fallback) => key in mockValues ? mockValues[key] : fallback;
window.GM_setValue = (key, value) => { mockValues[key] = value; };
window.GM_addStyle = css => { const style = document.createElement('style'); style.textContent = css; document.head.append(style); };
window.GM_notification = () => true;
window.GM_xmlhttpRequest = options => { options.onload({status: 200, responseText: JSON.stringify({choices:[{message:{content: window.mockAnswer || '1.A'}}]})}); };
`;

(async () => {
  const browser = await chromium.launch({headless: true, ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
  try {
    const page = await browser.newPage({viewport: {width: 900, height: 900}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://zyys.ihehang.com/**', route => route.fulfill({contentType:'text/html', body:'<!doctype html><meta charset="utf-8"><div id="fixture"></div>'}));
    await page.goto('https://zyys.ihehang.com/#/test');
    await page.addScriptTag({content: shim + instrumented});
    await page.waitForFunction(() => window.testRuntime && document.getElementById('service-toggle-btn'));
    const initialJobs = await page.evaluate(() => __sclpaBackgroundScheduler.pending);
    await page.addScriptTag({content: instrumented});
    assert.equal(await page.evaluate(() => __sclpaBackgroundScheduler.pending), initialJobs, 'duplicate injection must not add a main loop');

    await page.locator('#service-toggle-btn').click();
    assert.equal(await page.evaluate(() => mockValues.sclpa_service_active), true);
    await page.evaluate(() => { testRuntime.speed(8); document.getElementById('fixture').innerHTML = '<video></video>'; });
    await page.waitForFunction(() => __sclpaVideoRuntime.videos === 1);
    assert.equal(await page.locator('video').evaluate(v => { v.playbackRate = 1; return v.playbackRate; }), 8);
    const eventJobs = await page.locator('video').evaluate(v => {
      for (let i = 0; i < 500; i++) for (const name of ['canplay', 'playing', 'ratechange']) v.dispatchEvent(new Event(name));
      return __sclpaBackgroundScheduler.pending;
    });
    assert.ok(eventJobs < initialJobs + 5, 'media events must coalesce timers');
    await page.locator('#service-toggle-btn').click();
    assert.equal(await page.evaluate(() => testRuntime.guards()), 0);
    assert.equal(await page.locator('video').evaluate(v => { v.playbackRate = 1; return v.playbackRate; }), 1);
    assert.equal(await page.evaluate(() => __sclpaVideoRuntime.roots), 0);
    console.log('PASS: duplicate injection, real pause/start buttons, native playback setter and 1500-event timer coalescing');

    await page.evaluate(() => { document.getElementById('fixture').replaceChildren(); testRuntime.service(true); });
    for (let cycle = 0; cycle < 12; cycle++) {
      await page.evaluate(() => {
        const wrapper = document.createElement('div');
        const host = document.createElement('div');
        host.attachShadow({mode: 'open'}).innerHTML = '<video></video>';
        wrapper.append(host);
        const frame = document.createElement('iframe');
        wrapper.append(frame);
        document.getElementById('fixture').append(wrapper);
        frame.contentDocument.body.innerHTML = '<div id="shadow"></div><video></video>';
        frame.contentDocument.getElementById('shadow').attachShadow({mode:'open'}).innerHTML = '<video></video>';
      });
      await page.waitForFunction(() => __sclpaVideoRuntime.videos === 3 && __sclpaVideoRuntime.frames === 1);
      await page.evaluate(() => document.getElementById('fixture').replaceChildren());
      await page.waitForFunction(() => __sclpaVideoRuntime.videos === 0 && __sclpaVideoRuntime.frames === 0 && __sclpaVideoRuntime.roots === 1);
      assert.equal(await page.evaluate(() => testRuntime.guards()), 0);
    }
    console.log('PASS: 12 iframe/shadow DOM mount/unmount cycles release all media listeners and observers');

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    async function heap() {
      await cdp.send('HeapProfiler.collectGarbage');
      return (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize').value;
    }
    // Warm up engine and browser allocations before measuring retained memory.
    async function churn(count) {
      await page.evaluate(count => {
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < count; i++) fragment.append(document.createElement('video'));
        document.getElementById('fixture').append(fragment);
      }, count);
      await page.waitForFunction(count => __sclpaVideoRuntime.videos === count, count);
      await page.evaluate(() => { for (const v of document.querySelectorAll('video')) for (let i=0;i<10;i++) v.dispatchEvent(new Event('canplay')); });
      await page.evaluate(() => document.getElementById('fixture').replaceChildren());
      await page.waitForFunction(() => __sclpaVideoRuntime.videos === 0 && testRuntime.guards() === 0);
      assert.ok(await page.evaluate(() => __sclpaBackgroundScheduler.pending < 5));
    }
    await churn(250);
    const baselineHeap = await heap();
    for (let cycle=0;cycle<8;cycle++) await churn(250);
    const retainedHeap = await heap();
    assert.ok(retainedHeap - baselineHeap < 12 * 1024 * 1024, 'media churn must not retain unbounded JS memory');
    console.log(`PASS: 2250 video lifetimes / 22500 media events; retained heap delta ${((retainedHeap-baselineHeap)/1048576).toFixed(2)} MiB`);

    await page.evaluate(() => {
      location.hash='/imageAndText?courseContId=fixture';
      document.getElementById('fixture').innerHTML='<div class="image-and-text"></div>';
      const owner={countdown:null}; document.querySelector('.image-and-text').__vue__=owner;
      window.articleData={precossTime:0,totalSeconds:100000,completions:0};
      owner.countdown=setInterval(function(){
        const ImageAndTextInfo=window.articleData;
        ImageAndTextInfo.precossTime+=100;
        if(ImageAndTextInfo.precossTime>=ImageAndTextInfo.totalSeconds){ImageAndTextInfo.completions++;clearInterval(owner.countdown);}
      },100);
    });
    await page.waitForTimeout(1000);
    let first = await page.evaluate(() => articleData.precossTime);
    assert.ok(first >= 4500 && first < 12000, 'article should follow 8x rate');
    for (const [requested, expected] of [[1.5,1.5],[16,16],[100,16],[0,1],['invalid',1]]) {
      const before=await page.evaluate(rate=>{GM_setValue('sclpa_playback_rate',rate);return articleData.precossTime;},requested);
      await page.waitForTimeout(700);
      const difference=await page.evaluate(()=>articleData.precossTime)-before;
      assert.ok(difference>=expected*350 && difference<=expected*1100, `article rate ${requested} must normalize to ${expected}`);
    }
    await page.evaluate(()=>GM_setValue('sclpa_playback_rate',8));
    first=await page.evaluate(()=>articleData.precossTime);
    await page.evaluate(() => document.dispatchEvent(new Event('freeze')));
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => articleData.precossTime), first);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(300);
    const resumed = await page.evaluate(() => articleData.precossTime);
    assert.ok(resumed > first && resumed-first < 4000, 'resume without freeze time catch-up');
    await page.evaluate(() => articleData.totalSeconds=articleData.precossTime+200);
    await page.waitForFunction(() => articleData.completions === 1);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => articleData.completions), 1);
    assert.equal(await page.evaluate(() => __sclpaArticleTimingEngine.records.size), 0);
    // A platform timer abandoned by an SPA route must not remain in our job map.
    await page.evaluate(() => {
      const owner=document.querySelector('.image-and-text').__vue__;
      owner.countdown=setInterval(function(){const ImageAndTextInfo=articleData;ImageAndTextInfo.precossTime+=100;void ImageAndTextInfo.totalSeconds;},100);
      location.hash='/test';
    });
    await page.waitForFunction(() => __sclpaArticleTimingEngine.records.size === 0);
    console.log('PASS: article 8x rate, freeze, recovery without resume event, single completion and orphan timer cleanup');

    await page.evaluate(() => {
      document.getElementById('fixture').innerHTML=`<div class="examination-body-item"><div class="examination-body-title">1、合成题一</div><div class="examination-check-item">A.甲</div><div class="examination-check-item">B.乙</div></div><div class="examination-body-item"><div class="examination-body-title">2、合成题二</div><div class="examination-check-item">A.丙</div><div class="examination-check-item">B.丁</div></div>`;
      window.optionClicks=0;
      document.querySelectorAll('.examination-check-item').forEach(e=>e.onclick=()=>optionClicks++);
    });
    assert.equal(await page.evaluate(() => testRuntime.answers('1.A')), false);
    assert.equal(await page.evaluate(() => optionClicks), 0, 'invalid batch must not partially fill');
    assert.equal(await page.evaluate(() => testRuntime.answers('1.Z\n2.A')), false);
    assert.equal(await page.evaluate(() => testRuntime.answers('1：A\n2.B')), true);
    assert.equal(await page.evaluate(() => optionClicks), 2);
    await page.evaluate(() => {
      document.getElementById('fixture').replaceChildren();
      location.hash='/onlineExam';GM_setValue('sclpa_nav_context','exam');testRuntime.phaseSet('specialized-exam');testRuntime.examList();
    });
    assert.equal(await page.evaluate(() => testRuntime.phase()), 'specialized-exam', 'loading list must not be treated as empty');
    await page.evaluate(() => {
      document.getElementById('fixture').innerHTML='<span class="el-table__empty-text" style="display:none">暂无数据</span>';
      testRuntime.examList();
    });
    assert.equal(await page.evaluate(() => testRuntime.phase()), 'specialized-exam');
    await page.evaluate(() => {document.querySelector('.el-table__empty-text').style.display='block';testRuntime.examList();});
    assert.equal(await page.evaluate(() => testRuntime.phase()), 'public-exam');
    await page.evaluate(() => {testRuntime.service(false);location.hash='/test';});
    await page.locator('#nav-all-in-one-btn').click();
    assert.equal(await page.evaluate(() => mockValues.sclpa_service_active), true);
    assert.equal(await page.evaluate(() => testRuntime.phase()), 'specialized-video');
    await page.evaluate(() => {testRuntime.service(false);location.hash='/test';});
    console.log('PASS: complete answer validation, colon format, loading/hidden empty exam lists, paused all-in-one button');

    await page.evaluate(() => testRuntime.helper());
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>{const rect=document.getElementById('ai-helper-panel').getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth;});
    const narrowPanel=await page.locator('#ai-helper-panel').boundingBox();
    assert.ok(narrowPanel.x >= 0 && narrowPanel.x+narrowPanel.width <= 390, 'AI panel must remain in a narrow viewport');
    await page.setViewportSize({width:900,height:900});
    assert.equal(await page.locator('#ai-helper-submit-btn').isDisabled(), true);
    const stylesBefore = await page.locator('style').count();
    for (let i=0;i<30;i++) await page.evaluate(() => testRuntime.helper());
    assert.equal(await page.locator('style').count(), stylesBefore, 'exam re-entry must not append duplicate CSS');
    await page.locator('#api-key-input').evaluate(e=>{e.value='synthetic-test-key';});
    await page.locator('#api-key-save-btn').evaluate(e=>e.click());
    assert.equal(await page.locator('#ai-helper-submit-btn').isDisabled(), false);
    await page.locator('#ai-helper-textarea').fill('合成问题，不发送真实个人信息');
    await page.locator('#ai-helper-submit-btn').evaluate(e=>e.click());
    await page.waitForFunction(()=>document.getElementById('ai-helper-result').textContent==='1.A');
    await page.evaluate(()=>mockAnswer='<img src="x" onerror="window.injected=true">');
    await page.locator('#ai-helper-submit-btn').evaluate(e=>e.click());
    await page.waitForFunction(()=>document.getElementById('ai-helper-result').textContent.includes('<img'));
    assert.equal(await page.evaluate(()=>Boolean(window.injected)),false,'AI output must remain plain text');
    await page.evaluate(()=>{
      document.getElementById('ai-helper-panel').remove();
      document.getElementById('fixture').innerHTML='<button class="submit-btn"><span>提交试卷</span></button><div class="result-tip-content">考试完成，成绩处理中</div>';
      testRuntime.service(true);GM_setValue('sclpa_nav_context','exam');location.hash='/examination';testRuntime.submit();
    });
    await page.waitForFunction(()=>document.getElementById('sclpa-automation-notice')?.textContent.includes('未能确认考试结果'),{},{timeout:18000});
    assert.equal(await page.evaluate(()=>location.hash), '#/examination', 'exam finished must not be misreported as passed');
    await page.evaluate(()=>{testRuntime.service(false);location.hash='/test';document.getElementById('fixture').replaceChildren();});
    console.log('PASS: 30 AI panel recreations retain one stylesheet, live key save, synthetic AI response, unknown exam results stay on page');

    // Long-running idle checks catch loops that keep scheduling or accumulating jobs.
    const soakSeconds = Number(process.env.SOAK_SECONDS || 30);
    const soakStart = Date.now();
    const idleHeap = await heap();
    const idleTaskBefore=(await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='TaskDuration').value;
    await page.evaluate(()=>testRuntime.service(true));
    let running=true;
    while (Date.now()-soakStart < soakSeconds*1000) {
      await page.waitForTimeout(Math.min(10000, soakSeconds*1000-(Date.now()-soakStart)));
      const state=await page.evaluate(()=>({jobs:__sclpaBackgroundScheduler.pending,guards:testRuntime.guards(),videos:__sclpaVideoRuntime.videos,roots:__sclpaVideoRuntime.roots}));
      assert.ok(state.jobs < 6);assert.equal(state.guards,0);assert.equal(state.videos,0);assert.equal(state.roots,running?1:0);
      console.log(`SOAK ${Math.round((Date.now()-soakStart)/1000)}s ${running?'active':'paused'}: ${JSON.stringify(state)}`);
      if(running && Date.now()-soakStart >= soakSeconds*500){await page.evaluate(()=>testRuntime.service(false));running=false;}
    }
    const idleDelta=(await heap())-idleHeap;
    const idleTaskAfter=(await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='TaskDuration').value;
    assert.ok(idleDelta < 8*1048576);
    assert.deepEqual(errors,[], 'no unhandled browser errors');
    console.log(`PASS: ${soakSeconds}s idle soak, retained heap delta ${(idleDelta/1048576).toFixed(2)} MiB; main-thread task time ${(idleTaskAfter-idleTaskBefore).toFixed(3)}s; no page errors`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode=1; });
