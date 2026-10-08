// ==UserScript==
// @name         四川省执业药师继续教育（Beta 测试版）
// @namespace    http://tampermonkey.net/
// @version      1.4.0-beta.1
// @description  【Beta 测试版】四川省执业药师继续教育助手：视频与文章倍速、后台任务、全能托管、AI 答题纠错及异常提醒。
// @author       Coren
// @downloadURL  https://raw.githubusercontent.com/Cooanyh/zhiyeyaoshi/beta/1.4.0-beta.1/zhiyeyaoshi-beta.user.js
// @updateURL    https://raw.githubusercontent.com/Cooanyh/zhiyeyaoshi/beta/1.4.0-beta.1/zhiyeyaoshi-beta.user.js
// @match        https://www.sclpa.cn/*
// @match        https://zyys.ihehang.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_setValue
// @connect      api.deepseek.com
// @connect      self
// @inject-into  page
// @run-at       document-start
// @license CC BY-NC-SA 4.0
// license: https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans
// ==/UserScript==

// Script execution starts here. This log should appear first in console if script loads.
console.info('[执业药师] Beta 1.4.0-beta.1 已加载');

(function() {
    'use strict';

    if (window.__sclpaScriptInstance) return;
    window.__sclpaScriptInstance = { version: '1.4.0-beta.1' };

    const debugEnabled = GM_getValue('sclpa_debug', false);
    const debugLog = (...args) => { if (debugEnabled) console.debug(...args); };

    // ===================================================================================
    // --- 脚本配置 (Script Configuration) ---
    // ===================================================================================

    // Get user-defined playback speed from storage, default to 16x if not set
    let currentPlaybackRate = GM_getValue('sclpa_playback_rate', 1.0);
    // Get user-defined AI API Key from storage
    let aiApiKey = GM_getValue('sclpa_deepseek_api_key', '请在此处填入您自己的 DeepSeek API Key');

    const CONFIG = {
        // Use user-defined playback speed
        VIDEO_PLAYBACK_RATE: currentPlaybackRate,
        AI_API_SETTINGS: {
            // IMPORTANT: Get API Key from storage
            API_KEY: aiApiKey,
            DEEPSEEK_API_URL: 'https://api.deepseek.com/chat/completions',
        },
    };

    // --- 脚本全局状态 (Global States) ---
    let isServiceActive = GM_getValue('sclpa_service_active', true);
    let scriptMode = GM_getValue('sclpa_script_mode', 'video');
    let isVideoSpeedEngineInitialized = false;
    let refreshVideoSpeedEngine = null;
    let disposeVideoSpeedEngine = null;
    const backgroundPlaybackGuards = new Map();
    let emptyCourseObservation = null;
    let unfinishedTabClicked = false; // Flag to track if "未完成" tab has been clicked in the current page session
    let isPopupBeingHandled = false;
    let isModePanelCreated = false;
    let currentPageHash = '';
    let isChangingChapter = false;
    let isAiStyleInstalled = false;
    let isAiAnswerPending = false; // Flag to track if AI answer is currently being awaited
    let aiBatchGeneration = 0;
    let currentQuestionBatchText = ''; // Renamed from currentQuestionText to reflect batch processing
    let isSubmittingExam = false; // Flag to indicate if exam submission process is ongoing
    // --- 考试自动重试闭环状态 (Exam auto-retry closed loop state) ---
    let examAnswerMemory = loadExamAnswerMemory(); // Map<题目文本, 答案字母>，跨重试轮次保留已确认答案
    let examAttemptCount = 0; // 当前考试链内已自动重试的次数
    let examRetryChainActive = false; // 自首次失败至通过/放弃该场期间为 true
    let isHandlingExamResult = false; // 防止失败弹窗被多处重复处理
    // 上一轮作答的题目与答案组合（Map<题目文本, {answer, options, title}>），
    // 用于没有纠错复核页时把“刚刚的答案组合”回传 AI 修正。
    let lastAttemptData = new Map();
    // 仅保留当前考试重试链；确认错答与未及格轮次分开记录。
    const confirmedWrongAnswers = new Map();
    const failedAttemptAnswers = new Map();
    // 考试批次结束提示相关状态
    let lastStartedExamSignature = ''; // 最近一次“开始考试”所在行的文本，用于记录失败场次与跳过已重试耗尽的场次
    let failedExamSummary = []; // 重试耗尽仍未通过的场次汇总
    let exhaustedExamSignatures = new Set(); // 已重试耗尽的场次签名（跳过，不再自动重进）
    let examSummaryNotified = false; // 防止“全部处理完成”提示重复弹出
    let currentNavContext = GM_getValue('sclpa_nav_context', '');
    // 当前考试所属的考试列表路由，考后用于自动返回并继续下一场考试（专业课优先，公需课其次）。
    let currentExamListRoute = 'https://zyys.ihehang.com/#/onlineExam';
    const runtimeUiState = {
        speedChangeAlertShown: GM_getValue('sclpa_speed_alert_shown', false)
    };
    let publicCourseTraversalTarget = '';
    let publicCourseListActionPending = false;
    const exhaustedPublicCourseCategories = new Set();
    const VIDEO_LOAD_TIMEOUT_MS = 45000;
    const VIDEO_LOAD_MAX_RETRIES = 2;
    const VIDEO_LOAD_FAILURES_KEY = 'sclpa_video_load_failures';
    let videoLoadingState = null;
    let videoLoadFailures = readVideoLoadFailures();
    // 全能托管状态会持久化，页面跳转或刷新后仍能从上一次阶段继续。
    const ALL_IN_ONE_PHASES = [
        { id: 'specialized-video', label: '专业课视频', url: 'https://zyys.ihehang.com/#/specialized', context: 'course' },
        { id: 'public-video', label: '公需课视频', url: 'https://zyys.ihehang.com/#/publicDemand', context: 'course', publicTarget: 'video' },
        { id: 'public-article', label: '公需课文章', url: 'https://zyys.ihehang.com/#/publicDemand', context: 'course', publicTarget: 'article' },
        { id: 'specialized-exam', label: '专业课考试', url: 'https://zyys.ihehang.com/#/onlineExam', context: 'exam' },
        { id: 'public-exam', label: '公需课考试', url: 'https://zyys.ihehang.com/#/openOnlineExam', context: 'exam' }
    ];
    let isAllInOneMode = GM_getValue('sclpa_all_in_one_enabled', false);
    let allInOnePhase = GM_getValue('sclpa_all_in_one_phase', '');
    let allInOneTransitionPending = false;
    const backgroundAlarmMessages = {
        'video-stalled': '视频持续加载无进展，脚本正在尝试恢复。请留意学习进度。',
        'video-skipped': '视频重试后仍无法播放，已暂时跳过；该视频仍未完成，请稍后处理。',
        'video-stopped': '剩余视频加载失败，学习服务已暂停。请返回学习页检查并重试。',
        'ai-failed': 'AI 未返回可用答案，当前试卷保留，请返回学习页处理。',
        'ai-timeout': '等待 AI 答案超时，当前试卷保留，请返回学习页重试。',
        'exam-unknown': '无法确认考试结果，自动跳转已停止，请返回学习页确认。',
        'exam-failed': '存在重试后仍未通过的考试，请返回学习页检查。',
        'scheduler-error': '后台任务执行异常，请返回学习页检查运行状态。',
        'scheduler-fallback': '后台调度不可用，已退回普通计时；后台进度可能变慢，请检查学习页。',
        'page-frozen': '浏览器冻结了后台学习页，学习将暂停；请返回学习页恢复。',
        'test': '这是一条测试通知。点击通知可返回学习页面。'
    };
    const backgroundAlarmTimes = new Map();
    let pendingAutomationNotice = null;
    let automationNoticeTimer = null;
    let backgroundNotificationSequence = 0;
    const backgroundNotificationsPending = new Set();

    const runtimeKeepAwake = createRuntimeKeepAwake();
    const backgroundScheduler = createBackgroundScheduler();
    const scriptSetTimeout = backgroundScheduler.setTimeout;
    const scriptSetInterval = backgroundScheduler.setInterval;
    const scriptClearTimeout = backgroundScheduler.clear;
    const scriptClearInterval = backgroundScheduler.clear;

    function createRuntimeKeepAwake() {
        const status = { running: false, webLock: 'inactive', screenLock: 'inactive' };
        let active = false;
        let epoch = 0;
        let webAbort = null;
        let webRelease = null;
        let screenSentinel = null;
        let screenPending = false;
        let webRetryAt = 0;
        let screenRetryAt = 0;
        const lockName = 'sclpa-study-runtime-' + (crypto.randomUUID?.() || Math.random().toString(36).slice(2));

        function render() {
            const node = document.getElementById('runtime-keep-awake-status');
            if (!node) return;
            node.textContent = !active ? '保活已释放（服务暂停）' :
                '尝试保活：后台锁' + (status.webLock === 'held' ? '已持有' : '未持有') +
                ' / 屏幕唤醒锁' + (status.screenLock === 'held' ? '已持有' : document.hidden ? '后台不可持有' : '未持有');
        }
        function releaseScreen() {
            const sentinel = screenSentinel;
            screenSentinel = null;
            status.screenLock = 'inactive';
            if (sentinel) Promise.resolve(sentinel.release()).catch(() => {});
        }
        function release() {
            active = false;
            status.running = false;
            epoch++;
            webAbort?.abort();
            webAbort = null;
            webRelease?.();
            webRelease = null;
            status.webLock = 'inactive';
            releaseScreen();
            render();
        }
        function requestWebLock() {
            if (!active || webAbort || performance.now() < webRetryAt) return;
            if (!navigator.locks?.request) { status.webLock = 'unsupported'; return; }
            const generation = epoch;
            const abort = new AbortController();
            webAbort = abort;
            status.webLock = 'pending';
            navigator.locks.request(lockName, { mode: 'shared', signal: abort.signal }, async lock => {
                if (!lock || !active || generation !== epoch) return;
                status.webLock = 'held';
                render();
                await new Promise(resolve => { webRelease = resolve; });
            }).catch(() => {
                if (active && generation === epoch) status.webLock = 'unavailable';
            }).finally(() => {
                if (webAbort !== abort) return;
                webAbort = null;
                webRelease = null;
                status.webLock = active ? 'unavailable' : 'inactive';
                webRetryAt = performance.now() + 30000;
                render();
            });
        }
        async function requestScreenLock() {
            if (!active || document.hidden || screenPending || screenSentinel || performance.now() < screenRetryAt) return;
            if (!navigator.wakeLock?.request) { status.screenLock = 'unsupported'; return; }
            const generation = epoch;
            screenPending = true;
            status.screenLock = 'pending';
            try {
                const sentinel = await navigator.wakeLock.request('screen');
                if (!active || generation !== epoch || document.hidden) {
                    await sentinel.release();
                    return;
                }
                screenSentinel = sentinel;
                status.screenLock = 'held';
                sentinel.addEventListener('release', () => {
                    if (screenSentinel !== sentinel) return;
                    screenSentinel = null;
                    status.screenLock = active ? 'released' : 'inactive';
                    screenRetryAt = performance.now() + 30000;
                    render();
                });
            } catch (_) {
                if (active && generation === epoch) status.screenLock = 'unavailable';
                screenRetryAt = performance.now() + 30000;
            } finally {
                screenPending = false;
                render();
            }
        }
        function sync() {
            if (!isServiceActive) { if (active) release(); else render(); return; }
            if (!active) { active = true; status.running = true; epoch++; webRetryAt = 0; screenRetryAt = 0; }
            requestWebLock();
            requestScreenLock();
            render();
        }
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) releaseScreen();
            else { screenRetryAt = 0; sync(); }
        });
        document.addEventListener('resume', sync);
        window.addEventListener('pageshow', sync);
        window.addEventListener('pagehide', release);
        window.__sclpaRuntimeKeepAwake = status;
        return { sync, release };
    }

    function createBackgroundScheduler() {
        const nativeTimeout = window.setTimeout.bind(window);
        const nativeClearTimeout = window.clearTimeout.bind(window);
        const jobs = new Map();
        const status = { mode: 'native', frozen: false, callbacks: 0, pending: 0 };
        let sequence = 0;
        let worker = null;
        let workerUrl = null;
        let fallbackTimer = null;
        let dispatching = false;
        const clock = () => performance.now();

        function arm() {
            status.pending = jobs.size;
            if (dispatching) return;
            let next = Infinity;
            if (!status.frozen) for (const job of jobs.values()) next = Math.min(next, job.due);
            const delay = Number.isFinite(next) ? Math.max(10, next - clock()) : null;
            if (worker) {
                worker.postMessage({ delay });
            } else {
                if (fallbackTimer !== null) nativeClearTimeout(fallbackTimer);
                fallbackTimer = delay === null ? null : nativeTimeout(dispatch, delay);
            }
        }

        function dispatch() {
            if (status.frozen) return;
            const now = clock();
            dispatching = true;
            for (const [id, job] of Array.from(jobs)) {
                if (!jobs.has(id) || job.due > now) continue;
                if (job.interval) job.due = now + job.delay;
                else jobs.delete(id);
                try {
                    job.callback.apply(window, job.args);
                    status.callbacks++;
                } catch (error) {
                    console.error('[Script] 后台任务执行失败：', error);
                    notifyBackgroundException('scheduler-error');
                }
            }
            dispatching = false;
            arm();
        }

        function releaseWorkerUrl() {
            if (workerUrl) URL.revokeObjectURL(workerUrl);
            workerUrl = null;
        }
        try {
            workerUrl = URL.createObjectURL(new Blob([
                "let timer=null;onmessage=e=>{if(timer!==null)clearTimeout(timer);timer=null;if(e.data.delay!==null)timer=setTimeout(()=>postMessage('tick'),e.data.delay)};postMessage('ready');"
            ], { type: 'text/javascript' }));
            worker = new Worker(workerUrl);
            status.mode = 'worker';
            worker.onmessage = event => {
                if (event.data === 'ready') releaseWorkerUrl();
                else if (event.data === 'tick') dispatch();
            };
            worker.onerror = () => {
                worker.terminate();
                worker = null;
                status.mode = 'native';
                releaseWorkerUrl();
                console.warn('[Script] 当前页面不允许后台调度，已退回普通计时。');
                notifyBackgroundException('scheduler-fallback');
                arm();
            };
        } catch (error) {
            worker = null;
            notifyBackgroundException('scheduler-fallback');
            releaseWorkerUrl();
        }

        function schedule(callback, delay, interval, args) {
            if (typeof callback !== 'function') throw new TypeError('后台任务必须是函数');
            const id = --sequence;
            const milliseconds = Math.max(interval ? 10 : 0, Number(delay) || 0);
            jobs.set(id, { callback, args, delay: milliseconds, interval, due: clock() + milliseconds });
            arm();
            return id;
        }
        function clear(id) {
            jobs.delete(id);
            arm();
        }
        function resetArticleClocks() {
            for (const record of window.__sclpaArticleTimingEngine?.records?.values() || []) {
                record.lastTick = clock();
                record.carry = 0;
            }
        }
        document.addEventListener('freeze', () => {
            notifyBackgroundException('page-frozen');
            status.frozen = true;
            resetArticleClocks();
            arm();
        });
        document.addEventListener('resume', () => {
            status.frozen = false;
            resetArticleClocks();
            const now = clock();
            for (const job of jobs.values()) if (job.interval) job.due = now + job.delay;
            arm();
        });
        const resumeScheduler = () => {
            if (status.frozen) {
                status.frozen = false;
                resetArticleClocks();
                const now = clock();
                for (const job of jobs.values()) if (job.interval) job.due = now + job.delay;
            }
            arm();
        };
        document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeScheduler(); });
        window.addEventListener('pageshow', resumeScheduler);
        window.addEventListener('pagehide', event => {
            if (event.persisted) return;
            jobs.clear();
            status.pending = 0;
            worker?.terminate();
            if (fallbackTimer !== null) nativeClearTimeout(fallbackTimer);
            releaseWorkerUrl();
        });
        window.__sclpaBackgroundScheduler = status;
        return {
            setTimeout: (callback, delay, ...args) => schedule(callback, delay, false, args),
            setInterval: (callback, delay, ...args) => schedule(callback, delay, true, args),
            clear
        };
    }

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
            console.error(`[Script Error] findElementByText failed for selector "${selector}" with text "${text}":`, e);
            return null;
        }
    }

    /**
     * Safely click an element
     * @param {HTMLElement} element - The element to click.
     */
    function clickElement(element) {
        if (element && typeof element.click === 'function') {
            debugLog('[Script] Clicking element:', element);
            element.click();
        } else {
            console.warn('[Script] Attempted to click a non-existent or unclickable element:', element);
        }
    }

    /**
     * Hook a method on a given object.
     * @param {Object} object The object to hook the method on.
     * @param {string} methodName The name of the method to hook (e.g., 'setTimeout').
     * @param {(original: Function) => Function} hooker A function that receives the original function and returns a new function.
     */
    function hook(object, methodName, hooker) {
        const original = object[methodName];
        if (typeof original === 'function') {
            object[methodName] = hooker(original);
            debugLog(`[Script] Successfully hooked ${methodName}`);
        } else {
            console.warn(`[Script] Failed to hook ${methodName}: original is not a function.`);
        }
    }

    /**
     * Detects the visible result dialog supplied by the examination page.
     * A failed result triggers the auto-retry closed loop (or manual review
     * once the retry limit is reached).
     */
    function isElementVisible(element) {
        return Boolean(element && element.getClientRects().length > 0);
    }

    function resultTipTextIsFailure(text) {
        return /考试未通过|未通过|考试不合格|不合格|没有通过/.test(String(text || ''));
    }

    function hasFailedExamResult() {
        const resultTip = document.querySelector('.result-tip-content');
        return Boolean(resultTip && isElementVisible(resultTip) && resultTipTextIsFailure(resultTip.innerText));
    }

    // ===================================================================================
    // --- 考试自动重试闭环 (Exam Auto-Retry Closed Loop) ---
    // ===================================================================================

    const EXAM_CORRECTION_SYSTEM_PROMPT =
        '你是执业药师考试答题助手。以下题目已由复核页确认回答错误，并附有历轮确认错答。' +
        '单选题排除所有已确认错误的选项；多选题排除已确认错误的完整组合，但不能据此认定组合中每个选项都错误。' +
        '未及格轮次作答仅供参考，不代表每题均错误。请重新判断并给出答案。' +
        '只输出一行一道，格式为“序号.字母选项”（多选连续字母），不要输出解释。';

    const EXAM_NO_REVIEW_CORRECTION_SYSTEM_PROMPT =
        '你是执业药师考试答题助手。以下提供历次未及格考试的作答记录；缺少逐题复核，不能把每道题的历史选项都认定为错误。' +
        '仅排除另行标明的已确认错答：单选排除对应选项，多选排除完整组合，不能排除组合中的所有单个选项。' +
        '结合所有历轮记录重新判断答案。只输出一行一道，格式为“序号.字母选项”（多选连续字母），不要输出解释。';

    function normalizeExamRetryLimit(value) {
        const parsed = Number(value);
        return value === '' || value === null || !Number.isFinite(parsed) ? 3 : Math.max(0, Math.min(3, Math.trunc(parsed)));
    }

    function questionHistoryKey(question) {
        return JSON.stringify([question.title, question.options]);
    }

    function canonicalAnswer(value) {
        return [...new Set(normalizeAnswerLetters(value))].sort().join('');
    }

    function recordAttemptAnswer(history, question, answer) {
        const letters = canonicalAnswer(answer);
        if (!letters) return;
        const key = questionHistoryKey(question);
        const entries = history.get(key) || [];
        if (!entries.some(entry => entry.round === examAttemptCount && entry.answer === letters)) {
            entries.push({ round: examAttemptCount, answer: letters });
            history.set(key, entries);
        }
    }

    function describeAttemptHistory(history, question) {
        return (history.get(questionHistoryKey(question)) || [])
            .map(entry => '第' + entry.round + '轮：' + entry.answer).join('；') || '无';
    }

    function isConfirmedWrongAnswer(question, answer) {
        const letters = canonicalAnswer(answer);
        return (confirmedWrongAnswers.get(questionHistoryKey(question)) || []).some(entry => entry.answer === letters);
    }

    function buildRetryHistoryContext(items) {
        const lines = Array.from(items).map((item, index) => {
            const question = {
                title: getNormalizedQuestionTitle(item),
                options: Array.from(item.querySelectorAll('.examination-check-item')).map(option => option.innerText.trim()).filter(Boolean)
            };
            const wrong = describeAttemptHistory(confirmedWrongAnswers, question);
            const failed = describeAttemptHistory(failedAttemptAnswers, question);
            return wrong === '无' && failed === '无' ? '' :
                '第' + (index + 1) + '题：已确认错答：' + wrong + '；未及格轮次作答（未逐题确认）：' + failed;
        }).filter(Boolean);
        return lines.length ? '\n\n重试历史：单选排除已确认错答；多选只排除已确认错误的完整组合。未逐题确认的作答仅供参考。\n' + lines.join('\n') : '';
    }

    function loadExamAnswerMemory() {
        try {
            const raw = GM_getValue('sclpa_exam_answer_memory', '');
            const object = raw ? JSON.parse(raw) : {};
            return new Map(Object.entries(object));
        } catch (e) {
            return new Map();
        }
    }

    function persistExamAnswerMemory() {
        try {
            GM_setValue('sclpa_exam_answer_memory', JSON.stringify(Object.fromEntries(examAnswerMemory)));
        } catch (e) {
            console.warn('[Script] 保存考试答案记忆失败：', e);
        }
    }

    function resetExamRetryState(reason) {
        aiBatchGeneration++;
        if (reason) debugLog(`[Script] 重置考试自动重试状态：${reason}`);
        examAttemptCount = 0;
        examRetryChainActive = false;
        isHandlingExamResult = false;
        lastAttemptData.clear();
        confirmedWrongAnswers.clear();
        failedAttemptAnswers.clear();
        if (examAnswerMemory.size > 0) {
            examAnswerMemory.clear();
            persistExamAnswerMemory();
        }
    }

    /**
     * 从题目元素中提取去序号的题目文本，作为跨重试轮次记忆答案的稳定键。
     */
    function getNormalizedQuestionTitle(item) {
        const titleElement = item.querySelector('.examination-body-title');
        if (!titleElement) return '';
        return titleElement.innerText.trim()
            .replace(/^\s*\d+\s*[、.．:：)）]\s*/, '')
            .trim();
    }

    function getRememberedAnswerForItem(item) {
        const title = getNormalizedQuestionTitle(item);
        return title ? (examAnswerMemory.get(title) || '') : '';
    }

    function normalizeAnswerLetters(value) {
        if (!value) return '';
        const letters = String(value).match(/[A-Za-z]/g);
        return letters ? letters.join('').toUpperCase() : '';
    }

    /**
     * 解析“1.A / 2.ABC / 3：B”这类答案为 {序号: 字母} 映射。
     */
    function parseAnswersToMap(answerText) {
        const map = new Map();
        String(answerText || '').split('\n').forEach(line => {
            const match = line.trim().match(/^(\d+)\s*[.．:：、]\s*([A-Za-z]+)/);
            if (match) map.set(parseInt(match[1], 10), match[2].toUpperCase());
        });
        return map;
    }

    /**
     * 按完整文本查找按钮，兼容 <button><span>文本</span></button> 等多种结构。
     */
    function findButtonByExactText(text) {
        const candidates = [
            findElementByText('button span', text),
            findElementByText('button', text),
            findElementByText('span', text)
        ];
        for (const element of candidates) {
            if (!element) continue;
            const button = element.tagName === 'BUTTON' ? element : element.closest('button');
            if (button) return button;
        }
        return null;
    }

    /**
     * 等待“纠错查看”复核页渲染完成（出现错题标记或上次答案元素）。
     */
    function waitForReviewPage(timeoutMs = 12000, pollMs = 500) {
        return new Promise((resolve) => {
            const startedAt = Date.now();
            const timer = scriptSetInterval(() => {
                const reviewVisible = document.querySelector('.examination-body-item .details-state') ||
                    document.querySelector('.examination-body-item .examination-details em');
                if (reviewVisible || Date.now() - startedAt > timeoutMs) {
                    scriptClearInterval(timer);
                    resolve(Boolean(reviewVisible));
                }
            }, pollMs);
        });
    }

    /**
     * 考试未通过后的统一处理：未达重试上限则进入自动重试闭环；
     * 已达上限则记录失败并放弃该场，继续处理其他考试（不等待人工复核）。
     */
    function handleFailedExamResult() {
        if (isHandlingExamResult) return;
        isHandlingExamResult = true;

        const maxRetries = normalizeExamRetryLimit(GM_getValue('sclpa_exam_max_retries', 3));
        if (maxRetries <= 0 || examAttemptCount >= maxRetries) {
            console.warn(`[Script] 考试未通过，已达自动重试上限（${examAttemptCount}/${maxRetries}），放弃该场继续下一场。`);
            recordFailedExamAndContinue();
            return;
        }

        isSubmittingExam = false;
        isAiAnswerPending = false;
        examRetryChainActive = true;
        examAttemptCount++;
        debugLog(`[Script] 检测到考试未通过，启动自动重试闭环（第 ${examAttemptCount}/${maxRetries} 次）。`);

        // 若复核页已经可见（部分平台交卷后直接展示错题），则无需点击“纠错查看”。
        const reviewAlreadyVisible = Array.from(document.querySelectorAll('.examination-body-item .details-state'))
            .some(element => isElementVisible(element));
        if (reviewAlreadyVisible) {
            debugLog('[Script] 纠错复核页已可见，直接提取错题。');
            collectReviewAnswersAndCorrect();
            return;
        }

        const reviewButton = findButtonByExactText('纠错查看') ||
            findButtonByExactText('查看答案') ||
            findButtonByExactText('查看错题') ||
            findButtonByExactText('错题查看');
        if (!reviewButton) {
            console.warn('[Script] 未找到“纠错查看 / 查看答案”按钮，改用上一轮答案组合请求 AI 修正。');
            attemptRetryWithoutReview();
            return;
        }
        debugLog('[Script] 点击“纠错查看 / 查看答案”，进入纠错复核页提取错题。');
        clickElement(reviewButton);

        const reviewGeneration = aiBatchGeneration;
        waitForReviewPage().then(found => {
            if (!isServiceActive || aiBatchGeneration !== reviewGeneration) return;
            if (!found) {
                console.warn('[Script] 未检测到纠错复核页，改用上一轮答案组合请求 AI 修正。');
                attemptRetryWithoutReview();
                return;
            }
            collectReviewAnswersAndCorrect();
        });
    }

    /**
     * 从纠错复核页提取错题与答对题目，把答对的答案保留进记忆，
     * 将错题回传 AI 获取修正答案，然后点击“返回”回到考试列表继续下一场。
     */
    function collectReviewAnswersAndCorrect() {
        const correctionGeneration = aiBatchGeneration;
        const correctionRoute = window.location.hash;
        const correctionCurrent = () => isServiceActive && aiBatchGeneration === correctionGeneration && window.location.hash === correctionRoute;
        const items = Array.from(document.querySelectorAll('.examination-body-item'));
        if (items.length === 0) {
            console.warn('[Script] 纠错复核页没有题目元素，改用上一轮答案组合请求 AI 修正。');
            attemptRetryWithoutReview();
            return;
        }

        const reviewQuestions = items.map((item, index) => {
            const dangerState = item.querySelector('.details-state.danger');
            const isWrong = Boolean(dangerState && dangerState.innerText.includes('回答错误'));
            const title = getNormalizedQuestionTitle(item) || item.querySelector('.examination-body-title')?.innerText.trim() || `题目${index + 1}`;
            const options = Array.from(item.querySelectorAll('.examination-check-item'))
                .map(option => option.innerText.trim())
                .filter(Boolean);
            const previousAnswer = item.querySelector('.examination-details em')?.innerText.trim() || '';
            return { index: index + 1, title, options, previousAnswer, isWrong };
        });

        // 答对的题目直接保留其上次答案，避免重试时被 AI 改错。
        reviewQuestions.forEach(question => {
            if (!question.isWrong && question.previousAnswer) {
                examAnswerMemory.set(question.title, normalizeAnswerLetters(question.previousAnswer));
            }
        });

        const wrongQuestions = reviewQuestions.filter(question => question.isWrong);
        wrongQuestions.forEach(question => {
            recordAttemptAnswer(confirmedWrongAnswers, question, question.previousAnswer);
            examAnswerMemory.delete(question.title);
        });
        if (wrongQuestions.length === 0) {
            debugLog('[Script] 纠错复核页未标记“回答错误”的题目，直接返回考试列表。');
            persistExamAnswerMemory();
            returnToExamListAfterReview();
            return;
        }

        debugLog(`[Script] 发现 ${wrongQuestions.length} 道错题，请求 AI 修正答案...`);
        askAiForAnswer(buildCorrectionPrompt(wrongQuestions), EXAM_CORRECTION_SYSTEM_PROMPT).then(correctionText => {
            if (!correctionCurrent()) return;
            const correctedMap = parseAnswersToMap(correctionText);
            let applied = 0;
            wrongQuestions.forEach(question => {
                const letters = correctedMap.get(question.index);
                if (letters && !isConfirmedWrongAnswer(question, letters)) {
                    examAnswerMemory.set(question.title, letters);
                    applied++;
                } else {
                    console.warn(`[Script] AI 未返回第 ${question.index} 题的修正答案（原答案 ${question.previousAnswer || '无'} 不保留）。`);
                }
            });
            persistExamAnswerMemory();
            debugLog(`[Script] AI 修正完成，已更新 ${applied} 道错题答案，返回考试列表继续作答。`);
            returnToExamListAfterReview();
        }).catch(error => {
            if (!correctionCurrent()) return;
            console.warn('[Script] AI 纠错请求失败，放弃该场继续下一场：', error);
            recordFailedExamAndContinue();
        });
    }

    function buildCorrectionPrompt(wrongQuestions) {
        const lines = wrongQuestions.map(question => {
            const optionLines = question.options.map(option => `  ${option}`).join('\n');
            return `第${question.index}题：${question.title}\n选项：\n${optionLines}\n历轮已确认错答：${describeAttemptHistory(confirmedWrongAnswers, question)}\n未及格轮次作答（未逐题确认）：${describeAttemptHistory(failedAttemptAnswers, question)}`;
        });
        return [
            '以下题目由复核页确认答错；请结合所有历轮记录排除已确认错答，重新判断答案。',
            '',
            ...lines,
            '',
            '请按上述题目序号输出答案，格式：序号.字母选项（多选连续，如 2.ABC）。'
        ].join('\n');
    }

    /**
     * 无纠错复核页时的修正提示词：把上一轮作答的答案组合发给 AI，指出组合有问题。
     */
    function buildNoReviewCorrectionPrompt() {
        const entries = Array.from(lastAttemptData.values());
        entries.forEach(data => {
            recordAttemptAnswer(failedAttemptAnswers, data, data.answer);
            examAnswerMemory.delete(data.title);
        });
        const lines = entries.map((data, index) => {
            const optionLines = data.options.map(option => `  ${option}`).join('\n');
            return `第${index + 1}题：${data.title}\n选项：\n${optionLines}\n历轮未及格考试作答（未逐题确认）：${describeAttemptHistory(failedAttemptAnswers, data)}\n历轮已确认错答：${describeAttemptHistory(confirmedWrongAnswers, data)}`;
        });
        return [
            '以下是历次未及格考试的作答记录。缺少逐题复核，不能把所有历史作答都认定为错误；仅排除已确认错答。',
            '',
            ...lines,
            '',
            '请按上述题目序号输出答案，格式：序号.字母选项（多选连续，如 2.ABC）。'
        ].join('\n');
    }

    /**
     * 没有纠错复核页时的重试路径：把上一轮答案组合回传 AI 修正后，
     * 返回考试列表从“待考试”第一个重新作答。
     */
    function attemptRetryWithoutReview() {
        const correctionGeneration = aiBatchGeneration;
        const correctionRoute = window.location.hash;
        const correctionCurrent = () => isServiceActive && aiBatchGeneration === correctionGeneration && window.location.hash === correctionRoute;
        if (lastAttemptData.size === 0) {
            console.warn('[Script] 无纠错复核页且无上一轮作答记录，放弃该场继续下一场。');
            recordFailedExamAndContinue();
            return;
        }
        debugLog(`[Script] 未找到纠错复核页，改用上一轮答案组合请求 AI 修正（共 ${lastAttemptData.size} 题）。`);
        askAiForAnswer(buildNoReviewCorrectionPrompt(), EXAM_NO_REVIEW_CORRECTION_SYSTEM_PROMPT).then(correctionText => {
            if (!correctionCurrent()) return;
            const correctedMap = parseAnswersToMap(correctionText);
            let applied = 0;
            Array.from(lastAttemptData.values()).forEach((data, index) => {
                const letters = correctedMap.get(index + 1);
                if (letters && !isConfirmedWrongAnswer(data, letters)) {
                    examAnswerMemory.set(data.title, letters);
                    applied++;
                } else {
                    console.warn(`[Script] AI 未返回第 ${index + 1} 题的修正答案（不保留旧组合，重试时由 AI 重答）。`);
                }
            });
            persistExamAnswerMemory();
            debugLog(`[Script] 无复核页纠错完成，已更新 ${applied} 道题答案，返回考试列表继续作答。`);
            returnToExamListAfterReview();
        }).catch(error => {
            if (!correctionCurrent()) return;
            console.warn('[Script] AI 纠错请求失败，放弃该场继续下一场：', error);
            recordFailedExamAndContinue();
        });
    }

    /**
     * 记录重试耗尽仍未通过的场次，跳过该场，返回考试列表继续处理其他考试。
     */
    function recordFailedExamAndContinue() {
        isSubmittingExam = false;
        isAiAnswerPending = false;
        const signature = lastStartedExamSignature || '';
        const displayName = signature ? signature.split('\n')[0].trim().slice(0, 50) : '未知考试';
        if (signature) exhaustedExamSignatures.add(signature);
        notifyBackgroundException('exam-failed');
        failedExamSummary.push({ name: displayName, attempts: examAttemptCount });
        console.warn(`[Script] 已记录失败场次：${displayName}（重试 ${examAttemptCount} 次），继续处理其他考试。`);
        resetExamRetryState('考试重试耗尽，放弃该场');
        returnToExamListAfterReview();
    }

    /**
     * 全部考试处理完成后的提示（只提示一次，仅在存在失败场次时弹窗）。
     */
    function notifyExamBatchFinished() {
        if (examSummaryNotified) return;
        examSummaryNotified = true;
        if (failedExamSummary.length > 0) {
            const names = failedExamSummary.map(item => item.name || '未知考试').join('、');
            console.warn(`[Script] 全部考试处理完成，${failedExamSummary.length} 场重试后仍未通过（平台可能要求重新学习）：${names}`);
            showAutomationNotice(`所有考试处理完成。\n\n${failedExamSummary.length} 场考试多次重试后仍未通过，平台可能要求重新学习对应课程：\n${names}`);
            failedExamSummary = [];
        } else {
            debugLog('[Script] 全部考试处理完成，本批次均已通过。');
        }
    }

    /**
     * 复核页没有“重新考试”按钮：点击页面上的“返回”回到考试列表，
     * 由主循环从“待考试”第一个（即刚答错的那场）继续自动开始作答。
     * 保持失败处理占位，直到离开复核视图后再放行。
     */
    function returnToExamListAfterReview() {
        // 保持 isHandlingExamResult 为 true，避免切换期间失败弹窗/复核页残留被重复处理。
        isHandlingExamResult = true;

        const backButton = findButtonByExactText('返回') ||
            findButtonByExactText('返回上一页') ||
            findButtonByExactText('返回列表') ||
            findButtonByExactText('重新考试') || // 兼容个别平台存在“重新考试”按钮的情况
            findButtonByExactText('重新作答') ||
            findButtonByExactText('重考');
        if (backButton) {
            debugLog('[Script] 点击“返回”，回到考试列表继续下一场作答。');
            clickElement(backButton);
        } else {
            console.warn('[Script] 未找到“返回”按钮，直接导航回考试列表。');
            window.location.href = currentExamListRoute;
        }
        currentQuestionBatchText = ''; // 确保新一轮题目会被重新处理

        // 兜底：点击“返回”后若仍停留在考试页（例如回到结果页），强制返回考试列表。
        scriptSetTimeout(() => {
            if (window.location.hash.toLowerCase().includes('/examination')) {
                debugLog(`[Script] 点击“返回”后仍停留在考试页，直接导航回考试列表：${currentExamListRoute}`);
                window.location.href = currentExamListRoute;
            }
        }, 2500);

        const startedAt = Date.now();
        const releaseTimer = scriptSetInterval(() => {
            const reviewVisible = Array.from(document.querySelectorAll('.examination-body-item .details-state'))
                .find(element => element.offsetParent !== null);
            const failureDialogVisible = hasFailedExamResult();
            if ((!reviewVisible && !failureDialogVisible) || Date.now() - startedAt > 15000) {
                scriptClearInterval(releaseTimer);
                isHandlingExamResult = false;
                if (reviewVisible || failureDialogVisible) {
                    console.warn('[Script] 等待离开复核页超时，已放行失败处理（若失败弹窗仍存在将再次进入重试链）。');
                }
            }
        }, 1000);
    }

    /**
     * 考试通过后的收尾：确保考试导航上下文，
     * 若平台未自动跳转则直接返回考试列表，让主循环继续开始下一场考试。
     */
    function proceedAfterExamPassed() {
        // 确保返回考试列表后仍按“考试”流程处理，而不是被当作课程流程跳回课程页。
        GM_setValue('sclpa_nav_context', 'exam');
        currentNavContext = 'exam';

        scriptSetTimeout(() => {
            if (window.location.hash.toLowerCase().includes('/examination')) {
                debugLog(`[Script] 考试结果页未自动跳转，直接返回考试列表：${currentExamListRoute}`);
                window.location.href = currentExamListRoute;
            } else {
                debugLog('[Script] 考试完成后平台已自动跳转，主循环继续。');
            }
        }, 2500);
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

    function getPublicCourseCategoryTabs() {
        return Array.from(document.querySelectorAll('.tabsList .radioBodx .radio-tab-tag'));
    }

    function getPublicCourseUnfinishedTab() {
        return Array.from(document.querySelectorAll('.tabsList .radio-box .radio-tab-tag'))
            .find(tab => tab.innerText.trim() === '未完成') || findElementByText('div.radio-tab-tag', '未完成');
    }

    function schedulePublicCourseListAction(callback, delay) {
        if (publicCourseListActionPending) return;
        publicCourseListActionPending = true;
        scriptSetTimeout(() => {
            publicCourseListActionPending = false;
            callback();
        }, delay);
    }

    function moveToNextPublicCourseCategory() {
        const publicTarget = GM_getValue('sclpa_public_target', 'video');
        if (publicCourseTraversalTarget !== publicTarget) {
            publicCourseTraversalTarget = publicTarget;
            exhaustedPublicCourseCategories.clear();
        }

        const categories = getPublicCourseCategoryTabs();
        const currentIndex = categories.findIndex(tab => tab.classList.contains('radio-tab-tag-ed'));
        if (categories.length === 0 || currentIndex < 0) {
            console.warn('[Script] 未找到公需课分类标签，无法切换到下一分类。');
            return false;
        }

        const currentCategory = categories[currentIndex].innerText.trim();
        exhaustedPublicCourseCategories.add(`${publicTarget}:${currentCategory}`);
        const followingCategories = [
            ...categories.slice(currentIndex + 1),
            ...categories.slice(0, currentIndex)
        ];
        const nextCategory = followingCategories.find(tab =>
            !exhaustedPublicCourseCategories.has(`${publicTarget}:${tab.innerText.trim()}`)
        );

        if (!nextCategory) {
            debugLog(`[Script] 公需课-${publicTarget} 的所有分类均未找到未完成内容，停止切换。`);
            return false;
        }

        debugLog(`[Script] 当前分类“${currentCategory}”没有未完成内容，切换到“${nextCategory.innerText.trim()}”。`);
        clickElement(nextCategory);
        schedulePublicCourseListAction(() => handleCourseListPage('公需课'), 1500);
        return true;
    }

    // ===================================================================================
    // --- 全能托管 (All-in-one workflow) ---
    // ===================================================================================

    function getAllInOnePhase() {
        return ALL_IN_ONE_PHASES.find(phase => phase.id === allInOnePhase) || null;
    }

    async function notifyBackgroundException(kind, force = false) {
        const message = backgroundAlarmMessages[kind];
        if (!message || (!force && !document.hidden)) return false;
        const now = Date.now();
        let last = backgroundAlarmTimes.get(kind) || 0;
        try { last = Math.max(last, Number(sessionStorage.getItem('sclpa-alarm:' + kind)) || 0); } catch (_) {}
        if (!force && (now - last < 300000 || backgroundNotificationsPending.has(kind))) return false;
        if (!force) backgroundNotificationsPending.add(kind);
        showAutomationNotice(message);
        const tag = 'sclpa-learning-' + kind + '-' + now + '-' + (++backgroundNotificationSequence);
        const markAccepted = () => {
            if (force) return;
            const acceptedAt = Date.now();
            backgroundAlarmTimes.set(kind, acceptedAt);
            try { sessionStorage.setItem('sclpa-alarm:' + kind, String(acceptedAt)); } catch (_) {}
        };
        const clearFailedCooldown = () => {
            if (force) return;
            backgroundAlarmTimes.delete(kind);
            try { sessionStorage.removeItem('sclpa-alarm:' + kind); } catch (_) {}
        };
        const focusPage = () => { window.focus(); };
        const nativeNotification = () => {
            try {
                if (typeof Notification !== 'function' || Notification.permission !== 'granted') return false;
                const notice = new Notification('执业药师：学习异常提醒', { body: message, tag, requireInteraction: true, silent: false });
                notice.onclick = () => { focusPage(); notice.close(); };
                notice.onerror = () => {
                    clearFailedCooldown();
                    showAutomationNotice(message + '\n桌面通知未能显示，请检查浏览器和系统通知设置。');
                };
                return true;
            } catch (_) { return false; }
        };
        try {
            if (typeof GM_notification === 'function') {
                let waitTimer = null;
                try {
                    // 等脚本初始化完成后使用内部调度，避免启动阶段回退通知触及未初始化的计时器。
                    await Promise.resolve();
                    const result = await Promise.race([
                        Promise.resolve(GM_notification({ title: '执业药师：学习异常提醒', text: message, tag,
                            silent: false, highlight: true, timeout: 0, onclick: focusPage })),
                        new Promise((_, reject) => {
                            waitTimer = scriptSetTimeout(() => reject(new Error('notification request timeout')), 5000);
                        })
                    ]);
                    if (result !== false) { markAccepted(); return true; }
                } catch (_) {
                    // 失败时尝试已授权的原生通知，不将失败写入去重记录。
                } finally {
                    if (waitTimer !== null) scriptClearTimeout(waitTimer);
                }
            }
            if (nativeNotification()) { markAccepted(); return true; }
            showAutomationNotice(message + '\n桌面通知不可用，请点击设置中的“测试桌面通知”检查权限。');
            return false;
        } finally {
            if (!force) backgroundNotificationsPending.delete(kind);
        }
    }

    function dismissAutomationNotice(expected = pendingAutomationNotice) {
        if (expected !== pendingAutomationNotice) return;
        pendingAutomationNotice = null;
        if (automationNoticeTimer !== null) scriptClearTimeout(automationNoticeTimer);
        automationNoticeTimer = null;
        document.getElementById('sclpa-automation-notice')?.remove();
    }

    function renderAutomationNotice() {
        const state = pendingAutomationNotice;
        if (!state) return;
        if (state.hideAt && state.hideAt <= Date.now()) { dismissAutomationNotice(state); return; }
        const host = document.querySelector('#tab-control') || document.body;
        if (!host) return;
        let notice = document.getElementById('sclpa-automation-notice');
        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'sclpa-automation-notice';
            notice.setAttribute('role', 'status');
            notice.style.cssText = 'margin:12px 0;padding:12px;background:#E8F3FF;border:1px solid #0078D4;border-radius:6px;white-space:pre-wrap;';
        }
        host.appendChild(notice);
        notice.replaceChildren();
        const text = document.createElement('div');
        text.textContent = state.message;
        notice.appendChild(text);
        if (!state.hideAt) {
            const close = document.createElement('button');
            close.type = 'button';
            close.textContent = '我知道了';
            close.style.cssText = 'margin-top:10px;padding:6px 12px;cursor:pointer;';
            close.onclick = () => dismissAutomationNotice(state);
            notice.appendChild(close);
        } else if (automationNoticeTimer === null) {
            automationNoticeTimer = scriptSetTimeout(() => dismissAutomationNotice(state), Math.max(0, state.hideAt - Date.now()));
        }
    }

    function showAutomationNotice(message, { autoHideMs = 0 } = {}) {
        if (automationNoticeTimer !== null) scriptClearTimeout(automationNoticeTimer);
        automationNoticeTimer = null;
        pendingAutomationNotice = { message, hideAt: autoHideMs > 0 ? Date.now() + autoHideMs : 0 };
        console.info('[Script] ' + message);
        renderAutomationNotice();
    }

    function updateAllInOneButton() {
        const button = document.getElementById('nav-all-in-one-btn');
        if (!button) return;
        const phase = getAllInOnePhase();
        const text = isAllInOneMode && phase
            ? `全能托管中：${phase.label}`
            : '全能托管（按顺序完成全部）';
        const textNode = button.querySelector('.nav-btn-text');
        if (textNode) textNode.textContent = text;
    }

    function stopAllInOneMode(reason = '已停止') {
        if (!isAllInOneMode && !allInOnePhase) return;
        debugLog(`[Script] 全能托管${reason}。`);
        isAllInOneMode = false;
        allInOnePhase = '';
        allInOneTransitionPending = false;
        GM_setValue('sclpa_all_in_one_enabled', false);
        GM_setValue('sclpa_all_in_one_phase', '');
        updateAllInOneButton();
    }

    function navigateToAllInOnePhase() {
        const phase = getAllInOnePhase();
        if (!isAllInOneMode || !phase) return false;

        allInOneTransitionPending = true;
        currentNavContext = phase.context;
        GM_setValue('sclpa_nav_context', phase.context);
        if (phase.publicTarget) GM_setValue('sclpa_public_target', phase.publicTarget);
        updateAllInOneButton();
        debugLog(`[Script] 全能托管进入阶段：${phase.label}。`);
        // 公需课视频与文章共用同一 SPA 路由；同路由切换时不能等待 hashchange。
        const targetHash = new URL(phase.url).hash.toLowerCase();
        if (window.location.hash.toLowerCase() === targetHash) {
            allInOneTransitionPending = false;
            return true;
        }
        window.location.href = phase.url;
        return true;
    }

    function setRuntimeServiceActive(active, message = '') {
        isServiceActive = Boolean(active);
        if (!isServiceActive) {
            aiBatchGeneration++;
            isAiAnswerPending = false;
            isSubmittingExam = false;
            isHandlingExamResult = false;
            currentQuestionBatchText = '';
        }
        GM_setValue('sclpa_service_active', isServiceActive);
        if (!isServiceActive) disposeVideoSpeedEngine?.();
        runtimeKeepAwake.sync();
        const button = document.getElementById('service-toggle-btn');
        if (button) { button.textContent = isServiceActive ? '⏸️ 暂停服务' : '▶️ 启动服务'; button.className = 'panel-btn ' + (isServiceActive ? 'service-btn-active' : 'service-btn-paused'); }
        const dot = document.getElementById('status-dot');
        if (dot) dot.className = 'status-dot ' + (isServiceActive ? 'active' : 'paused');
        const status = document.getElementById('status-text');
        if (status) status.textContent = message || (isServiceActive ? '服务运行中' : '服务已暂停');
        if (isServiceActive) initializeEnhancedVideoSpeedEngine();
    }

    function startAllInOneMode() {
        setRuntimeServiceActive(true);
        isAllInOneMode = true;
        allInOnePhase = ALL_IN_ONE_PHASES[0].id;
        allInOneTransitionPending = false;
        publicCourseTraversalTarget = '';
        exhaustedPublicCourseCategories.clear();
        examSummaryNotified = false;
        GM_setValue('sclpa_all_in_one_enabled', true);
        GM_setValue('sclpa_all_in_one_phase', allInOnePhase);
        navigateToAllInOnePhase();
    }

    /**
     * 仅当当前阶段正是 expectedPhase 时前进，避免列表尚在加载时误切换。
     */
    function advanceAllInOnePhaseIfExpected(expectedPhase) {
        if (!isAllInOneMode || allInOnePhase !== expectedPhase || allInOneTransitionPending) return false;

        const currentIndex = ALL_IN_ONE_PHASES.findIndex(phase => phase.id === expectedPhase);
        const nextPhase = ALL_IN_ONE_PHASES[currentIndex + 1];
        if (!nextPhase) {
            stopAllInOneMode('所有阶段已完成');
            setRuntimeServiceActive(false, '全部任务已处理，请核对学习进度和考试结果');
            const failures = failedExamSummary.length;
            showAutomationNotice(failures ? '全能托管已处理完毕，但仍有 ' + failures + ' 场考试未通过，请核对平台记录并重新处理。' : '✅ 全能托管已处理完毕，请核对平台的学习进度和考试结果。');
            if (failures) notifyBackgroundException('exam-failed');
            failedExamSummary = [];
            return true;
        }

        allInOnePhase = nextPhase.id;
        GM_setValue('sclpa_all_in_one_phase', allInOnePhase);
        publicCourseTraversalTarget = '';
        exhaustedPublicCourseCategories.clear();
        debugLog(`[Script] 全能托管：${expectedPhase} 无待处理内容，切换到 ${nextPhase.label}。`);
        return navigateToAllInOnePhase();
    }

    function handleAllInOneExamPhaseExhausted() {
        if (allInOnePhase === 'specialized-exam') {
            return advanceAllInOnePhaseIfExpected('specialized-exam');
        }
        if (allInOnePhase === 'public-exam') {
            return advanceAllInOnePhaseIfExpected('public-exam');
        }
        return false;
    }

    // ===================================================================================
    // --- UI面板管理 (UI Panel Management) ---
    // ===================================================================================

    /**
     * Create the modern script control panel with tabs
     */
    function createModeSwitcherPanel() {
        if (isModePanelCreated) {
            debugLog('[Script] Mode switcher panel already created, skipping.');
            return;
        }
        isModePanelCreated = true;
        debugLog('[Script] Attempting to create Modern Mode Switcher Panel...');

        try {
            GM_addStyle(`
                /* Microsoft Fluent Design System - 微软流畅设计系统 */
                #mode-switcher-panel {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    width: 400px;
                    background: #FFFFFF;
                    border-radius: 8px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
                    z-index: 10000;
                    overflow: hidden;
                    font-family: 'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                    transition: all 0.2s ease;
                    border: 1px solid rgba(0, 0, 0, 0.06);
                }
                
                #mode-switcher-panel:hover {
                    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0, 0, 0, 0.1);
                }
                
                #mode-switcher-panel.collapsed {
                    width: 240px;
                }
                
                /* Header - 标题栏 */
                #mode-switcher-header {
                    padding: 16px 20px;
                    background: #F3F2F1;
                    color: #323130;
                    cursor: move;
                    user-select: none;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
                }
                
                #mode-switcher-header h3 {
                    margin: 0;
                    font-size: 15px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    letter-spacing: -0.01em;
                }
                
                #mode-switcher-toggle-collapse {
                    background: transparent;
                    border: none;
                    color: #605E5C;
                    font-size: 18px;
                    cursor: pointer;
                    padding: 4px 12px;
                    border-radius: 4px;
                    transition: all 0.15s ease;
                    line-height: 1;
                }
                
                #mode-switcher-toggle-collapse:hover {
                    background: rgba(0, 0, 0, 0.05);
                    color: #323130;
                }
                
                /* Tabs - 标签页 */
                #mode-switcher-tabs {
                    display: flex;
                    background: #FAFAFA;
                    padding: 8px;
                    gap: 4px;
                    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
                }
                
                .tab-btn {
                    flex: 1;
                    padding: 8px 12px;
                    background: transparent;
                    border: none;
                    color: #605E5C;
                    font-size: 13px;
                    cursor: pointer;
                    border-radius: 4px;
                    transition: all 0.15s ease;
                    font-weight: 500;
                    font-family: inherit;
                }
                
                .tab-btn:hover {
                    background: rgba(0, 0, 0, 0.04);
                    color: #323130;
                }
                
                .tab-btn.active {
                    background: #FFFFFF;
                    color: #0078D4;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                    font-weight: 600;
                }
                
                /* Content - 内容区域 */
                #mode-switcher-content {
                    padding: 20px;
                    background: #FFFFFF;
                    max-height: 480px;
                    overflow-y: auto;
                    max-height: 480px;
                }
                
                #mode-switcher-content::-webkit-scrollbar {
                    width: 8px;
                }
                
                #mode-switcher-content::-webkit-scrollbar-track {
                    background: #F3F2F1;
                }
                
                #mode-switcher-content::-webkit-scrollbar-thumb {
                    background: #C8C8C8;
                    border-radius: 4px;
                }
                
                #mode-switcher-content::-webkit-scrollbar-thumb:hover {
                    background: #A8A8A8;
                }
                
                /* Tab Content Animation */
                .tab-content {
                    display: none;
                    animation: fluentFadeIn 0.2s ease;
                }
                
                .tab-content.active {
                    display: block;
                }
                
                @keyframes fluentFadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(8px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                /* Section Title */
                .panel-section {
                    margin-bottom: 24px;
                }
                
                .panel-section:last-child {
                    margin-bottom: 0;
                }
                
                .section-title {
                    font-size: 12px;
                    color: #605E5C;
                    margin-bottom: 12px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.02em;
                }
                
                /* Status Indicator */
                .status-indicator {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    padding: 16px;
                    background: #F3F2F1;
                    border-radius: 6px;
                    margin-bottom: 16px;
                    border: 1px solid rgba(0, 0, 0, 0.04);
                }
                
                .status-dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    animation: fluentPulse 2s infinite;
                }
                
                .status-dot.active {
                    background: #107C10;
                    box-shadow: 0 0 8px rgba(16, 124, 16, 0.4);
                }
                
                .status-dot.paused {
                    background: #D13438;
                    box-shadow: 0 0 8px rgba(209, 52, 56, 0.4);
                    animation: none;
                }
                
                @keyframes fluentPulse {
                    0%, 100% {
                        transform: scale(1);
                        opacity: 1;
                    }
                    50% {
                        transform: scale(1.15);
                        opacity: 0.75;
                    }
                }
                
                #status-text {
                    font-size: 14px;
                    font-weight: 500;
                    color: #323130;
                }
                
                /* Primary Button */
                .panel-btn {
                    padding: 10px 20px;
                    font-size: 14px;
                    color: #FFFFFF;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    width: 100%;
                    box-sizing: border-box;
                    font-weight: 600;
                    font-family: inherit;
                    letter-spacing: 0.01em;
                }
                
                .panel-btn:hover {
                    transform: translateY(-1px);
                }
                
                .panel-btn:active {
                    transform: translateY(0);
                }
                
                .service-btn-active {
                    background: #107C10;
                }
                
                .service-btn-active:hover {
                    background: #0B5C0B;
                }
                
                .service-btn-paused {
                    background: #D13438;
                }
                
                .service-btn-paused:hover {
                    background: #A80000;
                }
                
                #api-key-save-btn.panel-btn:hover {
                    background: #106EBE !important;
                }
                
                /* Navigation Button */
                .nav-btn {
                    padding: 12px 16px;
                    font-size: 13px;
                    color: #323130;
                    background: #FFFFFF;
                    border: 1px solid #E1DFDD;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    width: 100%;
                    margin-bottom: 8px;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-family: inherit;
                }
                
                .nav-btn:last-child {
                    margin-bottom: 0;
                }
                
                .nav-btn:hover {
                    background: #F3F2F1;
                    border-color: #0078D4;
                    transform: translateX(4px);
                }
                
                .nav-btn-icon {
                    font-size: 16px;
                    width: 24px;
                    text-align: center;
                }
                
                .nav-btn-text {
                    flex: 1;
                    text-align: left;
                }
                
                .nav-btn-arrow {
                    opacity: 0;
                    transition: all 0.15s ease;
                    color: #0078D4;
                    font-weight: 600;
                }
                
                .nav-btn:hover .nav-btn-arrow {
                    opacity: 1;
                }
                
                /* Navigation Grid */
                .nav-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                }
                
                .nav-grid .nav-btn {
                    margin-bottom: 0;
                }
                
                /* Setting Row */
                .setting-row {
                    margin-bottom: 20px;
                }
                
                .setting-row:last-child {
                    margin-bottom: 0;
                }
                
                .setting-row label {
                    display: block;
                    margin-bottom: 8px;
                    font-size: 13px;
                    color: #323130;
                    font-weight: 600;
                }
                
                /* Speed Slider */
                .speed-slider-container {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    background: #F3F2F1;
                    padding: 12px 16px;
                    border-radius: 4px;
                    border: 1px solid rgba(0, 0, 0, 0.04);
                }
                
                .speed-slider-container input[type="range"] {
                    flex: 1;
                    height: 4px;
                    border-radius: 2px;
                    background: #E1DFDD;
                    outline: none;
                    -webkit-appearance: none;
                }
                
                .speed-slider-container input[type="range"]::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background: #0078D4;
                    cursor: pointer;
                    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
                    transition: all 0.15s ease;
                }
                
                .speed-slider-container input[type="range"]::-webkit-slider-thumb:hover {
                    transform: scale(1.1);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
                }
                
                #speed-display {
                    font-weight: 700;
                    font-size: 15px;
                    color: #0078D4;
                    min-width: 48px;
                    text-align: center;
                    letter-spacing: -0.01em;
                }
                
                /* API Key Input */
                .api-key-input {
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid #E1DFDD;
                    border-radius: 4px;
                    box-sizing: border-box;
                    font-size: 13px;
                    transition: all 0.15s ease;
                    font-family: inherit;
                    color: #323130;
                }
                
                .api-key-input:focus {
                    outline: none;
                    border-color: #0078D4;
                    box-shadow: 0 0 0 2px rgba(0, 120, 212, 0.2);
                }
                
                .api-key-status {
                    margin-top: 8px;
                    font-size: 12px;
                    padding: 8px 12px;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-weight: 500;
                }
                
                .api-key-status.configured {
                    background: #DFF6DD;
                    color: #0B5C0B;
                    border: 1px solid #A7F0A3;
                }
                
                .api-key-status.not-configured {
                    background: #FFF4CE;
                    color: #8A6914;
                    border: 1px solid #FCEFC4;
                }
                
                /* Divider */
                .panel-divider {
                    width: 100%;
                    height: 1px;
                    background: #E1DFDD;
                    margin: 24px 0;
                }
                
                /* Tutorial Content */
                .tutorial-content {
                    background: #FAFAFA;
                    padding: 16px;
                    border-radius: 4px;
                    border: 1px solid rgba(0, 0, 0, 0.04);
                }
                
                .tutorial-section {
                    margin-bottom: 20px;
                }
                
                .tutorial-section:last-child {
                    margin-bottom: 0;
                }
                
                .tutorial-section h4 {
                    font-size: 13px;
                    color: #0078D4;
                    margin: 0 0 10px 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: 600;
                }
                
                .tutorial-section ul {
                    margin: 0;
                    padding-left: 20px;
                    color: #323130;
                    font-size: 13px;
                    line-height: 1.7;
                }
                
                .tutorial-section li {
                    margin-bottom: 6px;
                }
                
                .tutorial-section li::marker {
                    color: #0078D4;
                }
                
                .tutorial-warning {
                    background: #FFF4CE;
                    border-left: 3px solid #FFB900;
                    padding: 12px;
                    border-radius: 4px;
                    margin-top: 16px;
                }
                
                .tutorial-warning strong {
                    color: #8A6914;
                }
                
                .tutorial-link {
                    color: #0078D4;
                    text-decoration: none;
                    font-weight: 500;
                }
                
                .tutorial-link:hover {
                    text-decoration: underline;
                }
                
                /* Collapsed State */
                #mode-switcher-panel.collapsed #mode-switcher-tabs,
                #mode-switcher-panel.collapsed #mode-switcher-content {
                    display: none;
                }
            `);

            const panel = document.createElement('div');
            panel.id = 'mode-switcher-panel';
            panel.innerHTML = `
                <div id="mode-switcher-header">
                    <h3>控制面板</h3>
                    <button id="mode-switcher-toggle-collapse">－</button>
                </div>
                <div id="mode-switcher-tabs">
                    <button class="tab-btn active" data-tab="control">控制</button>
                    <button class="tab-btn" data-tab="settings">设置</button>
                    <button class="tab-btn" data-tab="tutorial">教程</button>
                </div>
                <div id="mode-switcher-content">
                    <!-- 控制面板 -->
                    <div class="tab-content active" id="tab-control">
                        <div class="status-indicator">
                            <div class="status-dot" id="status-dot"></div>
                            <span id="status-text">服务运行中</span>
                        </div>
                        <button id="service-toggle-btn" class="panel-btn"></button>
                        
                        <div class="panel-divider"></div>
                        
                        <div class="panel-section">
                            <div class="section-title">快速导航</div>
                            <div style="margin-bottom: 10px;">
                                <button id="nav-all-in-one-btn" class="nav-btn" style="background: #E8F3FF; border-color: #0078D4;">
                                    <span class="nav-btn-text">全能托管（推荐）</span>
                                    <span class="nav-btn-arrow">→</span>
                                </button>
                            </div>
                            <div class="nav-grid">
                                <button id="nav-specialized-btn" class="nav-btn">
                                    <span class="nav-btn-text">专业课程</span>
                                    <span class="nav-btn-arrow">→</span>
                                </button>
                                <button id="nav-public-video-btn" class="nav-btn">
                                    <span class="nav-btn-text">公需课-视频</span>
                                    <span class="nav-btn-arrow">→</span>
                                </button>
                                <button id="nav-public-article-btn" class="nav-btn">
                                    <span class="nav-btn-text">公需课-文章</span>
                                    <span class="nav-btn-arrow">→</span>
                                </button>
                                <button id="nav-specialized-exam-btn" class="nav-btn">
                                    <span class="nav-btn-text">专业课-考试</span>
                                    <span class="nav-btn-arrow">→</span>
                                </button>
                            </div>
                            <div style="margin-top: 10px;">
                                <button id="nav-public-exam-btn" class="nav-btn">
                                    <span class="nav-btn-text">公需课-考试</span>
                                    <span class="nav-btn-arrow">→</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 设置面板 -->
                    <div class="tab-content" id="tab-settings">
                        <div class="panel-section">
                            <div class="section-title">播放设置</div>
                            <div class="setting-row">
                                <label for="speed-slider">学习倍速：视频 / 文章 (1-16x)</label>
                                <div class="speed-slider-container">
                                    <input type="range" id="speed-slider" min="1" max="16" step="0.5" value="${currentPlaybackRate}">
                                    <span id="speed-display">${currentPlaybackRate}x</span>
                                </div>
                            </div>
                        </div>

                        <div class="panel-divider"></div>

                        <div class="panel-section">
                            <div class="section-title">运行保活</div>
                            <div id="runtime-keep-awake-status" style="font-size:12px;color:#605E5C;">尝试保活</div>
                        </div>
                        <div class="panel-divider"></div>
                        <div class="panel-section">
                            <div class="section-title">后台异常通知</div>
                            <button id="test-background-notification-btn" class="panel-btn">测试桌面通知</button>
                            <div style="font-size:12px;color:#605E5C;margin-top:6px;">后台异常时发送桌面提醒；同类异常五分钟内不重复提醒。请允许浏览器或脚本管理器发送系统通知。</div>
                        </div>
                        <div class="panel-divider"></div>
                        <div class="panel-section">
                            <div class="section-title">考试设置</div>
                            <div class="setting-row">
                                <label for="exam-retry-input">考试失败自动重试次数 (0-3)</label>
                                <input type="number" id="exam-retry-input" class="api-key-input" min="0" max="3" step="1" value="${normalizeExamRetryLimit(GM_getValue('sclpa_exam_max_retries', 3))}">
                                <div style="font-size: 12px; color: #605E5C; margin-top: 6px;">考试未通过时自动提取错题回传 AI 修正并重新作答；设为 0 则跳过错题重试，继续其他考试；默认 3 次，最多 3 次。</div>
                            </div>
                        </div>

                        <div class="panel-divider"></div>

                        <div class="panel-section">
                            <div class="section-title">AI 设置</div>
                            <div class="setting-row">
                                <label for="api-key-input">DeepSeek API Key</label>
                                <input type="password" id="api-key-input" class="api-key-input" placeholder="请输入您的 API Key" value="">
                                <div id="api-key-status" class="api-key-status not-configured">
                                    ⚠️ 未配置 API Key
                                </div>
                            </div>
                            <button id="api-key-save-btn" class="panel-btn" style="background: #0078D4; margin-top: 12px;">
                                保存设置
                            </button>
                        </div>
                    </div>
                    
                    <!-- 教程面板 -->
                    <div class="tab-content" id="tab-tutorial">
                        <div class="tutorial-content">
                            <div class="tutorial-section">
                                <h4>快速开始</h4>
                                <ul>
                                    <li>安装脚本后，屏幕右下角会出现控制面板</li>
                                    <li>点击相应按钮可快速跳转到不同学习模块</li>
                                    <li>开启服务后，脚本将自动完成刷课任务</li>
                                    <li>视频默认16倍速静音播放</li>
                                </ul>
                            </div>
                            
                            <div class="tutorial-section">
                                <h4>AI 助手</h4>
                                <ul>
                                    <li>在使用AI答题功能前，需先设置 DeepSeek API Key</li>
                                    <li>在"设置"标签页中输入您的 API Key 并保存</li>
                                    <li>获取 API Key：<a href="https://platform.deepseek.com/api_keys" target="_blank" class="tutorial-link">点击此处</a></li>
                                    <li>AI会自动处理考试题目并选择答案</li>
                                </ul>
                            </div>
                            
                            <div class="tutorial-section">
                                <h4>功能说明</h4>
                                <ul>
                                    <li><strong>专业课程：</strong>自动播放视频课程，支持多章节切换</li>
                                    <li><strong>公需课-视频：</strong>自动播放视频，支持静音倍速</li>
                                    <li><strong>公需课-文章：</strong>自动计时，标记已读状态</li>
                                    <li><strong>考试：</strong>AI自动答题（需配置API Key）</li>
                                </ul>
                            </div>

                            <div class="tutorial-section">
                                <h4>视频倍速技术</h4>
                                <ul>
                                    <li><strong>增强倍速引擎：</strong>采用多重防护机制，确保倍速稳定生效</li>
                                    <li><strong>自动检测：</strong>支持主文档、iframe和Shadow DOM中的视频</li>
                                    <li><strong>实时监控：</strong>每秒检查并修正倍速设置</li>
                                    <li><strong>防护机制：</strong>阻止网页重置playbackRate属性</li>
                                    <li><strong>智能重试：</strong>自动适应视频加载和切换场景</li>
                                </ul>
                            </div>
                            
                            <div class="tutorial-warning">
                                <strong>注意事项：</strong>
                                <ul style="margin-top: 8px; margin-bottom: 0;">
                                    <li>请保持刷课页面始终处于前台</li>
                                    <li>不要折叠控制面板</li>
                                    <li>AI答题不能保证100%正确率</li>
                                    <li>考试未通过时脚本会自动提取错题回传AI修正并重新作答（可在“设置”调整重试次数）</li>
                                </ul>
                            </div>
                            
                            <div class="tutorial-section">
                                <h4>获取帮助</h4>
                                <ul>
                                    <li>GitHub：<a href="https://github.com/Cooanyh/zhiyeyaoshi" target="_blank" class="tutorial-link">访问项目主页</a></li>
                                    <li>问题反馈：在 脚本猫 或 GitHub 提交 Issue</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            if (document.body) {
                document.body.appendChild(panel);
                if (pendingAutomationNotice) renderAutomationNotice();
                debugLog('[Script] Modern Mode Switcher Panel appended to body.');
            } else {
                console.error('[Script Error] document.body is not available when trying to append Mode Switcher Panel.');
                isModePanelCreated = false;
                return;
            }

            // Tab switching functionality
            const tabBtns = document.querySelectorAll('.tab-btn');
            const tabContents = document.querySelectorAll('.tab-content');
            
            tabBtns.forEach(btn => {
                btn.onclick = () => {
                    const targetTab = btn.dataset.tab;
                    
                    tabBtns.forEach(b => b.classList.remove('active'));
                    tabContents.forEach(c => c.classList.remove('active'));
                    
                    btn.classList.add('active');
                    document.getElementById(`tab-${targetTab}`).classList.add('active');
                };
            });

            document.getElementById('test-background-notification-btn')?.addEventListener('click', async () => {
                try {
                    if (typeof GM_notification !== 'function' && typeof Notification === 'function' && Notification.permission === 'default') {
                        await Notification.requestPermission();
                    }
                    if (await notifyBackgroundException('test', true)) {
                        showAutomationNotice('已请求发送测试通知。若未显示，请检查浏览器和系统通知设置。', { autoHideMs: 8000 });
                    }
                } catch (_) { showAutomationNotice('通知权限未能启用，请检查浏览器和系统通知设置。'); }
            });

            // Service toggle
            const serviceBtn = document.getElementById('service-toggle-btn');
            const statusDot = document.getElementById('status-dot');
            const statusText = document.getElementById('status-text');
            
            const updateServiceButton = (isActive) => {
                if (serviceBtn) {
                    serviceBtn.innerText = isActive ? '⏸️ 暂停服务' : '▶️ 启动服务';
                    serviceBtn.className = 'panel-btn ' + (isActive ? 'service-btn-active' : 'service-btn-paused');
                }
                if (statusDot) {
                    statusDot.className = 'status-dot ' + (isActive ? 'active' : 'paused');
                }
                if (statusText) {
                    statusText.innerText = isActive ? '服务运行中' : '服务已暂停';
                }
            };
            updateServiceButton(isServiceActive);

            if (serviceBtn) {
                serviceBtn.onclick = () => {
                    const active = !isServiceActive;
                    if (active) resetVideoLoadFailures();
                    setRuntimeServiceActive(active);
                    if (active) mainLoop();
                };
            }

            // Speed slider
            const speedSlider = document.getElementById('speed-slider');
            const speedDisplay = document.getElementById('speed-display');
            
            if (speedSlider) {
                speedSlider.addEventListener('input', () => {
                    if (speedDisplay) speedDisplay.textContent = `${speedSlider.value}x`;
                });
                speedSlider.addEventListener('change', () => {
                    const newRate = parseFloat(speedSlider.value);
                    GM_setValue('sclpa_playback_rate', newRate);
                    debugLog(`[Script] 学习倍速设置为: ${newRate}x，应用到视频和文章计时。`);
                    applyCurrentVideoSpeed();
                    
                    if (!runtimeUiState.speedChangeAlertShown) {
                        scriptSetTimeout(() => {
                            showAutomationNotice(`学习倍速已更新为 ${newRate}x。`, { autoHideMs: 6000 });
                            runtimeUiState.speedChangeAlertShown = true;
                            GM_setValue('sclpa_speed_alert_shown', true);
                        }, 100);
                    }
                });
            }

            // 重试次数 0–3：0 跳过错题重试，默认 3 次。
            const examRetryInput = document.getElementById('exam-retry-input');
            if (examRetryInput) {
                examRetryInput.addEventListener('change', () => {
                    const value = normalizeExamRetryLimit(examRetryInput.value);
                    examRetryInput.value = value;
                    GM_setValue('sclpa_exam_max_retries', value);
                    debugLog(`[Script] 考试失败自动重试次数设置为: ${value}`);
                });
            }

            // API Key
            const apiKeyInput = document.getElementById('api-key-input');
            const apiKeyStatus = document.getElementById('api-key-status');
            const apiKeySaveBtn = document.getElementById('api-key-save-btn');
            
            // Load current API key
            const currentKey = GM_getValue('sclpa_deepseek_api_key', '');
            if (apiKeyInput) {
                apiKeyInput.value = currentKey;
            }
            if (apiKeyStatus && currentKey) {
                apiKeyStatus.className = 'api-key-status configured';
                apiKeyStatus.innerHTML = '✅ API Key 已配置';
            }
            
            if (apiKeySaveBtn && apiKeyInput) {
                apiKeySaveBtn.onclick = () => {
                    const newKey = apiKeyInput.value.trim();
                    if (newKey) {
                        GM_setValue('sclpa_deepseek_api_key', newKey);
                        CONFIG.AI_API_SETTINGS.API_KEY = newKey;
                        aiApiKey = newKey;
                        const aiSubmit = document.getElementById('ai-helper-submit-btn');
                        if (aiSubmit) aiSubmit.disabled = false;
                        const aiWarning = document.getElementById('ai-key-warning');
                        if (aiWarning) aiWarning.style.display = 'none';
                        if (apiKeyStatus) {
                            apiKeyStatus.className = 'api-key-status configured';
                            apiKeyStatus.innerHTML = '✅ API Key 已保存！';
                        }
                        scriptSetTimeout(() => {
                            aiApiKey = apiKeyInput.value.trim();
                            CONFIG.AI_API_SETTINGS.API_KEY = aiApiKey;
                            showAutomationNotice('API Key 已保存并应用。', { autoHideMs: 6000 });
                        }, 100);
                    } else {
                        if (apiKeyStatus) {
                            apiKeyStatus.className = 'api-key-status not-configured';
                            apiKeyStatus.innerHTML = '⚠️ 请输入有效的 API Key';
                        }
                    }
                };
            }

            // Navigation buttons
            const navAllInOneBtn = document.getElementById('nav-all-in-one-btn');
            const navSpecializedBtn = document.getElementById('nav-specialized-btn');
            const navPublicVideoBtn = document.getElementById('nav-public-video-btn');
            const navPublicArticleBtn = document.getElementById('nav-public-article-btn');
            const navSpecializedExamBtn = document.getElementById('nav-specialized-exam-btn');
            const navPublicExamBtn = document.getElementById('nav-public-exam-btn');
            const collapseBtn = document.getElementById('mode-switcher-toggle-collapse');

            if (collapseBtn) {
                collapseBtn.onclick = () => {
                    if (panel) panel.classList.toggle('collapsed');
                    if (collapseBtn && panel) collapseBtn.innerText = panel.classList.contains('collapsed') ? '＋' : '－';
                };
            }

            if (navAllInOneBtn) {
                updateAllInOneButton();
                navAllInOneBtn.onclick = () => startAllInOneMode();
            }

            if (navSpecializedBtn) {
                navSpecializedBtn.onclick = () => {
                    stopAllInOneMode('已因手动切换到专业课程而停止');
                    GM_setValue('sclpa_nav_context', 'course');
                    window.location.href = 'https://zyys.ihehang.com/#/specialized';
                };
            }

            if (navPublicVideoBtn) {
                navPublicVideoBtn.onclick = () => {
                    stopAllInOneMode('已因手动切换到公需课视频而停止');
                    GM_setValue('sclpa_public_target', 'video');
                    GM_setValue('sclpa_nav_context', 'course');
                    window.location.href = 'https://zyys.ihehang.com/#/publicDemand';
                };
            }

            if (navPublicArticleBtn) {
                navPublicArticleBtn.onclick = () => {
                    stopAllInOneMode('已因手动切换到公需课文章而停止');
                    GM_setValue('sclpa_public_target', 'article');
                    GM_setValue('sclpa_nav_context', 'course');
                    window.location.href = 'https://zyys.ihehang.com/#/publicDemand';
                };
            }

            if (navSpecializedExamBtn) {
                navSpecializedExamBtn.onclick = () => {
                    stopAllInOneMode('已因手动切换到专业课考试而停止');
                    GM_setValue('sclpa_nav_context', 'exam');
                    window.location.href = 'https://zyys.ihehang.com/#/onlineExam';
                };
            }

            if (navPublicExamBtn) {
                navPublicExamBtn.onclick = () => {
                    stopAllInOneMode('已因手动切换到公需课考试而停止');
                    GM_setValue('sclpa_nav_context', 'exam');
                    window.location.href = 'https://zyys.ihehang.com/#/openOnlineExam';
                };
            }

            if (panel && document.getElementById('mode-switcher-header')) {
                makeDraggable(panel, document.getElementById('mode-switcher-header'));
            }
            debugLog('[Script] Modern Mode Switcher Panel creation attempted and event listeners attached.');

        } catch (e) {
            console.error('[Script Error] Error creating Modern Mode Switcher Panel:', e);
            isModePanelCreated = false;
        }
    }

    /**
     * Create AI helper panel, ensuring it's always new
     */
    /**
     * Create modern AI helper panel
     */
    function createManualAiHelper() {
        const existingPanel = document.getElementById('ai-helper-panel');
        if (existingPanel) {
            existingPanel.remove();
            debugLog('[Script] Removed existing AI helper panel.');
        }
        debugLog('[Script] Attempting to create Modern AI Helper Panel...');

        try {
            if (!isAiStyleInstalled) {
            GM_addStyle(`
                /* AI Helper Panel - Fluent Design */
                #ai-helper-panel {
                    position: fixed;
                    box-sizing: border-box;
                    bottom: 20px;
                    right: 420px;
                    width: 400px;
                    max-width: 90vw;
                    background: #FFFFFF;
                    border-radius: 8px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
                    z-index: 99999;
                    font-family: 'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    transition: all 0.2s ease;
                    border: 1px solid rgba(0, 0, 0, 0.06);
                }
                
                #ai-helper-panel:hover {
                    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0, 0, 0, 0.1);
                }
                
                #ai-helper-header {
                    padding: 14px 20px;
                    background: #F3F2F1;
                    color: #323130;
                    font-weight: 600;
                    cursor: move;
                    user-select: none;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
                }
                
                #ai-helper-header h3 {
                    margin: 0;
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    letter-spacing: -0.01em;
                }
                
                #ai-helper-close-btn {
                    background: transparent;
                    border: none;
                    color: #605E5C;
                    font-size: 18px;
                    cursor: pointer;
                    padding: 4px 12px;
                    border-radius: 4px;
                    transition: all 0.15s ease;
                    line-height: 1;
                }
                
                #ai-helper-close-btn:hover {
                    background: rgba(0, 0, 0, 0.05);
                    color: #323130;
                }
                
                #ai-helper-content {
                    padding: 20px;
                    background: #FFFFFF;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                
                #ai-helper-textarea {
                    width: 100%;
                    box-sizing: border-box;
                    height: 120px;
                    padding: 12px;
                    border: 1px solid #E1DFDD;
                    border-radius: 4px;
                    resize: vertical;
                    font-size: 14px;
                    transition: all 0.15s ease;
                    font-family: inherit;
                    color: #323130;
                    line-height: 1.5;
                }
                
                #ai-helper-textarea:focus {
                    outline: none;
                    border-color: #0078D4;
                    box-shadow: 0 0 0 2px rgba(0, 120, 212, 0.2);
                }
                
                #ai-helper-textarea::placeholder {
                    color: #A19F9D;
                }
                
                #ai-helper-submit-btn {
                    padding: 12px 24px;
                    background: #0078D4;
                    color: #FFFFFF;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.15s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    font-family: inherit;
                    letter-spacing: 0.01em;
                }
                
                #ai-helper-submit-btn:hover {
                    background: #106EBE;
                    transform: translateY(-1px);
                }
                
                #ai-helper-submit-btn:active {
                    transform: translateY(0);
                }
                
                #ai-helper-submit-btn:disabled {
                    background: #E1DFDD;
                    color: #A19F9D;
                    cursor: not-allowed;
                    transform: none;
                }
                
                #ai-helper-result {
                    padding: 14px;
                    background: #F3F2F1;
                    border-radius: 4px;
                    min-height: 80px;
                    max-height: 250px;
                    overflow-y: auto;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    font-size: 13px;
                    line-height: 1.6;
                    border: 1px solid rgba(0, 0, 0, 0.04);
                }
                
                #ai-helper-result::-webkit-scrollbar {
                    width: 8px;
                }
                
                #ai-helper-result::-webkit-scrollbar-track {
                    background: #F3F2F1;
                }
                
                #ai-helper-result::-webkit-scrollbar-thumb {
                    background: #C8C8C8;
                    border-radius: 4px;
                }
                
                #ai-helper-result::-webkit-scrollbar-thumb:hover {
                    background: #A8A8A8;
                }
                
                #ai-key-warning {
                    color: #8A6914;
                    font-size: 13px;
                    padding: 12px;
                    background: #FFF4CE;
                    border-radius: 4px;
                    display: flex;
                    align-items: flex-start;
                    gap: 8px;
                    border: 1px solid #FCEFC4;
                    line-height: 1.5;
                }
                
                .ai-thinking {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    color: #0078D4;
                }
                
                .ai-thinking-dot {
                    display: flex;
                    gap: 4px;
                }
                
                .ai-thinking-dot span {
                    width: 8px;
                    height: 8px;
                    background: #0078D4;
                    border-radius: 50%;
                    animation: fluentBounce 1.4s infinite ease-in-out both;
                }
                
                .ai-thinking-dot span:nth-child(1) {
                    animation-delay: -0.32s;
                }
                
                .ai-thinking-dot span:nth-child(2) {
                    animation-delay: -0.16s;
                }
                
                @keyframes fluentBounce {
                    0%, 80%, 100% {
                        transform: scale(0);
                    }
                    40% {
                        transform: scale(1);
                    }
                }
                
                .ai-result-label {
                    font-size: 12px;
                    color: #605E5C;
                    margin-bottom: 8px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    text-transform: uppercase;
                    letter-spacing: 0.02em;
                }
                @media (max-width: 860px) {
                    #ai-helper-panel { right: 12px; max-width: calc(100vw - 24px); }
                }
            `);
                isAiStyleInstalled = true;
            }
            
            const panel = document.createElement('div');
            panel.id = 'ai-helper-panel';
            panel.innerHTML = `
                <div id="ai-helper-header">
                    <h3>🤖 AI 问答助手</h3>
                    <button id="ai-helper-close-btn">✕</button>
                </div>
                <div id="ai-helper-content">
                    <textarea id="ai-helper-textarea" placeholder="💡 输入您的问题...&#10;&#10;示例：复制所有考试题目及选项，AI将自动分析并给出答案"></textarea>
                    <div id="ai-key-warning" style="display: none;">
                        ⚠️ 请先在控制面板的"设置"标签页中配置您的 DeepSeek API Key
                    </div>
                    <button id="ai-helper-submit-btn">
                        <span>🚀</span>
                        <span>向 AI 提问</span>
                    </button>
                    <div class="ai-result-label">💬 AI 回答：</div>
                    <div id="ai-helper-result">
                        <span style="color: #999;">请在上方输入您的问题...</span>
                    </div>
                </div>
            `;
            
            if (document.body) {
                document.body.appendChild(panel);
                debugLog('[Script] Modern AI Helper Panel appended to body.');
            } else {
                console.error('[Script Error] document.body is not available when trying to append AI Helper Panel.');
                return;
            }

            // Get elements
            const submitBtn = document.getElementById('ai-helper-submit-btn');
            const closeBtn = document.getElementById('ai-helper-close-btn');
            const textarea = document.getElementById('ai-helper-textarea');
            const resultDiv = document.getElementById('ai-helper-result');
            const keyWarning = document.getElementById('ai-key-warning');

            // Check API Key status
            const isApiKeyConfigured = CONFIG.AI_API_SETTINGS.API_KEY && 
                                       CONFIG.AI_API_SETTINGS.API_KEY !== '请在此处填入您自己的 DeepSeek API Key';
            
            if (keyWarning && submitBtn) {
                if (!isApiKeyConfigured) {
                    keyWarning.style.display = 'block';
                    submitBtn.disabled = true;
                }
            }

            if (closeBtn) {
                closeBtn.onclick = () => { 
                    if (panel) panel.remove(); 
                };
            }

            if (submitBtn && textarea && resultDiv) {
                submitBtn.onclick = async () => {
                    const question = textarea.value.trim();
                    if (!question) { 
                        resultDiv.innerHTML = '<span style="color: #dc3545;">❌ 错误：问题不能为空！</span>'; 
                        return; 
                    }
                    if (!CONFIG.AI_API_SETTINGS.API_KEY || CONFIG.AI_API_SETTINGS.API_KEY.includes('请在此处')) {
                        resultDiv.innerHTML = '<span style="color: #dc3545;">❌ 错误：请先在控制面板中设置您的 DeepSeek API Key！</span>';
                        return;
                    }

                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<span class="ai-thinking"><span class="ai-thinking-dot"><span></span><span></span><span></span></span><span>AI思考中...</span>';
                    resultDiv.innerHTML = '<div class="ai-thinking"><span class="ai-thinking-dot"><span></span><span></span><span></span></span><span>正在向AI发送请求...</span></div>';
                    
                    try {
                        const answer = await askAiForAnswer(question);
                        resultDiv.textContent = String(answer);
                    } catch (error) {
                        resultDiv.innerHTML = `<span style="color: #dc3545;">❌ 请求失败：${error}</span>`;
                    } finally {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<span>🚀</span><span>向 AI 提问</span>';
                    }
                };
            }

            if (panel && document.getElementById('ai-helper-header')) {
                makeDraggable(panel, document.getElementById('ai-helper-header'));
            }
            debugLog('[Script] Modern AI Helper Panel creation attempted and event listeners attached.');

        } catch (e) {
            console.error('[Script Error] Error creating Modern AI Helper Panel:', e);
        }
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
    function askAiForAnswer(question, systemPromptOverride) {
        return new Promise((resolve, reject) => {
            if (!CONFIG.AI_API_SETTINGS.API_KEY || CONFIG.AI_API_SETTINGS.API_KEY === '请在此处填入您自己的 DeepSeek API Key') {
                reject('API Key 未设置或不正确，请在控制面板中设置！');
                return;
            }
            const systemPrompt = systemPromptOverride || '你是一个乐于助人的问题回答助手。聚焦于执业药师相关的内容，请根据用户提出的问题，提供准确、清晰的解答。注意回答时仅仅包括答案，不允许其他额外任何解释，输出为一行一道题目的答案，答案只能是题目序号:字母选项，不能包含文字内容。单选输出示例：1.A。多选输出示例：1.ABC。';
            const payload = {
                model: "deepseek-v4-flash",
                messages: [{
                    "role": "system",
                    "content": systemPrompt
                }, {
                    "role": "user",
                    "content": question
                }],
                temperature: 0.2,
                thinking: {"type": "disabled"}
            };
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
        const expectedRoute = courseType === '公需课' ? '/publicdemand' : '/specialized';
        if (!window.location.hash.toLowerCase().includes(expectedRoute)) return;
        debugLog(`[Script] handleCourseListPage called for ${courseType}.`);

        // Handle public course tab switching first
        if (courseType === '公需课') {
            const publicTarget = GM_getValue('sclpa_public_target', 'video');
            const targetTabText = publicTarget === 'article' ? '文章资讯' : '视频课程';
            const targetTab = findElementByText('.radioTab > .radio-tab-tag', targetTabText);
            if (targetTab && !targetTab.classList.contains('radio-tab-tag-ed')) {
                debugLog(`[Script] Public Course: Target is ${targetTabText}, switching tab...`);
                clickElement(targetTab);
                schedulePublicCourseListAction(() => handleCourseListPage(courseType), 1000);
                return;
            }
        }

        const unfinishedTab = courseType === '公需课'
            ? getPublicCourseUnfinishedTab()
            : findElementByText('div.radio-tab-tag', '未完成');

        // Step 1: Click "未完成" tab if not already active
        // Removed `!unfinishedTabClicked` to ensure it keeps trying to click until active
        if (unfinishedTab && !isUnfinishedTabActive(unfinishedTab)) {
            debugLog('[Script] Course List: Found "未完成" tab and it is not active, clicking it...');
            clickElement(unfinishedTab);
            // Set unfinishedTabClicked to true only after a successful click attempt
            // This flag is reset by mainLoop when hash changes to a list page.
            unfinishedTabClicked = true;
            // After clicking, wait for the page to filter/load the unfinished list
            const continueAfterFilter = () => {
                debugLog('[Script] Course List: Waiting after clicking "未完成" tab, then re-evaluating...');
                handleCourseListPage(courseType);
            };
            if (courseType === '公需课') {
                schedulePublicCourseListAction(continueAfterFilter, 3000);
            } else {
                scriptSetTimeout(continueAfterFilter, 3000);
            }
            return; // Crucial to prevent immediate fall-through to course finding
        }

        // Step 2: If "未完成" tab is active, proceed to find and click the first unfinished course.
        // This block will only execute if the tab is truly active.
        if (unfinishedTab && isUnfinishedTabActive(unfinishedTab)) {
            const findAndEnterCourse = () => {
                if (!isServiceActive) return;
                if (!window.location.hash.toLowerCase().includes(expectedRoute)) return;
                if (Array.from(document.querySelectorAll('.el-loading-mask')).some(isElementVisible)) return;
                let targetCourseElement = Array.from(document.querySelectorAll('.play-card')).find(card =>
                    !card.querySelector('.el-icon-success') && !card.innerText.includes('已完成') &&
                    !(courseType === '公需课' && isBlockedPublicVideoCard(card))
                );

                if (!targetCourseElement) {
                    // Fallback for article cards if play-card not found (for public courses)
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
                    emptyCourseObservation = null;
                    if (courseType === '公需课') {
                        const publicTarget = GM_getValue('sclpa_public_target', 'video');
                        const activeCategory = getPublicCourseCategoryTabs().find(tab => tab.classList.contains('radio-tab-tag-ed'));
                        if (activeCategory) exhaustedPublicCourseCategories.delete(`${publicTarget}:${activeCategory.innerText.trim()}`);
                    }
                    debugLog(`[Script] ${courseType}: Found the first unfinished item, clicking to enter study...`);
                    const clickableElement = targetCourseElement.querySelector('.play-card-box-right-text') || targetCourseElement;
                    clickElement(clickableElement);
                } else {
                    const category = getPublicCourseCategoryTabs().find(tab => tab.classList.contains('radio-tab-tag-ed'))?.innerText.trim() || '';
                    const emptyKey = window.location.hash + '|' + courseType + '|' + GM_getValue('sclpa_public_target', 'video') + '|' + category;
                    if (emptyCourseObservation?.key !== emptyKey) {
                        emptyCourseObservation = { key: emptyKey, since: performance.now() };
                        return;
                    }
                    if (performance.now() - emptyCourseObservation.since < 4000) return;
                    debugLog('[Script] 未完成列表持续为空，继续检查后续分类或阶段。');
                    if (courseType === '公需课') {
                        const moved = moveToNextPublicCourseCategory();
                        if (!moved) {
                            const publicTarget = GM_getValue('sclpa_public_target', 'video');
                            if (publicTarget === 'video' && Object.values(videoLoadFailures).some(record => !record.professional && record.blocked)) {
                                pauseForVideoLoadFailures();
                                return;
                            }
                            advanceAllInOnePhaseIfExpected(publicTarget === 'article' ? 'public-article' : 'public-video');
                        }
                    } else {
                        advanceAllInOnePhaseIfExpected('specialized-video');
                    }
                }
            };
            if (courseType === '公需课') {
                schedulePublicCourseListAction(findAndEnterCourse, 1500);
            } else {
                scriptSetTimeout(findAndEnterCourse, 1500);
            }
        }
    }

    /**
     * Main handler for learning page
     */
    function handleLearningPage() {
        if (!isServiceActive) return;
        debugLog('[Script] handleLearningPage called.');
        if (/\/(?:openplayer|majorplayerpage)(?:[/?]|$)/i.test(window.location.hash) &&
            handleVideoLoading(document.querySelector('video'))) return;
        if (!isVideoSpeedEngineInitialized) {
            initializeEnhancedVideoSpeedEngine();
        }

        const directoryItems = document.querySelectorAll('.catalogue-item');

        if (directoryItems.length > 0) {
            handleMultiChapterCourse(directoryItems);
        } else {
            const video = document.querySelector('video');
            if (video) {
                handleSingleMediaCourse(video);
            } else if (/\/(?:imageandtext|articleplayerpage)(?:[/?]|$)/i.test(window.location.hash)) {
                handleArticleReadingPage();
            } else {
                // 视频页面异步挂载播放器；尚无 video 时应等待，不能按文章完成状态返回列表。
                debugLog('[Script] Waiting for video player to mount.');
            }
        }
    }

    /**
     * [FIXED] Handle multi-chapter courses (professional courses)
     * @param {NodeListOf<Element>} directoryItems
     */
    function handleMultiChapterCourse(directoryItems) {
        if (isChangingChapter) return;
        debugLog('[Script] handleMultiChapterCourse called.');
        const video = document.querySelector('video');

        // [FIX] Ensure video object exists before proceeding
        if (!video) {
            debugLog('[Script] Video element not found, waiting...');
            return;
        }

        // [FIX] Always set playbackRate and muted properties if video exists.
        // This ensures the speed is applied even if the video is currently paused.
        video.playbackRate = CONFIG.VIDEO_PLAYBACK_RATE;
        video.muted = true;

        // If video is playing, we've done our job for this cycle.
        if (!video.paused) {
            return;
        }

        // Logic to find the next unfinished chapter
        let nextChapter = null;
        for (const item of directoryItems) {
            if (!item.querySelector('.el-icon-success') && !isBlockedProfessionalChapter(item)) {
                nextChapter = item;
                break;
            }
        }

        if (nextChapter) {
            const isAlreadySelected = nextChapter.classList.contains('catalogue-item-ed');
            if (isAlreadySelected) { // If it's the correct chapter but paused
                debugLog('[Script] Current chapter is correct but video is paused, attempting to play.');
                video.play().catch(e => { console.error('[Script Error] Failed to play video:', e); });
            } else { // If we need to switch to the next chapter
                debugLog('[Script] Moving to next chapter:', nextChapter.innerText.trim());
                clickElement(nextChapter);
                isChangingChapter = true;
                scriptSetTimeout(() => { isChangingChapter = false; }, 4000); // Give time for chapter to load
            }
        } else {
            if (Array.from(directoryItems).some(item => !item.querySelector('.el-icon-success') && isBlockedProfessionalChapter(item))) {
                pauseForVideoLoadFailures();
                return;
            }
            // All chapters have the success icon. The main loop will now handle navigation via handleMajorPlayerPage.
            debugLog('[Script] All chapters appear to be complete. The main loop will verify and navigate.');
        }
    }


    /**
     * [FIXED] Handle single media courses (public courses)
     * @param {HTMLVideoElement} video
     */
    function handleSingleMediaCourse(video) {
        if (!video.dataset.singleVidControlled) {
            video.addEventListener('ended', () => {
                if (isServiceActive && hasConfirmedPublicVideoCompletion()) {
                    safeNavigateAfterCourseCompletion();
                }
            });
            video.dataset.singleVidControlled = 'true';
            debugLog('[Script] Added "ended" event listener for single media course.');
        }

        // [FIX] Always set playbackRate and muted properties.
        video.playbackRate = CONFIG.VIDEO_PLAYBACK_RATE;
        video.muted = true;

        if (video.ended) {
            // 平台在 ended 后异步保存学习记录；播放器结束不等于记录已保存。
            if (hasConfirmedPublicVideoCompletion()) safeNavigateAfterCourseCompletion();
            return;
        }
        if (video.paused) {
            debugLog('[Script] Single media video paused, attempting to play.');
            video.play().catch(e => { console.error('[Script Error] Failed to play single media video:', e); });
        }
    }

    function hasConfirmedPublicVideoCompletion() {
        const activeItem = document.querySelector('.open-player-right-content .video-list-item.active');
        if (!activeItem) return false;
        const status = activeItem.querySelector('.list-item-status')?.innerText.trim();
        const completedIcon = activeItem.querySelector('use');
        const iconName = completedIcon?.getAttribute('xlink:href') || completedIcon?.getAttribute('href');
        return status === '待考试' || status === '完成' || status === '已完成' || iconName === '#icon-wancheng';
    }

    function readVideoLoadFailures() {
        try {
            const stored = JSON.parse(sessionStorage.getItem(VIDEO_LOAD_FAILURES_KEY) || '{}');
            if (stored && typeof stored === 'object' && !Array.isArray(stored)) return stored;
        } catch (error) { /* 浏览器禁用会话存储时，仅保留当前页面的重试记录。 */ }
        return {};
    }

    function saveVideoLoadFailures() {
        try {
            sessionStorage.setItem(VIDEO_LOAD_FAILURES_KEY, JSON.stringify(videoLoadFailures));
            return true;
        } catch (error) { return false; }
    }

    function resetVideoLoadFailures() {
        videoLoadFailures = {};
        videoLoadingState = null;
        saveVideoLoadFailures();
    }

    function publicVideoTitle(element) {
        return (element?.querySelector('.title')?.textContent || element?.textContent || '').replace(/\s+/g, '').trim();
    }

    function isBlockedPublicVideoTitle(title) {
        return Boolean(title && Object.values(videoLoadFailures).some(record => !record.professional && record.blocked && record.title === title));
    }

    function isBlockedPublicVideoCard(card) {
        if (GM_getValue('sclpa_public_target', 'video') !== 'video') return false;
        const text = card.textContent.replace(/\s+/g, '');
        return Object.values(videoLoadFailures).some(record => !record.professional && record.blocked && record.title && text.includes(record.title));
    }

    function professionalChapterKey(item) {
        // 仅在当前课程目录内关联章节，不保存学习者或接口参数。
        const titles = Array.from(document.querySelectorAll('.catalogue-item')).map(publicVideoTitle);
        return `professional:${JSON.stringify(titles)}:${publicVideoTitle(item)}`;
    }

    function isBlockedProfessionalChapter(item) {
        return Boolean(videoLoadFailures[professionalChapterKey(item)]?.blocked);
    }

    function pauseForVideoLoadFailures() {
        notifyBackgroundException('video-stopped');
        setRuntimeServiceActive(false);
        const status = document.getElementById('status-text');
        if (status) status.textContent = '加载失败课程仍未完成；启动服务可重新尝试';
        const button = document.getElementById('service-toggle-btn');
        if (button) {
            button.textContent = '▶️ 启动服务';
            button.className = 'panel-btn service-btn-paused';
        }
        document.getElementById('status-dot')?.classList.remove('active');
    }

    function reconcileVideoLoadingIndicator(video, previousTime) {
        if (!video || video.error || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
        const quality = video.getVideoPlaybackQuality?.();
        const hasDecodedFrame = quality && quality.totalVideoFrames > quality.droppedVideoFrames;
        if (!hasDecodedFrame && Math.abs(video.currentTime - previousTime) <= 0.05) return;
        const component = video.closest('.video-box')?.__vue__;
        if (component?.$options?.name !== 'videoPlayer' || !component.loadLoading ||
            component.loadError || component.slideVerifyShow || component.toSeeEl) return;
        if (!component.playerEl?.el()?.contains(video)) return;
        // 网站仅在 loadedmetadata 回调中关闭遮罩；已解码/播放的视频不能继续被旧加载状态遮住。
        component.loadLoading = false;
        debugLog('[Script] 视频已经可播放，校正网站残留的加载遮罩。');
    }

    // 只恢复实际加载停滞；不修改学习进度、不把失败课程标记为完成。
    function handleVideoLoading(video) {
        const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
        const professional = /\/majorplayerpage(?:[/?]|$)/i.test(window.location.hash);
        if (professional && isChangingChapter) return true;
        const activeItem = document.querySelector(professional ? '.catalogue-item-ed' : '.open-player-right-content .video-list-item.active');
        const title = activeItem ? publicVideoTitle(activeItem) : '';
        const courseId = params.get('courseContId');
        const key = professional ? (activeItem ? professionalChapterKey(activeItem) : 'professional:player-mount') : courseId ? `course:${courseId}` : title ? `title:${title}` : 'public:player-mount';
        if (!key) return false;
        const now = performance.now();
        const time = video?.currentTime || 0;
        if (!videoLoadingState || videoLoadingState.key !== key) {
            videoLoadingState = { key, lastTime: time, lastProgressAt: now };
        }
        const state = videoLoadingState;
        const pendingRequest = Array.from(document.querySelectorAll('.el-loading-mask')).some(isElementVisible);
        if (!pendingRequest) reconcileVideoLoadingIndicator(video, state.lastTime);
        if (!pendingRequest && video?.ended) return false;
        if (!pendingRequest && video && !video.error &&
            (Math.abs(time - state.lastTime) > 0.05 || (video.paused && video.readyState >= 3))) {
            state.lastTime = time;
            state.lastProgressAt = now;
            return false;
        }
        state.lastTime = time;
        if (now - state.lastProgressAt < VIDEO_LOAD_TIMEOUT_MS) return false;
        const record = videoLoadFailures[key] || { retries: 0, title, professional, blocked: false };
        if (title) record.title = title;
        videoLoadFailures[key] = record;
        state.lastProgressAt = now;
        if (record.retries < VIDEO_LOAD_MAX_RETRIES) {
            if (record.retries === 0) notifyBackgroundException('video-stalled');
            record.retries++;
            const persisted = saveVideoLoadFailures();
            console.warn(`[Script] 视频加载超时，恢复尝试 ${record.retries}/${VIDEO_LOAD_MAX_RETRIES}。`);
            if (persisted && (!video || pendingRequest || record.retries === VIDEO_LOAD_MAX_RETRIES)) {
                window.location.reload();
            } else if (video) {
                video.load();
                video.play().catch(() => {});
            }
            return true;
        }
        record.blocked = true;
        saveVideoLoadFailures();
        notifyBackgroundException('video-skipped');
        console.warn('[Script] 此视频重试后仍加载失败，本轮暂时跳过，保留未完成状态。');
        if (professional) {
            const nextChapter = Array.from(document.querySelectorAll('.catalogue-item')).find(item =>
                !item.classList.contains('catalogue-item-ed') && !item.querySelector('.el-icon-success') && !isBlockedProfessionalChapter(item));
            videoLoadingState = null;
            if (nextChapter) {
                clickElement(nextChapter);
                isChangingChapter = true;
                scriptSetTimeout(() => { isChangingChapter = false; }, 4000);
            } else pauseForVideoLoadFailures();
            return true;
        }
        const next = Array.from(document.querySelectorAll('.open-player-right-content .video-list-item')).find(item => {
            const status = item.querySelector('.list-item-status')?.textContent.trim() || '';
            const icon = item.querySelector('use');
            const completedIcon = (icon?.getAttribute('xlink:href') || icon?.getAttribute('href')) === '#icon-wancheng';
            return !item.classList.contains('active') && !/待考试|完成|合格/.test(status) && !completedIcon &&
                !isBlockedPublicVideoTitle(publicVideoTitle(item));
        });
        videoLoadingState = null;
        if (next) clickElement(next);
        else if (record.title) safeNavigateBackToList();
        else pauseForVideoLoadFailures();
        const status = document.getElementById('status-text');
        if (isServiceActive && status) status.textContent = '运行中（有加载失败视频暂时跳过；重启服务可重试）';
        return true;
    }

    /**
     * Handle article reading page
     */
    function handleArticleReadingPage() {
        if (!/\/(?:imageandtext|articleplayerpage)(?:[/?]|$)/i.test(window.location.hash)) return;
        debugLog('[Script] handleArticleReadingPage called.');
        const progressLabel = document.querySelector('.action-btn .label');
        const info = document.querySelector('.image-and-text')?.__vue__?.ImageAndTextInfo;
        const confirmed = info ? Boolean(info.isWanCheng || info.isTongGuo)
            : Boolean(progressLabel && /^(待考试|已完成|完成)$/.test(progressLabel.innerText.trim()));
        if (confirmed) {
            debugLog('[Script] Article study completed, preparing to return to list.');
            safeNavigateAfterCourseCompletion();
        } else {
            debugLog('[Script] Article progress not yet 100% or "待考试".');
        }
    }

    /**
     * Handle exam page (where the actual questions are displayed)
     * Automatically copies question to AI helper and processes the AI answer.
     */
    function handleExamPage() {
        if (!isServiceActive) return; // Only run if service is active
        debugLog('[Script] handleExamPage called.');

        currentNavContext = GM_getValue('sclpa_nav_context', ''); // Ensure context is fresh
        if (currentNavContext === 'course') {
            debugLog('[Script] Current navigation context is "course". Ignoring exam automation and navigating back to course list.');
            safeNavigateBackToList();
            return;
        }

        if (isSubmittingExam) {
            debugLog('[Script] Exam submission in progress, deferring AI processing.');
            return;
        }

        if (!document.getElementById('ai-helper-panel')) {
            createManualAiHelper();
            scriptSetTimeout(() => {
                triggerAiQuestionAndProcessAnswer();
            }, 500);
        } else {
            triggerAiQuestionAndProcessAnswer();
        }
    }

    /**
     * Gathers all questions and options from the current exam page,
     * sends them to AI, and waits for the response to select answers.
     */
    async function triggerAiQuestionAndProcessAnswer() {
        const examinationItems = document.querySelectorAll('.examination-body-item');

        if (examinationItems.length === 0) {
            debugLog('[Script] No examination items found. Cannot trigger AI.');
            return;
        }

        // 纠错复核视图（含错题标记）不是作答页面，不自动作答。
        const visibleReviewState = Array.from(document.querySelectorAll('.examination-body-item .details-state'))
            .find(element => element.offsetParent !== null);
        if (visibleReviewState) {
            debugLog('[Script] Current view is the correction review page, skipping auto answering.');
            return;
        }

        let fullQuestionBatchContent = '';
        examinationItems.forEach(item => {
            fullQuestionBatchContent += item.innerText.trim() + '\n\n'; // Concatenate all questions
        });

        // Only process if the batch of questions has changed and AI answer is not pending
        if (!fullQuestionBatchContent || fullQuestionBatchContent === currentQuestionBatchText || isAiAnswerPending) {
            if (isAiAnswerPending) {
                debugLog('[Script] AI answer already pending for current question batch, skipping new query.');
            } else if (fullQuestionBatchContent === currentQuestionBatchText) {
                debugLog('[Script] Question batch content has not changed, skipping AI query.');
            }
            return;
        }

        // 自动重试轮次：若本页所有题目都有记忆答案，直接作答，不再请求 AI。
        if (examAnswerMemory.size > 0) {
            const items = Array.from(examinationItems);
            const rememberedAnswers = items.map(item => getRememberedAnswerForItem(item));
            if (rememberedAnswers.length > 0 && rememberedAnswers.every(answer => answer)) {
                debugLog('[Script] Using remembered answers to answer current page directly (auto retry round).');
                currentQuestionBatchText = fullQuestionBatchContent;
                if (!parseAndSelectAllAnswers('')) return;
                const answerRoute = window.location.hash;
                scriptSetTimeout(() => {
                    if (isCurrentAnswerBatch(answerRoute, fullQuestionBatchContent)) {
                        handleNextQuestionOrSubmitExam();
                    }
                }, 1000);
                return;
            }
        }

        const aiHelperTextarea = document.getElementById('ai-helper-textarea');
        const aiHelperSubmitBtn = document.getElementById('ai-helper-submit-btn');
        const aiHelperResultDiv = document.getElementById('ai-helper-result');

        if (!aiHelperTextarea || !aiHelperSubmitBtn || !aiHelperResultDiv) {
            debugLog('[Script] AI helper elements missing. Cannot trigger AI.');
            return;
        }

        currentQuestionBatchText = fullQuestionBatchContent; // Update current batch text
        aiHelperTextarea.value = fullQuestionBatchContent + buildRetryHistoryContext(examinationItems); // Set textarea value with all questions
        aiHelperResultDiv.innerText = '正在向AI发送请求...';
        debugLog('[Script] New batch of exam questions copied to AI helper textarea, triggering AI query...');

        isAiAnswerPending = true;

        const answerRoute = window.location.hash;
        const answerGeneration = ++aiBatchGeneration;
        const answerDeadline = performance.now() + 150000;
        const checkInterval = 500;
        clickElement(aiHelperSubmitBtn);

        const checkAiResult = scriptSetInterval(() => {
            if (!isServiceActive || answerGeneration !== aiBatchGeneration || !isCurrentAnswerBatch(answerRoute, fullQuestionBatchContent)) {
                scriptClearInterval(checkAiResult);
                if (answerGeneration === aiBatchGeneration) isAiAnswerPending = false;
                return;
            }
            if (aiHelperResultDiv.innerText.trim() && aiHelperResultDiv.innerText.trim() !== '正在向AI发送请求...' && aiHelperResultDiv.innerText.trim() !== '请先提问...') {
                scriptClearInterval(checkAiResult);
                isAiAnswerPending = false;
                if (/错误|失败|超时|未配置|请先.*(?:设置|填写|配置)/.test(aiHelperResultDiv.innerText)) {
                    notifyBackgroundException('ai-failed');
                    console.warn('[Script] AI 没有返回可用答案，保留当前试卷等待处理。');
                    return;
                }
                debugLog('[Script] AI response received:', aiHelperResultDiv.innerText.trim());
                if (!parseAndSelectAllAnswers(aiHelperResultDiv.innerText.trim())) return;

                scriptSetTimeout(() => {
                    if (isCurrentAnswerBatch(answerRoute, fullQuestionBatchContent)) {
                        handleNextQuestionOrSubmitExam();
                    }
                }, 1000);
            } else if (performance.now() >= answerDeadline) {
                scriptClearInterval(checkAiResult);
                isAiAnswerPending = false;
                debugLog('[Script] Timeout waiting for AI response for question batch.');
                aiHelperResultDiv.innerText = 'AI请求超时，请手动重试。';
                notifyBackgroundException('ai-timeout');
            }
        }, checkInterval);
    }


    function isCurrentAnswerBatch(route, batch) {
        if (window.location.hash !== route || currentQuestionBatchText !== batch) return false;
        const current = Array.from(document.querySelectorAll('.examination-body-item'))
            .map(item => item.innerText.trim() + '\n\n').join('');
        return current === batch;
    }

    /**
     * 为单个题目按答案字母（如 "ABC"）点击对应选项。
     * 同时记录本轮作答的答案组合，用于没有纠错复核页时回传 AI 修正。
     */
    function selectAnswersForItem(item, answerLetters) {
        for (const letter of String(answerLetters || '')) {
            const optionText = `${letter}.`;
            // Find options specific to this question item
            const optionElement = Array.from(item.querySelectorAll('.examination-check-item')).find(el =>
                el.innerText.trim().startsWith(optionText)
            );

            if (optionElement) {
                debugLog(`[Script] Selecting option: ${letter}`);
                clickElement(optionElement);
            } else {
                console.warn(`[Script] Option '${letter}' not found using text '${optionText}'.`);
            }
        }

        const answerText = String(answerLetters || '').toUpperCase();
        if (!answerText) return;
        const title = getNormalizedQuestionTitle(item) || item.querySelector('.examination-body-title')?.innerText.trim() || '';
        if (!title) return;
        const options = Array.from(item.querySelectorAll('.examination-check-item'))
            .map(option => option.innerText.trim())
            .filter(Boolean);
        lastAttemptData.set(title, { answer: answerText, options, title });
    }

    /**
     * Parses the AI response and automatically selects the corresponding options for all questions on the exam page.
     * 重试轮次中，记忆答案优先于 AI 新答案，避免已确认答对的题被 AI 改错。
     * @param {string} aiResponse - The raw response string from the AI (e.g., "1.A\n2.BC\n3.D").
     */
    function parseAndSelectAllAnswers(aiResponse) {
        const answers = parseAnswersToMap(aiResponse);
        const items = Array.from(document.querySelectorAll('.examination-body-item'));
        const selections = [];
        for (const item of items) {
            const title = item.querySelector('.examination-body-title')?.innerText.trim() || '';
            const number = title.match(/^(\d+)\s*[、.．:：)）]/)?.[1];
            const answer = canonicalAnswer(getRememberedAnswerForItem(item) || answers.get(Number(number)) || '');
            const options = Array.from(item.querySelectorAll('.examination-check-item')).map(option => option.innerText.trim());
            const question = { title: getNormalizedQuestionTitle(item), options };
            if (!number || !answer || [...answer].some(letter => !options.some(text => text.startsWith(letter + '.'))) || isConfirmedWrongAnswer(question, answer)) {
                showAutomationNotice('AI 答案缺失、选项无效或重复已确认错答，已停止自动交卷，请核对后重试。');
                notifyBackgroundException('ai-failed');
                return false;
            }
            selections.push([item, answer]);
        }
        if (!selections.length) return false;
        selections.forEach(([item, answer]) => selectAnswersForItem(item, answer));
        return true;
    }

    /**
     * Handles navigation after answering a question: either to the next question or submits the exam.
     */
    function handleNextQuestionOrSubmitExam() {
        if (!window.location.hash.toLowerCase().includes('/examination')) return;
        if (!isServiceActive || isSubmittingExam) {
            debugLog('[Script] Service inactive or exam submission in progress, deferring next step.');
            return;
        }
        debugLog('[Script] handleNextQuestionOrSubmitExam called.');

        // First, try to find the "下一题" button
        const nextQuestionButton = findElementByText('button span', '下一题');

        if (nextQuestionButton) {
            debugLog('[Script] Found "下一题" button, clicking it...');
            clickElement(nextQuestionButton.closest('button'));
            // After clicking "下一题", the page should load the next question batch.
            // mainLoop will detect hash change and re-trigger handleExamPage,
            // or if on the same hash but content changed, triggerAiQuestionAndProcessAnswer will detect new questions.
            // Reset question batch text to ensure new questions are processed
            currentQuestionBatchText = '';
        } else {
            // If "下一题" not found, try to find "提交试卷"
            const submitExamButton = findElementByText('button.submit-btn span', '提交试卷');

            if (submitExamButton) {
                debugLog('[Script] "下一题" not found. Found "提交试卷" button, clicking it...');
                isSubmittingExam = true;
                clickElement(submitExamButton.closest('button'));

                const submittedRoute = window.location.hash;
                const submittedGeneration = aiBatchGeneration;
                let resultChecks = 0;
                const resultDeadline = performance.now() + 15000;
                const resultCheckTimer = scriptSetInterval(() => {
                    if (!isServiceActive || window.location.hash !== submittedRoute || aiBatchGeneration !== submittedGeneration) {
                        scriptClearInterval(resultCheckTimer);
                        if (aiBatchGeneration === submittedGeneration) isSubmittingExam = false;
                        return;
                    }
                    if (hasFailedExamResult()) {
                        scriptClearInterval(resultCheckTimer);
                        handleFailedExamResult();
                        return;
                    }

                    // 若结果提示已出现但并非“未通过”，视为通过：确认完成、重置重试状态并自动返回列表继续下一场。
                    const resultTip = document.querySelector('.result-tip-content');
                    if (resultTip && isElementVisible(resultTip) && !resultTipTextIsFailure(resultTip.innerText) &&
                        /考试通过|考试合格|成绩合格|通过考试|及格/.test(resultTip.innerText)) {
                        scriptClearInterval(resultCheckTimer);
                        isSubmittingExam = false;
                        resetExamRetryState('检测到考试通过结果');
                        debugLog('[Script] 检测到考试通过结果，自动返回考试列表继续下一场考试。');
                        proceedAfterExamPassed();
                        return;
                    }

                    resultChecks++;
                    if (resultChecks >= 30 || performance.now() >= resultDeadline) {
                        scriptClearInterval(resultCheckTimer);
                        isSubmittingExam = false;
                        notifyBackgroundException('exam-unknown');
                        showAutomationNotice('未能确认考试结果，已停止自动跳转，请核对平台结果。');
                        resetExamRetryState('结果未知，等待人工确认');
                    }
                }, 500);
            } else {
                debugLog('[Script] Neither "下一题" nor "提交试卷" button found. Check page state or selectors.');
            }
        }
    }


    /**
     * Handle exam list page (e.g., #/onlineExam or #/openOnlineExam)
     * This function will find and click the "待考试" tab if it's not already active,
     * then find and click the "开始考试" button for the first pending exam.
     */
    function hasConfirmedEmptyExamList() {
        return Array.from(document.querySelectorAll('.el-table__empty-text, .el-empty__description, .no-data, .empty-data'))
            .some(element => isElementVisible(element) && /暂无数据|暂无.*考试|没有.*考试/.test(element.innerText));
    }

    function handleExamListPage() {
        if (!isServiceActive) return;
        debugLog('[Script] handleExamListPage called.');

        const currentHash = window.location.hash.toLowerCase();
        if (!/\/(?:onlineexam|openonlineexam)(?:[/?]|$)/.test(currentHash)) return;
        if (Array.from(document.querySelectorAll('.el-loading-mask')).some(isElementVisible)) return;
        currentNavContext = GM_getValue('sclpa_nav_context', '');
        // 记录当前所在考试列表，考后自动返回用（专业课优先，公需课其次）。
        currentExamListRoute = currentHash.includes('/openonlineexam')
            ? 'https://zyys.ihehang.com/#/openOnlineExam'
            : 'https://zyys.ihehang.com/#/onlineExam';

        // If the context is 'course', we should not be automating exams. Navigate back.
        if (currentNavContext === 'course') {
            debugLog('[Script] Current navigation context is "course". Ignoring exam automation and navigating back to course list.');
            safeNavigateBackToList();
            return;
        }

        const pendingExamTab = findElementByText('div.radio-tab-tag', '待考试');

        if (pendingExamTab && !isUnfinishedTabActive(pendingExamTab)) {
            debugLog('[Script] Found "待考试" tab, clicking it...');
            clickElement(pendingExamTab);
            // After clicking, wait for the content to load, then re-evaluate
            scriptSetTimeout(() => {
                handleExamListPage();
            }, 2500);
            return;
        } else if (pendingExamTab && isUnfinishedTabActive(pendingExamTab)) {
            // Check for "暂无数据" if on professional exam page
            if (currentHash.includes('/onlineexam')) {
                const emptyDataText = document.querySelector('.el-table__empty-text');
                if (emptyDataText && isElementVisible(emptyDataText) && emptyDataText.innerText.includes('暂无数据')) {
                    debugLog('[Script] Professional Exam List: Detected "暂无数据". Switching to Public Exam List.');
                    if (advanceAllInOnePhaseIfExpected('specialized-exam')) return;
                    window.location.href = 'https://zyys.ihehang.com/#/openOnlineExam';
                    return; // Exit after navigation
                }
            }

            // If not "暂无数据" or on public exam page, attempt to start exam
            debugLog('[Script] "待考试" tab is active. Attempting to find "开始考试" button...');
            attemptClickStartExamButton();
        } else {
            // 标签未挂载时不能认定列表为空。
            if (!hasConfirmedEmptyExamList()) return;
            if (handleAllInOneExamPhaseExhausted()) return;
            notifyExamBatchFinished();
        }
    }

    /**
     * 获取“开始考试”按钮所在行/卡片的文本，作为识别具体场次的签名。
     */
    function getExamRowSignature(button) {
        if (!button) return '';
        const row = button.closest('tr') || button.closest('.el-card') || button.closest('li') || button.parentElement;
        return row ? row.innerText.trim() : '';
    }

    /**
     * Attempts to find and click the "开始考试" button for the first available exam.
     * 跳过已重试耗尽的场次；找不到可开始的考试时提示批次完成。
     */
    function attemptClickStartExamButton() {
        // 非重试链中点击“开始考试”属于全新考试，清理可能残留的重试记忆。
        if (!examRetryChainActive) {
            resetExamRetryState('开始新的考试');
        }

        const startExamButtons = Array.from(document.querySelectorAll('button span'))
            .filter(span => span.innerText.trim() === '开始考试')
            .map(span => span.closest('button'))
            .filter(button => button);

        // 已重试耗尽的场次若已不在当前列表（平台要求重新学习等），移除标记，之后重现时仍可作答。
        const currentSignatures = new Set(startExamButtons.map(button => getExamRowSignature(button)).filter(Boolean));
        for (const signature of Array.from(exhaustedExamSignatures)) {
            if (!currentSignatures.has(signature)) exhaustedExamSignatures.delete(signature);
        }

        let targetButton = null;
        for (const button of startExamButtons) {
            const signature = getExamRowSignature(button);
            if (signature && exhaustedExamSignatures.has(signature)) continue;
            targetButton = button;
            break;
        }

        if (targetButton) {
            debugLog('[Script] Found "开始考试" button, clicking it...');
            lastStartedExamSignature = getExamRowSignature(targetButton);
            examSummaryNotified = false; // 新一批开始，重置“全部完成”提示标记
            clickElement(targetButton);
        } else if (startExamButtons.length > 0) {
            debugLog('[Script] 待考试列表中其余场次均已重试耗尽，停止自动考试并提示。');
            if (handleAllInOneExamPhaseExhausted()) return;
            notifyExamBatchFinished();
        } else {
            debugLog('[Script] "开始考试" button not found on the page.');
            if (!hasConfirmedEmptyExamList()) return;
            if (handleAllInOneExamPhaseExhausted()) return;
            notifyExamBatchFinished();
        }
    }


    /**
     * Handle generic popups, including the "前往考试" popup after course completion.
     */
    function handleGenericPopups() {
        if (!isServiceActive || isPopupBeingHandled) return;
        debugLog('[Script] handleGenericPopups called.');

        if (hasFailedExamResult()) {
            handleFailedExamResult();
            return;
        }

        const currentHash = window.location.hash.toLowerCase(); // Get current hash here
        const visibleMessageBox = Array.from(document.querySelectorAll('.el-message-box')).find(isElementVisible);
        const examCompletionPopupMessage = visibleMessageBox?.querySelector('.el-message-box__message p');
        const popupButtons = visibleMessageBox ? Array.from(visibleMessageBox.querySelectorAll('button')).filter(isElementVisible) : [];
        const goToExamBtnInPopup = popupButtons.find(button => button.innerText.trim() === '前往考试');
        const cancelBtnInPopup = popupButtons.find(button => button.innerText.trim() === '取消');

        if (examCompletionPopupMessage && examCompletionPopupMessage.innerText.includes('恭喜您已经完成所有课程学习') && goToExamBtnInPopup && cancelBtnInPopup) {
            // If on major player page, the new dedicated handler will manage this popup.
            if (currentHash.includes('/majorplayerpage')) {
                return;
            }

            currentNavContext = GM_getValue('sclpa_nav_context', '');
            // Only handle this popup for course completion context on non-majorPlayerPage
            if (currentNavContext === 'course') {
                debugLog('[Script] Detected "恭喜您" completion popup on non-majorPlayerPage. Clicking "取消".');
                isPopupBeingHandled = true;
                clickElement(cancelBtnInPopup);
                // 关闭仍可见的旧提示不代表新课程完成；视频必须确实结束才能返回列表。
                const canLeaveCurrentCourse = /\/(?:imageandtext|articleplayerpage)(?:[/?]|$)/i.test(currentHash) ||
                    (currentHash.includes('/openplayer') && document.querySelector('video')?.ended);
                if (canLeaveCurrentCourse) safeNavigateAfterCourseCompletion();
                scriptSetTimeout(() => { isPopupBeingHandled = false; }, 1000); // Reset flag after delay
                return;
            }
        }

        const visibleDialogButtons = Array.from(document.querySelectorAll('.el-message-box, .el-dialog'))
            .filter(isElementVisible)
            .flatMap(dialog => Array.from(dialog.querySelectorAll('button')).filter(isElementVisible));
        const genericBtn = visibleDialogButtons.find(button => button.innerText.trim() === '确定') ||
            visibleDialogButtons.find(button => button.innerText.trim() === '进入下一节学习');
        if (genericBtn) {
            debugLog(`[Script] Detected generic popup button: ${genericBtn.innerText.trim()}. Clicking it.`);
            isPopupBeingHandled = true;
            clickElement(genericBtn);
            scriptSetTimeout(() => { isPopupBeingHandled = false; }, 2500);
        }
    }


    // ===================================================================================
    // --- 核心自动化 (Core Automation) ---
    // ===================================================================================

    /**
     * [动态倍速应用器] 立即将当前配置的倍速应用到所有视频
     * 允许在不重新加载页面的情况下动态调整倍速
     */
    function applyCurrentVideoSpeed() {
        const targetRate = GM_getValue('sclpa_playback_rate', 1.0);

        CONFIG.VIDEO_PLAYBACK_RATE = targetRate;
        currentPlaybackRate = targetRate;

        function applyToVideo(video) {
            if (!video || video.nodeType !== Node.ELEMENT_NODE) return;

            const currentRate = video.playbackRate;
            if (Math.abs(currentRate - targetRate) > 0.01) {
                try {
                    video.playbackRate = targetRate;
                    debugLog(`[Script] 动态应用倍速: ${targetRate}x (从 ${currentRate}x 调整)`);
                } catch (e) {
                    console.warn('[Script] 应用倍速失败:', e);
                }
            }
        }

        document.querySelectorAll('video').forEach(video => applyToVideo(video));

        try {
            document.querySelectorAll('iframe').forEach(iframe => {
                iframe.contentDocument?.querySelectorAll('video').forEach(video => applyToVideo(video));
            });
        } catch (e) {
        }

        document.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) {
                el.shadowRoot.querySelectorAll('video').forEach(video => applyToVideo(video));
            }
        });

        if (refreshVideoSpeedEngine) {
            refreshVideoSpeedEngine();
        }

        const speedDisplay = document.getElementById('speed-display');
        if (speedDisplay) {
            speedDisplay.textContent = `${targetRate}x`;
        }

        debugLog(`[Script] 动态倍速应用完成: ${targetRate}x`);
    }

    /**
     * 标准 HTML5 视频倍速引擎。
     * 使用加载/播放事件、播放器实例级倍速保护和 MutationObserver 覆盖 SPA 重新挂载视频的场景；
     * 不篡改浏览器原生属性描述符或页面计时器。
     */
    function initializeEnhancedVideoSpeedEngine() {
        if (!isServiceActive) return;
        if (isVideoSpeedEngineInitialized && refreshVideoSpeedEngine) { refreshVideoSpeedEngine(); return; }
        const videos = new Map();
        const roots = new Map();
        const frames = new Map();
        let scanTimer = null;
        let disposed = false;
        const stats = { videos: 0, roots: 0, frames: 0, scans: 0 };
        window.__sclpaVideoRuntime = stats;
        function updateStats() { stats.videos = videos.size; stats.roots = roots.size; stats.frames = frames.size; }
        function connectedDocument(owner) {
            try {
                while (owner !== document) {
                    const frame = owner.defaultView?.frameElement;
                    if (!frame?.isConnected) return false;
                    owner = frame.ownerDocument;
                }
                return true;
            } catch (_) { return false; }
        }
        function attached(video) {
            if (!video.isConnected) return false;
            return connectedDocument(video.ownerDocument);
        }
        function apply(video) {
            if (!isServiceActive || !attached(video)) return;
            const rate = CONFIG.VIDEO_PLAYBACK_RATE;
            try {
                if (Math.abs(video.defaultPlaybackRate - rate) > 0.01) video.defaultPlaybackRate = rate;
                if (Math.abs(video.playbackRate - rate) > 0.01) video.playbackRate = rate;
            } catch (_) {}
        }
        function watch(video) {
            if (videos.has(video) || !attached(video)) return;
            let timer = null;
            const original = Object.getOwnPropertyDescriptor(video, 'playbackRate');
            const native = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
            const get = native?.get ? function() { return native.get.call(this); } : null;
            if (get && native.set) {
                try {
                    Object.defineProperty(video, 'playbackRate', { configurable: true, get,
                        set(value) {
                            const target = isServiceActive ? CONFIG.VIDEO_PLAYBACK_RATE : value;
                            if (Math.abs(native.get.call(this) - target) > 0.01) native.set.call(this, target);
                        }
                    });
                } catch (_) {}
            }
            const reapply = () => {
                if (!isServiceActive || timer !== null || disposed) return;
                timer = scriptSetTimeout(() => { timer = null; apply(video); }, 100);
            };
            for (const event of ['loadedmetadata', 'canplay', 'playing', 'ratechange']) video.addEventListener(event, reapply);
            installBackgroundPlaybackGuard(video, reapply);
            videos.set(video, () => {
                if (timer !== null) scriptClearTimeout(timer);
                for (const event of ['loadedmetadata', 'canplay', 'playing', 'ratechange']) video.removeEventListener(event, reapply);
                backgroundPlaybackGuards.get(video)?.();
                backgroundPlaybackGuards.delete(video);
                if (get && Object.getOwnPropertyDescriptor(video, 'playbackRate')?.get === get) {
                    try { if (original) Object.defineProperty(video, 'playbackRate', original); else delete video.playbackRate; } catch (_) {}
                }
            });
            apply(video);
        }
        function queueScan() {
            if (scanTimer !== null || disposed || !isServiceActive) return;
            scanTimer = scriptSetTimeout(() => { scanTimer = null; scan(); }, 100);
        }
        function relevant(node) {
            return node.nodeType === 1 && (node.matches('video,iframe') || node.shadowRoot || node.querySelector('video,iframe') || Array.from(node.querySelectorAll('*')).some(host => host.shadowRoot));
        }
        function observeRoot(root) {
            if (roots.has(root)) return;
            const observer = new MutationObserver(mutations => {
                if (mutations.some(m => Array.from(m.removedNodes).some(relevant) || Array.from(m.addedNodes).some(relevant))) queueScan();
                // 新增组件可能通过 Shadow DOM 挂载媒体，仅检查新子树。
                for (const mutation of mutations) for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (node.shadowRoot) { observeRoot(node.shadowRoot); queueScan(); }
                    for (const host of node.querySelectorAll('*')) if (host.shadowRoot) { observeRoot(host.shadowRoot); queueScan(); }
                }
            });
            observer.observe(root, { childList: true, subtree: true });
            roots.set(root, observer);
        }
        function scan() {
            if (disposed || !isServiceActive) return;
            stats.scans++;
            for (const [video, cleanup] of videos) if (!attached(video)) { cleanup(); videos.delete(video); }
            for (const [frame, cleanup] of frames) if (!frame.isConnected) { cleanup(); frames.delete(frame); }
            for (const [root, observer] of roots) {
                const connected = root === document || (root.host ? root.host.isConnected && connectedDocument(root.host.ownerDocument) : connectedDocument(root));
                if (!connected) { observer.disconnect(); roots.delete(root); }
            }
            for (const root of Array.from(roots.keys())) {
                root.querySelectorAll('video').forEach(video => { watch(video); apply(video); });
                for (const host of root.querySelectorAll('*')) if (host.shadowRoot) observeRoot(host.shadowRoot);
                for (const frame of root.querySelectorAll('iframe')) {
                    if (!frames.has(frame)) {
                        const load = () => {
                            for (const [oldRoot, observer] of roots) if (oldRoot !== document && !oldRoot.host && oldRoot.defaultView?.frameElement === frame) {
                                observer.disconnect(); roots.delete(oldRoot);
                            }
                            queueScan();
                        };
                        frame.addEventListener('load', load);
                        frames.set(frame, () => frame.removeEventListener('load', load));
                    }
                    try { if (frame.contentDocument) observeRoot(frame.contentDocument); } catch (_) {}
                }
            }
            // 新发现的同源 iframe / shadow root 在下一轮扫描应用，最多同时保留一个扫描任务。
            const pendingMedia = Array.from(roots.keys()).some(root => Array.from(root.querySelectorAll('video')).some(video => !videos.has(video)));
            if (pendingMedia) queueScan();
            updateStats();
        }
        function dispose() {
            disposed = true;
            if (scanTimer !== null) scriptClearTimeout(scanTimer);
            scanTimer = null;
            for (const cleanup of videos.values()) cleanup();
            for (const observer of roots.values()) observer.disconnect();
            for (const cleanup of frames.values()) cleanup();
            videos.clear(); roots.clear(); frames.clear(); updateStats();
            isVideoSpeedEngineInitialized = false;
            refreshVideoSpeedEngine = null;
            disposeVideoSpeedEngine = null;
            window.removeEventListener('pagehide', dispose);
        }
        observeRoot(document);
        refreshVideoSpeedEngine = queueScan;
        disposeVideoSpeedEngine = dispose;
        isVideoSpeedEngineInitialized = true;
        window.addEventListener('pagehide', dispose);
        scan();
    }

    // ===================================================================================
    /** 只识别平台文章的 100ms 阅读计时，复用平台回调和保存完成流程。 */
    function initializeArticleTimingEngine() {
        if (window.__sclpaArticleTimingEngine) return;
        const siteWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const nativeSetInterval = siteWindow.setInterval;
        const nativeClearInterval = siteWindow.clearInterval;
        const records = new Map();
        const engine = { records, acceleratedTicks: 0 };
        window.__sclpaArticleTimingEngine = engine;

        siteWindow.setInterval = function(callback, delay, ...args) {
            let articleCallback = false;
            if (typeof callback === 'function' && Number(delay) === 100 &&
                /\/(?:imageandtext|articleplayerpage)(?:[/?]|$)/i.test(location.hash)) {
                const source = Function.prototype.toString.call(callback);
                articleCallback = source.includes('precossTime') && source.includes('ImageAndTextInfo') && source.includes('totalSeconds');
            }
            if (!articleCallback) return nativeSetInterval.call(this, callback, delay, ...args);
            const record = { id: null, carry: 0, lastRate: 1, cancelled: false, lastTick: performance.now(), missingOwnerAt: null };
            record.id = scriptSetInterval(function(...callbackArgs) {
                const now = performance.now();
                const elapsed = now - record.lastTick;
                record.lastTick = now;
                const component = document.querySelector('.image-and-text')?.__vue__;
                const onArticle = /\/(?:imageandtext|articleplayerpage)(?:[/?]|$)/i.test(location.hash);
                if (!component) record.missingOwnerAt ??= now; else record.missingOwnerAt = null;
                if (!onArticle || (component?.countdown != null && component.countdown !== record.id) ||
                    (record.missingOwnerAt !== null && now - record.missingOwnerAt > 5000)) {
                    siteWindow.clearInterval(record.id);
                    return;
                }
                const active = GM_getValue('sclpa_service_active', true) && component?.countdown === record.id &&
                    /\/(?:imageandtext|articleplayerpage)(?:[/?]|$)/i.test(location.hash);
                const requested = Number(GM_getValue('sclpa_playback_rate', 1));
                const rate = active && Number.isFinite(requested) ? Math.min(16, Math.max(1, requested)) : 1;
                if (record.lastRate !== rate) record.carry = 0;
                record.lastRate = rate;
                // 用真实执行间隔维持倍率；长时间冻结不补算为已学习，更不积压完成请求。
                record.carry += rate * (elapsed > 2000 ? 1 : Math.max(0, elapsed / 100));
                const ticks = Math.floor(record.carry);
                record.carry -= ticks;
                for (let index = 0; index < ticks && !record.cancelled; index++) {
                    callback.apply(this, callbackArgs);
                    if (rate > 1) engine.acceleratedTicks++;
                }
            }, delay, ...args);
            records.set(record.id, record);
            return record.id;
        };
        siteWindow.clearInterval = function(id) {
            const record = records.get(id);
            if (record) {
                record.cancelled = true;
                records.delete(id);
                return scriptClearInterval(id);
            }
            return nativeClearInterval.call(this, id);
        };
    }

    /**
     * 后台播放守护。
     * 不重写全局 Object.defineProperty，也不伪造 document.hidden；前者会阻断本脚本
     * 为单个播放器安装的倍速 setter，后者会破坏站点自己的可见性逻辑。
     */
    function initializeVideoPlaybackFixes() {
        debugLog('[Script] 初始化后台播放守护：保留浏览器原生可见性与属性 API。');
    }

    /**
     * 当站点在页面失焦或后台暂停视频时，尝试恢复播放与当前倍速。
     * 浏览器仍可能对后台标签进行原生节流；本函数不会修改浏览器调度策略。
     */
    function installBackgroundPlaybackGuard(video, reapplySpeed) {
        if (!video || backgroundPlaybackGuards.has(video)) return;
        video.dataset.sclpaBackgroundGuardInstalled = 'true';

        let restoreTimer = null;
        const restorePlayback = () => {
            if (!isServiceActive || !video.isConnected || video.ended || restoreTimer) return;
            restoreTimer = scriptSetTimeout(() => {
                restoreTimer = null;
                if (!isServiceActive || !video.isConnected || video.ended) return;
                reapplySpeed();
                if (video.paused) {
                    video.play().catch(error => {
                        console.debug('[Script] 后台恢复播放被浏览器拒绝：', error);
                    });
                }
            }, 150);
        };

        const handleVisibilityChange = () => {
            if (video.ownerDocument.hidden) restorePlayback();
        };
        const handlePause = () => {
            if (video.ownerDocument.hidden && !video.ended) restorePlayback();
        };
        const ownerDocument = video.ownerDocument;
        const ownerWindow = ownerDocument.defaultView;
        ownerDocument.addEventListener('visibilitychange', handleVisibilityChange, true);
        window.addEventListener('blur', restorePlayback, true);
        if (ownerWindow && ownerWindow !== window) ownerWindow.addEventListener('blur', restorePlayback, true);
        video.addEventListener('pause', handlePause);
        backgroundPlaybackGuards.set(video, () => {
            scriptClearTimeout(restoreTimer);
            ownerDocument.removeEventListener('visibilitychange', handleVisibilityChange, true);
            window.removeEventListener('blur', restorePlayback, true);
            if (ownerWindow && ownerWindow !== window) ownerWindow.removeEventListener('blur', restorePlayback, true);
            video.removeEventListener('pause', handlePause);
            delete video.dataset.sclpaBackgroundGuardInstalled;
        });
    }

    function cleanupDetachedVideoGuards() {
        for (const [video, cleanup] of backgroundPlaybackGuards) {
            if (!video.isConnected) {
                cleanup();
                backgroundPlaybackGuards.delete(video);
            }
        }
    }


    /**
     * Safely navigate back to the corresponding course list
     * This function is now mostly a fallback, as direct button clicks are preferred.
     */
    function safeNavigateBackToList() {
        const hash = window.location.hash.toLowerCase();
        const returnUrl = hash.includes('public') || hash.includes('openplayer') || hash.includes('imageandtext') || hash.includes('openonlineexam')
            ? 'https://zyys.ihehang.com/#/publicDemand'
            : 'https://zyys.ihehang.com/#/specialized';
        debugLog(`[Script] Fallback: Navigating back to list: ${returnUrl}`);
        window.location.href = returnUrl;
    }

    /**
     * Decide next action after a course (including all its chapters) is completed.
     * This function is crucial for determining whether to proceed to exam or continue course swiping.
     */
    function safeNavigateAfterCourseCompletion() {
        const hash = window.location.hash.toLowerCase();
        currentNavContext = GM_getValue('sclpa_nav_context', ''); // Ensure context is fresh
        debugLog('[Script] safeNavigateAfterCourseCompletion called. Current hash:', hash, 'Context:', currentNavContext);

        // Check if the current page is a player page (video or article player)
        if (hash.includes('/majorplayerpage') || hash.includes('/articleplayerpage') || hash.includes('/openplayer') || hash.includes('/imageandtext')) {
            // If the navigation context is explicitly set to 'exam' (e.g., user clicked '专业课-考试' from panel)
            if (currentNavContext === 'exam') {
                const goToExamButton = findElementByText('button span', '前往考试');
                if (goToExamButton) {
                    debugLog('[Script] Course completed. Context is "exam". Found "前往考试" button, clicking it.');
                    currentExamListRoute = hash.includes('openplayer') || hash.includes('imageandtext')
                        ? 'https://zyys.ihehang.com/#/openOnlineExam'
                        : 'https://zyys.ihehang.com/#/onlineExam';
                    clickElement(goToExamButton.closest('button'));
                    return; // Exit after clicking exam button
                } else {
                    debugLog('[Script] Course completed. Context is "exam" but "前往考试" button not found, navigating back to exam list.');
                    // Navigate to appropriate exam list if '前往考试' isn't found
                    const examReturnUrl = hash.includes('openplayer') || hash.includes('imageandtext') ? 'https://zyys.ihehang.com/#/openOnlineExam' : 'https://zyys.ihehang.com/#/onlineExam';
                    currentExamListRoute = examReturnUrl;
                    window.location.href = examReturnUrl;
                    return;
                }
            } else {
                // For majorPlayerPage, navigation is now handled by the dedicated handler.
                if (hash.includes('/majorplayerpage')) {
                    debugLog('[Script] Professional Course completed. Awaiting main loop handler for navigation.');
                } else {
                    // For public courses (or other non-majorPlayerPage players), use general navigation
                    debugLog('[Script] Public Course completed. Navigating back to general course list.');
                    safeNavigateBackToList();
                }
                return; // Exit after attempting navigation
            }
        }

        // Fallback for other cases (e.g., if this function is called from a non-player page unexpectedly)
        debugLog('[Script] safeNavigateAfterCourseCompletion called from non-player page or unhandled scenario. Navigating back to general course list.');
        safeNavigateBackToList();
    }


    // ===================================================================================
    // --- 主循环与启动器 (Main Loop & Initiator) ---
    // ===================================================================================

    /**
     * [FIXED] Dedicated handler for the professional course player page (/majorPlayerPage).
     * This function's only job is to detect the final completion popup and navigate.
     * @returns {boolean} - Returns true if navigation was initiated, otherwise false.
     */
    function handleMajorPlayerPage() {
        // Priority 1: Check for the "Congratulations" popup. Its presence means the course is finished.
        const completionPopup = Array.from(document.querySelectorAll('.el-message-box'))
            .find(popup => isElementVisible(popup) && popup.innerText.includes('恭喜您已经完成所有课程学习'));
        if (completionPopup && completionPopup.innerText.includes('恭喜您已经完成所有课程学习')) {
            debugLog('[Script] Completion popup detected. This signifies the course is finished. Navigating to professional courses list.');
            const navButton = document.getElementById('nav-specialized-btn');
            if (navButton) {
                clickElement(navButton);
            } else {
                console.warn('[Script] Could not find "专业课程" button (nav-specialized-btn) for navigation. Falling back to URL change.');
                window.location.href = 'https://zyys.ihehang.com/#/specialized';
            }
            // Return true as we've initiated the final navigation action.
            return true;
        }

        // If no popup is found, it means the course is still in progress. Return false.
        return false;
    }


    /**
     * Page router, determines which handler function to execute based on URL hash
     */
    function router() {
        const hash = window.location.hash.toLowerCase();
        debugLog('[Script] Router: Current hash is', hash);
        if (hash.includes('/specialized')) {
            handleCourseListPage('专业课');
        } else if (hash.includes('/publicdemand')) {
            handleCourseListPage('公需课');
        } else if (hash.includes('/examination')) {
            handleExamPage();
        } else if (hash.includes('/majorplayerpage') || hash.includes('/articleplayerpage') || hash.includes('/openplayer') || hash.includes('/imageandtext')) {
             handleLearningPage();
        } else if (hash.includes('/onlineexam') || hash.includes('/openonlineexam')) {
            handleExamListPage();
        } else {
            debugLog('[Script] Router: No specific handler for current hash, idling.');
        }
    }

    /**
     * Main script loop, executed every 2 seconds
     */
    function mainLoop() {
        runtimeKeepAwake.sync();
        debugLog('[Script] Main loop running...');
        const currentHash = window.location.hash; // Get current hash at the start of the loop

        // Detect hash change to reset states
        if (currentHash !== currentPageHash) {
            const oldHash = currentPageHash;
            currentPageHash = currentHash; // Update currentPageHash
            debugLog(`[Script] Hash changed from ${oldHash} to ${currentHash}.`);
            // SPA 路由通常不会重载脚本；确认路由变化后允许下一阶段继续前进。
            allInOneTransitionPending = false;

            // If exiting an examination page, clean up AI panel and related flags
            if (oldHash.includes('/examination') && !currentHash.includes('/examination')) {
                const aiPanel = document.getElementById('ai-helper-panel');
                if (aiPanel) aiPanel.remove();
                currentQuestionBatchText = ''; // Reset batch text on exam page exit
                isAiAnswerPending = false;
                aiBatchGeneration++;
                isSubmittingExam = false;
                debugLog('[Script] Exited examination page, reset AI related flags.');
            }
        }

        // Always reset unfinishedTabClicked if we are on a course list page or exam list page.
        // This ensures that even if the hash doesn't change (e.g., page reload to same hash),
        // the "未完成" tab logic is re-evaluated.
        if (currentHash.includes('/specialized') || currentHash.includes('/publicdemand') ||
            currentHash.includes('/onlineexam') || currentHash.includes('/openonlineexam')) {
            if (unfinishedTabClicked) { // Only log if it's actually being reset
                debugLog('[Script] Resetting unfinishedTabClicked flag for current list page.');
            }
            unfinishedTabClicked = false;
        }

        if (isServiceActive) {
            // High-priority handler for the professional course player page.
            if (currentHash.toLowerCase().includes('/majorplayerpage')) {
                // If the handler initiates navigation, it returns true.
                // We should then skip the rest of the main loop for this cycle.
                if (handleMajorPlayerPage()) {
                    return;
                }
            }
            // Handle other generic popups
            handleGenericPopups();
        }

        // Route to the appropriate page handler
        router();
    }

    /**
     * Start the script
     */
    function startScript() {
        debugLog(`[Script] Sichuan Licensed Pharmacist Continuing Education (v1.4.0-beta.1) started.`);
        debugLog(`[Script] Service status: ${isServiceActive ? 'Running' : 'Paused'} | Current speed: ${currentPlaybackRate}x`);
        currentPageHash = window.location.hash;
        currentNavContext = GM_getValue('sclpa_nav_context', ''); // Load initial navigation context

        try {
            initializeVideoPlaybackFixes();
        } catch (e) {
            console.error('[Script Error] Failed to initialize video playback fixes during load:', e);
        }

        try {
            createModeSwitcherPanel(); // This creates the UI panel
        } catch (e) {
            console.error('[Script Error] Failed to create Mode Switcher Panel during load:', e);
        }

        runtimeKeepAwake.sync();

        // Start the main loop
        scriptSetInterval(mainLoop, 2000);
        debugLog('[Script] Main loop initiated.');
    }

    // 在站点创建文章计时器前安装；不启用旧的全局 Date/计时器加速。
    initializeArticleTimingEngine();

    // 脚本管理器可能在 load 已触发后注入；两种时机均走同一个启动入口。
    if (document.readyState === 'complete') {
        startScript();
    } else {
        window.addEventListener('load', startScript, { once: true });
    }

})();
