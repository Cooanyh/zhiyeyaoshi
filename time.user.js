// ==UserScript==
// @name            时间倍速器
// @name:en         时间倍速器（微信：C919irt）
// @namespace       https://gitee.com/HGJing/everthing-hook/
// @homepageURL     https://timer.palerock.cn
// @version         2.2.0
// @description     控制网页计时器速度|加速跳过页面计时广告|视频快进（慢放）|跳过广告|支持几乎所有网页。提供免费试用和永久激活两种方式。
// @description:en  Control timer speed, skip ads, support almost all websites. Free trial and permanent activation available.
// @include         *
// @author          Cangshi
// @run-at          document-start
// @grant           unsafeWindow

// @grant           GM_setValue
// @grant           GM_getValue
// @grant           GM_listValues
// @grant           GM_deleteValue
// @grant           GM_addValueChangeListener
// @grant           GM_removeValueChangeListener
// @grant           GM_log
// @grant           GM_registerMenuCommand
// @grant           GM_unregisterMenuCommand
// @grant           GM_openInTab
// @grant           GM_xmlhttpRequest
// @grant           GM_getTab
// @grant           GM_saveTab
// @grant           GM_notification
// @grant           GM_setClipboard

// @grant           GM.deleteValue
// @grant           GM.getValue
// @grant           GM.listValues
// @grant           GM.setValue

// @grant           GM.getResourceUrl
// @grant           GM.notification
// @grant           GM.registerMenuCommand
// @grant           GM.xmlHttpRequest

// @note            💎 使用方式：免费试用24小时（扫码看广告）| 永久激活限时9.9元，活动后19.9元（联系客服）
// @supportURL      https://qsy.iano.cn
// @contactURL      微信：C919irt
// @antifeature     payment 脚本提供两种使用方式：1.免费试用需观看广告获取验证码24小时有效 2.永久激活限时9.9元（活动后19.9元）需支付后获取激活码永久使用
// ==/UserScript==

// ==========================================
// 💎 时间倍速器 - 使用说明
// ==========================================
//
// 【免费试用】24小时有效
// 1. 点击"激活时间倍速器"按钮
// 2. 选择"免费试用"选项卡
// 3. 扫码观看广告获取验证码
// 4. 输入验证码即可使用24小时
//
// 【永久激活】限时9.9元，活动后19.9元 永久使用
// 1. 点击"激活时间倍速器"按钮
// 2. 选择"永久激活"选项卡
// 3. 扫码支付（限时9.9元）
// 4. 点击"联系客服获取激活码"（自动复制微信号）
// 5. 添加微信：C919irt 发送支付截图
// 6. 获取激活码后输入即可永久使用
//
// 【联系方式】
// 微信：C919irt
// 网站：https://qsy.iano.cn
//
// ==========================================

// ========== 验证码验证模块 ==========
(function() {
    'use strict';

    const VERIFY_API = 'https://qsy.iano.cn/index.php?s=/api/code/verify';
    const STORAGE_KEY = 'video_speed_valid_until';
    const VERIFY_DATE_KEY = 'video_speed_verify_date';
    const SESSION_KEY = 'video_speed_session';
    const USER_CHOICE_KEY = 'video_speed_user_choice'; // 用户选择是否使用加速
    const QRCODE_IMG = 'https://qsy.iano.cn/yzm.png'; // 小程序码图片
    const PERMANENT_KEY = 'video_speed_permanent_code'; // 永久激活码
    const WECHAT_ID = 'C919irt'; // 你的微信号
    const REWARD_QRCODE = 'https://qsy.iano.cn/zsm.png'; // 赞赏码图片
    const PERMANENT_VERIFY_API = 'https://qsy.iano.cn/index.php?s=/api/code/verify_permanent'; // 永久激活码验证API

    // 限时活动配置
    const PROMOTION_END_DATE = '2026-02-28'; // 限时活动截止日期 YYYY-MM-DD
    const PROMOTION_PRICE = '9.9'; // 活动价格
    const NORMAL_PRICE = '19.9'; // 原价

    // 生成设备码（基于硬件特征，重装浏览器也保持一致）
    function getDeviceId() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('device-fingerprint', 2, 2);
        const canvasData = canvas.toDataURL();

        // 组合多个稳定特征
        const features = [
            navigator.platform,
            navigator.hardwareConcurrency,
            screen.width + 'x' + screen.height,
            screen.colorDepth,
            new Date().getTimezoneOffset(),
            canvasData.slice(-50)
        ].join('|');

        // 生成哈希
        let hash = 0;
        for (let i = 0; i < features.length; i++) {
            hash = ((hash << 5) - hash) + features.charCodeAt(i);
            hash = hash & hash;
        }
        return 'DEV' + Math.abs(hash).toString(16).toUpperCase().padStart(12, '0');
    }

    // 获取设备码（缓存）
    const DEVICE_ID = getDeviceId();

    // 获取今天的日期字符串 YYYY-MM-DD
    function getTodayStr() {
        return new Date().toISOString().slice(0, 10);
    }

    // 获取当前价格信息
    function getCurrentPrice() {
        const today = new Date();
        const endDate = new Date(PROMOTION_END_DATE);
        const isPromotion = today <= endDate;

        return {
            price: isPromotion ? PROMOTION_PRICE : NORMAL_PRICE,
            isPromotion: isPromotion,
            daysLeft: isPromotion ? Math.ceil((endDate - today) / (1000 * 60 * 60 * 24)) : 0
        };
    }

    // 检查是否已验证
    function isVerified() {
        // 首先检查是否有永久激活码
        const permanentCode = GM_getValue(PERMANENT_KEY, '');
        if (permanentCode && permanentCode.length > 0) {
            return true; // 有永久激活码，直接通过
        }

        // 检查24小时临时验证
        const validUntil = GM_getValue(STORAGE_KEY, 0);
        if (validUntil <= Date.now() / 1000) return false; // 有效期已过

        // 检查是否是同一会话（浏览器未关闭）
        if (sessionStorage.getItem(SESSION_KEY)) return true;

        // 新会话：检查是否跨天
        const verifyDate = GM_getValue(VERIFY_DATE_KEY, '');
        const today = getTodayStr();
        if (verifyDate !== today) return false; // 跨天需要重新验证

        // 同一天，标记会话
        sessionStorage.setItem(SESSION_KEY, '1');
        return true;
    }

    // 启动时验证永久激活码是否仍然有效（后台静默验证）
    function verifyPermanentCodeOnStartup() {
        const permanentCode = GM_getValue(PERMANENT_KEY, '');
        if (!permanentCode || permanentCode.length === 0) return;

        GM_xmlhttpRequest({
            method: 'POST',
            url: PERMANENT_VERIFY_API,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: 'code=' + encodeURIComponent(permanentCode) + '&device_id=' + encodeURIComponent(DEVICE_ID),
            onload: function(res) {
                try {
                    const data = JSON.parse(res.responseText);
                    if (data.code !== 1 || !data.data.valid) {
                        // 激活码无效，清除本地存储
                        GM_deleteValue(PERMANENT_KEY);
                        console.log('[时间倍速器] 激活码已失效，请重新激活');
                        location.reload(); // 刷新页面显示激活界面
                    }
                } catch (e) {
                    // 解析失败，不做处理
                }
            },
            onerror: function() {
                // 网络错误，不做处理（保持本地状态）
            }
        });
    }

    // 启动时验证
    verifyPermanentCodeOnStartup();

    // 显示激活按钮（可拖动的悬浮卡片）
    function showActivateButton() {
        const btn = document.createElement('div');
        btn.id = '_activate_btn';
        btn.innerHTML = `
            <style>
                @keyframes _activate_pulse {
                    0%, 100% { box-shadow: 0 4px 20px rgba(102,126,234,0.5); }
                    50% { box-shadow: 0 6px 30px rgba(102,126,234,0.8); }
                }
                @keyframes _activate_shine {
                    0% { background-position: -200% center; }
                    100% { background-position: 200% center; }
                }
                #_activate_btn {
                    position: fixed; right: 20px; bottom: 80px; z-index: 999998;
                    padding: 12px 20px; border-radius: 50px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    box-shadow: 0 4px 20px rgba(102,126,234,0.5);
                    display: flex; align-items: center; gap: 10px;
                    cursor: move; transition: all 0.3s ease;
                    user-select: none;
                    animation: _activate_pulse 2s infinite;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                #_activate_btn::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    border-radius: 50px;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
                    background-size: 200% 100%;
                    animation: _activate_shine 3s infinite;
                }
                #_activate_btn:hover {
                    transform: scale(1.05);
                    box-shadow: 0 6px 30px rgba(102,126,234,0.7);
                }
                #_activate_btn:active {
                    transform: scale(0.98);
                }
                ._activate_icon {
                    font-size: 24px;
                    position: relative;
                    z-index: 1;
                }
                ._activate_text {
                    color: #fff;
                    font-size: 15px;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                    position: relative;
                    z-index: 1;
                }
                ._activate_hint {
                    position: absolute;
                    top: -35px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0,0,0,0.8);
                    color: #fff;
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    white-space: nowrap;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.3s ease;
                }
                #_activate_btn:hover ._activate_hint {
                    opacity: 1;
                }
            </style>
            <div class="_activate_hint">点击激活倍速功能</div>
            <div class="_activate_icon">⚡</div>
            <div class="_activate_text">激活时间倍速器</div>
        `;
        (document.body || document.documentElement).appendChild(btn);

        // 拖动功能
        let isDragging = false, startX, startY, startLeft, startTop;

        btn.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            isDragging = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = btn.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            function onMove(e) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    isDragging = true;
                    btn.style.left = (startLeft + dx) + 'px';
                    btn.style.top = (startTop + dy) + 'px';
                    btn.style.right = 'auto';
                    btn.style.bottom = 'auto';
                }
            }

            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);

                // 如果不是拖动，而是点击，则触发激活
                if (!isDragging) {
                    activateScript();
                }
                setTimeout(() => { isDragging = false; }, 100);
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        // 激活脚本函数
        async function activateScript() {
            btn.remove(); // 移除激活按钮

            // 检查是否已验证
            if (!isVerified()) {
                // 未验证，显示验证码弹窗
                showVerifyDialog();
            } else {
                // 已验证，直接启用脚本
                window._videoSpeedEnabled = true;
                location.reload(); // 重新加载页面以启用脚本
            }
        }
    }

    // 显示验证弹窗
    function showVerifyDialog() {
        const overlay = document.createElement('div');
        overlay.id = '_verify_overlay';
        overlay.innerHTML = `
            <style>
                @keyframes _verify_fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes _verify_scaleIn {
                    from { opacity: 0; transform: scale(0.8); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes _verify_shake {
                    0%, 100% { transform: translateX(0); }
                    20%, 60% { transform: translateX(-8px); }
                    40%, 80% { transform: translateX(8px); }
                }
                #_verify_overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.65); z-index: 999999;
                    display: flex; align-items: center; justify-content: center;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    animation: _verify_fadeIn 0.3s ease;
                }
                ._verify_box {
                    background: linear-gradient(145deg, #ffffff 0%, #f8f9ff 100%);
                    border-radius: 16px; padding: 24px;
                    width: 320px; text-align: center;
                    box-shadow: 0 20px 60px rgba(102,126,234,0.3), 0 8px 20px rgba(0,0,0,0.15);
                    animation: _verify_scaleIn 0.3s ease;
                    max-height: 90vh; overflow-y: auto;
                }
                ._verify_tabs {
                    display: flex; gap: 10px; margin-bottom: 20px;
                }
                ._verify_tab {
                    flex: 1; padding: 10px; font-size: 14px; font-weight: 600;
                    background: #f0f0f0; border: none; border-radius: 8px;
                    cursor: pointer; transition: all 0.3s ease; color: #666;
                }
                ._verify_tab.active {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: #fff; box-shadow: 0 2px 10px rgba(102,126,234,0.4);
                }
                ._verify_content {
                    display: none;
                }
                ._verify_content.active {
                    display: block;
                }
                ._verify_title {
                    font-size: 18px; font-weight: 600; color: #333;
                    margin-bottom: 6px; letter-spacing: 1px;
                }
                ._verify_desc {
                    font-size: 13px; color: #666; margin-bottom: 12px; line-height: 1.5;
                }
                ._verify_qrcode {
                    width: 140px; height: 140px; margin: 10px auto; display: block;
                    border-radius: 12px; object-fit: cover;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                    transition: transform 0.3s ease;
                }
                ._verify_qrcode:hover { transform: scale(1.05); }
                ._verify_input {
                    width: 100%; padding: 12px; font-size: 16px; text-align: center;
                    border: 2px solid #e0e0e0; border-radius: 10px; margin-bottom: 12px;
                    letter-spacing: 4px; font-weight: 600; color: #333;
                    box-sizing: border-box; transition: all 0.3s ease;
                    background: #fafafa;
                }
                ._verify_input:focus {
                    border-color: #667eea; outline: none;
                    background: #fff; box-shadow: 0 0 0 4px rgba(102,126,234,0.15);
                }
                ._verify_input::placeholder { letter-spacing: 2px; font-weight: 400; color: #aaa; }
                ._verify_btn {
                    width: 100%; padding: 12px; font-size: 15px; font-weight: 600; color: #fff;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border: none; border-radius: 10px; cursor: pointer;
                    transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(102,126,234,0.4);
                    margin-bottom: 8px;
                }
                ._verify_btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(102,126,234,0.5); }
                ._verify_btn:active { transform: translateY(0); }
                ._verify_btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
                ._verify_btn_secondary {
                    width: 100%; padding: 10px; font-size: 14px; font-weight: 500;
                    background: #f0f0f0; color: #667eea; border: 2px solid #667eea;
                    border-radius: 10px; cursor: pointer; transition: all 0.3s ease;
                    margin-bottom: 8px;
                }
                ._verify_btn_secondary:hover { background: #667eea; color: #fff; }
                ._verify_cancel {
                    width: 100%; padding: 10px; font-size: 14px; font-weight: 500; color: #999;
                    background: transparent; border: none; cursor: pointer;
                    transition: all 0.3s ease; margin-top: 8px;
                }
                ._verify_cancel:hover { color: #666; }
                ._verify_error {
                    color: #e74c3c; font-size: 13px; margin-bottom: 10px;
                    display: none; font-weight: 500;
                }
                ._verify_success {
                    color: #27ae60; font-size: 13px; margin-bottom: 10px;
                    display: none; font-weight: 500;
                }
                ._verify_error.shake { animation: _verify_shake 0.4s ease; }
                ._verify_divider {
                    height: 1px; background: #e0e0e0; margin: 15px 0;
                }
                ._verify_hint {
                    font-size: 12px; color: #999; margin-top: 10px; line-height: 1.4;
                }
            </style>
            <div class="_verify_box">
                <div class="_verify_tabs">
                    <button class="_verify_tab active" data-tab="free">免费试用</button>
                    <button class="_verify_tab" data-tab="permanent">永久激活</button>
                </div>

                <!-- 免费试用内容 -->
                <div class="_verify_content active" id="_free_content">
                    <div class="_verify_title">🎁 免费试用24小时</div>
                    <div class="_verify_desc">扫码观看广告获取验证码<br>验证后免费使用24小时</div>
                    <img class="_verify_qrcode" src="${QRCODE_IMG}" alt="小程序码">
                    <div class="_verify_error" id="_verify_error_free"></div>
                    <input type="text" class="_verify_input" id="_verify_code_free" placeholder="输入4位验证码" maxlength="4">
                    <button class="_verify_btn" id="_verify_submit_free">立即验证</button>
                </div>

                <!-- 永久激活内容 -->
                <div class="_verify_content" id="_permanent_content">
                    <div class="_verify_title">💎 永久无广告版本</div>
                    <div class="_verify_desc" id="_price_desc"></div>
                    <img class="_verify_qrcode" src="${REWARD_QRCODE}" alt="赞赏码">
                    <div style="background:#f0f4ff;padding:10px;border-radius:8px;margin:10px 0;text-align:center;">
                        <div style="font-size:12px;color:#666;margin-bottom:5px;">您的设备码（激活后绑定此设备）</div>
                        <div style="font-size:14px;color:#667eea;font-weight:bold;font-family:monospace;user-select:all;" id="_device_id_display">${DEVICE_ID}</div>
                        <button style="margin-top:8px;padding:5px 15px;font-size:12px;background:#667eea;color:#fff;border:none;border-radius:4px;cursor:pointer;" id="_copy_device_id">复制设备码</button>
                    </div>
                    <div class="_verify_error" id="_verify_error_perm"></div>
                    <div class="_verify_success" id="_verify_success_perm"></div>
                    <input type="text" class="_verify_input" id="_verify_code_perm" placeholder="输入激活码" maxlength="20">
                    <button class="_verify_btn" id="_verify_submit_perm">验证激活码</button>
                    <button class="_verify_btn_secondary" id="_contact_service">联系客服获取激活码</button>
                    <div class="_verify_hint">💡 点击"联系客服"按钮将自动复制微信号</div>
                </div>

                <button class="_verify_cancel" id="_verify_cancel">取消激活</button>
            </div>
        `;
        (document.body || document.documentElement).appendChild(overlay);

        // ========== 设置动态价格显示 ==========
        const priceInfo = getCurrentPrice();
        const priceDesc = document.getElementById('_price_desc');
        if (priceInfo.isPromotion) {
            priceDesc.innerHTML = `🔥 限时特惠 <strong style="color:#e74c3c;text-decoration:line-through;">${NORMAL_PRICE}元</strong> <strong style="color:#667eea;font-size:18px;">${priceInfo.price}元</strong><br>扫码赞赏后联系客服获取激活码<br>一次激活，永久使用，无需看广告<br><span style="color:#e74c3c;font-size:12px;">⏰ 活动仅剩 ${priceInfo.daysLeft} 天，${PROMOTION_END_DATE} 后恢复原价</span>`;
        } else {
            priceDesc.innerHTML = `扫码赞赏 <strong style="color:#667eea;">${priceInfo.price}元</strong> 后联系客服获取激活码<br>一次激活，永久使用，无需看广告`;
        }

        // ========== 选项卡切换功能 ==========
        const tabs = overlay.querySelectorAll('._verify_tab');
        const contents = overlay.querySelectorAll('._verify_content');

        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                const targetTab = this.getAttribute('data-tab');
                tabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                contents.forEach(c => c.classList.remove('active'));
                if (targetTab === 'free') {
                    document.getElementById('_free_content').classList.add('active');
                } else {
                    document.getElementById('_permanent_content').classList.add('active');
                }
            });
        });

        // ========== 免费试用验证逻辑（保留原有功能）==========
        const inputFree = document.getElementById('_verify_code_free');
        const btnFree = document.getElementById('_verify_submit_free');
        const errorFree = document.getElementById('_verify_error_free');

        btnFree.onclick = function() {
            const code = inputFree.value.trim();
            if (!/^\d{4}$/.test(code)) {
                errorFree.textContent = '请输入4位验证码';
                errorFree.style.display = 'block';
                errorFree.classList.remove('shake');
                void errorFree.offsetWidth;
                errorFree.classList.add('shake');
                return;
            }
            btnFree.disabled = true;
            btnFree.textContent = '验证中...';
            errorFree.style.display = 'none';

            GM_xmlhttpRequest({
                method: 'POST',
                url: VERIFY_API,
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: 'code=' + encodeURIComponent(code),
                onload: function(res) {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data.code === 1 && data.data.valid) {
                            GM_setValue(STORAGE_KEY, data.data.valid_until);
                            GM_setValue(VERIFY_DATE_KEY, getTodayStr());
                            sessionStorage.setItem(SESSION_KEY, '1');
                            overlay.remove();
                            GM_notification({
                                text: '验证成功！24小时内免费使用',
                                title: '时间倍速器',
                                timeout: 3000
                            });
                            location.reload();
                        } else {
                            errorFree.textContent = data.msg || '验证码无效或已过期';
                            errorFree.style.display = 'block';
                            errorFree.classList.remove('shake');
                            void errorFree.offsetWidth;
                            errorFree.classList.add('shake');
                            btnFree.disabled = false;
                            btnFree.textContent = '立即验证';
                        }
                    } catch (e) {
                        errorFree.textContent = '验证失败，请重试';
                        errorFree.style.display = 'block';
                        errorFree.classList.remove('shake');
                        void errorFree.offsetWidth;
                        errorFree.classList.add('shake');
                        btnFree.disabled = false;
                        btnFree.textContent = '立即验证';
                    }
                },
                onerror: function() {
                    errorFree.textContent = '网络错误，请重试';
                    errorFree.style.display = 'block';
                    errorFree.classList.remove('shake');
                    void errorFree.offsetWidth;
                    errorFree.classList.add('shake');
                    btnFree.disabled = false;
                    btnFree.textContent = '立即验证';
                },
                ontimeout: function() {
                    errorFree.textContent = '请求超时，请重试';
                    errorFree.style.display = 'block';
                    errorFree.classList.remove('shake');
                    void errorFree.offsetWidth;
                    errorFree.classList.add('shake');
                    btnFree.disabled = false;
                    btnFree.textContent = '立即验证';
                }
            });
        };

        inputFree.onkeypress = function(e) {
            if (e.key === 'Enter') btnFree.click();
        };

        // ========== 永久激活码验证逻辑（新增功能）==========
        const inputPerm = document.getElementById('_verify_code_perm');
        const btnPerm = document.getElementById('_verify_submit_perm');
        const errorPerm = document.getElementById('_verify_error_perm');
        const successPerm = document.getElementById('_verify_success_perm');

        btnPerm.onclick = function() {
            const code = inputPerm.value.trim();
            if (code.length < 6) {
                errorPerm.textContent = '请输入有效的激活码';
                errorPerm.style.display = 'block';
                successPerm.style.display = 'none';
                errorPerm.classList.remove('shake');
                void errorPerm.offsetWidth;
                errorPerm.classList.add('shake');
                return;
            }

            btnPerm.disabled = true;
            btnPerm.textContent = '验证中...';
            errorPerm.style.display = 'none';
            successPerm.style.display = 'none';

            // 调用服务器API验证激活码
            GM_xmlhttpRequest({
                method: 'POST',
                url: PERMANENT_VERIFY_API,
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: 'code=' + encodeURIComponent(code) + '&device_id=' + encodeURIComponent(DEVICE_ID),
                onload: function(res) {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data.code === 1 && data.data.valid) {
                            // 激活成功，保存激活码
                            GM_setValue(PERMANENT_KEY, code.toUpperCase());
                            successPerm.textContent = '✅ 激活成功！永久无广告使用';
                            successPerm.style.display = 'block';
                            errorPerm.style.display = 'none';

                            setTimeout(function() {
                                overlay.remove();
                                GM_notification({
                                    text: '永久激活成功！感谢支持',
                                    title: '时间倍速器',
                                    timeout: 3000
                                });
                                location.reload();
                            }, 1500);
                        } else {
                            errorPerm.textContent = data.msg || '激活码无效，请联系客服获取正确的激活码';
                            errorPerm.style.display = 'block';
                            successPerm.style.display = 'none';
                            errorPerm.classList.remove('shake');
                            void errorPerm.offsetWidth;
                            errorPerm.classList.add('shake');
                            btnPerm.disabled = false;
                            btnPerm.textContent = '验证激活码';
                        }
                    } catch (e) {
                        errorPerm.textContent = '验证失败，请重试';
                        errorPerm.style.display = 'block';
                        successPerm.style.display = 'none';
                        errorPerm.classList.remove('shake');
                        void errorPerm.offsetWidth;
                        errorPerm.classList.add('shake');
                        btnPerm.disabled = false;
                        btnPerm.textContent = '验证激活码';
                    }
                },
                onerror: function() {
                    errorPerm.textContent = '网络错误，请重试';
                    errorPerm.style.display = 'block';
                    successPerm.style.display = 'none';
                    errorPerm.classList.remove('shake');
                    void errorPerm.offsetWidth;
                    errorPerm.classList.add('shake');
                    btnPerm.disabled = false;
                    btnPerm.textContent = '验证激活码';
                },
                ontimeout: function() {
                    errorPerm.textContent = '请求超时，请重试';
                    errorPerm.style.display = 'block';
                    successPerm.style.display = 'none';
                    errorPerm.classList.remove('shake');
                    void errorPerm.offsetWidth;
                    errorPerm.classList.add('shake');
                    btnPerm.disabled = false;
                    btnPerm.textContent = '验证激活码';
                }
            });
        };

        inputPerm.onkeypress = function(e) {
            if (e.key === 'Enter') btnPerm.click();
        };

        // ========== 复制设备码功能 ==========
        const copyDeviceBtn = document.getElementById('_copy_device_id');
        copyDeviceBtn.onclick = function() {
            GM_setClipboard(DEVICE_ID, 'text');
            copyDeviceBtn.textContent = '✅ 已复制';
            copyDeviceBtn.style.background = '#27ae60';
            setTimeout(function() {
                copyDeviceBtn.textContent = '复制设备码';
                copyDeviceBtn.style.background = '#667eea';
            }, 2000);
        };

        // ========== 联系客服功能（复制微信号）==========
        const contactBtn = document.getElementById('_contact_service');
        contactBtn.onclick = function() {
            GM_setClipboard(WECHAT_ID, 'text');
            const originalText = contactBtn.textContent;
            contactBtn.textContent = '✅ 微信号已复制：' + WECHAT_ID;
            contactBtn.style.background = '#27ae60';
            contactBtn.style.color = '#fff';
            contactBtn.style.borderColor = '#27ae60';

            setTimeout(function() {
                contactBtn.textContent = originalText;
                contactBtn.style.background = '';
                contactBtn.style.color = '';
                contactBtn.style.borderColor = '';
            }, 3000);

            GM_notification({
                text: '微信号 ' + WECHAT_ID + ' 已复制到剪贴板',
                title: '联系客服',
                timeout: 3000
            });
        };

        // 取消按钮
        document.getElementById('_verify_cancel').onclick = function() {
            overlay.remove();
            showActivateButton();
        };
    }

    // 主逻辑：检查验证状态
    function init() {
        // 检查是否已验证
        if (isVerified()) {
            // 已验证，直接启用脚本
            window._videoSpeedEnabled = true;
        } else {
            // 未验证，显示激活按钮，等待用户主动点击
            window._videoSpeedEnabled = false;
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', showActivateButton);
            } else {
                showActivateButton();
            }
        }
    }

    init();
})();
// ========== 验证码验证模块结束 ==========

// ========== 悬浮球拖动模块 ==========
(function() {
    'use strict';

    // 检查是否允许运行脚本
    if (window._videoSpeedEnabled === false) {
        return; // 用户选择不使用或未验证，不运行
    }

    const DRAG_POS_KEY = 'video_speed_drag_pos';

    function initDrag() {
        const container = document.querySelector('._th-container');
        if (!container) return setTimeout(initDrag, 500);

        // 恢复保存的位置
        const savedPos = GM_getValue(DRAG_POS_KEY, null);
        if (savedPos) {
            container.style.left = savedPos.left;
            container.style.right = 'auto';
            container.style.top = savedPos.top;
        }

        let isDragging = false,
            startX, startY, startLeft, startTop;

        container.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            isDragging = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = container.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            container.style.transition = 'none';

            function onMove(e) {
                const dx = e.clientX - startX,
                    dy = e.clientY - startY;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging = true;
                if (isDragging) {
                    container.style.left = (startLeft + dx) + 'px';
                    container.style.top = (startTop + dy) + 'px';
                    container.style.right = 'auto';
                }
            }

            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                container.style.transition = '';
                if (isDragging) {
                    GM_setValue(DRAG_POS_KEY, {
                        left: container.style.left,
                        top: container.style.top
                    });
                    setTimeout(function() {
                        isDragging = false;
                    }, 50);
                }
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        // 阻止拖动时触发点击
        container.addEventListener('click', function(e) {
            if (isDragging) {
                e.stopPropagation();
                e.preventDefault();
            }
        }, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(initDrag, 1000);
        });
    } else {
        setTimeout(initDrag, 1000);
    }
})();
// ========== 悬浮球拖动模块结束 ==========

! function(t, e) {
    "object" == typeof exports && "undefined" != typeof module ? module.exports = e() : "function" == typeof define &&
        define.amd ? define(e) : (t = "undefined" != typeof globalThis ? globalThis : t || self).$hookTimer = e()
}(this, (function() {
    "use strict";

    // 检查是否允许运行脚本
    if (window._videoSpeedEnabled === false) {
        return {}; // 用户选择不使用或未验证，返回空对象
    }

    function t(t, e) {
        if (!(t instanceof e)) throw new TypeError("Cannot call a class as a function")
    }

    function e(t, e) {
        for (var n = 0; n < e.length; n++) {
            var r = e[n];
            r.enumerable = r.enumerable || !1, r.configurable = !0, "value" in r && (r.writable = !0), Object
                .defineProperty(t, r.key, r)
        }
    }

    function n(t, n, r) {
        return n && e(t.prototype, n), r && e(t, r), t
    }

    function r(t) {
        if (void 0 === t) throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
        return t
    }

    function o(t, e) {
        return (o = Object.setPrototypeOf || function(t, e) {
            return t.__proto__ = e, t
        })(t, e)
    }

    function i(t, e) {
        if ("function" != typeof e && null !== e) throw new TypeError(
            "Super expression must either be null or a function");
        t.prototype = Object.create(e && e.prototype, {
            constructor: {
                value: t,
                writable: !0,
                configurable: !0
            }
        }), e && o(t, e)
    }

    function a(t) {
        return (a = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(t) {
            return typeof t
        } : function(t) {
            return t && "function" == typeof Symbol && t.constructor === Symbol && t !== Symbol
                .prototype ? "symbol" : typeof t
        })(t)
    }

    function u(t, e) {
        return !e || "object" !== a(e) && "function" != typeof e ? r(t) : e
    }

    function c(t) {
        return (c = Object.setPrototypeOf ? Object.getPrototypeOf : function(t) {
            return t.__proto__ || Object.getPrototypeOf(t)
        })(t)
    }

    function l(t, e, n) {
        return e in t ? Object.defineProperty(t, e, {
            value: n,
            enumerable: !0,
            configurable: !0,
            writable: !0
        }) : t[e] = n, t
    }
    var s, f, h, d = 1e3;

    function y() {
        return d++
    }

    function p() {
        return null == s && (s = "undefined" == typeof unsafeWindow ? window : unsafeWindow), s
    }

    function v() {
        var t = p().parent !== p();
        try {
            t = t && "FRAMESET" !== p().parent.document.body.tagName
        } catch (t) {}
        return t
    }

    function g(t) {
        var e = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 1 / 0,
            n = Array.prototype.flat || function() {
                var t = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : 1 / 0;
                if (t < 1) return this;
                var e = [],
                    r = t - 1;
                return this.forEach((function(t) {
                    t instanceof Array ? e = e.concat(n.call(t, r)) : e.push(t)
                })), e
            };
        return n.call(t, e)
    }

    function m(t, e) {
        (null == e || e > t.length) && (e = t.length);
        for (var n = 0, r = new Array(e); n < e; n++) r[n] = t[n];
        return r
    }

    function b(t, e) {
        if (t) {
            if ("string" == typeof t) return m(t, e);
            var n = Object.prototype.toString.call(t).slice(8, -1);
            return "Object" === n && t.constructor && (n = t.constructor.name), "Map" === n || "Set" === n ?
                Array.from(t) : "Arguments" === n || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n) ? m(t,
                    e) : void 0
        }
    }

    function w(t, e) {
        return function(t) {
            if (Array.isArray(t)) return t
        }(t) || function(t, e) {
            var n = t && ("undefined" != typeof Symbol && t[Symbol.iterator] || t["@@iterator"]);
            if (null != n) {
                var r, o, i = [],
                    a = !0,
                    u = !1;
                try {
                    for (n = n.call(t); !(a = (r = n.next()).done) && (i.push(r.value), !e || i.length !==
                            e); a = !0);
                } catch (t) {
                    u = !0, o = t
                } finally {
                    try {
                        a || null == n.return || n.return()
                    } finally {
                        if (u) throw o
                    }
                }
                return i
            }
        }(t, e) || b(t, e) || function() {
            throw new TypeError(
                "Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."
            )
        }()
    }

    function k(t, e) {
        var n = "undefined" != typeof Symbol && t[Symbol.iterator] || t["@@iterator"];
        if (!n) {
            if (Array.isArray(t) || (n = function(t, e) {
                    if (!t) return;
                    if ("string" == typeof t) return x(t, e);
                    var n = Object.prototype.toString.call(t).slice(8, -1);
                    "Object" === n && t.constructor && (n = t.constructor.name);
                    if ("Map" === n || "Set" === n) return Array.from(t);
                    if ("Arguments" === n || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return x(t,
                        e)
                }(t)) || e && t && "number" == typeof t.length) {
                n && (t = n);
                var r = 0,
                    o = function() {};
                return {
                    s: o,
                    n: function() {
                        return r >= t.length ? {
                            done: !0
                        } : {
                            done: !1,
                            value: t[r++]
                        }
                    },
                    e: function(t) {
                        throw t
                    },
                    f: o
                }
            }
            throw new TypeError(
                "Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."
            )
        }
        var i, a = !0,
            u = !1;
        return {
            s: function() {
                n = n.call(t)
            },
            n: function() {
                var t = n.next();
                return a = t.done, t
            },
            e: function(t) {
                u = !0, i = t
            },
            f: function() {
                try {
                    a || null == n.return || n.return()
                } finally {
                    if (u) throw i
                }
            }
        }
    }

    function x(t, e) {
        (null == e || e > t.length) && (e = t.length);
        for (var n = 0, r = new Array(e); n < e; n++) r[n] = t[n];
        return r
    }

    function O() {
        return null == h && (h = "undefined" == typeof unsafeWindow ? window : unsafeWindow), h
    }

    function R() {
        var t = O().parent !== O();
        try {
            t = t && "FRAMESET" !== O().parent.document.body.tagName
        } catch (t) {}
        return t
    }! function(t) {
        t.BOOLEAN = "boolean", t.STRING = "string", t.NUMBER = "number", t.SHORTCUT = "shortcut", t
            .LONG_STRING = "long_string", t.DATE = "date", t.COLOR = "color", t.ARRAY = "array", t.PICKLIST =
            "picklist", t.DUELING_PICKLIST = "dueling_picklist"
    }(f || (f = {}));
    var M = "__hooks_load_module",
        _ = Object.getOwnPropertyNames.bind(Object),
        A = Object.getPrototypeOf.bind(Object);

    function S(t) {
        var e, n = {},
            r = k(_(t));
        try {
            for (r.s(); !(e = r.n()).done;) {
                var o = e.value;
                n[o] = t[o]
            }
        } catch (t) {
            r.e(t)
        } finally {
            r.f()
        }
        return n
    }
    var C = [
        [Array.prototype],
        [Object, !1]
    ].map((function(t) {
        var e = w(t, 1)[0];
        return [e, S(e)]
    }));

    function T(t) {
        var e, n = k(C);
        try {
            for (n.s(); !(e = n.n()).done;) {
                var r = w(e.value, 2),
                    o = r[0],
                    i = r[1];
                if (t === o) return i
            }
        } catch (t) {
            n.e(t)
        } finally {
            n.f()
        }
        return t
    }

    function I(t, e) {
        return function(t, e) {
            var n = T(arguments.length > 2 && void 0 !== arguments[2] && !arguments[2] ? t : A(t)),
                r = n[e];
            return "function" == typeof r ? r.bind(t) : n[e]
        }(e.conditions || [], "reduce")((function(e, n) {
            return e || Object.entries(n).every((function(e) {
                var n = w(e, 2),
                    r = n[0],
                    o = n[1];
                return t[r] === o
            }))
        }), !1)
    }
    var E = {};
    try {
        E.addStyle = GM_addStyle
    } catch (t) {}
    try {
        E.addElement = GM_addElement
    } catch (t) {}
    try {
        E.deleteValue = GM_deleteValue
    } catch (t) {}
    try {
        E.listValues = GM_listValues
    } catch (t) {}
    try {
        E.getValue = GM_getValue
    } catch (t) {}
    try {
        E.setValue = GM_setValue
    } catch (t) {}
    try {
        E.addValueChangeListener = GM_addValueChangeListener
    } catch (t) {}
    try {
        E.removeValueChangeListener = GM_removeValueChangeListener
    } catch (t) {}
    try {
        E.xmlhttpRequest = GM_xmlhttpRequest
    } catch (t) {}
    try {
        E.registerMenuCommand = GM_registerMenuCommand
    } catch (t) {}
    try {
        E.unregisterMenuCommand = GM_unregisterMenuCommand
    } catch (t) {}
    try {
        E.download = GM_download
    } catch (t) {}
    try {
        E.log = GM_log
    } catch (t) {}
    try {
        E.openInTab = GM_openInTab
    } catch (t) {}
    try {
        E.setClipboard = GM_setClipboard
    } catch (t) {}
    try {
        E.info = GM_info
    } catch (t) {}
    try {
        E.getResourceText = GM_getResourceText
    } catch (t) {}
    try {
        E.getResourceURL = GM_getResourceURL
    } catch (t) {}
    try {
        E.getTab = GM_getTab
    } catch (t) {}
    try {
        E.getTabs = GM_getTabs
    } catch (t) {}
    try {
        E.saveTab = GM_saveTab
    } catch (t) {}
    try {
        E.notification = GM_notification
    } catch (t) {}
    var j = window,
        D = new Proxy({}, {
            get: function(t, e) {
                var n = ["GM", e].join("_");
                return j[n] ? j[n] : E[e] ? E[e] : j.GM && j.GM[e] ? j.GM[e] : void 0
            }
        }),
        P = function() {
            if (!R()) {
                for (var t = arguments.length, e = new Array(t), n = 0; n < t; n++) e[n] = arguments[n];
                var r;
                if (e.unshift("[TimerHook]"), "function" == typeof D.log) D.log(e.join(" "));
                else(r = console).log.apply(r, e)
            }
        },
        N = function() {
            if (!R()) {
                for (var t, e = arguments.length, n = new Array(e), r = 0; r < e; r++) n[r] = arguments[r];
                n.unshift("[TimerHook]"), (t = console).warn.apply(t, n)
            }
        },
        L = function() {
            function e() {
                t(this, e), l(this, "host", void 0), l(this, "isActive", !1), l(this, "isMountHost", !1)
            }
            return n(e, [{
                key: "mountHost",
                value: function(t) {
                    this.host = t, this.isMountHost = !0, this.onMounted()
                }
            }, {
                key: "activate",
                value: function() {
                    this.isActive = !0, this.init()
                }
            }, {
                key: "deactivate",
                value: function() {
                    this.isActive = !1, this.onDestroy()
                }
            }, {
                key: "moduleName",
                get: function() {}
            }, {
                key: "priority",
                get: function() {
                    return 50
                }
            }, {
                key: "autoActivate",
                get: function() {
                    return !0
                }
            }, {
                key: "isCoreModule",
                get: function() {
                    return !1
                }
            }, {
                key: "isOnlyOuterIframe",
                get: function() {
                    return !1
                }
            }, {
                key: "getDependencyModule",
                value: function(t) {
                    if (null != this.host) {
                        var e = this.host.getModule(t);
                        return e && e.moduleIdentityName ? e : void 0
                    }
                }
            }, {
                key: "init",
                value: function() {}
            }, {
                key: "onMounted",
                value: function() {}
            }, {
                key: "onDestroy",
                value: function() {}
            }, {
                key: "declareConfigs",
                value: function() {
                    return []
                }
            }, {
                key: "setConfig",
                value: function(t, e) {
                    var n = this.getDependencyModule("configs");
                    n && n.available() || N(
                        "Config module not found, can't set configs values."), n.setValue(
                        this.moduleIdentityName, t, e)
                }
            }, {
                key: "getConfig",
                value: function(t) {
                    var e, n = this.getDependencyModule("configs"),
                        r = (this.declareConfigs().find((function(e) {
                            return e.key === t
                        })) || {}).default;
                    return n && n.available() && null !== (e = n.getValue(this
                        .moduleIdentityName, t)) && void 0 !== e ? e : r
                }
            }, {
                key: "window",
                get: function() {
                    return this.host ? this.host.getWindow() : O()
                }
            }, {
                key: "document",
                get: function() {
                    return this.window.document
                }
            }]), e
        }();

    function B(t, e, n) {
        return (B = "undefined" != typeof Reflect && Reflect.get ? Reflect.get : function(t, e, n) {
            var r = function(t, e) {
                for (; !Object.prototype.hasOwnProperty.call(t, e) && null !== (t = c(t)););
                return t
            }(t, e);
            if (r) {
                var o = Object.getOwnPropertyDescriptor(r, e);
                return o.get ? o.get.call(n) : o.value
            }
        })(t, e, n || t)
    }

    function V(t) {
        var e = function() {
            if ("undefined" == typeof Reflect || !Reflect.construct) return !1;
            if (Reflect.construct.sham) return !1;
            if ("function" == typeof Proxy) return !0;
            try {
                return Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], (function() {}))), !0
            } catch (t) {
                return !1
            }
        }();
        return function() {
            var n, r = c(t);
            if (e) {
                var o = c(this).constructor;
                n = Reflect.construct(r, arguments, o)
            } else n = r.apply(this, arguments);
            return u(this, n)
        }
    }
    var U = function(e) {
        i(a, e);
        var o = V(a);

        function a() {
            var e;
            t(this, a);
            for (var n = arguments.length, i = new Array(n), u = 0; u < n; u++) i[u] = arguments[u];
            return l(r(e = o.call.apply(o, [this].concat(i))), "rate", 1), l(r(e), "host", void 0), e
        }
        return n(a, [{
            key: "onRateChange",
            value: function(t) {
                this.rate = t
            }
        }, {
            key: "mountHost",
            value: function(t) {
                B(c(a.prototype), "mountHost", this).call(this, t), this.rate = t.rate
            }
        }]), a
    }(L);

    function G(t) {
        var e = function() {
            if ("undefined" == typeof Reflect || !Reflect.construct) return !1;
            if (Reflect.construct.sham) return !1;
            if ("function" == typeof Proxy) return !0;
            try {
                return Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], (function() {}))), !0
            } catch (t) {
                return !1
            }
        }();
        return function() {
            var n, r = c(t);
            if (e) {
                var o = c(this).constructor;
                n = Reflect.construct(r, arguments, o)
            } else n = r.apply(this, arguments);
            return u(this, n)
        }
    }
    var H = function(e) {
        i(a, e);
        var o = G(a);

        function a() {
            var e;
            t(this, a);
            for (var n = arguments.length, i = new Array(n), u = 0; u < n; u++) i[u] = arguments[u];
            return l(r(e = o.call.apply(o, [this].concat(i))), "isDOMLoaded", !1), l(r(e),
                "waitDomLoadedCallback", void 0), e
        }
        return n(a, [{
            key: "onMounted",
            value: function() {
                var t = this;
                B(c(a.prototype), "onMounted", this).call(this), this.document
                    .addEventListener("readystatechange", (function() {
                        "interactive" !== t.document.readyState && "complete" !== t
                            .document.readyState || (t.isDOMLoaded = !0,
                                "function" == typeof t.waitDomLoadedCallback && t
                                .waitDomLoadedCallback(void 0))
                    }))
            }
        }, {
            key: "waitDomLoaded",
            value: function() {
                var t, e, n, r = this;
                return this.isDOMLoaded || null !== (t = this.document) && void 0 !== t &&
                    null !== (e = t.body) && void 0 !== e && null !== (n = e.childNodes) &&
                    void 0 !== n && n.length ? Promise.resolve() : new Promise((function(
                        t) {
                        r.waitDomLoadedCallback = t
                    }))
            }
        }, {
            key: "applyStyle",
            value: function(t) {
                var e = this.style(),
                    n = this.document.createElement("style");
                if (n.setAttribute("type", "text/css"), n.styleSheet) n.styleSheet.cssText =
                    e;
                else {
                    var r = this.document.createTextNode(e);
                    n.appendChild(r)
                }
                t.appendChild(n)
            }
        }, {
            key: "applyElement",
            value: function() {
                var t = this.element();
                return this.document.body.appendChild(t), t
            }
        }, {
            key: "onUiRateChange",
            value: function(t) {}
        }, {
            key: "onRateChange",
            value: function(t) {
                var e = this.rate !== t;
                B(c(a.prototype), "onRateChange", this).call(this, t), e && this
                    .onUiRateChange(t)
            }
        }, {
            key: "init",
            value: function() {
                var t = this;
                P("Started to loading '".concat(this.moduleIdentityName, "' component...")),
                    this.waitDomLoaded().then((function() {
                        t.applyStyle(t.applyElement()), P("UI component '".concat(t
                            .moduleIdentityName, "' loaded."))
                    }))
            }
        }]), a
    }(U);

    function W(t) {
        var e = function() {
            if ("undefined" == typeof Reflect || !Reflect.construct) return !1;
            if (Reflect.construct.sham) return !1;
            if ("function" == typeof Proxy) return !0;
            try {
                return Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], (function() {}))), !0
            } catch (t) {
                return !1
            }
        }();
        return function() {
            var n, r = c(t);
            if (e) {
                var o = c(this).constructor;
                n = Reflect.construct(r, arguments, o)
            } else n = r.apply(this, arguments);
            return u(this, n)
        }
    }
    var q = "hook_timer__change_rate",
        F = function(e) {
            i(a, e);
            var o = W(a);

            function a() {
                var e;
                t(this, a);
                for (var n = arguments.length, i = new Array(n), u = 0; u < n; u++) i[u] = arguments[u];
                return l(r(e = o.call.apply(o, [this].concat(i))), "rate", 1), l(r(e), "state", "preparing"), l(
                    r(e), "setIntervalOrigin", void 0), l(r(e), "clearIntervalOrigin", void 0), l(r(e),
                    "inTimeCheckId", void 0), e
            }
            return n(a, [{
                key: "setSpeed",
                value: function(t) {
                    var e = arguments.length > 1 && void 0 !== arguments[1] && arguments[1];
                    if (0 === t && (t = this.defaultRate), t && (t !== this.rate || e) && t >
                        0 && (this.rate = t, this.onRateChanged(t)), null == t) {
                        var n = prompt("输入欲改变计时器变化倍率（当前：" + this.rate + "）");
                        n && this.setSpeed(parseFloat(n))
                    }
                }
            }, {
                key: "speedDown",
                value: function(t) {
                    null == t && (t = this.getConfig("decrementRate")), this.setSpeed(this
                        .rate - t)
                }
            }, {
                key: "speedUp",
                value: function(t) {
                    null == t && (t = this.getConfig("incrementRate")), this.setSpeed(this
                        .rate + t)
                }
            }, {
                key: "speedDivide",
                value: function(t) {
                    null == t && (t = this.getConfig("divideRate")), this.setSpeed(this.rate / (
                        t || 1))
                }
            }, {
                key: "speedMultiply",
                value: function(t) {
                    null == t && (t = this.getConfig("multiplyRate")), this.setSpeed(this.rate *
                        (t || 1))
                }
            }, {
                key: "onRateChanged",
                value: function(t) {
                    P("Timer speed rate changed to:", t), this.sentChangesToIframe(), this
                        .getAllActivateModules().filter((function(t) {
                            return t.onRateChange
                        })).forEach((function(e) {
                            e.onRateChange(t)
                        }))
                }
            }, {
                key: "beginInTimeCheck",
                value: function() {
                    var t = this;
                    this.keptInTime && (this.inTimeCheckId = this.setIntervalOrigin.call(this
                        .getWindow(), (function() {
                            t.rate && 1 !== t.rate && t.setSpeed(t.rate, !0)
                        }), this.keptInterval))
                }
            }, {
                key: "catchOriginMethod",
                value: function() {
                    this.setIntervalOrigin = this.getWindow().setInterval, this
                        .clearIntervalOrigin = this.getWindow().clearInterval
                }
            }, {
                key: "keptInTime",
                get: function() {
                    return this.getConfig("keptInTime")
                }
            }, {
                key: "keptInterval",
                get: function() {
                    return this.getConfig("keptInterval")
                }
            }, {
                key: "defaultRate",
                get: function() {
                    return this.getConfig("defaultRate")
                }
            }, {
                key: "bootstrap",
                value: function() {
                    "preparing" === this.state && (this.catchOriginMethod(), this
                        .listenParentEvent(), this.launchModules(this.getAllModules()), this
                        .setSpeed(this.defaultRate), this.beginInTimeCheck(), this
                        .waitForModulesLoad(), this.state = "started")
                }
            }, {
                key: "launchModules",
                value: function(t) {
                    var e = this;
                    t.filter((function(t) {
                        return t.autoActivate
                    })).forEach((function(t) {
                        var n = t.moduleIdentityName;
                        e.deactivateModules.includes(n) && !t.isCoreModule || e
                            .activateModule(n)
                    }))
                }
            }, {
                key: "registerModules",
                value: function(t) {
                    var e = this;
                    return t.filter((function(t) {
                        var n = t.moduleIdentityName;
                        return n && e.registerModule(t, t.isOnlyOuterIframe), n
                    }))
                }
            }, {
                key: "waitForModulesLoad",
                value: function() {
                    var t = this,
                        e = this.getWindow().___hooks_preModules || [];
                    e.length > 0 && this.launchModules(this.registerModules(e)), this
                        .getWindow()[M] = 1, this.getWindow().addEventListener(M, (function(e) {
                            e.detail && e.detail.moduleIdentityName && t.launchModules(t
                                .registerModules([e.detail]))
                        }))
                }
            }, {
                key: "exportOuter",
                value: function() {
                    var t = this;
                    this.getWindow()._OxA ? (this.getWindow().$hookTimer = this, this
                        .getWindow()._OxA = this) : Object.defineProperty(this.getWindow(),
                        "_OxA", {
                            get: function() {
                                return 1
                            },
                            set: function(e) {
                                "_OxA" === e && (t.getWindow().$hookTimer = t)
                            }
                        })
                }
            }, {
                key: "listenParentEvent",
                value: function() {
                    var t = this;
                    v() && this.getWindow().addEventListener("message", (function(e) {
                        var n = e.data;
                        (n.type || "") === q && t.setSpeed(n.rate || 0)
                    }))
                }
            }, {
                key: "deactivateModules",
                get: function() {
                    return this.getConfig("deactivateModules")
                }
            }, {
                key: "sentChangesToIframe",
                value: function() {
                    var t = this.getWindow().document,
                        e = t.querySelectorAll("iframe") || [],
                        n = t.querySelectorAll("frame");
                    if (e.length)
                        for (var r = 0; r < e.length; r++) e[r].contentWindow.postMessage({
                            type: q,
                            rate: this.rate
                        }, "*");
                    if (n.length)
                        for (var o = 0; o < n.length; o++) n[o].contentWindow.postMessage({
                            type: q,
                            rate: this.rate
                        }, "*")
                }
            }, {
                key: "declareConfigs",
                value: function() {
                    return [{
                        key: "multiplyRate",
                        type: f.NUMBER,
                        default: 2
                    }, {
                        key: "divideRate",
                        type: f.NUMBER,
                        default: 2
                    }, {
                        key: "decrementRate",
                        type: f.NUMBER,
                        default: 2
                    }, {
                        key: "incrementRate",
                        type: f.NUMBER,
                        default: 2
                    }, {
                        key: "defaultRate",
                        type: f.NUMBER,
                        default: 1
                    }, {
                        key: "keptInTime",
                        type: f.BOOLEAN,
                        default: !0
                    }, {
                        key: "keptInterval",
                        type: f.NUMBER,
                        default: 4e3
                    }, {
                        key: "deactivateModules",
                        type: f.ARRAY,
                        values: this.getAllModules().map((function(t) {
                            return {
                                key: t.moduleIdentityName
                            }
                        })),
                        default: []
                    }]
                }
            }, {
                key: "setConfig",
                value: function(t, e) {
                    var n = this.getModule("configs");
                    n && n.available() || N(
                        "Config module not found, can't set configs values."), n.setValue(
                        "host", t, e)
                }
            }, {
                key: "getConfig",
                value: function(t) {
                    var e, n = this.getModule("configs"),
                        r = (this.declareConfigs().find((function(e) {
                            return e.key === t
                        })) || {}).default;
                    return n && n.available() && null !== (e = n.getValue("host", t)) &&
                        void 0 !== e ? e : r
                }
            }]), a
        }(function() {
            function e() {
                t(this, e), l(this, "modules", {})
            }
            return n(e, [{
                key: "activateModule",
                value: function(t) {
                    var e = this.getModule(t);
                    e ? (e.activate(), P("Module - '".concat(t, "' activated"))) : N(
                        "Activate module failed, ".concat(t, " is not found"))
                }
            }, {
                key: "deactivateModule",
                value: function(t) {
                    var e = this.getModule(t);
                    e || N("Deactivate module failed, '".concat(t, "' is not found")), e
                        .deactivate()
                }
            }, {
                key: "getModule",
                value: function(t) {
                    return this.modules[t]
                }
            }, {
                key: "registerModule",
                value: function(t) {
                    var e = arguments.length > 1 && void 0 !== arguments[1] && arguments[1];
                    e && v() || (this.modules[t.moduleIdentityName] = t, t.mountHost(this))
                }
            }, {
                key: "getAllActivateModules",
                value: function() {
                    return Object.values(this.modules).filter((function(t) {
                        return t.isActive
                    }))
                }
            }, {
                key: "getAllModules",
                value: function() {
                    return Object.values(this.modules)
                }
            }, {
                key: "getWindow",
                value: function() {
                    return p()
                }
            }]), e
        }());
    var z = function(t, e) {
        if (!(t instanceof e)) throw new TypeError("Cannot call a class as a function")
    };

    function Y(t, e) {
        return t(e = {
            exports: {}
        }, e.exports), e.exports
    }
    var $ = Y((function(t) {
        function e(n, r) {
            return t.exports = e = Object.setPrototypeOf || function(t, e) {
                return t.__proto__ = e, t
            }, e(n, r)
        }
        t.exports = e
    }));
    var K = function(t, e) {
            if ("function" != typeof e && null !== e) throw new TypeError(
                "Super expression must either be null or a function");
            t.prototype = Object.create(e && e.prototype, {
                constructor: {
                    value: t,
                    writable: !0,
                    configurable: !0
                }
            }), e && $(t, e)
        },
        J = Y((function(t) {
            function e(n) {
                return "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? t.exports =
                    e = function(t) {
                        return typeof t
                    } : t.exports = e = function(t) {
                        return t && "function" == typeof Symbol && t.constructor === Symbol && t !==
                            Symbol.prototype ? "symbol" : typeof t
                    }, e(n)
            }
            t.exports = e
        }));
    var Q = function(t) {
        if (void 0 === t) throw new ReferenceError(
            "this hasn't been initialised - super() hasn't been called");
        return t
    };
    var X = function(t, e) {
            return !e || "object" !== J(e) && "function" != typeof e ? Q(t) : e
        },
        Z = Y((function(t) {
            function e(n) {
                return t.exports = e = Object.setPrototypeOf ? Object.getPrototypeOf : function(t) {
                    return t.__proto__ || Object.getPrototypeOf(t)
                }, e(n)
            }
            t.exports = e
        }));
    var tt = function(t, e) {
        (null == e || e > t.length) && (e = t.length);
        for (var n = 0, r = new Array(e); n < e; n++) r[n] = t[n];
        return r
    };
    var et = function(t) {
        if (Array.isArray(t)) return tt(t)
    };
    var nt = function(t) {
        if ("undefined" != typeof Symbol && Symbol.iterator in Object(t)) return Array.from(t)
    };
    var rt = function(t, e) {
        if (t) {
            if ("string" == typeof t) return tt(t, e);
            var n = Object.prototype.toString.call(t).slice(8, -1);
            return "Object" === n && t.constructor && (n = t.constructor.name), "Map" === n || "Set" === n ?
                Array.from(t) : "Arguments" === n || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n) ?
                tt(t, e) : void 0
        }
    };
    var ot = function() {
        throw new TypeError(
            "Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."
        )
    };
    var it = function(t) {
        return et(t) || nt(t) || rt(t) || ot()
    };

    function at(t, e) {
        for (var n = 0; n < e.length; n++) {
            var r = e[n];
            r.enumerable = r.enumerable || !1, r.configurable = !0, "value" in r && (r.writable = !0), Object
                .defineProperty(t, r.key, r)
        }
    }
    var ut = function(t, e, n) {
        return e && at(t.prototype, e), n && at(t, n), t
    };
    var ct = function(t, e) {
            for (; !Object.prototype.hasOwnProperty.call(t, e) && null !== (t = Z(t)););
            return t
        },
        lt = Y((function(t) {
            function e(n, r, o) {
                return "undefined" != typeof Reflect && Reflect.get ? t.exports = e = Reflect.get : t
                    .exports = e = function(t, e, n) {
                        var r = ct(t, e);
                        if (r) {
                            var o = Object.getOwnPropertyDescriptor(r, e);
                            return o.get ? o.get.call(n) : o.value
                        }
                    }, e(n, r, o || n)
            }
            t.exports = e
        }));
    var st = function(t) {
        return -1 !== Function.toString.call(t).indexOf("[native code]")
    };
    var ft = function() {
            if ("undefined" == typeof Reflect || !Reflect.construct) return !1;
            if (Reflect.construct.sham) return !1;
            if ("function" == typeof Proxy) return !0;
            try {
                return Date.prototype.toString.call(Reflect.construct(Date, [], (function() {}))), !0
            } catch (t) {
                return !1
            }
        },
        ht = Y((function(t) {
            function e(n, r, o) {
                return ft() ? t.exports = e = Reflect.construct : t.exports = e = function(t, e, n) {
                    var r = [null];
                    r.push.apply(r, e);
                    var o = new(Function.bind.apply(t, r));
                    return n && $(o, n.prototype), o
                }, e.apply(null, arguments)
            }
            t.exports = e
        })),
        dt = Y((function(t) {
            function e(n) {
                var r = "function" == typeof Map ? new Map : void 0;
                return t.exports = e = function(t) {
                    if (null === t || !st(t)) return t;
                    if ("function" != typeof t) throw new TypeError(
                        "Super expression must either be null or a function");
                    if (void 0 !== r) {
                        if (r.has(t)) return r.get(t);
                        r.set(t, e)
                    }

                    function e() {
                        return ht(t, arguments, Z(this).constructor)
                    }
                    return e.prototype = Object.create(t.prototype, {
                        constructor: {
                            value: e,
                            enumerable: !1,
                            writable: !0,
                            configurable: !0
                        }
                    }), $(e, t)
                }, e(n)
            }
            t.exports = e
        }));

    function yt(t, e) {
        var n = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : "initAssign",
            r = Object.getPrototypeOf(e);
        return Object.setPrototypeOf(t, r), "function" == typeof r[n] && r[n].call(t, e), t
    }

    function pt(t) {
        return Number(Math.random().toString().substr(3, t) + Date.now()).toString(36)
    }

    function vt(t) {
        var e = function() {
            if ("undefined" == typeof Reflect || !Reflect.construct) return !1;
            if (Reflect.construct.sham) return !1;
            if ("function" == typeof Proxy) return !0;
            try {
                return Date.prototype.toString.call(Reflect.construct(Date, [], (function() {}))), !0
            } catch (t) {
                return !1
            }
        }();
        return function() {
            var n, r = Z(t);
            if (e) {
                var o = Z(this).constructor;
                n = Reflect.construct(r, arguments, o)
            } else n = r.apply(this, arguments);
            return X(this, n)
        }
    }! function(t, e) {
        t(e = {
            exports: {}
        }, e.exports)
    }((function(t) {
        function e(n) {
            return "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? t.exports = e =
                function(t) {
                    return typeof t
                } : t.exports = e = function(t) {
                    return t && "function" == typeof Symbol && t.constructor === Symbol && t !== Symbol
                        .prototype ? "symbol" : typeof t
                }, e(n)
        }
        t.exports = e
    }));
    var gt = {
        instanceType: function(t) {
            K(n, t);
            var e = vt(n);

            function n() {
                return z(this, n), e.apply(this, arguments)
            }
            return ut(n, [{
                key: "initAssign",
                value: function(t) {
                    this.id = pt(7),
                        function(t, e, n, r) {
                            e && void 0 !== e[n] ? t[n] = e[n] : "function" ==
                                typeof r && (t[n] = r())
                        }(this, t, "uniqueId", (function() {
                            return pt(7)
                        }))
                }
            }, {
                key: "bind",
                value: function(t) {
                    var e, r = arguments.length > 1 && void 0 !== arguments[1] ?
                        arguments[1] : [];
                    return yt((e = lt(Z(n.prototype), "bind", this)).call.apply(e, [
                        this, t
                    ].concat(it(r))), this)
                }
            }, {
                key: "before",
                value: function(t) {
                    var e = arguments.length > 1 && void 0 !== arguments[1] &&
                        arguments[1];
                    return this.surround({
                        before: t,
                        adaptAsync: e
                    })
                }
            }, {
                key: "after",
                value: function(t) {
                    var e = arguments.length > 1 && void 0 !== arguments[1] &&
                        arguments[1];
                    return this.surround({
                        after: t,
                        adaptAsync: e
                    })
                }
            }, {
                key: "surround",
                value: function(t) {
                    var e = t.before,
                        n = void 0 === e ? void 0 : e,
                        r = t.after,
                        o = void 0 === r ? void 0 : r,
                        i = t.onError,
                        a = void 0 === i ? void 0 : i,
                        u = t.adaptAsync,
                        c = void 0 !== u && u,
                        l = this;
                    return "function" != typeof l ? l : yt((function() {
                        for (var t = this, e = arguments.length, r =
                                new Array(e), i = 0; i < e; i++) r[i] =
                            arguments[i];
                        var u = {},
                            s = {
                                origin: l,
                                args: r,
                                trans: u
                            },
                            f = "function" == typeof a;
                        try {
                            var h, d, y = !1;
                            return "function" == typeof n && (h = n.call(
                                this, Object.assign({}, s, {
                                    preventDefault: function() {
                                        y = !0
                                    }
                                })), y) ? h : (d =
                                h instanceof Promise && c ? h.then((
                                    function() {
                                        return l.apply(t, r)
                                    })) : l.apply(this, r),
                                "function" == typeof o && (d =
                                    d instanceof Promise && c ? d.then((
                                        function(e) {
                                            return o.call(t, Object
                                                .assign({}, s, {
                                                    lastValue: e
                                                }))
                                        })) : o.call(this, Object
                                        .assign({}, s, {
                                            lastValue: d
                                        }))), d instanceof Promise &&
                                c && f ? d.catch((function(e) {
                                    var n = !1,
                                        r = "";
                                    return Promise.resolve(a
                                        .call(t, Object
                                            .assign({}, s, {
                                                error: e,
                                                resolve: function(
                                                    t
                                                ) {
                                                    r = t,
                                                        n = !
                                                        0
                                                }
                                            }))).then((
                                        function(t) {
                                            if (!n)
                                                throw e;
                                            return r ||
                                                t
                                        }))
                                })) : d)
                        } catch (t) {
                            if (!f) throw t;
                            var p = !1,
                                v = "",
                                g = function(t) {
                                    v = t, p = !0
                                },
                                m = a.call(this, Object.assign({}, s, {
                                    error: t,
                                    resolve: g
                                }));
                            if (!p) throw t;
                            return v || m
                        }
                    }), this)
                }
            }, {
                key: "then",
                value: function(t) {
                    var e = this;
                    return yt((function() {
                        for (var n = arguments.length, r = new Array(n), o =
                                0; o < n; o++) r[o] = arguments[o];
                        var i = e.apply(this, r);
                        return Promise.resolve(i).then(t)
                    }), this)
                }
            }, {
                key: "catch",
                value: function(t) {
                    var e = this;
                    return yt((function() {
                        var n;
                        try {
                            for (var r = arguments.length, o = new Array(r),
                                    i = 0; i < r; i++) o[i] = arguments[i];
                            if ((n = e.apply(this, o)) instanceof Promise)
                                return n.catch(t)
                        } catch (e) {
                            n = t.call(this, e)
                        }
                        return n
                    }), this)
                }
            }, {
                key: "finally",
                value: function(t) {
                    var e = this;
                    return yt((function() {
                        var n = function() {
                            try {
                                t.call(this)
                            } catch (t) {}
                        };
                        try {
                            for (var r = arguments.length, o = new Array(r),
                                    i = 0; i < r; i++) o[i] = arguments[i];
                            var a = e.apply(this, o);
                            return a instanceof Promise ? "function" ==
                                typeof a.finally ? a.finally((function() {
                                    return n()
                                })) : a.catch((function(t) {
                                    return t
                                })).then((function(t) {
                                    if (n(), t instanceof Error)
                                        throw t
                                })) : (n(), a)
                        } catch (t) {
                            throw n(), t
                        }
                    }), this)
                }
            }, {
                key: "register",
                value: function() {
                    var t = arguments.length > 0 && void 0 !== arguments[0] ? arguments[
                        0] : {};
                    return this.registerClass((function(e) {
                        var n = function(t) {
                            K(n, t);
                            var e = vt(n);

                            function n() {
                                return z(this, n), e.apply(this,
                                    arguments)
                            }
                            return n
                        }(e);
                        return Object.assign(n.prototype, t), n
                    }))
                }
            }, {
                key: "registerClass",
                value: function(t) {
                    var e = t(this.constructor),
                        n = this.bind(this);
                    if (Object.setPrototypeOf(n, e.prototype), "function" != typeof e ||
                        !(n instanceof this.constructor)) throw new Error(
                        "Registered class must extend FunctionInstance");
                    return n
                }
            }]), n
        }(dt(Function))
    };

    function mt(t, e) {
        var n = function() {
            for (var e = arguments.length, n = new Array(e), r = 0; r < e; r++) n[r] = arguments[r];
            return (t || function() {}).apply(this, n)
        };
        return function(t, e) {
            var n = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : "initAssign",
                r = e.prototype;
            Object.setPrototypeOf(t, r), "function" == typeof r[n] && r[n].call(t)
        }(n, (e = Object.assign({}, gt, e)).instanceType), n
    }
    var bt, wt = {
            protect: !1,
            syncDesc: !0,
            native: !1
        },
        kt = Object.defineProperty,
        xt = Object.defineProperties;

    function Ot(t, e, n) {
        var r = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : {},
            o = t[e];
        if ("function" == typeof o) {
            var i = Object.assign({}, wt, r),
                a = i.native,
                u = n(a ? o : mt(o));
            t[e] = a ? u : function() {
                for (var t = arguments.length, e = new Array(t), n = 0; n < t; n++) e[n] = arguments[n];
                try {
                    return u.apply(this, e)
                } catch (t) {
                    return console.warn("[Hook JS]", "Hooks  running lost once."), o.apply(this, e)
                }
            };
            var c = i.protect,
                l = i.syncDesc;
            c && At(t, e), l && St(o, t[e])
        }
    }

    function Rt(t, e, n, r) {
        var o = arguments.length > 4 && void 0 !== arguments[4] ? arguments[4] : {};
        return Ot(t, e, (function(t) {
            return t[n](r)
        }), o)
    }

    function Mt(t, e, n) {
        var r = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : {};
        return Rt(t, e, "before", n, r)
    }

    function _t(t, e, n) {
        var r = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : {};
        return Ot(t, e, n, Object.assign({}, r, {
            native: !0
        }))
    }

    function At(t, e) {
        kt.call(Object, t, e, {
            writable: !1
        })
    }

    function St(t, e) {
        xt.call(Object, e, {
            toString: {
                enumerable: !1,
                writable: !0,
                value: function() {
                    return t.toString()
                }
            },
            toLocaleString: {
                enumerable: !1,
                writable: !0,
                value: function() {
                    return t.toLocaleString()
                }
            }
        })
    }

    function Ct(t) {
        var e = function() {
            if ("undefined" == typeof Reflect || !Reflect.construct) return !1;
            if (Reflect.construct.sham) return !1;
            if ("function" == typeof Proxy) return !0;
            try {
                return Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], (function() {}))), !0
            } catch (t) {
                return !1
            }
        }();
        return function() {
            var n, r = c(t);
            if (e) {
                var o = c(this).constructor;
                n = Reflect.construct(r, arguments, o)
            } else n = r.apply(this, arguments);
            return u(this, n)
        }
    }! function(t) {
        t.TIMEOUT = "timeout", t.INTERVAL = "interval"
    }(bt || (bt = {}));
    var Tt = function(e) {
        i(a, e);
        var o = Ct(a);

        function a() {
            var e;
            t(this, a);
            for (var n = arguments.length, i = new Array(n), u = 0; u < n; u++) i[u] = arguments[u];
            return l(r(e = o.call.apply(o, [this].concat(i))), "percentage", void 0), l(r(e),
                "interval", {}), l(r(e), "timeout", {}), l(r(e), "setIntervalOrigin", void 0), l(r(e),
                "setTimeoutOrigin", void 0), l(r(e), "clearIntervalOrigin", void 0), l(r(e),
                "clearTimeoutOrigin", void 0), e
        }
        return n(a, [{
            key: "onMounted",
            value: function() {
                B(c(a.prototype), "onMounted", this).call(this), this.setIntervalOrigin =
                    this.window.setInterval, this.setTimeoutOrigin = this.window.setTimeout,
                    this.clearIntervalOrigin = this.window.clearInterval, this
                    .clearTimeoutOrigin = this.window.clearTimeout
            }
        }, {
            key: "init",
            value: function() {
                var t = this;
                this.percentage = 1 / this.rate, _t(this.window, "setInterval", (function(
                    e) {
                    return t.getHookedTimerFunction(bt.INTERVAL, e)
                })), _t(this.window, "setTimeout", (function(e) {
                    return t.getHookedTimerFunction(bt.TIMEOUT, e)
                })), Mt(this.window, "clearInterval", (function(e) {
                    var n = e.args;
                    t.redirectNewestId(n)
                })), Mt(this.window, "clearTimeout", (function(e) {
                    var n = e.args;
                    t.redirectNewestId(n)
                }))
            }
        }, {
            key: "onRateChange",
            value: function(t) {
                var e = this;
                B(c(a.prototype), "onRateChange", this).call(this, t), this.percentage = 1 /
                    t, Object.values(this.interval).forEach((function(t) {
                        t.args[1] = Math.floor((t.originMS || 1) * e.percentage), e
                            .clearIntervalOrigin.call(e.window, t.nowId), t.nowId =
                            e.setIntervalOrigin.apply(e.window, t.args)
                    })), Object.values(this.timeout).forEach((function(t) {
                        var n = Date.now(),
                            r = t.exceptNextFireTime,
                            o = t.oldPercentage,
                            i = r - n;
                        i < 0 && (i = 0);
                        var a = Math.floor(e.percentage / o * i);
                        t.args[1] = a, t.exceptNextFireTime = n + a, t
                            .oldPercentage = e.percentage, e.clearTimeoutOrigin
                            .call(e.window, t.nowId), t.nowId = e.setTimeoutOrigin
                            .apply(e.window, t.args)
                    }))
            }
        }, {
            key: "notifyExec",
            value: function(t) {
                var e = this;
                t && Object.values(this.timeout).filter((function(e) {
                    return e.uniqueId === t
                })).forEach((function(t) {
                    e.clearTimeoutOrigin.call(e.window, t.nowId), delete e
                        .timeout[t.originId]
                }))
            }
        }, {
            key: "redirectNewestId",
            value: function(t) {
                var e = t[0];
                this.interval[e] && (t[0] = this.interval[e].nowId, delete this.interval[
                    e]), this.timeout[e] && (t[0] = this.timeout[e].nowId, delete this
                    .timeout[e])
            }
        }, {
            key: "getHookedTimerFunction",
            value: function(t, e) {
                var n = t,
                    r = this;
                return function() {
                    for (var t = arguments.length, o = new Array(t), i = 0; i < t; i++)
                        o[i] = arguments[i];
                    var a = y(),
                        u = o[0];
                    "string" == typeof u && (r.window.__timer = {
                            notifyExec: r.notifyExec.bind(r)
                        }, u += ";__timer.notifyExec(" + a + ")", o[0] = u),
                        "function" == typeof u && (o[0] = function() {
                            var t = u.apply(this, arguments);
                            return r.notifyExec(a), t
                        });
                    var c = o[1];
                    o[1] *= r.percentage;
                    var l = e.apply(r.window, o);
                    return r[n][l] = {
                        args: o,
                        originMS: c,
                        originId: l,
                        nowId: l,
                        uniqueId: a,
                        oldPercentage: r.percentage,
                        exceptNextFireTime: Date.now() + c
                    }, l
                }
            }
        }, {
            key: "moduleIdentityName",
            get: function() {
                return "timer"
            }
        }]), a
    }(U);

    function It(t) {
        var e = function() {
            if ("undefined" == typeof Reflect || !Reflect.construct) return !1;
            if (Reflect.construct.sham) return !1;
            if ("function" == typeof Proxy) return !0;
            try {
                return Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], (function() {}))), !0
            } catch (t) {
                return !1
            }
        }();
        return function() {
            var n, r = c(t);
            if (e) {
                var o = c(this).constructor;
                n = Reflect.construct(r, arguments, o)
            } else n = r.apply(this, arguments);
            return u(this, n)
        }
    }
    var Et, jt = function(e) {
        i(a, e);
        var o = It(a);

        function a() {
            var e;
            t(this, a);
            for (var n = arguments.length, i = new Array(n), u = 0; u < n; u++) i[u] = arguments[u];
            return l(r(e = o.call.apply(o, [this].concat(i))), "DateOrigin", void 0), l(r(e),
                "DateModified", void 0), l(r(e), "rate", 1), l(r(e), "lastDatetime", void 0), l(r(e),
                "lastMDatetime", void 0), e
        }
        return n(a, [{
            key: "onMounted",
            value: function() {
                B(c(a.prototype), "onMounted", this).call(this), this.lastDatetime = Date
                    .now(), this.lastMDatetime = Date.now(), this.DateOrigin = this.window
                    .Date, this.DateModified = this.window.Date
            }
        }, {
            key: "init",
            value: function() {
                this.hookedDate()
            }
        }, {
            key: "onRateChange",
            value: function(t) {
                this.DateModified && (this.lastMDatetime = this.DateModified.now(), this
                    .lastDatetime = this.DateOrigin.now()), B(c(a.prototype),
                    "onRateChange", this).call(this, t)
            }
        }, {
            key: "hookedDate",
            value: function() {
                var e = this,
                    n = this;
                _t(this.window, "Date", (function(e) {
                    var r = function(e) {
                        i(o, e);
                        var r = It(o);

                        function o() {
                            t(this, o);
                            for (var e = arguments.length, i = new Array(e),
                                    a = 0; a < e; a++) i[a] = arguments[a];
                            if (0 === i.length) {
                                var u = n.DateOrigin.now(),
                                    c = u - n.lastDatetime,
                                    l = c * n.rate;
                                i.push(n.lastMDatetime + l)
                            }
                            return r.call.apply(r, [this].concat(i))
                        }
                        return o
                    }(e);
                    return r = r.bind(new r)
                })), this.DateModified = this.window.Date, _t(this.DateModified, "now",
                    (function() {
                        return function() {
                            return (new e.DateModified).getTime()
                        }
                    }))
            }
        }, {
            key: "moduleIdentityName",
            get: function() {
                return "dateTimer"
            }
        }]), a
    }(U);

    function Dt(t, e) {
        var n = "undefined" != typeof Symbol && t[Symbol.iterator] || t["@@iterator"];
        if (!n) {
            if (Array.isArray(t) || (n = function(t, e) {
                    if (!t) return;
                    if ("string" == typeof t) return Pt(t, e);
                    var n = Object.prototype.toString.call(t).slice(8, -1);
                    "Object" === n && t.constructor && (n = t.constructor.name);
                    if ("Map" === n || "Set" === n) return Array.from(t);
                    if ("Arguments" === n || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return Pt(
                        t, e)
                }(t)) || e && t && "number" == typeof t.length) {
                n && (t = n);
                var r = 0,
                    o = function() {};
                return {
                    s: o,
                    n: function() {
                        return r >= t.length ? {
                            done: !0
                        } : {
                            done: !1,
                            value: t[r++]
                        }
                    },
                    e: function(t) {
                        throw t
                    },
                    f: o
                }
            }
            throw new TypeError(
                "Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."
            )
        }
        var i, a = !0,
            u = !1;
        return {
            s: function() {
                n = n.call(t)
            },
            n: function() {
                var t = n.next();
                return a = t.done, t
            },
            e: function(t) {
                u = !0, i = t
            },
            f: function() {
                try {
                    a || null == n.return || n.return()
                } finally {
                    if (u) throw i
                }
            }
        }
    }

    function Pt(t, e) {
        (null == e || e > t.length) && (e = t.length);
        for (var n = 0, r = new Array(e); n < e; n++) r[n] = t[n];
        return r
    }

    function Nt(t) {
        var e = function() {
            if ("undefined" == typeof Reflect || !Reflect.construct) return !1;
            if (Reflect.construct.sham) return !1;
            if ("function" == typeof Proxy) return !0;
            try {
                return Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], (function() {}))), !0
            } catch (t) {
                return !1
            }
        }();
        return function() {
            var n, r = c(t);
            if (e) {
                var o = c(this).constructor;
                n = Reflect.construct(r, arguments, o)
            } else n = r.apply(this, arguments);
            return u(this, n)
        }
    }! function(t) {
        t.CTRL = "ctrl", t.META = "meta", t.CMD = "meta", t.SHIFT = "shift", t.ALT = "alt"
    }(Et || (Et = {}));
    var Lt = function(e) {
        i(o, e);
        var r = Nt(o);

        function o() {
            return t(this, o), r.apply(this, arguments)
        }
        return n(o, [{
            key: "init",
            value: function() {
                var t = this,
                    e = this.shortcutList;
                this.window.addEventListener("keydown", (function(n) {
                    var r, o = Dt(e);
                    try {
                        for (o.s(); !(r = o.n()).done;) {
                            var i = r.value;
                            I(n, i) && (n.preventDefault(), n.stopPropagation(),
                                i.operator(t.host))
                        }
                    } catch (t) {
                        o.e(t)
                    } finally {
                        o.f()
                    }
                }))
            }
        }, {
            key: "shortcutList",
            get: function() {
                var t = this;
                return [
                    ["shortcutExpressions.+", function(t) {
                        return t.speedUp()
                    }],
                    ["shortcutExpressions.-", function(t) {
                        return t.speedDown()
                    }],
                    ["shortcutExpressions.*", function(t) {
                        return t.speedMultiply()
                    }],
                    ["shortcutExpressions./", function(t) {
                        return t.speedDivide()
                    }],
                    ["shortcutExpressions.reset", function(t) {
                        return t.setSpeed(1)
                    }],
                    ["shortcutExpressions.custom", function(t) {
                        return t.setSpeed()
                    }]
                ].map((function(e) {
                    var n = w(e, 2),
                        r = n[0],
                        o = n[1];
                    return {
                        expressions: t.getConfig(r),
                        operator: o
                    }
                })).map((function(t) {
                    return e = t, "string" == typeof(n = Object.assign({}, e, {
                            conditions: []
                        })).expressions && (n.expressions = n.expressions.split(
                            ";")), n.expressions && n
                        .expressions instanceof Array && (n.conditions = n
                            .expressions.map((function(t) {
                                return function(t) {
                                    var e = arguments.length > 1 &&
                                        void 0 !== arguments[1] ?
                                        arguments[1] : "+",
                                        n = t.split(e).map((
                                            function(t) {
                                                return t.trim()
                                            })).filter((function(
                                            t) {
                                            return t
                                        })),
                                        r = {
                                            code: n.pop() ||
                                                "UNKNOWN_KEY"
                                        };
                                    return n.forEach((function(t) {
                                        r[t + "Key"] = !
                                            0
                                    })), r
                                }(t)
                            }))), n;
                    var e, n
                }))
            }
        }, {
            key: "moduleIdentityName",
            get: function() {
                return "shortcutKey"
            }
        }, {
            key: "declareConfigs",
            value: function() {
                return [{
                    type: f.ARRAY,
                    itemType: f.SHORTCUT,
                    key: "shortcutExpressions.+",
                    default: ["ctrl + Equal", "meta + Equal", "ctrl + Period",
                        "meta + Period"
                    ]
                }, {
                    type: f.ARRAY,
                    itemType: f.SHORTCUT,
                    key: "shortcutExpressions.-",
                    default: ["ctrl + Minus", "meta + Minus", "ctrl + Comma",
                        "meta + Comma"
                    ]
                }, {
                    type: f.ARRAY,
                    itemType: f.SHORTCUT,
                    key: "shortcutExpressions.*",
                    default: ["alt + Equal", "alt + Period"]
                }, {
                    type: f.ARRAY,
                    itemType: f.SHORTCUT,
                    key: "shortcutExpressions./",
                    default: ["alt + Minus", "alt + Comma"]
                }, {
                    type: f.ARRAY,
                    itemType: f.SHORTCUT,
                    key: "shortcutExpressions.reset",
                    default: ["ctrl + Digit0", "meta + Digit0", "alt + Digit0"]
                }, {
                    type: f.ARRAY,
                    itemType: f.SHORTCUT,
                    key: "shortcutExpressions.custom",
                    default: ["ctrl + Digit9", "meta + Digit9"]
                }]
            }
        }]), o
    }(U);

    function Bt(t) {
        var e = function() {
            if ("undefined" == typeof Reflect || !Reflect.construct) return !1;
            if (Reflect.construct.sham) return !1;
            if ("function" == typeof Proxy) return !0;
            try {
                return Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], (function() {}))), !0
            } catch (t) {
                return !1
            }
        }();
        return function() {
            var n, r = c(t);
            if (e) {
                var o = c(this).constructor;
                n = Reflect.construct(r, arguments, o)
            } else n = r.apply(this, arguments);
            return u(this, n)
        }
    }

    function Vt(t, e) {
        var n = "undefined" != typeof Symbol && t[Symbol.iterator] || t["@@iterator"];
        if (!n) {
            if (Array.isArray(t) || (n = function(t, e) {
                    if (!t) return;
                    if ("string" == typeof t) return Ut(t, e);
                    var n = Object.prototype.toString.call(t).slice(8, -1);
                    "Object" === n && t.constructor && (n = t.constructor.name);
                    if ("Map" === n || "Set" === n) return Array.from(t);
                    if ("Arguments" === n || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return Ut(
                        t, e)
                }(t)) || e && t && "number" == typeof t.length) {
                n && (t = n);
                var r = 0,
                    o = function() {};
                return {
                    s: o,
                    n: function() {
                        return r >= t.length ? {
                            done: !0
                        } : {
                            done: !1,
                            value: t[r++]
                        }
                    },
                    e: function(t) {
                        throw t
                    },
                    f: o
                }
            }
            throw new TypeError(
                "Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."
            )
        }
        var i, a = !0,
            u = !1;
        return {
            s: function() {
                n = n.call(t)
            },
            n: function() {
                var t = n.next();
                return a = t.done, t
            },
            e: function(t) {
                u = !0, i = t
            },
            f: function() {
                try {
                    a || null == n.return || n.return()
                } finally {
                    if (u) throw i
                }
            }
        }
    }

    function Ut(t, e) {
        (null == e || e > t.length) && (e = t.length);
        for (var n = 0, r = new Array(e); n < e; n++) r[n] = t[n];
        return r
    }

    function Gt(t) {
        var e, n = {},
            r = Vt(Object.entries(t).filter((function(t) {
                var e = w(t, 1)[0];
                return !["target", "key"].includes(e)
            })));
        try {
            for (r.s(); !(e = r.n()).done;) {
                var o = w(e.value, 2),
                    i = o[0],
                    a = o[1];
                n[i] = a
            }
        } catch (t) {
            r.e(t)
        } finally {
            r.f()
        }
        return n
    }
    var Ht = function(e) {
        i(a, e);
        var o = Bt(a);

        function a() {
            var e;
            t(this, a);
            for (var n = arguments.length, i = new Array(n), u = 0; u < n; u++) i[u] = arguments[u];
            return l(r(e = o.call.apply(o, [this].concat(i))), "defines", []), l(r(e),
                "definePropertiesOrigin", void 0), l(r(e), "definePropertyOrigin", void 0), e
        }
        return n(a, [{
            key: "onMounted",
            value: function() {
                B(c(a.prototype), "onMounted", this).call(this), this
                    .definePropertiesOrigin = this.window.Object.defineProperties, this
                    .definePropertyOrigin = this.window.Object.defineProperty
            }
        }, {
            key: "isCoreModule",
            get: function() {
                return !0
            }
        }, {
            key: "init",
            value: function() {
                var t = this;
                Mt(this.window.Object, "defineProperties", (function(e) {
                    var n, r = e.args,
                        o = w(r, 2),
                        i = o[0],
                        a = o[1],
                        u = Object.entries(a).map((function(e) {
                            var n = w(e, 2),
                                o = n[0],
                                a = n[1],
                                u = Object.assign({
                                    target: i,
                                    key: o
                                }, a);
                            return t.hookDefine(u) ? (r[0] = u.target, [
                                u.key, Gt(u)
                            ]) : [!1]
                        })).filter((function(t) {
                            return w(t, 1)[0]
                        }));
                    r[1] = (n = {}, u.forEach((function(t) {
                        n[null == t[0] ? "" : t[0]] = t[1]
                    })), n)
                })), Mt(this.window.Object, "defineProperty", (function(e) {
                    var n = e.args,
                        r = e.preventDefault,
                        o = w(n, 3),
                        i = o[0],
                        a = o[1],
                        u = o[2],
                        c = Object.assign({
                            target: i,
                            key: a
                        }, u);
                    t.hookDefine(c) ? (n[0] = c.target, n[1] = c.key, n[2] = Gt(
                        c)) : r()
                }))
            }
        }, {
            key: "hookDefine",
            value: function(t) {
                var e, n = Vt(this.defines);
                try {
                    for (n.s(); !(e = n.n()).done;) {
                        if ((0, e.value)(t)) return !1
                    }
                } catch (t) {
                    n.e(t)
                } finally {
                    n.f()
                }
                return !0
            }
        }, {
            key: "applyDefineRole",
            value: function(t) {
                this.defines.push(t)
            }
        }, {
            key: "moduleIdentityName",
            get: function() {
                return "definition"
            }
        }]), a
    }(L);

    function Wt(t) {
        return function(t) {
            if (Array.isArray(t)) return m(t)
        }(t) || function(t) {
            if ("undefined" != typeof Symbol && null != t[Symbol.iterator] || null != t["@@iterator"])
                return Array.from(t)
        }(t) || b(t) || function() {
            throw new TypeError(
                "Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."
            )
        }()
    }

    function qt(t) {
        var e = function() {
            if ("undefined" == typeof Reflect || !Reflect.construct) return !1;
            if (Reflect.construct.sham) return !1;
            if ("function" == typeof Proxy) return !0;
            try {
                return Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], (function() {}))), !0
            } catch (t) {
                return !1
            }
        }();
        return function() {
            var n, r = c(t);
            if (e) {
                var o = c(this).constructor;
                n = Reflect.construct(r, arguments, o)
            } else n = r.apply(this, arguments);
            return u(this, n)
        }
    }
    var Ft = function(e) {
        i(a, e);
        var o = qt(a);

        function a() {
            var e;
            t(this, a);
            for (var n = arguments.length, i = new Array(n), u = 0; u < n; u++) i[u] = arguments[u];
            return l(r(e = o.call.apply(o, [this].concat(i))), "extraElements", []), e
        }
        return n(a, [{
            key: "init",
            value: function() {
                var t = this;
                ! function(t, e, n) {
                    Rt(t, e, "after", n, arguments.length > 3 && void 0 !== arguments[3] ?
                        arguments[3] : {})
                }(this.window.Element.prototype, "attachShadow", (function(e) {
                    var n = e.lastValue;
                    return t.extraElements.push(n), n
                }))
            }
        }, {
            key: "querySelectorAll",
            value: function(t) {
                return g(this.extraElements.map((function(e) {
                    return Wt(e.querySelectorAll(t))
                })))
            }
        }, {
            key: "moduleIdentityName",
            get: function() {
                return "shadowDOM"
            }
        }, {
            key: "isCoreModule",
            get: function() {
                return !0
            }
        }]), a
    }(L);

    function zt(t, e) {
        var n = "undefined" != typeof Symbol && t[Symbol.iterator] || t["@@iterator"];
        if (!n) {
            if (Array.isArray(t) || (n = function(t, e) {
                    if (!t) return;
                    if ("string" == typeof t) return Yt(t, e);
                    var n = Object.prototype.toString.call(t).slice(8, -1);
                    "Object" === n && t.constructor && (n = t.constructor.name);
                    if ("Map" === n || "Set" === n) return Array.from(t);
                    if ("Arguments" === n || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return Yt(
                        t, e)
                }(t)) || e && t && "number" == typeof t.length) {
                n && (t = n);
                var r = 0,
                    o = function() {};
                return {
                    s: o,
                    n: function() {
                        return r >= t.length ? {
                            done: !0
                        } : {
                            done: !1,
                            value: t[r++]
                        }
                    },
                    e: function(t) {
                        throw t
                    },
                    f: o
                }
            }
            throw new TypeError(
                "Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."
            )
        }
        var i, a = !0,
            u = !1;
        return {
            s: function() {
                n = n.call(t)
            },
            n: function() {
                var t = n.next();
                return a = t.done, t
            },
            e: function(t) {
                u = !0, i = t
            },
            f: function() {
                try {
                    a || null == n.return || n.return()
                } finally {
                    if (u) throw i
                }
            }
        }
    }

    function Yt(t, e) {
        (null == e || e > t.length) && (e = t.length);
        for (var n = 0, r = new Array(e); n < e; n++) r[n] = t[n];
        return r
    }

    function $t(t) {
        var e = function() {
            if ("undefined" == typeof Reflect || !Reflect.construct) return !1;
            if (Reflect.construct.sham) return !1;
            if ("function" == typeof Proxy) return !0;
            try {
                return Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], (function() {}))), !0
            } catch (t) {
                return !1
            }
        }();
        return function() {
            var n, r = c(t);
            if (e) {
                var o = c(this).constructor;
                n = Reflect.construct(r, arguments, o)
            } else n = r.apply(this, arguments);
            return u(this, n)
        }
    }
    var Kt = function(e) {
        i(o, e);
        var r = $t(o);

        function o() {
            return t(this, o), r.apply(this, arguments)
        }
        return n(o, [{
            key: "onRateChange",
            value: function(t) {
                B(c(o.prototype), "onRateChange", this).call(this, t);
                var e, n = zt(this.allVideoElements);
                try {
                    for (n.s(); !(e = n.n()).done;) {
                        var r = e.value;
                        this.changePlaybackRate(r, t)
                    }
                } catch (t) {
                    n.e(t)
                } finally {
                    n.f()
                }
            }
        }, {
            key: "init",
            value: function() {
                this.preventPlaybackRateLock()
            }
        }, {
            key: "changePlaybackRate",
            value: function(t, e) {
                e = e >= 16 ? 16 : e <= .065 ? .065 : e, this.unlockPlaybackRate(t), t
                    .playbackRate = e, 1 !== e && this.lockPlaybackRate(t)
            }
        }, {
            key: "lockPlaybackRate",
            value: function(t) {
                var e = (this.definitionModule || {}).definePropertyOrigin;
                (void 0 === e ? Object.defineProperty : e).call(Object, t, "playbackRate", {
                    configurable: !0,
                    get: function() {
                        return 1
                    },
                    set: function() {}
                })
            }
        }, {
            key: "unlockPlaybackRate",
            value: function(t) {
                delete t.playbackRate, delete t.playbackRate, delete t.playbackRate
            }
        }, {
            key: "definitionModule",
            get: function() {
                return this.getDependencyModule("definition")
            }
        }, {
            key: "preventPlaybackRateLock",
            value: function() {
                var t = this.definitionModule;
                t ? t.applyDefineRole((function(t) {
                    if (t.target instanceof HTMLVideoElement &&
                        "playbackRate" === t.key) return N("已阻止对该网站视频视频倍率的锁定"),
                        !0
                })) : N(
                    "`Video Speed Module`, dependency: `definition` module is required."
                )
            }
        }, {
            key: "allVideoElements",
            get: function() {
                var t = this.getDependencyModule("shadowDOM");
                return t || N(
                    "`Video Speed Module`, dependency: `shadowDOM` module is required."
                ), [].concat(Wt(t ? t.querySelectorAll("video") : []), Wt(this
                    .document.querySelectorAll("video")))
            }
        }, {
            key: "moduleIdentityName",
            get: function() {
                return "videoSpeed"
            }
        }]), o
    }(U);

    function Jt(t) {
        var e = function() {
            if ("undefined" == typeof Reflect || !Reflect.construct) return !1;
            if (Reflect.construct.sham) return !1;
            if ("function" == typeof Proxy) return !0;
            try {
                return Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], (function() {}))), !0
            } catch (t) {
                return !1
            }
        }();
        return function() {
            var n, r = c(t);
            if (e) {
                var o = c(this).constructor;
                n = Reflect.construct(r, arguments, o)
            } else n = r.apply(this, arguments);
            return u(this, n)
        }
    }
    var Qt = function(e) {
            i(o, e);
            var r = Jt(o);

            function o(e) {
                var n, i = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : "__CM";
                return t(this, o), (n = r.call(this)).storage = e, n.prefix = i, n
            }
            return n(o, [{
                key: "isCoreModule",
                get: function() {
                    return !0
                }
            }, {
                key: "openPage",
                value: function(t) {
                    if (t.includes("configuration") && "function" == typeof D.openInTab) {
                        var e = D.openInTab(t, {
                            active: !0
                        });
                        this.injectConfigStyles(e)
                    } else "function" == typeof D.openInTab ? D.openInTab(t, {
                        active: !0
                    }) : this.window.open(t)
                }
            }, {
                key: "injectConfigStyles",
                value: function(t) {
                    var e = this;
                    var n = function() {
                        var n = t.document;
                        if (n && n.head && n.body) {
                            var r = n.createElement("style");
                            r.type = "text/css", r.innerHTML = e.getConfigStyles(), n.head.appendChild(r);
                            var i = n.querySelector(".container, #app, main");
                            i && e.injectDonationHTML(i), clearInterval(o)
                        }
                    };
                    n();
                    var o = setInterval(n, 100)
                }
            }, {
                key: "injectDonationHTML",
                value: function(t) {
                    var e = t.querySelector(".donation-section");
                    if (!e) {
                        var n = document.createElement("div");
                        n.className = "donation-section";
                        n.innerHTML = '\n                    <h2 class="donation-title">💝 感谢大佬的赞赏</h2>\n                    <p class="donation-text">如果这个工具对你有帮助，欢迎请作者喝杯咖啡！<br>你的支持是我持续改进的动力 💪</p>\n                    <img src="https://picsum.photos/200/200?random=flower" alt="赞赏码" class="donation-qr" />\n                    <p class="donation-thanks">感谢你的支持与鼓励！🌟</p>\n                ';
                        t.appendChild(n)
                    }
                }
            }, {
                key: "getConfigStyles",
                value: function() {
                    return "\n            /* 配置页面美化样式 */\n            body {\n                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;\n                font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;\n                margin: 0;\n                padding: 20px;\n                min-height: 100vh;\n            }\n\n            .container, #app, main {\n                background: rgba(255, 255, 255, 0.95) !important;\n                border-radius: 20px !important;\n                padding: 30px !important;\n                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1) !important;\n                backdrop-filter: blur(20px) !important;\n                max-width: 800px !important;\n                margin: 0 auto !important;\n            }\n\n            h1, h2, h3 {\n                color: #2c3e50 !important;\n                text-align: center !important;\n                margin-bottom: 30px !important;\n                font-weight: 600 !important;\n            }\n\n            .form-group, .config-item, .setting-item {\n                margin-bottom: 25px !important;\n                padding: 20px !important;\n                background: #f8f9fa !important;\n                border-radius: 15px !important;\n                border: 1px solid rgba(0, 0, 0, 0.05) !important;\n                transition: all 0.3s ease !important;\n            }\n\n            .form-group:hover, .config-item:hover, .setting-item:hover {\n                transform: translateY(-2px) !important;\n                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1) !important;\n            }\n\n            label, .label {\n                color: #495057 !important;\n                font-weight: 600 !important;\n                margin-bottom: 8px !important;\n                display: block !important;\n                font-size: 14px !important;\n            }\n\n            input[type=\"text\"], input[type=\"number\"], select, .input {\n                width: 100% !important;\n                padding: 12px 16px !important;\n                border: 2px solid #e9ecef !important;\n                border-radius: 10px !important;\n                font-size: 14px !important;\n                transition: all 0.3s ease !important;\n                background: white !important;\n                box-sizing: border-box !important;\n            }\n\n            input[type=\"text\"]:focus, input[type=\"number\"]:focus, select:focus, .input:focus {\n                outline: none !important;\n                border-color: #667eea !important;\n                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1) !important;\n            }\n\n            .btn, button, .button {\n                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;\n                color: white !important;\n                border: none !important;\n                padding: 12px 24px !important;\n                border-radius: 10px !important;\n                font-size: 14px !important;\n                font-weight: 600 !important;\n                cursor: pointer !important;\n                transition: all 0.3s ease !important;\n                text-decoration: none !important;\n                display: inline-block !important;\n            }\n\n            .btn:hover, button:hover, .button:hover {\n                transform: translateY(-2px) !important;\n                box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3) !important;\n            }\n\n            .switch, .toggle {\n                position: relative !important;\n                display: inline-block !important;\n                width: 60px !important;\n                height: 34px !important;\n            }\n\n            .switch input, .toggle input {\n                opacity: 0 !important;\n                width: 0 !important;\n                height: 0 !important;\n            }\n\n            .slider {\n                position: absolute !important;\n                cursor: pointer !important;\n                top: 0 !important;\n                left: 0 !important;\n                right: 0 !important;\n                bottom: 0 !important;\n                background-color: #ccc !important;\n                transition: .4s !important;\n                border-radius: 34px !important;\n            }\n\n            .slider:before {\n                position: absolute !important;\n                content: \"\" !important;\n                height: 26px !important;\n                width: 26px !important;\n                left: 4px !important;\n                bottom: 4px !important;\n                background-color: white !important;\n                transition: .4s !important;\n                border-radius: 50% !important;\n            }\n\n            input:checked + .slider {\n                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;\n            }\n\n            input:checked + .slider:before {\n                transform: translateX(26px) !important;\n            }\n\n            .nav-tabs, .tabs {\n                display: flex !important;\n                border-bottom: 2px solid #e9ecef !important;\n                margin-bottom: 30px !important;\n                background: transparent !important;\n            }\n\n            .nav-tabs li, .tabs li {\n                margin-right: 20px !important;\n            }\n\n            .nav-tabs a, .tabs a {\n                padding: 12px 20px !important;\n                text-decoration: none !important;\n                color: #6c757d !important;\n                border-radius: 10px 10px 0 0 !important;\n                transition: all 0.3s ease !important;\n                font-weight: 500 !important;\n            }\n\n            .nav-tabs a.active, .tabs a.active,\n            .nav-tabs a:hover, .tabs a:hover {\n                color: #667eea !important;\n                background: rgba(102, 126, 234, 0.1) !important;\n            }\n\n            .tab-content, .tab-pane {\n                animation: fadeIn 0.3s ease !important;\n            }\n\n            @keyframes fadeIn {\n                from { opacity: 0; transform: translateY(10px); }\n                to { opacity: 1; transform: translateY(0); }\n            }\n\n            .description, .help-text {\n                color: #6c757d !important;\n                font-size: 12px !important;\n                margin-top: 5px !important;\n            }\n\n            /* 打赏作者区域 */\n            .donation-section {\n                margin-top: 40px !important;\n                padding: 30px !important;\n                background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%) !important;\n                border-radius: 20px !important;\n                text-align: center !important;\n                border: 2px solid rgba(102, 126, 234, 0.1) !important;\n            }\n\n            .donation-title {\n                color: #2c3e50 !important;\n                font-size: 24px !important;\n                font-weight: 600 !important;\n                margin-bottom: 15px !important;\n            }\n\n            .donation-text {\n                color: #6c757d !important;\n                font-size: 16px !important;\n                margin-bottom: 25px !important;\n                line-height: 1.6 !important;\n            }\n\n            .donation-qr {\n                max-width: 200px !important;\n                height: auto !important;\n                border-radius: 15px !important;\n                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15) !important;\n                margin: 0 auto !important;\n                display: block !important;\n            }\n\n            .donation-thanks {\n                color: #495057 !important;\n                font-size: 14px !important;\n                margin-top: 20px !important;\n                font-style: italic !important;\n            }\n\n            /* 响应式设计 */\n            @media (max-width: 768px) {\n                body { padding: 10px !important; }\n                .container, #app, main {\n                    padding: 20px !important;\n                    margin: 0 !important;\n                    border-radius: 15px !important;\n                }\n                .donation-section {\n                    padding: 20px !important;\n                }\n                .donation-qr {\n                    max-width: 150px !important;\n                }\n            }\n            "
                }
            }, {
                key: "init",
                value: function() {
                    var t = this;
                    B(c(o.prototype), "init", this).call(this), "function" == typeof D
                        .registerMenuCommand && (D.registerMenuCommand("⚙️ 倍速设置", (function() {
                            t.openPage("https://timer.palerock.cn/configuration")
                        })))
                }
            }, {
                key: "getAllConfigs",
                value: function() {
                    var t = this;
                    return this.getDeclaredConfigurations().map((function(e) {
                        var n = t.getValue(e.namespace, e.key);
                        return Object.assign({}, e, {
                            value: null != n ? n : e.default
                        })
                    }))
                }
            }, {
                key: "getDeclaredConfigurations",
                value: function() {
                    return g([this.host.declareConfigs().map((function(t) {
                        return Object.assign({}, t, {
                            namespace: "host"
                        })
                    }))].concat(Wt(this.host.getAllActivateModules().map((function(t) {
                        return t.declareConfigs().map((function(e) {
                            return Object.assign({}, e, {
                                namespace: t
                                    .moduleIdentityName,
                                modelName: t
                                    .moduleName
                            })
                        }))
                    })))))
                }
            }, {
                key: "moduleIdentityName",
                get: function() {
                    return "configs"
                }
            }, {
                key: "saveAllConfigs",
                value: function(t) {
                    var e = this;
                    t.forEach((function(t) {
                        var n;
                        e.setValue(t.namespace, t.key, null !== (n = t.value) &&
                            void 0 !== n ? n : t.default)
                    }))
                }
            }, {
                key: "getValue",
                value: function(t, e) {
                    if (this.available()) return this.storage.get([this.prefix, t, e].join("_"))
                }
            }, {
                key: "setValue",
                value: function(t, e, n) {
                    this.available() && this.storage.set([this.prefix, t, e].join("_"), n)
                }
            }, {
                key: "available",
                value: function() {
                    return !!this.storage && this.storage.available()
                }
            }, {
                key: "resetAll",
                value: function() {
                    var t = this;
                    this.storage.list().filter((function(e) {
                        return e.startsWith(t.prefix)
                    })).forEach((function(e) {
                        t.storage.remove(e)
                    }))
                }
            }]), o
        }(L),
        Xt = function() {
            function e() {
                t(this, e), l(this, "isAvailable", void 0)
            }
            return n(e, [{
                key: "get",
                value: function(t) {
                    return D.getValue(t)
                }
            }, {
                key: "list",
                value: function() {
                    return D.listValues()
                }
            }, {
                key: "remove",
                value: function(t) {
                    D.deleteValue(t)
                }
            }, {
                key: "set",
                value: function(t, e) {
                    D.setValue(t, e)
                }
            }, {
                key: "available",
                value: function() {
                    return null == this.isAvailable && (this.isAvailable = [a(D.setValue), a(D
                        .getValue), a(D.listValues), a(D.deleteValue)].every((function(
                        t) {
                        return "function" === t
                    }))), this.isAvailable
                }
            }]), e
        }();

    function Zt(t) {
        var e = function() {
            if ("undefined" == typeof Reflect || !Reflect.construct) return !1;
            if (Reflect.construct.sham) return !1;
            if ("function" == typeof Proxy) return !0;
            try {
                return Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], (function() {}))), !0
            } catch (t) {
                return !1
            }
        }();
        return function() {
            var n, r = c(t);
            if (e) {
                var o = c(this).constructor;
                n = Reflect.construct(r, arguments, o)
            } else n = r.apply(this, arguments);
            return u(this, n)
        }
    }
    var te = function(e) {
            i(a, e);
            var o = Zt(a);

            function a() {
                var e;
                t(this, a);
                for (var n = arguments.length, i = new Array(n), u = 0; u < n; u++) i[u] = arguments[u];
                return l(r(e = o.call.apply(o, [this].concat(i))), "nodeElement", void 0), l(r(e),
                    "clickMapper", {
                        "_item-input": function(t) {
                            t.setSpeed()
                        },
                        "_item-x2": function(t) {
                            t.speedUp()
                        },
                        "_item-x-2": function(t) {
                            t.speedDown()
                        },
                        "_item-xx2": function(t) {
                            t.speedMultiply()
                        },
                        "_item-xx-2": function(t) {
                            t.speedDivide()
                        },
                        "_item-reset": function(t) {
                            t.setSpeed(0)
                        }
                    }), l(r(e), "setTimeoutOrigin", setTimeout), e
            }
            return n(a, [{
                key: "moduleIdentityName",
                get: function() {
                    return "legacyUi"
                }
            }, {
                key: "displayNum",
                get: function() {
                    return (this.rate.toString().split(".")[1] || "").length > 2 ? this.rate
                        .toFixed(2) : this.rate.toString()
                }
            }, {
                key: "showSuspendedBall",
                get: function() {
                    return this.getConfig("showSuspendedBall")
                }
            }, {
                key: "deeplyColor",
                get: function() {
                    return this.getConfig("deeplyColor")
                }
            }, {
                key: "genElement",
                value: function() {
                    var t = this.document.createElement("div");
                    t.innerHTML = (this.showSuspendedBall ?
                            '<div class="_th-container" >\n    <div class="_th-click-hover _item-input">\n        <span class="btn-text">' +
                            this.displayNum + 'x' +
                            '</span>\n        <span class="btn-tooltip">自定义</span>\n    </div>\n    <div class="_th-item _item-x2">\n        <span class="btn-text">+</span>\n        <span class="btn-tooltip">加速</span>\n    </div>\n    <div class="_th-item _item-x-2">\n        <span class="btn-text">-</span>\n        <span class="btn-tooltip">减速</span>\n    </div>\n    <div class="_th-item _item-xx2">\n        <span class="btn-text">++</span>\n        <span class="btn-tooltip">快进</span>\n    </div>\n    <div class="_th-item _item-xx-2">\n        <span class="btn-text">--</span>\n        <span class="btn-tooltip">慢放</span>\n    </div>\n    <div class="_th-item _item-reset">\n        <span class="btn-text">●</span>\n        <span class="btn-tooltip">重置</span>\n    </div>\n</div>\n' :
                            "") +
                        '<div class="_th_cover-all-show-times _th_hidden">\n    <div class="_th_times">' +
                        this.displayNum + 'x' + "</div>\n</div>";
                    var e = this;
                    return Object.keys(this.clickMapper).forEach((function(n) {
                        var r = e.clickMapper[n],
                            o = t.getElementsByClassName(n)[0];
                        o && (o.onclick = function() {
                            r(e.host, e.rate)
                        })
                    })), t
                }
            }, {
                key: "element",
                value: function() {
                    return this.nodeElement || (this.nodeElement = this.genElement()), this
                        .nodeElement
                }
            }, {
                key: "style",
                value: function() {
                    var t = this.position,
                        e = this.positionOffset,
                        n = "right" === t ? "left" : "right",
                        r = "left" === t;
                    return "\n        ._th-container ._th-item {\n            margin: 4px 0;\n            position: relative;\n            width: 0;\n            height: 0;\n            cursor: pointer;\n            opacity: 0;\n            background: #f0f0f3;\n            border-radius: 50%;\n            text-align: center;\n            line-height: 34px;\n            transition: all .25s ease;\n            color: #666;\n            font-weight: 600;\n            font-size: 12px;\n            border: none;\n            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;\n            transform: scale(0);\n            "
                        .concat(n,
                            ": 0;\n        						}\n\n        ._th-container ._th-item, ._th-container ._th-click-hover, ._th_cover-all-show-times ._th_times {\n            box-shadow: "
                        ).concat(this.deeplyColor ? "inset 4px 4px 8px #d1d1d4, inset -4px -4px 8px #ffffff, 2px 2px 6px rgba(0,0,0,0.08)" :
                            "inset 3px 3px 6px #d1d1d4, inset -3px -3px 6px #ffffff, 2px 2px 4px rgba(0,0,0,0.06)",
                            ";\n        }\n\n        ._th-container:hover ._th-item._item-x2 {\n            width: 34px;\n            height: 34px;\n            opacity: 1;\n            transform: scale(1);\n            transition-delay: 0s;\n            background: #f0f0f3;\n            color: #ff6b6b;\n        }\n\n        ._th-container:hover ._th-item._item-x-2 {\n            width: 34px;\n            height: 34px;\n            opacity: 1;\n            transform: scale(1);\n            transition-delay: 0.04s;\n            background: #f0f0f3;\n            color: #feca57;\n        }\n\n        ._th-container:hover ._th-item._item-xx2 {\n            width: 34px;\n            height: 34px;\n            opacity: 1;\n            transform: scale(1);\n            transition-delay: 0.08s;\n            background: #f0f0f3;\n            color: #48dbfb;\n        }\n\n        ._th-container:hover ._th-item._item-xx-2 {\n            width: 34px;\n            height: 34px;\n            opacity: 1;\n            transform: scale(1);\n            transition-delay: 0.12s;\n            background: #f0f0f3;\n            color: #1dd1a1;\n        }\n\n        ._th-container:hover ._th-item._item-reset {\n            width: 34px;\n            height: 34px;\n            opacity: 1;\n            transform: scale(1);\n            transition-delay: 0.16s;\n            background: #f0f0f3;\n            color: #ff7675;\n        }\n\n        ._th-click-hover {\n            position: relative;\n            transition: all .25s ease;\n            height: 46px;\n            width: 46px;\n            cursor: pointer;\n            opacity: .9;\n            border-radius: 50%;\n            background: #f0f0f3;\n            text-align: center;\n            line-height: 46px;\n            color: #667eea;\n            font-weight: 700;\n            font-size: 13px;\n            border: none;\n            letter-spacing: -0.5px;\n            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;\n            "
                        ).concat(n,
                            ": 0\n        }\n\n        ._th-container:hover {\n            "
                        ).concat(t,
                            ": 10px;\n        }\n\n        ._th-container {\n            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\n            font-size: 13px;\n            transition: all .25s ease;\n            "
                        ).concat(t, ": -38px;\n            top: ").concat(e,
                            ";\n            position: fixed;\n            box-sizing: border-box;\n            z-index: 100000;\n            user-select: none;\n            display: flex;\n            width: 58px;\n            flex-direction: column;\n            align-items: center;\n            justify-content: flex-start;\n            padding: 6px;\n            background: rgba(240, 240, 243, 0.9);\n            border-radius: 29px;\n            backdrop-filter: blur(20px);\n            box-shadow: inset 2px 2px 6px rgba(209, 209, 212, 0.5), inset -2px -2px 6px rgba(255, 255, 255, 0.8), 3px 3px 12px rgba(0, 0, 0, 0.1);\n        }\n\n        ._th-container ._th-item:hover {\n            opacity: 1;\n            transform: scale(1.12);\n        }\n\n        ._th-container ._th-item:active {\n            transform: scale(0.9);\n        }\n\n        ._th-container:hover ._th-click-hover {\n            opacity: 1;\n        }\n\n        ._th-container:hover ._th-item {\n            opacity: 1;\n            "
                        ).concat(n,
                            ": 0\n        }\n\n        ._th-container ._th-click-hover:hover {\n            transform: scale(1.08);\n            filter: brightness(1.1);\n        }\n\n        ._th-container ._th-click-hover:active {\n            transform: scale(0.95);\n            filter: brightness(0.9);\n        }\n\n        ._th_cover-all-show-times {\n            position: fixed;\n            top: 0;\n            "
                        ).concat(n,
                            ": 0;\n            width: 100%;\n            height: 100%;\n            z-index: 99999;\n            opacity: 1;\n            font-weight: 700;\n            font-size: 32px;\n            color: #2c3e50;\n            background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(0, 0, 0, 0.1));\n            backdrop-filter: blur(8px);\n        }\n\n        ._th_cover-all-show-times._th_hidden {\n            z-index: -99999;\n            opacity: 0;\n            transition: all .8s ease;\n        }\n\n        ._th_cover-all-show-times ._th_times {\n            width: 280px;\n            height: 280px;\n            border-radius: 50%;\n            background: #f0f0f3;\n            text-align: center;\n            line-height: 280px;\n            color: #667eea;\n            font-weight: 700;\n            border: none;\n            box-shadow: inset 8px 8px 16px #d1d1d4, inset -8px -8px 16px #ffffff, 6px 6px 20px rgba(102, 126, 234, 0.2);\n            position: absolute;\n            top: 50%;\n            "
                        ).concat(n,
                            ": 50%;\n            margin-top: -140px;\n            margin-")
                        .concat(n, ": -140px;\n        }\n        \n        /* 按钮文字切换样式 */\n        ._th-container .btn-text {\n            position: absolute;\n            top: 50%;\n            left: 50%;\n            transform: translate(-50%, -50%) scale(1);\n            transition: opacity 0.3s ease, transform 0.3s ease;\n            opacity: 1;\n            pointer-events: none;\n            font-feature-settings: \"liga\" 0, \"calt\" 0;\n            font-variant-ligatures: none;\n            letter-spacing: 0;\n            word-spacing: 0;\n        }\n        \n        ._th-container .btn-tooltip {\n            position: absolute;\n            top: 50%;\n            left: 50%;\n            transform: translate(-50%, -50%) scale(0.8);\n            opacity: 0;\n            transition: opacity 0.3s ease, transform 0.3s ease;\n            font-size: 10px;\n            font-weight: 600;\n            white-space: nowrap;\n            pointer-events: none;\n        }\n        \n        ._th-container ._th-item:hover .btn-text,\n        ._th-container ._th-click-hover:hover .btn-text {\n            opacity: 0;\n            transform: translate(-50%, -50%) scale(1.1);\n        }\n        \n        ._th-container ._th-item:hover .btn-tooltip,\n        ._th-container ._th-click-hover:hover .btn-tooltip {\n            opacity: 1;\n            transform: translate(-50%, -50%) scale(1);\n        }\n        \n        /* 确保按钮有相对定位 */\n        ._th-container ._th-item,\n        ._th-container ._th-click-hover {\n            position: relative;\n            overflow: hidden;\n        }\n\n        /* 修复++和--按钮显示 */\n        ._th-container ._th-item._item-xx2 .btn-text,\n        ._th-container ._th-item._item-xx-2 .btn-text {\n            font-family: 'Courier New', monospace;\n            font-feature-settings: normal;\n            font-variant-ligatures: normal;\n            letter-spacing: -1px;\n            text-rendering: optimizeSpeed;\n        }\n        ")
                }
            }, {
                key: "onUiRateChange",
                value: function(t) {
                    if (B(c(a.prototype), "onUiRateChange", this).call(this, t), this
                        .nodeElement) {
                        var e = this.nodeElement.querySelector("._th-click-hover") || {},
                            n = this.nodeElement.querySelector("._th_times") || {},
                            r = this.displayNum;
                        var s = e.querySelector('.btn-text');
                        if (s) s.innerHTML = r + "x";
                        else e.innerHTML = r + "x";
                        n.innerHTML = r + "x";
                        var o = this.nodeElement.querySelector("._th_cover-all-show-times") || {};
                        o.className = "_th_cover-all-show-times", this.setTimeoutOrigin.bind(
                            this.window)((function() {
                            o.className = "_th_cover-all-show-times _th_hidden"
                        }), 100)
                    }
                }
            }, {
                key: "position",
                get: function() {
                    return this.getConfig("position")
                }
            }, {
                key: "positionOffset",
                get: function() {
                    return this.getConfig("positionOffset")
                }
            }, {
                key: "declareConfigs",
                value: function() {
                    return [{
                        key: "position",
                        type: f.STRING,
                        default: "left"
                    }, {
                        key: "positionOffset",
                        type: f.STRING,
                        default: "20%"
                    }, {
                        key: "showSuspendedBall",
                        type: f.BOOLEAN,
                        default: !0,
                        title: "Show Suspended Ball"
                    }, {
                        key: "deeplyColor",
                        type: f.BOOLEAN,
                        default: !0,
                        title: "Deeply Color"
                    }]
                }
            }]), a
        }(H),
        ee = new F;
    return ee.exportOuter(), ee.registerModule(new Qt(new Xt)), ee.registerModule(new Ht), ee.registerModule(
            new Ft), ee.registerModule(new Tt), ee.registerModule(new jt), ee.registerModule(new Kt), ee
        .registerModule(new Lt, !0), ee.registerModule(new te, !0), ee.bootstrap(), ee
}));