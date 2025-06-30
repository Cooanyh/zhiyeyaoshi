// ==UserScript==
// @name         四川省执业药师继续教育 (v1.1.5)
// @namespace    http://tampermonkey.net/
// @version      1.1.5
// @description  【v1.1.5 |新增】在UI面板中新增API Key设置功能，方便用户配置AI服务。
// @author       Coren & Gemini
// @match        https://www.sclpa.cn/*
// @match        https://zyys.ihehang.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.deepseek.com
// @connect      self
// @license MIT
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // --- 脚本配置 (Script Configuration) ---
    // ===================================================================================

    // Get user-defined playback speed from storage, default to 16x if not set
    let currentPlaybackRate = GM_getValue('sclpa_playback_rate', 16.0);
    // Get user-defined AI API Key from storage
    let aiApiKey = GM_getValue('sclpa_deepseek_api_key', '请在此处填入您自己的 DeepSeek API Key');

    const CONFIG = {
        // Use user-defined playback speed
        VIDEO_PLAYBACK_RATE: currentPlaybackRate,
        TIME_ACCELERATION_RATE: currentPlaybackRate,
        AI_API_SETTINGS: {
            // IMPORTANT: Get API Key from storage
            API_KEY: aiApiKey,
            DEEPSEEK_API_URL: 'https://api.deepseek.com/chat/completions',
        },
    };

    // --- 脚本全局状态 (Global States) ---
    let isServiceActive = GM_getValue('sclpa_service_active', true);
    let scriptMode = GM_getValue('sclpa_script_mode', 'video');
    let isTimeAccelerated = false;
    let unfinishedTabClicked = false;
    let isPopupBeingHandled = false;
    let isModePanelCreated = false;
    let currentPageHash = '';
    let isChangingChapter = false;


    // ===================================================================================
    // --- 辅助函数 (Helper Functions) ---
    // ===================================================================================

    /**
     * Find element by selector and text content
     * @param {string} selector - CSS selector.
     * @param {string} text - The text to match.
     * @returns {HTMLElement|null}
     */
    function findElementByText(selector, text) {
        try {
            return Array.from(document.querySelectorAll(selector)).find(el => el.innerText.trim() === text.trim());
        } catch (e) {
            return null;
        }
    }

    /**
     * Safely click an element
     * @param {HTMLElement} element - The element to click.
     */
    function clickElement(element) {
        if (element && typeof element.click === 'function') {
            console.log('[Script] Clicking element:', element);
            element.click();
        }
    }

    /**
     * Intelligently determine if "unfinished" tab is active (compatible with professional and public courses)
     * @param {HTMLElement} tabElement - The tab element to check.
     * @returns {boolean}
     */
    function isUnfinishedTabActive(tabElement) {
        if (!tabElement) return false;
        return tabElement.classList.contains('active-radio-tag') || tabElement.classList.contains('radio-tab-tag-ed');
    }

    /**
     * Lightweight function hooking tool, inspired by hooker.js
     * @param {object} object The object containing the method (e.g., window).
     * @param {string} methodName The name of the method to hook (e.g., 'setTimeout').
     * @param {(original: Function) => Function} hooker A function that receives the original function and returns a new function.
     */
    function hook(object, methodName, hooker) {
        const original = object[methodName];
        object[methodName] = hooker(original);
    }


    // ===================================================================================
    // --- UI面板管理 (UI Panel Management) ---
    // ===================================================================================

    /**
     * Create the script control panel (mode switching, navigation, etc.)
     */
    function createModeSwitcherPanel() {
        if (isModePanelCreated) return;
        isModePanelCreated = true;

        GM_addStyle(`
            #mode-switcher-panel { position: fixed; bottom: 20px; right: 20px; width: 220px; background-color: #fff; border: 1px solid #007bff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.15); z-index: 10000; overflow: hidden; font-family: 'Microsoft YaHei', sans-serif; }
            #mode-switcher-header { padding: 8px 12px; background-color: #007bff; color: white; cursor: move; user-select: none; display: flex; justify-content: space-between; align-items: center; }
            #mode-switcher-toggle-collapse { background: none; border: none; color: white; font-size: 18px; cursor: pointer; }
            #mode-switcher-content { padding: 15px; border-top: 1px solid #007bff; display: flex; flex-direction: column; align-items: center; gap: 10px; max-height: 500px; overflow: hidden; transition: max-height 0.3s ease-in-out, padding 0.3s ease-in-out; }
            #mode-switcher-panel.collapsed #mode-switcher-content { max-height: 0; padding-top: 0; padding-bottom: 0; }
            .panel-btn { padding: 8px 16px; font-size: 14px; color: white; border: none; border-radius: 5px; cursor: pointer; transition: background-color 0.3s; min-width: 120px; width: 100%; box-sizing: border-box; }
            .service-btn-active { background-color: #28a745; }
            .service-btn-paused { background-color: #dc3545; }
            .mode-btn-full { background-color: #17a2b8; }
            .mode-btn-video { background-color: #ffc107; color: #212529 !important; }
            .nav-btn { padding: 5px 10px; font-size: 12px; color: #007bff; background-color: #fff; border: 1px solid #007bff; border-radius: 5px; cursor: pointer; transition: all 0.3s; width: 100%; }
            .nav-btn:hover { background-color: #007bff; color: #fff; }
            .panel-divider { width: 100%; height: 1px; background-color: #eee; margin: 5px 0; }
            .setting-row { display: flex; flex-direction: column; width: 100%; align-items: center; }
            .setting-row > label { margin-bottom: 5px; font-size: 14px; }
            .speed-slider-container { display: flex; align-items: center; width: 100%; gap: 10px; }
            #speed-slider { flex-grow: 1; }
            #speed-display { font-weight: bold; font-size: 14px; color: #007bff; min-width: 45px; text-align: right; }
            .api-key-input { width: calc(100% - 20px); padding: 8px; margin-top: 5px; border: 1px solid #ccc; border-radius: 5px; box-sizing: border-box; font-size: 13px; }
            .api-key-action-btn { background-color: #6c757d; margin-top: 5px; }
            .api-key-action-btn:hover { background-color: #5a6268; }
        `);

        const panel = document.createElement('div');
        panel.id = 'mode-switcher-panel';
        panel.innerHTML = `
            <div id="mode-switcher-header">
                <span>控制面板</span>
                <button id="mode-switcher-toggle-collapse">－</button>
            </div>
            <div id="mode-switcher-content">
                <div class="setting-row">
                    <label>点击开启/关闭服务:</label>
                    <button id="service-toggle-btn" class="panel-btn"></button>
                </div>
                <div class="panel-divider"></div>
                <div class="setting-row">
                    <label for="speed-slider">倍速设置:</label>
                    <div class="speed-slider-container">
                         <input type="range" id="speed-slider" min="1" max="16" step="0.5" value="${currentPlaybackRate}">
                         <span id="speed-display">x${currentPlaybackRate}</span>
                    </div>
                </div>
                <div class="panel-divider"></div>
                <div class="setting-row">
                    <label>当前模式:</label>
                    <button id="mode-toggle-btn" class="panel-btn"></button>
                </div>
                <div class="panel-divider"></div>
                <div class="setting-row">
                    <label>AI API Key 设置:</label>
                    <button id="api-key-setting-btn" class="panel-btn api-key-action-btn">设置 API Key</button>
                </div>
                <div class="panel-divider"></div>
                <div class="setting-row">
                     <label>快速导航:</label>
                    <div style="display: flex; flex-direction: column; gap: 5px; width: 100%;">
                        <button id="nav-specialized-btn" class="nav-btn">专业课程</button>
                        <button id="nav-public-video-btn" class="nav-btn">公需课-视频</button>
                        <button id="nav-public-article-btn" class="nav-btn">公需课-文章</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        const serviceBtn = document.getElementById('service-toggle-btn');
        const modeBtn = document.getElementById('mode-toggle-btn');
        const collapseBtn = document.getElementById('mode-switcher-toggle-collapse');
        const navSpecializedBtn = document.getElementById('nav-specialized-btn');
        const navPublicVideoBtn = document.getElementById('nav-public-video-btn');
        const navPublicArticleBtn = document.getElementById('nav-public-article-btn');
        const speedSlider = document.getElementById('speed-slider');
        const speedDisplay = document.getElementById('speed-display');
        const apiKeySettingBtn = document.getElementById('api-key-setting-btn'); // New API Key button

        const updateServiceButton = (isActive) => {
            serviceBtn.innerText = isActive ? '服务运行中' : '服务已暂停';
            serviceBtn.className = 'panel-btn ' + (isActive ? 'service-btn-active' : 'service-btn-paused');
        };
        const updateModeButton = (mode) => {
            modeBtn.innerText = mode === 'full' ? '完整模式' : '仅视频模式';
            modeBtn.className = 'panel-btn ' + (mode === 'full' ? 'mode-btn-full' : 'mode-btn-video');
        };

        updateServiceButton(isServiceActive);
        updateModeButton(scriptMode);

        serviceBtn.onclick = () => {
            isServiceActive = !isServiceActive;
            GM_setValue('sclpa_service_active', isServiceActive);
            window.location.reload();
        };
        modeBtn.onclick = () => {
            scriptMode = (scriptMode === 'full') ? 'video' : 'full';
            GM_setValue('sclpa_script_mode', scriptMode);
            updateModeButton(scriptMode);
        };
        speedSlider.addEventListener('input', () => {
            speedDisplay.textContent = `x${speedSlider.value}`;
        });
        speedSlider.addEventListener('change', () => {
            const newRate = parseFloat(speedSlider.value);
            GM_setValue('sclpa_playback_rate', newRate);
            console.log(`[Script] Playback speed set to: ${newRate}x. Refreshing page to apply...`);
            window.location.reload();
        });
        collapseBtn.onclick = () => {
            panel.classList.toggle('collapsed');
            collapseBtn.innerText = panel.classList.contains('collapsed') ? '＋' : '－';
        };
        navSpecializedBtn.onclick = () => window.location.href = 'https://zyys.ihehang.com/#/specialized';
        navPublicVideoBtn.onclick = () => {
            GM_setValue('sclpa_public_target', 'video');
            window.location.href = 'https://zyys.ihehang.com/#/publicDemand';
        };
        navPublicArticleBtn.onclick = () => {
            GM_setValue('sclpa_public_target', 'article');
            window.location.href = 'https://zyys.ihehang.com/#/publicDemand';
        };

        // New API Key setting button click handler
        apiKeySettingBtn.onclick = () => {
            const currentKey = GM_getValue('sclpa_deepseek_api_key', '');
            const newKey = prompt('请输入您的 DeepSeek AI API Key:', currentKey);
            if (newKey !== null) { // User didn't click cancel
                GM_setValue('sclpa_deepseek_api_key', newKey.trim());
                CONFIG.AI_API_SETTINGS.API_KEY = newKey.trim(); // Update current config immediately
                alert('API Key 已保存！下次页面加载时生效。');
            }
        };

        makeDraggable(panel, document.getElementById('mode-switcher-header'));
    }

    /**
     * Create AI helper panel, ensuring it's always new
     */
    function createManualAiHelper() {
        const existingPanel = document.getElementById('ai-helper-panel');
        if (existingPanel) {
            existingPanel.remove();
        }

        GM_addStyle(`
            #ai-helper-panel { position: fixed; bottom: 20px; right: 20px; width: 350px; max-width: 90vw; background-color: #f0f8ff; border: 1px solid #b0c4de; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); z-index: 99999; font-family: 'Microsoft YaHei', sans-serif; display: flex; flex-direction: column; }
            #ai-helper-header { padding: 10px; background-color: #4682b4; color: white; font-weight: bold; cursor: move; border-top-left-radius: 9px; border-top-right-radius: 9px; user-select: none; display: flex; justify-content: space-between; align-items: center; }
            #ai-helper-close-btn { background: none; border: none; color: white; font-size: 20px; cursor: pointer; }
            #ai-helper-content { padding: 15px; display: flex; flex-direction: column; gap: 10px; }
            #ai-helper-textarea { width: 100%; box-sizing: border-box; height: 100px; padding: 8px; border: 1px solid #ccc; border-radius: 5px; resize: vertical; }
            #ai-helper-submit-btn { padding: 10px 15px; background-color: #5cb85c; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
            #ai-helper-result { margin-top: 10px; padding: 10px; background-color: #ffffff; border: 1px solid #eee; border-radius: 5px; min-height: 50px; max-height: 200px; overflow-y: auto; white-space: pre-wrap; word-wrap: break-word; }
            #ai-key-warning { color: #dc3545; font-size: 12px; margin-top: 5px; display: none; }
        `);
        const panel = document.createElement('div');
        panel.id = 'ai-helper-panel';
        panel.innerHTML = `
            <div id="ai-helper-header"><span>AI 问答助手</span><button id="ai-helper-close-btn">&times;</button></div>
            <div id="ai-helper-content">
                <label for="ai-helper-textarea">在此输入您的问题：</label>
                <textarea id="ai-helper-textarea" placeholder="案例：复制所有问题以及选项并询问AI，AI将直接回复答案选项..."></textarea>
                <div id="ai-key-warning">请先在控制面板中设置您的 DeepSeek API Key！</div>
                <button id="ai-helper-submit-btn">向AI提问</button>
                <label for="ai-helper-result">AI 回答：</label>
                <div id="ai-helper-result">请先提问...</div>
            </div>
        `;
        document.body.appendChild(panel);
        const submitBtn = document.getElementById('ai-helper-submit-btn');
        const closeBtn = document.getElementById('ai-helper-close-btn');
        const textarea = document.getElementById('ai-helper-textarea');
        const resultDiv = document.getElementById('ai-helper-result');
        const keyWarning = document.getElementById('ai-key-warning');

        // Check if API Key is set
        if (!CONFIG.AI_API_SETTINGS.API_KEY || CONFIG.AI_API_SETTINGS.API_KEY === '请在此处填入您自己的 DeepSeek API Key') {
            keyWarning.style.display = 'block';
            submitBtn.disabled = true;
            submitBtn.innerText = '请先设置 API Key';
        }

        closeBtn.onclick = () => panel.remove();
        submitBtn.onclick = async () => {
            const question = textarea.value.trim();
            if (!question) { resultDiv.innerText = '错误：问题不能为空！'; return; }
            if (!CONFIG.AI_API_SETTINGS.API_KEY || CONFIG.AI_API_SETTINGS.API_KEY === '请在此处填入您自己的 DeepSeek API Key') {
                resultDiv.innerText = '错误：请先设置您的 DeepSeek API Key！';
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerText = 'AI思考中...';
            resultDiv.innerText = '正在向AI发送请求...';
            try {
                resultDiv.innerText = await askAiForAnswer(question);
            } catch (error) {
                resultDiv.innerText = `请求失败：${error}`;
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerText = '向AI提问';
            }
        };
        makeDraggable(panel, document.getElementById('ai-helper-header'));
    }

    /**
     * Make UI panel draggable
     * @param {HTMLElement} panel - The panel element to be dragged.
     * @param {HTMLElement} header - The header element that acts as the drag handle.
     */
    function makeDraggable(panel, header) {
        let isDragging = false, offsetX, offsetY;
        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
            isDragging = true;
            if (panel.style.bottom || panel.style.right) {
                const rect = panel.getBoundingClientRect();
                panel.style.top = `${rect.top}px`;
                panel.style.left = `${rect.left}px`;
                panel.style.bottom = '';
                panel.style.right = '';
            }
            offsetX = e.clientX - parseFloat(panel.style.left);
            offsetY = e.clientY - parseFloat(panel.style.top);
            header.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const newX = e.clientX - offsetX;
            const newY = e.clientY - offsetY;
            panel.style.left = `${newX}px`;
            panel.style.top = `${newY}px`;
        });
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                header.style.cursor = 'move';
                document.body.style.userSelect = '';
            }
        });
    }

    // ===================================================================================
    // --- AI 调用 (AI Invocation) ---
    // ===================================================================================

    /**
     * Send request to DeepSeek AI and get answer
     * @param {string} question - User's question
     * @returns {Promise<string>}
     */
    function askAiForAnswer(question) {
        return new Promise((resolve, reject) => {
            if (!CONFIG.AI_API_SETTINGS.API_KEY || CONFIG.AI_API_SETTINGS.API_KEY === '请在此处填入您自己的 DeepSeek API Key') {
                reject('API Key 未设置或不正确，请在控制面板中设置！');
                return;
            }
            const payload = { model: "deepseek-chat", messages: [{ "role": "system", "content": "你是一个乐于助人的问题回答助手。聚焦于执业药师相关的内容，请根据用户提出的问题，提供准确、清晰、的解答。注意回答时仅仅包括答案，不允许其他额外任何解释" }, { "role": "user", "content": question }], temperature: 0.2 };
            GM_xmlhttpRequest({
                method: 'POST',
                url: CONFIG.AI_API_SETTINGS.DEEPSEEK_API_URL,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.AI_API_SETTINGS.API_KEY}` },
                data: JSON.stringify(payload),
                timeout: 20000,
                onload: (response) => { try { const result = JSON.parse(response.responseText); if (result.choices && result.choices.length > 0) { resolve(result.choices[0].message.content.trim()); } else { reject('AI响应格式不正确。'); } } catch (e) { reject(`解析AI响应失败: ${e.message}`); } },
                onerror: (err) => reject(`请求AI API网络错误: ${err.statusText || '未知错误'}`),
                ontimeout: () => reject('请求AI API超时')
            });
        });
    }


    // ===================================================================================
    // --- 页面逻辑处理 (Page-Specific Logic) ---
    // ===================================================================================

    /**
     * Handle course list page, compatible with video and article
     * @param {string} courseType - '专业课' or '公需课'.
     */
    function handleCourseListPage(courseType) {
        if (!isServiceActive) return;

        if (courseType === '公需课') {
            const publicTarget = GM_getValue('sclpa_public_target', 'video');
            const targetTabText = publicTarget === 'article' ? '文章资讯' : '视频课程';
            const targetTab = findElementByText('.radioTab > .radio-tab-tag', targetTabText);
            if (targetTab && !targetTab.classList.contains('radio-tab-tag-ed')) {
                console.log(`[Script] Target is ${targetTabText}, switching tab...`);
                clickElement(targetTab);
                return;
            }
        }

        const unfinishedTab = findElementByText('div.radio-tab-tag', '未完成');
        if (unfinishedTab && !isUnfinishedTabActive(unfinishedTab) && !unfinishedTabClicked) {
            clickElement(unfinishedTab);
            unfinishedTabClicked = true;
            return;
        }

        if (unfinishedTab && (isUnfinishedTabActive(unfinishedTab) || unfinishedTabClicked)) {
            setTimeout(() => {
                let targetCourseElement = document.querySelector('.play-card:not(:has(.el-icon-success))');

                if (!targetCourseElement) {
                    const allArticles = document.querySelectorAll('.information-card');
                    for (const article of allArticles) {
                        const statusTag = article.querySelector('.status');
                        if (statusTag && statusTag.innerText.trim() === '未完成') {
                            targetCourseElement = article;
                            break;
                        }
                    }
                }

                 if (targetCourseElement) {
                    console.log(`[Script] ${courseType}: Found the first unfinished item, clicking to enter study...`);
                    const clickableElement = targetCourseElement.querySelector('.play-card-box-right-text') || targetCourseElement;
                    clickElement(clickableElement);
                 } else {
                    console.log(`[Script] ${courseType}: No unfinished items found on "unfinished" page.`);
                 }
            }, 2500);
        }
    }

    /**
     * Main handler for learning page
     */
    function handleLearningPage() {
        if (!isServiceActive) return;
        if (!isTimeAccelerated) {
            accelerateTime();
            isTimeAccelerated = true;
        }

        const directoryItems = document.querySelectorAll('.catalogue-item');

        if (directoryItems.length > 0) {
            handleMultiChapterCourse(directoryItems);
        } else {
            const video = document.querySelector('video');
            if (video) {
                handleSingleMediaCourse(video);
            } else {
                handleArticleReadingPage();
            }
        }
    }

    /**
     * Handle multi-chapter courses (professional courses)
     * @param {NodeListOf<Element>} directoryItems
     */
    function handleMultiChapterCourse(directoryItems) {
        if (isChangingChapter) return;
        const video = document.querySelector('video');
        if (video && !video.paused) {
            video.playbackRate = CONFIG.VIDEO_PLAYBACK_RATE;
            video.muted = true;
            return;
        }

        let nextChapter = null;
        for (const item of directoryItems) {
            if (!item.querySelector('.el-icon-success')) {
                nextChapter = item;
                break;
            }
        }

        if (nextChapter) {
            const isAlreadySelected = nextChapter.classList.contains('catalogue-item-ed');
            if (isAlreadySelected && video && video.paused) {
                video.play().catch(e => {});
            } else if (!isAlreadySelected) {
                clickElement(nextChapter);
                isChangingChapter = true;
                setTimeout(() => { isChangingChapter = false; }, 4000);
            }
        } else {
            safeNavigateAfterCourseCompletion();
        }
    }

    /**
     * Handle single media courses (public courses)
     * @param {HTMLVideoElement} video
     */
    function handleSingleMediaCourse(video) {
        if (!video.dataset.singleVidControlled) {
            video.addEventListener('ended', safeNavigateAfterCourseCompletion);
            video.dataset.singleVidControlled = 'true';
        }
        video.playbackRate = CONFIG.VIDEO_PLAYBACK_RATE;
        video.muted = true;
        if (video.paused) {
            video.play().catch(e => {});
        }
    }

    /**
     * Handle article reading page
     */
    function handleArticleReadingPage() {
        console.log('[Script] Detected article page, monitoring progress...');
        const progressLabel = document.querySelector('.action-btn .label');
        if (progressLabel && (progressLabel.innerText.includes('100') || progressLabel.innerText.includes('待考试'))) {
            console.log('[Script] Article study completed, preparing to return to list.');
            safeNavigateAfterCourseCompletion();
        }
    }

    /**
     * Handle exam page
     */
    function handleExamPage() {
        if (!document.getElementById('ai-helper-panel')) {
            createManualAiHelper();
        }
        if (!isServiceActive) return;
        if (scriptMode === 'video') {
            safeNavigateBackToList();
        }
    }

    /**
     * Handle generic popups
     */
    function handleGenericPopups() {
        if (!isServiceActive || isPopupBeingHandled) return;
        const btn = findElementByText('button span', '确定') || findElementByText('button span', '进入下一节学习');
        if (btn) {
            isPopupBeingHandled = true;
            clickElement(btn.closest('button'));
            setTimeout(() => { isPopupBeingHandled = false; }, 2500);
        }
    }


    // ===================================================================================
    // --- 核心自动化 (Core Automation) ---
    // ===================================================================================

    /**
     * [Time Engine] Global time acceleration, including setTimeout, setInterval, and requestAnimationFrame
     */
    function accelerateTime() {
        if (CONFIG.TIME_ACCELERATION_RATE <= 1) return;
        console.log(`[Script] Time acceleration engine started, rate: ${CONFIG.TIME_ACCELERATION_RATE}x`);
        
        const rate = CONFIG.TIME_ACCELERATION_RATE;

        hook(window, 'setTimeout', (original) => (cb, delay, ...args) => original.call(window, cb, delay / rate, ...args));
        hook(window, 'setInterval', (original) => (cb, delay, ...args) => original.call(window, cb, delay / rate, ...args));

        hook(window, 'requestAnimationFrame', (original) => {
            let firstTimestamp = -1;
            return (callback) => {
                return original.call(window, (timestamp) => {
                    if (firstTimestamp < 0) firstTimestamp = timestamp;
                    const acceleratedTimestamp = firstTimestamp + (timestamp - firstTimestamp) * rate;
                    callback(acceleratedTimestamp);
                });
            };
        });

        hook(Date, 'now', (original) => {
            const scriptStartTime = original();
            return () => scriptStartTime + (original() - scriptStartTime) * rate;
        });
    }

    /**
     * Prevent webpage from resetting video playback rate
     */
    function preventPlaybackRateLock() {
        console.log('[Script] Starting video playback rate anti-rollback mechanism.');
        hook(Object, 'defineProperty', (original) => function(target, property, descriptor) {
            if (target instanceof HTMLMediaElement && property === 'playbackRate') {
                console.log('[Script] Detected website attempting to lock video playback rate, intercepted.');
                return;
            }
            return original.apply(this, arguments);
        });
    }


    /**
     * Safely navigate back to the corresponding course list
     */
    function safeNavigateBackToList() {
        const hash = window.location.hash.toLowerCase();
        const returnUrl = hash.includes('public') || hash.includes('openplayer') || hash.includes('imageandtext')
            ? 'https://zyys.ihehang.com/#/publicDemand'
            : 'https://zyys.ihehang.com/#/specialized';
        window.location.href = returnUrl;
    }

    /**
     * Decide next action after a course (including all its chapters) is completed
     */
    function safeNavigateAfterCourseCompletion() {
        const hash = window.location.hash.toLowerCase();
        if (hash.includes('public') || hash.includes('openplayer') || hash.includes('imageandtext')) {
            safeNavigateBackToList();
            return;
        }
        if (scriptMode === 'full') {
            const goToExamButton = findElementByText('button span', '前往考试');
            if (goToExamButton) {
                clickElement(goToExamButton.closest('button'));
            } else {
                safeNavigateBackToList();
            }
        } else {
            safeNavigateBackToList();
        }
    }


    // ===================================================================================
    // --- 主循环与启动器 (Main Loop & Initiator) ---
    // ===================================================================================

    /**
     * Page router, determines which handler function to execute based on URL hash
     */
    function router() {
        const hash = window.location.hash.toLowerCase();
        if (hash.includes('/specialized')) {
            handleCourseListPage('专业课');
        } else if (hash.includes('/publicdemand')) {
            handleCourseListPage('公需课');
        } else if (hash.includes('/examination')) {
            handleExamPage();
        } else if (hash.includes('/majorplayerpage') || hash.includes('/articleplayerpage') || hash.includes('/openplayer') || hash.includes('/imageandtext')) {
             handleLearningPage();
        }
    }

    /**
     * Main script loop, executed every 2 seconds
     */
    function mainLoop() {
        if (window.location.hash !== currentPageHash) {
            const oldHash = currentPageHash;
            currentPageHash = window.location.hash;
            if (oldHash.includes('/examination') && !currentPageHash.includes('/examination')) {
                const aiPanel = document.getElementById('ai-helper-panel');
                if (aiPanel) aiPanel.remove();
            }
            if (currentPageHash.includes('/specialized') || currentPageHash.includes('/publicdemand')) {
                unfinishedTabClicked = false;
            }
        }
        
        if (isServiceActive) {
            handleGenericPopups();
        }
        
        router();
    }

    /**
     * Start the script
     */
    window.addEventListener('load', () => {
        console.log(`[Script] Sichuan Licensed Pharmacist Continuing Education (v1.1.3) started.`);
        console.log(`[Script] Service status: ${isServiceActive ? 'Running' : 'Paused'} | Current mode: ${scriptMode} | Current speed: ${currentPlaybackRate}x`);
        currentPageHash = window.location.hash;
        
        preventPlaybackRateLock();
        createModeSwitcherPanel();
        
        setInterval(mainLoop, 2000);
    });

})();
