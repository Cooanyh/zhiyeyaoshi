// ==UserScript==
// @name         四川省执业药师继续教育
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  【v1.3.0 | 优化】四川职业药师继续教育;全新现代化GUI界面，新增教程标签页，提升用户体验
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
    let unfinishedTabClicked = false; // Flag to track if "未完成" tab has been clicked in the current page session
    let isPopupBeingHandled = false;
    let isModePanelCreated = false;
    let currentPageHash = '';
    let isChangingChapter = false;
    let isAiAnswerPending = false; // Flag to track if AI answer is currently being awaited
    let currentQuestionBatchText = ''; // Renamed from currentQuestionText to reflect batch processing
    let isSubmittingExam = false; // Flag to indicate if exam submission process is ongoing
    let currentNavContext = GM_getValue('sclpa_nav_context', '');


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
                #mode-switcher-panel { position: fixed; bottom: 20px; right: 20px; width: 380px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); z-index: 10000; overflow: hidden; font-family: 'Microsoft YaHei', -apple-system, sans-serif; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
                #mode-switcher-panel:hover { transform: translateY(-2px); box-shadow: 0 15px 50px rgba(0,0,0,0.25); }
                #mode-switcher-panel.collapsed { width: 200px; }
                #mode-switcher-header { padding: 15px 20px; background: rgba(255,255,255,0.15); backdrop-filter: blur(10px); color: white; cursor: move; user-select: none; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); }
                #mode-switcher-header h3 { margin: 0; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
                #mode-switcher-toggle-collapse { background: rgba(255,255,255,0.2); border: none; color: white; font-size: 18px; cursor: pointer; padding: 6px 12px; border-radius: 8px; transition: all 0.3s; }
                #mode-switcher-toggle-collapse:hover { background: rgba(255,255,255,0.3); transform: scale(1.05); }
                
                #mode-switcher-tabs { display: flex; background: rgba(255,255,255,0.1); padding: 10px; gap: 8px; }
                .tab-btn { flex: 1; padding: 10px 16px; background: rgba(255,255,255,0.1); border: none; color: rgba(255,255,255,0.8); font-size: 14px; cursor: pointer; border-radius: 10px; transition: all 0.3s; font-weight: 500; }
                .tab-btn:hover { background: rgba(255,255,255,0.2); color: white; }
                .tab-btn.active { background: white; color: #667eea; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
                
                #mode-switcher-content { padding: 20px; background: white; max-height: 450px; overflow-y: auto; }
                #mode-switcher-content::-webkit-scrollbar { width: 6px; }
                #mode-switcher-content::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
                #mode-switcher-content::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 3px; }
                #mode-switcher-content::-webkit-scrollbar-thumb:hover { background: #a1a1a1; }
                
                .tab-content { display: none; animation: fadeIn 0.3s ease; }
                .tab-content.active { display: block; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                
                .panel-section { margin-bottom: 20px; }
                .section-title { font-size: 14px; color: #666; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
                .section-title::before { content: ''; width: 4px; height: 16px; background: linear-gradient(180deg, #667eea 0%, #764ba2 100%); border-radius: 2px; }
                
                .status-indicator { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 16px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 12px; margin-bottom: 16px; }
                .status-dot { width: 12px; height: 12px; border-radius: 50%; animation: pulse 2s infinite; }
                .status-dot.active { background: #28a745; box-shadow: 0 0 10px rgba(40,167,69,0.5); }
                .status-dot.paused { background: #dc3545; box-shadow: 0 0 10px rgba(220,53,69,0.5); animation: none; }
                @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.2); opacity: 0.7; } }
                
                .panel-btn { padding: 12px 20px; font-size: 14px; color: white; border: none; border-radius: 10px; cursor: pointer; transition: all 0.3s; width: 100%; box-sizing: border-box; font-weight: 600; }
                .panel-btn:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
                .panel-btn:active { transform: translateY(0); }
                .service-btn-active { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); }
                .service-btn-paused { background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); }
                
                .nav-btn { padding: 12px 16px; font-size: 13px; color: #667eea; background: white; border: 2px solid #e9ecef; border-radius: 10px; cursor: pointer; transition: all 0.3s; width: 100%; margin-bottom: 8px; font-weight: 500; display: flex; align-items: center; gap: 10px; }
                .nav-btn:last-child { margin-bottom: 0; }
                .nav-btn:hover { border-color: #667eea; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); transform: translateX(5px); }
                .nav-btn-icon { font-size: 18px; }
                .nav-btn-text { flex: 1; text-align: left; }
                .nav-btn-arrow { opacity: 0; transition: all 0.3s; }
                .nav-btn:hover .nav-btn-arrow { opacity: 1; }
                
                .setting-row { margin-bottom: 16px; }
                .setting-row:last-child { margin-bottom: 0; }
                .setting-row label { display: block; margin-bottom: 8px; font-size: 13px; color: #495057; font-weight: 600; }
                
                .speed-slider-container { display: flex; align-items: center; gap: 12px; background: #f8f9fa; padding: 12px; border-radius: 10px; }
                .speed-slider-container input[type="range"] { flex: 1; height: 6px; border-radius: 3px; background: #e9ecef; outline: none; -webkit-appearance: none; }
                .speed-slider-container input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
                #speed-display { font-weight: bold; font-size: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; min-width: 50px; text-align: center; }
                
                .api-key-input { width: 100%; padding: 12px; border: 2px solid #e9ecef; border-radius: 10px; box-sizing: border-box; font-size: 13px; transition: all 0.3s; }
                .api-key-input:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,0.1); }
                .api-key-status { margin-top: 8px; font-size: 12px; padding: 8px 12px; border-radius: 8px; display: flex; align-items: center; gap: 6px; }
                .api-key-status.configured { background: #d4edda; color: #155724; }
                .api-key-status.not-configured { background: #fff3cd; color: #856404; }
                
                .panel-divider { width: 100%; height: 1px; background: linear-gradient(90deg, transparent, #e9ecef, transparent); margin: 20px 0; }
                
                .nav-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
                .nav-grid .nav-btn { margin-bottom: 0; }
                
                .tutorial-content { background: #f8f9fa; padding: 16px; border-radius: 12px; }
                .tutorial-section { margin-bottom: 20px; }
                .tutorial-section:last-child { margin-bottom: 0; }
                .tutorial-section h4 { font-size: 14px; color: #667eea; margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px; }
                .tutorial-section ul { margin: 0; padding-left: 20px; color: #495057; font-size: 13px; line-height: 1.8; }
                .tutorial-section li { margin-bottom: 6px; }
                .tutorial-section li::marker { color: #667eea; }
                .tutorial-warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; border-radius: 8px; margin-top: 16px; }
                .tutorial-warning strong { color: #856404; }
                .tutorial-link { color: #667eea; text-decoration: none; font-weight: 600; }
                .tutorial-link:hover { text-decoration: underline; }
                
                #mode-switcher-panel.collapsed #mode-switcher-tabs,
                #mode-switcher-panel.collapsed #mode-switcher-content { display: none; }
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
                            <button id="api-key-save-btn" class="panel-btn" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin-top: 12px;">
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
                    console.log(`[Script] Playback speed set to: ${newRate}x. Refreshing page to apply...`);
                    window.location.reload();
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
                #ai-helper-panel { position: fixed; bottom: 20px; right: 420px; width: 400px; max-width: 90vw; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.25); z-index: 99999; font-family: 'Microsoft YaHei', -apple-system, sans-serif; display: flex; flex-direction: column; overflow: hidden; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
                #ai-helper-panel:hover { transform: translateY(-2px); box-shadow: 0 15px 50px rgba(0,0,0,0.3); }
                #ai-helper-header { padding: 15px 20px; background: rgba(255,255,255,0.2); backdrop-filter: blur(10px); color: white; font-weight: bold; cursor: move; user-select: none; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); }
                #ai-helper-header h3 { margin: 0; font-size: 16px; display: flex; align-items: center; gap: 10px; }
                #ai-helper-close-btn { background: rgba(255,255,255,0.2); border: none; color: white; font-size: 18px; cursor: pointer; padding: 6px 12px; border-radius: 8px; transition: all 0.3s; }
                #ai-helper-close-btn:hover { background: rgba(255,255,255,0.3); transform: scale(1.1); }
                #ai-helper-content { padding: 20px; background: white; display: flex; flex-direction: column; gap: 16px; }
                #ai-helper-textarea { width: 100%; box-sizing: border-box; height: 120px; padding: 14px; border: 2px solid #e9ecef; border-radius: 12px; resize: vertical; font-size: 14px; transition: all 0.3s; font-family: inherit; }
                #ai-helper-textarea:focus { outline: none; border-color: #38ef7d; box-shadow: 0 0 0 3px rgba(56,239,125,0.1); }
                #ai-helper-submit-btn { padding: 14px 24px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; border: none; border-radius: 12px; cursor: pointer; font-size: 15px; font-weight: 600; transition: all 0.3s; display: flex; align-items: center; justify-content: center; gap: 8px; }
                #ai-helper-submit-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(56,239,125,0.4); }
                #ai-helper-submit-btn:disabled { background: #ccc; cursor: not-allowed; transform: none; box-shadow: none; }
                #ai-helper-result { padding: 16px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 12px; min-height: 80px; max-height: 250px; overflow-y: auto; white-space: pre-wrap; word-wrap: break-word; font-size: 14px; line-height: 1.6; border: 2px solid #e9ecef; }
                #ai-helper-result::-webkit-scrollbar { width: 6px; }
                #ai-helper-result::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
                #ai-helper-result::-webkit-scrollbar-thumb { background: #38ef7d; border-radius: 3px; }
                #ai-key-warning { color: #856404; font-size: 13px; padding: 12px; background: #fff3cd; border-radius: 8px; display: flex; align-items: center; gap: 8px; border-left: 4px solid #ffc107; }
                .ai-thinking { display: flex; align-items: center; gap: 12px; color: #11998e; }
                .ai-thinking-dot { display: flex; gap: 4px; }
                .ai-thinking-dot span { width: 8px; height: 8px; background: #11998e; border-radius: 50%; animation: bounce 1.4s infinite ease-in-out both; }
                .ai-thinking-dot span:nth-child(1) { animation-delay: -0.32s; }
                .ai-thinking-dot span:nth-child(2) { animation-delay: -0.16s; }
                @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
                .ai-result-label { font-size: 13px; color: #666; margin-bottom: 8px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
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
     * [Time Engine] Global time acceleration, including setTimeout, setInterval, and requestAnimationFrame
     */
    function accelerateTime() {
        if (CONFIG.TIME_ACCELERATION_RATE <= 1) return;
        console.log(`[Script] Time acceleration engine started, rate: ${CONFIG.TIME_ACCELERATION_RATE}x`);

        const rate = CONFIG.TIME_ACCELERATION_RATE;

        try {
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
