// ==UserScript==
// @name         四川省执业药师继续教育 (v1.0.2)
// @namespace    http://tampermonkey.net/
// @version      1.0.2
// @description  【v1.0.2 优化】新增AI助手离开考试页自动关闭功能，优化UI体验。功能：①16倍速 ②智能跳过 ③双模式切换 ④AI助手 ⑤服务启停 ⑥全课程支持。
// @author       Cooanyh & Gemini
// @match        https://www.sclpa.cn/*
// @match        https://zyys.ihehang.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.deepseek.com
// @connect      self
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // --- 脚本配置 (Script Configuration) ---
    // ===================================================================================

    const CONFIG = {
        VIDEO_PLAYBACK_RATE: 16.0,
        TIME_ACCELERATION_RATE: 16.0,
        AI_API_SETTINGS: {
            // =======================================================================
            // !!! 重要：请在此处填入您自己的 DeepSeek API Key !!!
            // !!! IMPORTANT: Please replace the key below with your own DeepSeek API Key !!!
            // =======================================================================
            API_KEY: '请在此处填入您自己的 DeepSeek API Key',
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
     * 通过选择器和文本内容查找元素
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
     * 安全地点击一个元素
     * @param {HTMLElement} element - The element to click.
     */
    function clickElement(element) {
        if (element && typeof element.click === 'function') {
            console.log('[脚本] 点击元素:', element);
            element.click();
        }
    }

    /**
     * 智能判断"未完成"标签是否处于激活状态 (兼容专业课和公需课)
     * @param {HTMLElement} tabElement - The tab element to check.
     * @returns {boolean}
     */
    function isUnfinishedTabActive(tabElement) {
        if (!tabElement) return false;
        return tabElement.classList.contains('active-radio-tag') || tabElement.classList.contains('radio-tab-tag-ed');
    }


    // ===================================================================================
    // --- UI面板管理 (UI Panel Management) ---
    // ===================================================================================

    /**
     * 创建脚本的控制面板 (模式切换、导航等)
     */
    function createModeSwitcherPanel() {
        if (isModePanelCreated) return;
        isModePanelCreated = true;

        GM_addStyle(`
            #mode-switcher-panel { position: fixed; bottom: 80px; right: 20px; width: 200px; background-color: #fff; border: 1px solid #007bff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.15); z-index: 10000; overflow: hidden; font-family: 'Microsoft YaHei', sans-serif; }
            #mode-switcher-header { padding: 8px 12px; background-color: #007bff; color: white; cursor: move; user-select: none; display: flex; justify-content: space-between; align-items: center; }
            #mode-switcher-toggle-collapse { background: none; border: none; color: white; font-size: 18px; cursor: pointer; }
            #mode-switcher-content { padding: 15px; border-top: 1px solid #007bff; display: flex; flex-direction: column; align-items: center; gap: 10px; max-height: 500px; overflow: hidden; transition: max-height 0.3s ease-in-out, padding 0.3s ease-in-out; }
            #mode-switcher-panel.collapsed #mode-switcher-content { max-height: 0; padding-top: 0; padding-bottom: 0; }
            .panel-btn { padding: 8px 16px; font-size: 14px; color: white; border: none; border-radius: 5px; cursor: pointer; transition: background-color 0.3s; min-width: 120px; width: 100%; box-sizing: border-box; }
            .service-btn-active { background-color: #28a745; }
            .service-btn-paused { background-color: #dc3545; }
            .mode-btn-full { background-color: #17a2b8; }
            .mode-btn-video { background-color: #ffc107; color: #212529 !important; }
            .nav-btn { padding: 5px 10px; font-size: 12px; color: #007bff; background-color: #fff; border: 1px solid #007bff; border-radius: 5px; cursor: pointer; transition: all 0.3s; }
            .nav-btn:hover { background-color: #007bff; color: #fff; }
            .panel-divider { width: 100%; height: 1px; background-color: #eee; margin: 5px 0; }
        `);

        const panel = document.createElement('div');
        panel.id = 'mode-switcher-panel';
        panel.innerHTML = `
            <div id="mode-switcher-header">
                <span>控制面板</span>
                <button id="mode-switcher-toggle-collapse">－</button>
            </div>
            <div id="mode-switcher-content">
                <p style="margin: 0; font-size: 14px;">服务状态:</p>
                <button id="service-toggle-btn" class="panel-btn"></button>
                <div class="panel-divider"></div>
                <p style="margin: 0; font-size: 14px;">当前模式:</p>
                <button id="mode-toggle-btn" class="panel-btn"></button>
                <div class="panel-divider"></div>
                <p style="margin: 0; font-size: 14px;">快速导航:</p>
                <div style="display: flex; gap: 10px; margin-top: 5px;">
                    <button id="nav-specialized-btn" class="nav-btn">专业课程</button>
                    <button id="nav-public-btn" class="nav-btn">公需课程</button>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        const serviceBtn = document.getElementById('service-toggle-btn');
        const modeBtn = document.getElementById('mode-toggle-btn');
        const collapseBtn = document.getElementById('mode-switcher-toggle-collapse');
        const navSpecializedBtn = document.getElementById('nav-specialized-btn');
        const navPublicBtn = document.getElementById('nav-public-btn');

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
            console.log(`[脚本] 服务状态已切换为: ${isServiceActive ? '运行中' : '暂停'}。正在刷新页面...`);
            window.location.reload();
        };

        modeBtn.onclick = () => {
            scriptMode = (scriptMode === 'full') ? 'video' : 'full';
            GM_setValue('sclpa_script_mode', scriptMode);
            updateModeButton(scriptMode);
            console.log(`[脚本] 模式已切换为: ${scriptMode}`);
        };

        collapseBtn.onclick = () => {
            panel.classList.toggle('collapsed');
            collapseBtn.innerText = panel.classList.contains('collapsed') ? '＋' : '－';
        };

        navSpecializedBtn.onclick = () => {
            window.location.href = 'https://zyys.ihehang.com/#/specialized';
        };

        navPublicBtn.onclick = () => {
            window.location.href = 'https://zyys.ihehang.com/#/publicDemand';
        };

        makeDraggable(panel, document.getElementById('mode-switcher-header'));
    }

    /**
     * 创建AI助手面板，并确保每次都是全新的
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
            #ai-helper-submit-btn { padding: 10px 15px; background-color: #5cb85c; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; transition: background-color 0.3s; }
            #ai-helper-submit-btn:hover { background-color: #4cae4c; }
            #ai-helper-submit-btn:disabled { background-color: #d3d3d3; cursor: not-allowed; }
            #ai-helper-result { margin-top: 10px; padding: 10px; background-color: #ffffff; border: 1px solid #eee; border-radius: 5px; min-height: 50px; max-height: 200px; overflow-y: auto; white-space: pre-wrap; word-wrap: break-word; }
        `);

        const panel = document.createElement('div');
        panel.id = 'ai-helper-panel';
        panel.innerHTML = `
            <div id="ai-helper-header">
                <span>AI 问答助手</span>
                <button id="ai-helper-close-btn">&times;</button>
            </div>
            <div id="ai-helper-content">
                <label for="ai-helper-textarea">在此输入您的问题：</label>
                <textarea id="ai-helper-textarea" placeholder="使用案例：直接复制全部题目及选项在这里发送..."></textarea>
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

        closeBtn.onclick = () => { panel.remove(); };

        submitBtn.onclick = async () => {
            const question = textarea.value.trim();
            if (!question) { resultDiv.innerText = '错误：问题不能为空！'; return; }
            submitBtn.disabled = true;
            submitBtn.innerText = 'AI思考中...';
            resultDiv.innerText = '正在向AI发送请求，请稍候...';
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
     * 使UI面板可拖拽
     * @param {HTMLElement} panel - The panel element to be dragged.
     * @param {HTMLElement} header - The header element that acts as the drag handle.
     */
    function makeDraggable(panel, header) {
        let isDragging = false;
        let offsetX, offsetY;
        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
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
     * 向DeepSeek AI发送请求并获取答案
     * @param {string} question - 用户输入的问题
     * @returns {Promise<string>}
     */
    function askAiForAnswer(question) {
        return new Promise((resolve, reject) => {
            const payload = {
                model: "deepseek-chat",
                messages: [
                    { "role": "system", "content": "你是一个乐于助人的问题回答助手。聚焦于执业药师相关的内容，请根据用户提出的问题，提供准确、清晰、的解答。注意回答时仅仅包括答案，不允许其他额外任何解释" },
                    { "role": "user", "content": question }
                ],
                temperature: 0.2,
            };
            GM_xmlhttpRequest({
                method: 'POST',
                url: CONFIG.AI_API_SETTINGS.DEEPSEEK_API_URL,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.AI_API_SETTINGS.API_KEY}` },
                data: JSON.stringify(payload),
                timeout: 20000,
                onload: (response) => {
                    try {
                        const result = JSON.parse(response.responseText);
                        if (result.choices && result.choices.length > 0) {
                            resolve(result.choices[0].message.content.trim());
                        } else {
                            reject('AI响应格式不正确。');
                        }
                    } catch (e) {
                        reject(`解析AI响应失败: ${e.message}`);
                    }
                },
                onerror: (err) => reject(`请求AI API网络错误`),
                ontimeout: () => reject('请求AI API超时')
            });
        });
    }


    // ===================================================================================
    // --- 页面逻辑处理 (Page-Specific Logic) ---
    // ===================================================================================

    /**
     * 处理课程列表页 (专业课/公需课)
     * @param {string} courseType - '专业课' or '公需课'.
     */
    function handleCourseListPage(courseType) {
        if (!isServiceActive) return;
        const unfinishedTab = findElementByText('div.radio-tab-tag', '未完成');

        if (unfinishedTab && !isUnfinishedTabActive(unfinishedTab) && !unfinishedTabClicked) {
            clickElement(unfinishedTab);
            unfinishedTabClicked = true;
            return;
        }

        if (unfinishedTab && (isUnfinishedTabActive(unfinishedTab) || unfinishedTabClicked)) {
            setTimeout(() => {
                const successIconSelector = '.el-icon-success';
                const courseContainers = document.querySelectorAll('.play-card-box, .play-card');

                if (courseContainers.length === 0) return;

                let targetCourseContainer = null;
                for (const container of courseContainers) {
                    const parentCard = container.closest('.play-card');
                    if (parentCard && !parentCard.querySelector(successIconSelector)) {
                         targetCourseContainer = container;
                         break;
                    } else if (!container.querySelector(successIconSelector)) {
                         targetCourseContainer = container;
                         break;
                    }
                }

                 if (targetCourseContainer) {
                    console.log(`[脚本] ${courseType}: 找到第一个未完成的课程，点击进入学习...`);
                    const clickableElement = targetCourseContainer.querySelector('.play-card-box-right-text') || targetCourseContainer;
                    clickElement(clickableElement);
                 } else {
                    console.log(`[脚本] ${courseType}: 在“未完成”页中未找到任何【未完成】的课程。`);
                 }
            }, 2500);
        }
    }


    /**
     * 学习页面的主处理函数
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
                handleArticlePage();
            }
        }
    }

    /**
     * 处理带章节目录的课程 (专业课)
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
     * 处理无章节目录的视频课程 (公需课)
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
     * 处理文章页面
     */
    function handleArticlePage() {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        setTimeout(safeNavigateAfterCourseCompletion, 5000 / CONFIG.TIME_ACCELERATION_RATE);
    }

    /**
     * 处理考试页面
     */
    function handleExamPage() {
        if (!document.getElementById('ai-helper-panel')) {
            createManualAiHelper();
            console.log('[脚本] 已进入考试页面，AI问答助手已加载。');
        }

        if (!isServiceActive) return;

        if (scriptMode === 'video') {
            safeNavigateBackToList();
        }
    }

    /**
     * 处理通用弹窗
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
     * 全局时间加速
     */
    function accelerateTime() {
        if (CONFIG.TIME_ACCELERATION_RATE <= 1) return;
        const originalSetTimeout = window.setTimeout;
        const originalSetInterval = window.setInterval;
        const rate = CONFIG.TIME_ACCELERATION_RATE;
        window.setTimeout = (cb, delay, ...args) => originalSetTimeout.call(window, cb, delay / rate, ...args);
        window.setInterval = (cb, delay, ...args) => originalSetInterval.call(window, cb, delay / rate, ...args);
    }

    /**
     * 安全地导航回对应的课程列表
     */
    function safeNavigateBackToList() {
        const hash = window.location.hash.toLowerCase();
        const returnUrl = hash.includes('public') || hash.includes('openplayer')
            ? 'https://zyys.ihehang.com/#/publicDemand'
            : 'https://zyys.ihehang.com/#/specialized';
        window.location.href = returnUrl;
    }

    /**
     * 在一个课程(包含其所有章节)完成后，决定下一步动作
     */
    function safeNavigateAfterCourseCompletion() {
        const hash = window.location.hash.toLowerCase();
        if (hash.includes('public') || hash.includes('openplayer')) {
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
     * 页面路由器，根据URL的hash决定执行哪个处理函数
     */
    function router() {
        const hash = window.location.hash.toLowerCase();
        if (hash.includes('/specialized')) {
            handleCourseListPage('专业课');
        } else if (hash.includes('/publicdemand')) {
            handleCourseListPage('公需课');
        } else if (hash.includes('/examination')) {
            handleExamPage();
        } else if (hash.includes('/majorplayerpage') || hash.includes('/articleplayerpage') || hash.includes('/openplayer')) {
             handleLearningPage();
        }
    }

    /**
     * 脚本的主循环，每2秒执行一次
     */
    function mainLoop() {
        // URL变化检测逻辑始终运行
        if (window.location.hash !== currentPageHash) {
            const oldHash = currentPageHash;
            currentPageHash = window.location.hash;
            console.log(`[脚本] URL发生变化: 从 ${oldHash || '空'} 到 ${currentPageHash}`);

            // 离开考试页面时，关闭AI助手
            if (oldHash.includes('/examination') && !currentPageHash.includes('/examination')) {
                const aiPanel = document.getElementById('ai-helper-panel');
                if (aiPanel) {
                    aiPanel.remove();
                    console.log('[脚本] 检测到离开考试页面，已关闭AI助手。');
                }
            }

            // 进入课程列表页时，重置状态
            if (currentPageHash.includes('/specialized') || currentPageHash.includes('/publicdemand')) {
                unfinishedTabClicked = false;
                console.log('[脚本] 检测到进入课程列表页，重置"未完成"标签的点击状态。');
            }
        }

        // 自动化功能由总开关控制
        if (isServiceActive) {
            handleGenericPopups();
        }

        // 路由分发始终运行，以确保UI（如AI助手）能正常显示
        router();
    }

    /**
     * 启动脚本
     */
    window.addEventListener('load', () => {
        console.log(`[脚本] 四川执业药师继续教育 (v1.0.2) 已启动。`);
        console.log(`[脚本] 服务状态: ${isServiceActive ? '运行中' : '已暂停'} | 当前模式: ${scriptMode}`);
        currentPageHash = window.location.hash;
        createModeSwitcherPanel();

        setInterval(mainLoop, 2000);
    });

})();
