// ==UserScript==
// @name         四川省执业药师继续教育
// @namespace    http://tampermonkey.net/
// @version      1.3.5
// @description  【v1.3.5 | 增强计时】四川职业药师继续教育;增强页面计时加速功能，支持setTimeout/setInterval/Date全面加速；支持文章阅读计时加速；采用微软Fluent Design界面
// @author       Coren
// @match        https://www.sclpa.cn/*
// @match        https://zyys.ihehang.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.deepseek.com
// @connect      self
// @license CC BY-NC-SA 4.0
// license: https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans
// ==/UserScript==

// Script execution starts here. This log should appear first in console if script loads.
console.log(`[Script Init] Attempting to load Sichuan Licensed Pharmacist Continuing Education script.`);

(function() {
    'use strict';

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
    let unfinishedTabClicked = false; // Flag to track if "未完成" tab has been clicked in the current page session
    let isPopupBeingHandled = false;
    let isModePanelCreated = false;
    let currentPageHash = '';
    let isChangingChapter = false;
    let isAiAnswerPending = false; // Flag to track if AI answer is currently being awaited
    let currentQuestionBatchText = ''; // Renamed from currentQuestionText to reflect batch processing
    let isSubmittingExam = false; // Flag to indicate if exam submission process is ongoing
    let currentNavContext = GM_getValue('sclpa_nav_context', '');
    let hasSpeedChangeAlertShown = GM_getValue('sclpa_speed_alert_shown', false); // Flag to track if speed change alert has been shown


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
            console.log('[Script] Clicking element:', element);
            element.click();
        } else {
            console.warn('[Script] Attempted to click a non-existent or unclickable element:', element);
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
        if (typeof original === 'function') {
            object[methodName] = hooker(original);
            console.log(`[Script] Successfully hooked ${methodName}`);
        } else {
            console.warn(`[Script] Failed to hook ${methodName}: original is not a function.`);
        }
    }


    // ===================================================================================
    // --- UI面板管理 (UI Panel Management) ---
    // ===================================================================================

    /**
     * Create the modern script control panel with tabs
     */
    function createModeSwitcherPanel() {
        if (isModePanelCreated) {
            console.log('[Script] Mode switcher panel already created, skipping.');
            return;
        }
        isModePanelCreated = true;
        console.log('[Script] Attempting to create Modern Mode Switcher Panel...');

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
                    <h3>✨ 控制面板</h3>
                    <button id="mode-switcher-toggle-collapse">－</button>
                </div>
                <div id="mode-switcher-tabs">
                    <button class="tab-btn active" data-tab="control">🎮 控制</button>
                    <button class="tab-btn" data-tab="settings">⚙️ 设置</button>
                    <button class="tab-btn" data-tab="tutorial">📖 教程</button>
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
                            <div class="nav-grid">
                                <button id="nav-specialized-btn" class="nav-btn">
                                    <span class="nav-btn-icon">📚</span>
                                    <span class="nav-btn-text">专业课程</span>
                                    <span class="nav-btn-arrow">→</span>
                                </button>
                                <button id="nav-public-video-btn" class="nav-btn">
                                    <span class="nav-btn-icon">🎬</span>
                                    <span class="nav-btn-text">公需课-视频</span>
                                    <span class="nav-btn-arrow">→</span>
                                </button>
                                <button id="nav-public-article-btn" class="nav-btn">
                                    <span class="nav-btn-icon">📄</span>
                                    <span class="nav-btn-text">公需课-文章</span>
                                    <span class="nav-btn-arrow">→</span>
                                </button>
                                <button id="nav-specialized-exam-btn" class="nav-btn">
                                    <span class="nav-btn-icon">✍️</span>
                                    <span class="nav-btn-text">专业课-考试</span>
                                    <span class="nav-btn-arrow">→</span>
                                </button>
                            </div>
                            <div style="margin-top: 10px;">
                                <button id="nav-public-exam-btn" class="nav-btn">
                                    <span class="nav-btn-icon">📝</span>
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
                                <label for="speed-slider">视频倍速 (1-16x)</label>
                                <div class="speed-slider-container">
                                    <input type="range" id="speed-slider" min="1" max="16" step="0.5" value="${currentPlaybackRate}">
                                    <span id="speed-display">${currentPlaybackRate}x</span>
                                </div>
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
                                💾 保存设置
                            </button>
                        </div>
                    </div>
                    
                    <!-- 教程面板 -->
                    <div class="tab-content" id="tab-tutorial">
                        <div class="tutorial-content">
                            <div class="tutorial-section">
                                <h4>🚀 快速开始</h4>
                                <ul>
                                    <li>安装脚本后，屏幕右下角会出现控制面板</li>
                                    <li>点击相应按钮可快速跳转到不同学习模块</li>
                                    <li>开启服务后，脚本将自动完成刷课任务</li>
                                    <li>视频默认16倍速静音播放</li>
                                </ul>
                            </div>
                            
                            <div class="tutorial-section">
                                <h4>🤖 AI 助手</h4>
                                <ul>
                                    <li>在使用AI答题功能前，需先设置 DeepSeek API Key</li>
                                    <li>在"设置"标签页中输入您的 API Key 并保存</li>
                                    <li>获取 API Key：<a href="https://platform.deepseek.com/api_keys" target="_blank" class="tutorial-link">点击此处</a></li>
                                    <li>AI会自动处理考试题目并选择答案</li>
                                </ul>
                            </div>
                            
                            <div class="tutorial-section">
                                <h4>⚡ 功能说明</h4>
                                <ul>
                                    <li><strong>专业课程：</strong>自动播放视频课程，支持多章节切换</li>
                                    <li><strong>公需课-视频：</strong>自动播放视频，支持静音倍速</li>
                                    <li><strong>公需课-文章：</strong>自动计时，标记已读状态</li>
                                    <li><strong>考试：</strong>AI自动答题（需配置API Key）</li>
                                </ul>
                            </div>

                            <div class="tutorial-section">
                                <h4>🎬 视频倍速技术</h4>
                                <ul>
                                    <li><strong>增强倍速引擎：</strong>采用多重防护机制，确保倍速稳定生效</li>
                                    <li><strong>自动检测：</strong>支持主文档、iframe和Shadow DOM中的视频</li>
                                    <li><strong>实时监控：</strong>每秒检查并修正倍速设置</li>
                                    <li><strong>防护机制：</strong>阻止网页重置playbackRate属性</li>
                                    <li><strong>智能重试：</strong>自动适应视频加载和切换场景</li>
                                </ul>
                            </div>
                            
                            <div class="tutorial-warning">
                                <strong>⚠️ 注意事项：</strong>
                                <ul style="margin-top: 8px; margin-bottom: 0;">
                                    <li>请保持刷课页面始终处于前台</li>
                                    <li>不要折叠控制面板</li>
                                    <li>文章阅读建议配合 TimerHooker 脚本加速</li>
                                    <li>AI答题不能保证100%正确率</li>
                                </ul>
                            </div>
                            
                            <div class="tutorial-section">
                                <h4>📞 获取帮助</h4>
                                <ul>
                                    <li>GitHub：<a href="https://github.com/Cooanyh/zhiyeyaoshi" target="_blank" class="tutorial-link">访问项目主页</a></li>
                                    <li>问题反馈：在 GreasyFork 或 GitHub 提交 Issue</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            if (document.body) {
                document.body.appendChild(panel);
                console.log('[Script] Modern Mode Switcher Panel appended to body.');
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
                    isServiceActive = !isServiceActive;
                    GM_setValue('sclpa_service_active', isServiceActive);
                    window.location.reload();
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
                    console.log(`[Script] 播放倍速设置为: ${newRate}x，立即应用到所有视频...`);
                    applyCurrentVideoSpeed();
                    
                    if (!hasSpeedChangeAlertShown) {
                        setTimeout(() => {
                            alert(`✅ 播放倍速已更新为 ${newRate}x，并立即应用到当前页面！\n\n💡 如需在其他页面生效，刷新页面即可。`);
                            hasSpeedChangeAlertShown = true;
                            GM_setValue('sclpa_speed_alert_shown', true);
                        }, 100);
                    }
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
                        if (apiKeyStatus) {
                            apiKeyStatus.className = 'api-key-status configured';
                            apiKeyStatus.innerHTML = '✅ API Key 已保存！';
                        }
                        setTimeout(() => {
                            alert('API Key 已保存！下次页面加载时生效。');
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

            if (navSpecializedBtn) {
                navSpecializedBtn.onclick = () => {
                    GM_setValue('sclpa_nav_context', 'course');
                    window.location.href = 'https://zyys.ihehang.com/#/specialized';
                };
            }

            if (navPublicVideoBtn) {
                navPublicVideoBtn.onclick = () => {
                    GM_setValue('sclpa_public_target', 'video');
                    GM_setValue('sclpa_nav_context', 'course');
                    window.location.href = 'https://zyys.ihehang.com/#/publicDemand';
                };
            }

            if (navPublicArticleBtn) {
                navPublicArticleBtn.onclick = () => {
                    GM_setValue('sclpa_public_target', 'article');
                    GM_setValue('sclpa_nav_context', 'course');
                    window.location.href = 'https://zyys.ihehang.com/#/publicDemand';
                };
            }

            if (navSpecializedExamBtn) {
                navSpecializedExamBtn.onclick = () => {
                    GM_setValue('sclpa_nav_context', 'exam');
                    window.location.href = 'https://zyys.ihehang.com/#/onlineExam';
                };
            }

            if (navPublicExamBtn) {
                navPublicExamBtn.onclick = () => {
                    GM_setValue('sclpa_nav_context', 'exam');
                    window.location.href = 'https://zyys.ihehang.com/#/openOnlineExam';
                };
            }

            if (panel && document.getElementById('mode-switcher-header')) {
                makeDraggable(panel, document.getElementById('mode-switcher-header'));
            }
            console.log('[Script] Modern Mode Switcher Panel creation attempted and event listeners attached.');

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
            console.log('[Script] Removed existing AI helper panel.');
        }
        console.log('[Script] Attempting to create Modern AI Helper Panel...');

        try {
            GM_addStyle(`
                /* AI Helper Panel - Fluent Design */
                #ai-helper-panel {
                    position: fixed;
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
            `);
            
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
                console.log('[Script] Modern AI Helper Panel appended to body.');
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
                    if (!isApiKeyConfigured) {
                        resultDiv.innerHTML = '<span style="color: #dc3545;">❌ 错误：请先在控制面板中设置您的 DeepSeek API Key！</span>';
                        return;
                    }

                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<span class="ai-thinking"><span class="ai-thinking-dot"><span></span><span></span><span></span></span><span>AI思考中...</span>';
                    resultDiv.innerHTML = '<div class="ai-thinking"><span class="ai-thinking-dot"><span></span><span></span><span></span></span><span>正在向AI发送请求...</span></div>';
                    
                    try {
                        const answer = await askAiForAnswer(question);
                        resultDiv.innerHTML = `<div style="color: #28a745; margin-bottom: 8px;">✅ 已获取答案</div><div style="color: #333;">${answer}</div>`;
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
            console.log('[Script] Modern AI Helper Panel creation attempted and event listeners attached.');

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
    function askAiForAnswer(question) {
        return new Promise((resolve, reject) => {
            if (!CONFIG.AI_API_SETTINGS.API_KEY || CONFIG.AI_API_SETTINGS.API_KEY === '请在此处填入您自己的 DeepSeek API Key') {
                reject('API Key 未设置或不正确，请在控制面板中设置！');
                return;
            }
            const payload = {
                model: "deepseek-chat",
                messages: [{
                    "role": "system",
                    "content": "你是一个乐于助人的问题回答助手。聚焦于执业药师相关的内容，请根据用户提出的问题，提供准确、清晰的解答。注意回答时仅仅包括答案，不允许其他额外任何解释，输出为一行一道题目的答案，答案只能是题目序号:字母选项，不能包含文字内容。单选输出示例：1.A。多选输出示例：1.ABC。"
                }, {
                    "role": "user",
                    "content": question
                }],
                temperature: 0.2
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
        console.log(`[Script] handleCourseListPage called for ${courseType}.`);

        // Handle public course tab switching first
        if (courseType === '公需课') {
            const publicTarget = GM_getValue('sclpa_public_target', 'video');
            const targetTabText = publicTarget === 'article' ? '文章资讯' : '视频课程';
            const targetTab = findElementByText('.radioTab > .radio-tab-tag', targetTabText);
            if (targetTab && !targetTab.classList.contains('radio-tab-tag-ed')) {
                console.log(`[Script] Public Course: Target is ${targetTabText}, switching tab...`);
                clickElement(targetTab);
                // After clicking the tab, wait for content to load, then re-run this function
                setTimeout(() => handleCourseListPage(courseType), 1000); // Re-evaluate after tab switch
                return;
            }
        }

        const unfinishedTab = findElementByText('div.radio-tab-tag', '未完成');

        // Step 1: Click "未完成" tab if not already active
        // Removed `!unfinishedTabClicked` to ensure it keeps trying to click until active
        if (unfinishedTab && !isUnfinishedTabActive(unfinishedTab)) {
            console.log('[Script] Course List: Found "未完成" tab and it is not active, clicking it...');
            clickElement(unfinishedTab);
            // Set unfinishedTabClicked to true only after a successful click attempt
            // This flag is reset by mainLoop when hash changes to a list page.
            unfinishedTabClicked = true;
            // After clicking, wait for the page to filter/load the unfinished list
            setTimeout(() => {
                console.log('[Script] Course List: Waiting after clicking "未完成" tab, then re-evaluating...');
                // After delay, re-call handleCourseListPage to re-check the active state and proceed.
                handleCourseListPage(courseType);
            }, 3000); // Increased delay to 3 seconds for tab content to load
            return; // Crucial to prevent immediate fall-through to course finding
        }

        // Step 2: If "未完成" tab is active, proceed to find and click the first unfinished course.
        // This block will only execute if the tab is truly active.
        if (unfinishedTab && isUnfinishedTabActive(unfinishedTab)) {
            setTimeout(() => {
                let targetCourseElement = document.querySelector('.play-card:not(:has(.el-icon-success))');

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
                    console.log(`[Script] ${courseType}: Found the first unfinished item, clicking to enter study...`);
                    const clickableElement = targetCourseElement.querySelector('.play-card-box-right-text') || targetCourseElement;
                    clickElement(clickableElement);
                } else {
                    console.log(`[Script] ${courseType}: No unfinished items found on "未完成" page. All courses might be completed or elements not yet loaded.`);
                }
            }, 1500); // Delay before finding the course element
        }
    }

    /**
     * Main handler for learning page
     */
    function handleLearningPage() {
        if (!isServiceActive) return;
        console.log('[Script] handleLearningPage called.');
        if (!isTimeAccelerated) {
            accelerateTime();
            initializeEnhancedVideoSpeedEngine();
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
     * [FIXED] Handle multi-chapter courses (professional courses)
     * @param {NodeListOf<Element>} directoryItems
     */
    function handleMultiChapterCourse(directoryItems) {
        if (isChangingChapter) return;
        console.log('[Script] handleMultiChapterCourse called.');
        const video = document.querySelector('video');

        // [FIX] Ensure video object exists before proceeding
        if (!video) {
            console.log('[Script] Video element not found, waiting...');
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
            if (!item.querySelector('.el-icon-success')) {
                nextChapter = item;
                break;
            }
        }

        if (nextChapter) {
            const isAlreadySelected = nextChapter.classList.contains('catalogue-item-ed');
            if (isAlreadySelected) { // If it's the correct chapter but paused
                console.log('[Script] Current chapter is correct but video is paused, attempting to play.');
                video.play().catch(e => { console.error('[Script Error] Failed to play video:', e); });
            } else { // If we need to switch to the next chapter
                console.log('[Script] Moving to next chapter:', nextChapter.innerText.trim());
                clickElement(nextChapter);
                isChangingChapter = true;
                setTimeout(() => { isChangingChapter = false; }, 4000); // Give time for chapter to load
            }
        } else {
            // All chapters have the success icon. The main loop will now handle navigation via handleMajorPlayerPage.
            console.log('[Script] All chapters appear to be complete. The main loop will verify and navigate.');
        }
    }


    /**
     * [FIXED] Handle single media courses (public courses)
     * @param {HTMLVideoElement} video
     */
    function handleSingleMediaCourse(video) {
        console.log('[Script] handleSingleMediaCourse called.');
        if (!video.dataset.singleVidControlled) {
            video.addEventListener('ended', safeNavigateAfterCourseCompletion);
            video.dataset.singleVidControlled = 'true';
            console.log('[Script] Added "ended" event listener for single media course.');
        }

        // [FIX] Always set playbackRate and muted properties.
        video.playbackRate = CONFIG.VIDEO_PLAYBACK_RATE;
        video.muted = true;

        if (video.paused) {
            console.log('[Script] Single media video paused, attempting to play.');
            video.play().catch(e => { console.error('[Script Error] Failed to play single media video:', e); });
        }
    }

    /**
     * Handle article reading page
     */
    function handleArticleReadingPage() {
        console.log('[Script] handleArticleReadingPage called.');
        const progressLabel = document.querySelector('.action-btn .label');
        if (progressLabel && (progressLabel.innerText.includes('100') || progressLabel.innerText.includes('待考试'))) {
            console.log('[Script] Article study completed, preparing to return to list.');
            safeNavigateAfterCourseCompletion();
        } else {
            console.log('[Script] Article progress not yet 100% or "待考试".');
        }
    }

    /**
     * Handle exam page (where the actual questions are displayed)
     * Automatically copies question to AI helper and processes the AI answer.
     */
    function handleExamPage() {
        if (!isServiceActive) return; // Only run if service is active
        console.log('[Script] handleExamPage called.');

        currentNavContext = GM_getValue('sclpa_nav_context', ''); // Ensure context is fresh
        if (currentNavContext === 'course') {
            console.log('[Script] Current navigation context is "course". Ignoring exam automation and navigating back to course list.');
            safeNavigateBackToList();
            return;
        }

        if (isSubmittingExam) {
            console.log('[Script] Exam submission in progress, deferring AI processing.');
            return;
        }

        if (!document.getElementById('ai-helper-panel')) {
            createManualAiHelper();
            setTimeout(() => {
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
        const aiHelperTextarea = document.getElementById('ai-helper-textarea');
        const aiHelperSubmitBtn = document.getElementById('ai-helper-submit-btn');
        const aiHelperResultDiv = document.getElementById('ai-helper-result');

        if (examinationItems.length === 0 || !aiHelperTextarea || !aiHelperSubmitBtn || !aiHelperResultDiv) {
            console.log('[Script] No examination items found or AI helper elements missing. Cannot trigger AI.');
            return;
        }

        let fullQuestionBatchContent = '';
        examinationItems.forEach(item => {
            fullQuestionBatchContent += item.innerText.trim() + '\n\n'; // Concatenate all questions
        });

        // Only process if the batch of questions has changed and AI answer is not pending
        if (fullQuestionBatchContent && fullQuestionBatchContent !== currentQuestionBatchText && !isAiAnswerPending) {
            currentQuestionBatchText = fullQuestionBatchContent; // Update current batch text
            aiHelperTextarea.value = fullQuestionBatchContent; // Set textarea value with all questions
            aiHelperResultDiv.innerText = '正在向AI发送请求...';
            console.log('[Script] New batch of exam questions copied to AI helper textarea, triggering AI query...');

            isAiAnswerPending = true;

            clickElement(aiHelperSubmitBtn);

            let attempts = 0;
            const maxAttempts = 300; // Max 300 attempts * 500ms = 60 seconds
            const checkInterval = 500;

            const checkAiResult = setInterval(() => {
                if (aiHelperResultDiv.innerText.trim() && aiHelperResultDiv.innerText.trim() !== '正在向AI发送请求...' && aiHelperResultDiv.innerText.trim() !== '请先提问...') {
                    clearInterval(checkAiResult);
                    isAiAnswerPending = false;
                    console.log('[Script] AI response received:', aiHelperResultDiv.innerText.trim());
                    parseAndSelectAllAnswers(aiHelperResultDiv.innerText.trim()); // Call new function to handle all answers

                    setTimeout(() => {
                        handleNextQuestionOrSubmitExam(); // After all answers are selected, move to next step
                    }, 1000);
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkAiResult);
                    isAiAnswerPending = false;
                    console.log('[Script] Timeout waiting for AI response for question batch.');
                    aiHelperResultDiv.innerText = 'AI请求超时，请手动重试。';
                    setTimeout(() => {
                        handleNextQuestionOrSubmitExam();
                    }, 1000);
                }
                attempts++;
            }, checkInterval);

        } else if (isAiAnswerPending) {
            console.log('[Script] AI answer already pending for current question batch, skipping new query.');
        } else if (fullQuestionBatchContent === currentQuestionBatchText) {
            console.log('[Script] Question batch content has not changed, skipping AI query.');
        }
    }


    /**
     * Parses the AI response and automatically selects the corresponding options for all questions on the exam page.
     * @param {string} aiResponse - The raw response string from the AI (e.g., "1.A\n2.BC\n3.D").
     */
    function parseAndSelectAllAnswers(aiResponse) {
        const aiAnswerLines = aiResponse.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        const examinationItems = document.querySelectorAll('.examination-body-item');

        const aiAnswersMap = new Map(); // Map to store {questionNumber: answerLetters}
        aiAnswerLines.forEach(line => {
            const parts = line.split('.');
            if (parts.length >= 2) {
                const qNum = parseInt(parts[0]);
                const ansLetters = parts[1].toUpperCase();
                if (!isNaN(qNum) && ansLetters) {
                    aiAnswersMap.set(qNum, ansLetters);
                } else {
                    console.warn(`[Script] Invalid AI response line format or content: ${line}`);
                }
            } else {
                console.warn(`[Script] Invalid AI response line format: ${line}`);
            }
        });

        examinationItems.forEach(item => {
            const questionTitleElement = item.querySelector('.examination-body-title');
            if (questionTitleElement) {
                const match = questionTitleElement.innerText.trim().match(/^(\d+)、/);
                const questionNumber = match ? parseInt(match[1]) : null;

                if (questionNumber !== null && aiAnswersMap.has(questionNumber)) {
                    const answerLetters = aiAnswersMap.get(questionNumber);
                    console.log(`[Script] Processing Q${questionNumber}: Selecting options ${answerLetters}`);

                    for (const letter of answerLetters) {
                        const optionText = `${letter}.`;
                        // Find options specific to this question item
                        const optionElement = Array.from(item.querySelectorAll('.examination-check-item')).find(el =>
                            el.innerText.trim().startsWith(optionText)
                        );

                        if (optionElement) {
                            console.log(`[Script] Selecting option: ${letter} for Q${questionNumber}`);
                            clickElement(optionElement);
                        } else {
                            console.warn(`[Script] Option '${letter}' not found for Q${questionNumber} using text '${optionText}'.`);
                        }
                    }
                } else if (questionNumber === null) {
                    console.warn('[Script] Could not extract question number from item:', item.innerText.trim().substring(0, 50) + '...');
                } else {
                    console.log(`[Script] No AI answer found for Q${questionNumber} in AI response. Skipping.`);
                }
            }
        });
        console.log('[Script] Finished parsing and selecting all answers on current page.');
    }


    /**
     * Handles navigation after answering a question: either to the next question or submits the exam.
     */
    function handleNextQuestionOrSubmitExam() {
        if (!isServiceActive || isSubmittingExam) {
            console.log('[Script] Service inactive or exam submission in progress, deferring next step.');
            return;
        }
        console.log('[Script] handleNextQuestionOrSubmitExam called.');

        // First, try to find the "下一题" button
        const nextQuestionButton = findElementByText('button span', '下一题');

        if (nextQuestionButton) {
            console.log('[Script] Found "下一题" button, clicking it...');
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
                console.log('[Script] "下一题" not found. Found "提交试卷" button, clicking it...');
                isSubmittingExam = true;
                clickElement(submitExamButton.closest('button'));

                setTimeout(() => {
                    console.log('[Script] Exam submitted. Navigating back to exam list page...');
                    const hash = window.location.hash.toLowerCase();
                    const returnUrl = hash.includes('openonlineexam')
                        ? 'https://zyys.ihehang.com/#/openOnlineExam'
                        : 'https://zyys.ihehang.com/#/onlineExam';
                    window.location.href = returnUrl;
                    isSubmittingExam = false;
                    currentQuestionBatchText = ''; // Clear for next exam cycle
                }, 3000);
            } else {
                console.log('[Script] Neither "下一题" nor "提交试卷" button found. Check page state or selectors.');
            }
        }
    }


    /**
     * Handle exam list page (e.g., #/onlineExam or #/openOnlineExam)
     * This function will find and click the "待考试" tab if it's not already active,
     * then find and click the "开始考试" button for the first pending exam.
     */
    function handleExamListPage() {
        if (!isServiceActive) return;
        console.log('[Script] handleExamListPage called.');

        const currentHash = window.location.hash.toLowerCase();
        currentNavContext = GM_getValue('sclpa_nav_context', '');

        // If the context is 'course', we should not be automating exams. Navigate back.
        if (currentNavContext === 'course') {
            console.log('[Script] Current navigation context is "course". Ignoring exam automation and navigating back to course list.');
            safeNavigateBackToList();
            return;
        }

        const pendingExamTab = findElementByText('div.radio-tab-tag', '待考试');

        if (pendingExamTab && !isUnfinishedTabActive(pendingExamTab)) {
            console.log('[Script] Found "待考试" tab, clicking it...');
            clickElement(pendingExamTab);
            // After clicking, wait for the content to load, then re-evaluate
            setTimeout(() => {
                handleExamListPage();
            }, 2500);
            return;
        } else if (pendingExamTab && isUnfinishedTabActive(pendingExamTab)) {
            // Check for "暂无数据" if on professional exam page
            if (currentHash.includes('/onlineexam')) {
                const emptyDataText = document.querySelector('.el-table__empty-text');
                if (emptyDataText && emptyDataText.innerText.includes('暂无数据')) {
                    console.log('[Script] Professional Exam List: Detected "暂无数据". Switching to Public Exam List.');
                    window.location.href = 'https://zyys.ihehang.com/#/openOnlineExam';
                    return; // Exit after navigation
                }
            }

            // If not "暂无数据" or on public exam page, attempt to start exam
            console.log('[Script] "待考试" tab is active. Attempting to find "开始考试" button...');
            attemptClickStartExamButton();
        } else {
            console.log('[Script] No "待考试" tab or pending exam found. All exams might be completed.');
            // If all exams are completed, or no pending tab, the script will idle here.
        }
    }

    /**
     * Attempts to find and click the "开始考试" button for the first available exam.
     */
    function attemptClickStartExamButton() {
        const startExamButton = findElementByText('button.el-button--danger span', '开始考试');

        if (startExamButton) {
            console.log('[Script] Found "开始考试" button, clicking it...');
            clickElement(startExamButton.closest('button'));
        } else {
            console.log('[Script] "开始考试" button not found on the page.');
        }
    }


    /**
     * Handle generic popups, including the "前往考试" popup after course completion.
     */
    function handleGenericPopups() {
        if (!isServiceActive || isPopupBeingHandled) return;
        console.log('[Script] handleGenericPopups called.');

        const currentHash = window.location.hash.toLowerCase(); // Get current hash here
        const examCompletionPopupMessage = document.querySelector('.el-message-box__message p');
        const goToExamBtnInPopup = findElementByText('button.el-button--primary span', '前往考试');
        const cancelBtnInPopup = findElementByText('button.el-button--default span', '取消');

        if (examCompletionPopupMessage && examCompletionPopupMessage.innerText.includes('恭喜您已经完成所有课程学习') && goToExamBtnInPopup && cancelBtnInPopup) {
            // If on major player page, the new dedicated handler will manage this popup.
            if (currentHash.includes('/majorplayerpage')) {
                return;
            }

            currentNavContext = GM_getValue('sclpa_nav_context', '');
            // Only handle this popup for course completion context on non-majorPlayerPage
            if (currentNavContext === 'course') {
                console.log('[Script] Detected "恭喜您" completion popup on non-majorPlayerPage. Clicking "取消".');
                isPopupBeingHandled = true;
                clickElement(cancelBtnInPopup.closest('button'));
                setTimeout(() => { isPopupBeingHandled = false; }, 1000); // Reset flag after delay
                return;
            }
        }

        const genericBtn = findElementByText('button span', '确定') || findElementByText('button span', '进入下一节学习');
        if (genericBtn) {
            console.log(`[Script] Detected generic popup button: ${genericBtn.innerText.trim()}. Clicking it.`);
            isPopupBeingHandled = true;
            clickElement(genericBtn.closest('button'));
            setTimeout(() => { isPopupBeingHandled = false; }, 2500);
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
                    console.log(`[Script] 动态应用倍速: ${targetRate}x (从 ${currentRate}x 调整)`);
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

        if (isTimeAccelerated) {
            console.log(`[Script] 重新初始化增强版倍速引擎，倍速: ${targetRate}x`);
            initializeEnhancedVideoSpeedEngine();
        }

        const speedDisplay = document.getElementById('speed-display');
        if (speedDisplay) {
            speedDisplay.textContent = `${targetRate}x`;
        }

        console.log(`[Script] 动态倍速应用完成: ${targetRate}x`);
    }

    /**
     * [增强版视频倍速引擎 v2] 专门针对HTML5视频播放器的高强度倍速控制
     * 参考time.user.js和time-hooker的VideoSpeedModule实现
     * 增强功能：防止视频暂停、自动恢复播放、多重防护
     */
    function initializeEnhancedVideoSpeedEngine() {
        console.log(`[Script] Enhanced HTML5 Video Speed Engine v2 started, rate: ${CONFIG.VIDEO_PLAYBACK_RATE}x`);

        const targetRate = CONFIG.VIDEO_PLAYBACK_RATE;
        const monitoredVideos = new WeakSet();

        function applyVideoSpeed(video) {
            if (!video || video.nodeType !== Node.ELEMENT_NODE) return;
            
            const currentRate = video.playbackRate;
            if (Math.abs(currentRate - targetRate) > 0.01) {
                try {
                    video.playbackRate = targetRate;
                    console.log(`[Script] 增强倍速已应用: ${targetRate}x (原倍速: ${currentRate}x)`);
                } catch (e) {
                    console.warn('[Script] 应用倍速失败:', e);
                }
            }
        }

        function applySpeedToAllVideos() {
            document.querySelectorAll('video').forEach(video => {
                applyVideoSpeed(video);
                if (!monitoredVideos.has(video)) {
                    monitoredVideos.add(video);
                    enhanceVideoMonitoring(video);
                }
            });

            try {
                document.querySelectorAll('iframe').forEach(iframe => {
                    iframe.contentDocument?.querySelectorAll('video').forEach(video => {
                        applyVideoSpeed(video);
                        if (!monitoredVideos.has(video)) {
                            monitoredVideos.add(video);
                            enhanceVideoMonitoring(video);
                        }
                    });
                });
            } catch (e) {
            }

            document.querySelectorAll('*').forEach(el => {
                if (el.shadowRoot) {
                    el.shadowRoot.querySelectorAll('video').forEach(video => {
                        applyVideoSpeed(video);
                        if (!monitoredVideos.has(video)) {
                            monitoredVideos.add(video);
                            enhanceVideoMonitoring(video);
                        }
                    });
                }
            });
        }

        function enhanceVideoMonitoring(video) {
            if (!video) return;

            const descriptor = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'playbackRate');
            if (descriptor && descriptor.set) {
                const originalSetter = descriptor.set;
                Object.defineProperty(video, 'playbackRate', {
                    get: function() {
                        return originalSetter.call(this);
                    },
                    set: function(value) {
                        if (Math.abs(value - targetRate) > 0.01) {
                            console.log(`[Script] 拦截playbackRate设置: ${value} → ${targetRate}`);
                            return originalSetter.call(this, targetRate);
                        }
                        return originalSetter.call(this, value);
                    },
                    configurable: true,
                    enumerable: true
                });
            }

            hook(video, 'play', (original) => async function(...args) {
                const result = original.apply(this, args);
                setTimeout(() => {
                    applyVideoSpeed(this);
                    if (this.paused && !document.hidden) {
                        this.play().catch(() => {});
                    }
                }, 50);
                return result;
            });

            hook(video, 'pause', (original) => function(...args) {
                if (!document.hidden) {
                    console.log('[Script] 拦截视频暂停，保持播放状态');
                    return;
                }
                return original.apply(this, args);
            });

            video.addEventListener('ratechange', () => {
                if (Math.abs(video.playbackRate - targetRate) > 0.01) {
                    console.log('[Script] 检测到倍速变化，正在恢复...');
                    setTimeout(() => applyVideoSpeed(video), 10);
                }
            });

            video.addEventListener('loadedmetadata', () => {
                setTimeout(() => applyVideoSpeed(video), 100);
            });
        }

        applySpeedToAllVideos();

        const observer = new MutationObserver((mutations) => {
            let shouldScan = false;
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeName === 'VIDEO' || (node.querySelectorAll && node.querySelectorAll('video').length > 0)) {
                            shouldScan = true;
                        }
                    });
                }
            });
            if (shouldScan) {
                setTimeout(applySpeedToAllVideos, 100);
            }
        });

        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });

        hook(Object, 'defineProperty', (original) => function(target, property, descriptor) {
            if (target instanceof HTMLMediaElement && property === 'playbackRate') {
                console.log('[Script] 拦截defineProperty锁定playbackRate');
                descriptor.value = targetRate;
                descriptor.writable = true;
            }
            return original.apply(this, arguments);
        });

        hook(HTMLMediaElement.prototype, 'setAttribute', (original) => function(name, value) {
            if (this instanceof HTMLVideoElement && name.toLowerCase() === 'playbackrate') {
                console.log('[Script] 拦截setAttribute设置playbackRate');
                return;
            }
            return original.apply(this, arguments);
        });

        setInterval(applySpeedToAllVideos, 1000);

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(applySpeedToAllVideos, 500);
            });
        }

        console.log('[Script] 增强版视频倍速引擎 v2 已启动，多重防护机制已激活');
    }

    /**
     * [Time Engine] Global time acceleration, including setTimeout, setInterval, and requestAnimationFrame
     */
    function accelerateTime() {
        console.log(`[Script] Time acceleration engine started, rate: ${CONFIG.TIME_ACCELERATION_RATE}x`);

        const rate = CONFIG.TIME_ACCELERATION_RATE;
        const percentage = 1 / rate;

        let scriptStartTime = Date.now();
        let lastDateTime = scriptStartTime;
        let lastModifiedTime = scriptStartTime;

        const DateOrigin = window.Date;
        let DateModified = window.Date;

        const trackedIntervals = new Map();
        const trackedTimeouts = new Map();

        let timerIdCounter = 0;

        try {
            const setTimeoutOrigin = window.setTimeout;
            const setIntervalOrigin = window.setInterval;
            const clearTimeoutOrigin = window.clearTimeout;
            const clearIntervalOrigin = window.clearInterval;

            window.setTimeout = function(callback, delay, ...args) {
                if (typeof delay !== 'number' || delay <= 0) {
                    return setTimeoutOrigin.call(window, callback, delay, ...args);
                }

                const originalDelay = delay;
                const hookedDelay = Math.floor(originalDelay * percentage);
                const timerId = setTimeoutOrigin.call(window, function() {
                    trackedTimeouts.delete(timerId);
                    if (typeof callback === 'function') {
                        callback.apply(this, arguments);
                    } else if (typeof callback === 'string') {
                        eval(callback);
                    }
                }, hookedDelay, ...args);

                trackedTimeouts.set(timerId, {
                    args: [callback, originalDelay, ...args],
                    originDelay: originalDelay,
                    hookedDelay: hookedDelay
                });

                return timerId;
            };

            window.setInterval = function(callback, delay, ...args) {
                if (typeof delay !== 'number' || delay <= 0) {
                    return setIntervalOrigin.call(window, callback, delay, ...args);
                }

                const originalDelay = delay;
                const hookedDelay = Math.floor(originalDelay * percentage);
                const intervalId = setIntervalOrigin.call(window, callback, hookedDelay, ...args);

                trackedIntervals.set(intervalId, {
                    args: [callback, originalDelay, ...args],
                    originDelay: originalDelay,
                    hookedDelay: hookedDelay
                });

                return intervalId;
            };

            window.clearTimeout = function(timerId) {
                trackedTimeouts.delete(timerId);
                return clearTimeoutOrigin.call(window, timerId);
            };

            window.clearInterval = function(intervalId) {
                trackedIntervals.delete(intervalId);
                return clearIntervalOrigin.call(window, intervalId);
            };

            window.Date = function(...args) {
                if (args.length === 0) {
                    const now = DateOrigin.now();
                    const delta = now - lastDateTime;
                    const adjustedDelta = delta * rate;
                    const newTime = lastModifiedTime + adjustedDelta;
                    lastModifiedTime = newTime;
                    lastDateTime = now;
                    return new Date(newTime);
                } else if (args.length === 1 && typeof args[0] === 'number') {
                    return new DateOrigin(args[0]);
                } else {
                    return new (Function.prototype.bind.apply(DateOrigin, [null].concat(args)))();
                }
            };

            window.Date.prototype = DateOrigin.prototype;
            window.Date.now = function() {
                const now = DateOrigin.now();
                const delta = now - lastDateTime;
                const adjustedDelta = delta * rate;
                const newTime = lastModifiedTime + adjustedDelta;
                return Math.floor(newTime);
            };
            window.Date.prototype.now = window.Date.now;

            const originalDateToString = DateOrigin.prototype.toString;
            window.Date.prototype.toString = function() {
                const now = DateOrigin.now();
                const delta = now - lastDateTime;
                const adjustedDelta = delta * rate;
                const newTime = lastModifiedTime + adjustedDelta;
                const fakeDate = new DateOrigin(newTime);
                return originalDateToString.call(fakeDate);
            };

            window.Date.prototype.getTime = function() {
                const now = DateOrigin.now();
                const delta = now - lastDateTime;
                const adjustedDelta = delta * rate;
                return lastModifiedTime + adjustedDelta;
            };

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

            console.log(`[Script] Time acceleration hooks applied successfully (rate: ${rate}x)`);
        } catch (e) {
            console.error('[Script Error] Failed to apply time acceleration hooks:', e);
        }
    }

    /**
     * Initializes video playback fixes including rate anti-rollback and background playback prevention.
     */
    function initializeVideoPlaybackFixes() {
        console.log('[Script] Initializing video playback fixes (rate anti-rollback and background playback).');

        try {
            // 1. Prevent webpage from resetting video playback rate
            hook(Object, 'defineProperty', (original) => function(target, property, descriptor) {
                if (target instanceof HTMLMediaElement && property === 'playbackRate') {
                    console.log('[Script] Detected website attempting to lock video playback rate, intercepted.');
                    return; // Prevent original defineProperty call for playbackRate
                }
                return original.apply(this, arguments);
            });

            // 2. Prevent video pausing when tab is in background by faking visibility state
            Object.defineProperty(document, "hidden", {
                get: function() {
                    return false;
                },
                configurable: true
            });
            Object.defineProperty(document, "visibilityState", {
                get: function() {
                    return "visible";
                },
                configurable: true
            });
            console.log('[Script] Document visibility state faked successfully.');
        } catch (e) {
            console.error('[Script Error] Failed to initialize video playback fixes:', e);
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
        console.log(`[Script] Fallback: Navigating back to list: ${returnUrl}`);
        window.location.href = returnUrl;
    }

    /**
     * Decide next action after a course (including all its chapters) is completed.
     * This function is crucial for determining whether to proceed to exam or continue course swiping.
     */
    function safeNavigateAfterCourseCompletion() {
        const hash = window.location.hash.toLowerCase();
        currentNavContext = GM_getValue('sclpa_nav_context', ''); // Ensure context is fresh
        console.log('[Script] safeNavigateAfterCourseCompletion called. Current hash:', hash, 'Context:', currentNavContext);

        // Check if the current page is a player page (video or article player)
        if (hash.includes('/majorplayerpage') || hash.includes('/articleplayerpage') || hash.includes('/openplayer') || hash.includes('/imageandtext')) {
            // If the navigation context is explicitly set to 'exam' (e.g., user clicked '专业课-考试' from panel)
            if (currentNavContext === 'exam') {
                const goToExamButton = findElementByText('button span', '前往考试');
                if (goToExamButton) {
                    console.log('[Script] Course completed. Context is "exam". Found "前往考试" button, clicking it.');
                    clickElement(goToExamButton.closest('button'));
                    return; // Exit after clicking exam button
                } else {
                    console.log('[Script] Course completed. Context is "exam" but "前往考试" button not found, navigating back to exam list.');
                    // Navigate to appropriate exam list if '前往考试' isn't found
                    const examReturnUrl = hash.includes('openplayer') || hash.includes('imageandtext') ? 'https://zyys.ihehang.com/#/openOnlineExam' : 'https://zyys.ihehang.com/#/onlineExam';
                    window.location.href = examReturnUrl;
                    return;
                }
            } else {
                // For majorPlayerPage, navigation is now handled by the dedicated handler.
                if (hash.includes('/majorplayerpage')) {
                    console.log('[Script] Professional Course completed. Awaiting main loop handler for navigation.');
                } else {
                    // For public courses (or other non-majorPlayerPage players), use general navigation
                    console.log('[Script] Public Course completed. Navigating back to general course list.');
                    safeNavigateBackToList();
                }
                return; // Exit after attempting navigation
            }
        }

        // Fallback for other cases (e.g., if this function is called from a non-player page unexpectedly)
        console.log('[Script] safeNavigateAfterCourseCompletion called from non-player page or unhandled scenario. Navigating back to general course list.');
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
        const completionPopup = document.querySelector('.el-message-box');
        if (completionPopup && completionPopup.innerText.includes('恭喜您已经完成所有课程学习')) {
            console.log('[Script] Completion popup detected. This signifies the course is finished. Navigating to professional courses list.');
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
        console.log('[Script] Router: Current hash is', hash);
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
            console.log('[Script] Router: No specific handler for current hash, idling.');
        }
    }

    /**
     * Main script loop, executed every 2 seconds
     */
    function mainLoop() {
        console.log('[Script] Main loop running...');
        const currentHash = window.location.hash; // Get current hash at the start of the loop

        // Detect hash change to reset states
        if (currentHash !== currentPageHash) {
            const oldHash = currentPageHash;
            currentPageHash = currentHash; // Update currentPageHash
            console.log(`[Script] Hash changed from ${oldHash} to ${currentHash}.`);

            // If exiting an examination page, clean up AI panel and related flags
            if (oldHash.includes('/examination') && !currentHash.includes('/examination')) {
                const aiPanel = document.getElementById('ai-helper-panel');
                if (aiPanel) aiPanel.remove();
                currentQuestionBatchText = ''; // Reset batch text on exam page exit
                isAiAnswerPending = false;
                isSubmittingExam = false;
                console.log('[Script] Exited examination page, reset AI related flags.');
            }
        }

        // Always reset unfinishedTabClicked if we are on a course list page or exam list page.
        // This ensures that even if the hash doesn't change (e.g., page reload to same hash),
        // the "未完成" tab logic is re-evaluated.
        if (currentHash.includes('/specialized') || currentHash.includes('/publicdemand') ||
            currentHash.includes('/onlineexam') || currentHash.includes('/openonlineexam')) {
            if (unfinishedTabClicked) { // Only log if it's actually being reset
                console.log('[Script] Resetting unfinishedTabClicked flag for current list page.');
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
    window.addEventListener('load', () => {
        console.log(`[Script] Sichuan Licensed Pharmacist Continuing Education (v1.3.1) started.`);
        console.log(`[Script] Service status: ${isServiceActive ? 'Running' : 'Paused'} | Current speed: ${currentPlaybackRate}x`);
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

        // Start the main loop
        setInterval(mainLoop, 2000);
        console.log('[Script] Main loop initiated.');
    });

})();
