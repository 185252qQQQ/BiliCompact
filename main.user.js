// ==UserScript==
// @name         更重的网页端B站精简
// @namespace    http://tampermonkey.net/
// @version      2.1.0
// @description  你是否厌倦了B站网页端极多视频？想要更简要的界面？这个插件将帮助你只显示指定数量的视频，支持多种页面、黑/白名单、快捷键，配置持久化。非侵入式设计，不在B站页面注入任何UI元素。
// @author       暮雨终将落下
// @match        https://www.bilibili.com/
// @match        https://www.bilibili.com/?*
// @match        https://www.bilibili.com/index/*
// @match        https://www.bilibili.com/v/popular/*
// @match        https://www.bilibili.com/v/*/*
// @match        https://www.bilibili.com/dynamic*
// @match        https://www.bilibili.com/search*
// @match        https://www.bilibili.com/anime/*
// @match        https://www.bilibili.com/guochuang/*
// @match        https://www.bilibili.com/music/*
// @match        https://www.bilibili.com/dance/*
// @match        https://www.bilibili.com/game/*
// @match        https://www.bilibili.com/technology/*
// @match        https://www.bilibili.com/life/*
// @match        https://www.bilibili.com/food/*
// @match        https://www.bilibili.com/car/*
// @match        https://www.bilibili.com/animal/*
// @match        https://www.bilibili.com/kichiku/*
// @match        https://www.bilibili.com/fashion/*
// @match        https://www.bilibili.com/ent/*
// @match        https://www.bilibili.com/cinephile/*
// @match        https://www.bilibili.com/popular/*
// @run-at       document-end
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_log
// ==/UserScript==

(function() {
    'use strict';

    // ======================== 配置（默认值，会从GM存储读取） ========================
    const DEFAULTS = {
        maxVideos: 10,                 // 最大显示数量
        excludeLive: true,             // 排除直播
        excludeAd: true,              // 排除广告
        excludeBangumi: true,         // 排除番剧
        excludePaid: true,            // 排除付费课程
        keepSpecialUPIDs: [],         // 保留的UP主ID列表（数字）
        keepPromoted: false,          // 保留推广位（不计入数量）
        enableShortcuts: true,        // 启用快捷键
        debug: false                  // 调试模式
    };

    // ======================== 状态 ========================
    let config = {};
    let isActive = true;               // 是否启用精简（切换开关）
    let effectiveSelector = null;      // 缓存的有效选择器
    let videoListContainer = null;     // 缓存的列表容器
    let observer = null;
    let debounceTimer = null;
    let lastRun = 0;
    const THROTTLE_INTERVAL = 200;     // 节流间隔（ms）

    // ======================== 工具函数 ========================
    function log(...args) {
        if (config.debug) console.log('[B站精简]', ...args);
    }

    function errorLog(...args) {
        console.error('[B站精简]', ...args);
    }

    // 安全获取存储
    function getConfig() {
        const cfg = {};
        for (const [key, def] of Object.entries(DEFAULTS)) {
            try {
                const val = GM_getValue(key, def);
                cfg[key] = val;
            } catch (e) {
                cfg[key] = def;
            }
        }
        return cfg;
    }

    function saveConfig(cfg) {
        for (const [key, val] of Object.entries(cfg)) {
            try {
                GM_setValue(key, val);
            } catch (e) {}
        }
    }

    // ======================== 选择器探测与缓存 ========================
    function detectSelector() {
        if (effectiveSelector) return effectiveSelector;

        // 候选选择器（优先使用标准类）
        const candidates = [
            '.bili-video-card',
            '.video-item',
            '.feed-item',
            '.bili-feed .video-card',
            '.feed-list .video-card',
            '[class*="video-card"]',
            '[class*="bili-video"]',
            '[class*="feed-item"]'
        ];

        // 首先尝试通过 data 属性查找
        const dataCandidates = [
            '[data-video-id]',
            '[data-aid]'
        ];
        for (const sel of dataCandidates) {
            const els = document.querySelectorAll(sel);
            if (els.length > 0) {
                for (const el of els) {
                    const card = el.closest('.bili-video-card, .video-item, .feed-item, [class*="video-card"], [class*="feed-item"]');
                    if (card) {
                        effectiveSelector = (card.tagName === el.tagName) ? sel :
                            Array.from(card.classList).map(c => '.' + c).join('');
                        log('通过data属性探测到选择器:', effectiveSelector);
                        return effectiveSelector;
                    }
                }
            }
        }

        // 遍历普通候选
        for (const sel of candidates) {
            const els = document.querySelectorAll(sel);
            if (els.length > 0) {
                effectiveSelector = sel;
                log('探测到选择器:', effectiveSelector);
                return effectiveSelector;
            }
        }

        // 最后回退：查找包含 /video/ 链接的父级卡片
        const links = document.querySelectorAll('a[href*="/video/"]');
        for (const link of links) {
            let parent = link.parentElement;
            let depth = 0;
            while (parent && depth < 5) {
                const cls = parent.className || '';
                if (cls.includes('card') || cls.includes('item') || cls.includes('feed') || cls.includes('video')) {
                    effectiveSelector = '.' + cls.split(' ').join('.');
                    log('通过链接回退探测到选择器:', effectiveSelector);
                    return effectiveSelector;
                }
                parent = parent.parentElement;
                depth++;
            }
        }

        return null;
    }

    // 获取视频列表容器（缩小观察范围）
    function detectContainer() {
        if (videoListContainer) return videoListContainer;
        const containers = [
            '.bili-feed',
            '.feed-list',
            '.video-list',
            '.bili-video-list',
            '.recommend-container'
        ];
        for (const sel of containers) {
            const el = document.querySelector(sel);
            if (el) {
                videoListContainer = el;
                log('探测到容器:', sel);
                return el;
            }
        }
        videoListContainer = document.body;
        return videoListContainer;
    }

    // ======================== 核心过滤逻辑 ========================
    function limitVideos() {
        if (!isActive) {
            restoreAllVideos();
            return;
        }

        try {
            const selector = detectSelector();
            if (!selector) {
                log('未找到视频卡片，跳过');
                return;
            }

            // 获取所有卡片
            let cards = document.querySelectorAll(selector);
            if (cards.length === 0) {
                const links = document.querySelectorAll('a[href*="/video/"]');
                const parentCards = new Set();
                for (const link of links) {
                    let parent = link.parentElement;
                    let depth = 0;
                    while (parent && depth < 5) {
                        if (parent.className && (parent.className.includes('card') || parent.className.includes('item') || parent.className.includes('feed'))) {
                            parentCards.add(parent);
                            break;
                        }
                        parent = parent.parentElement;
                        depth++;
                    }
                }
                cards = Array.from(parentCards);
                if (cards.length === 0) {
                    log('仍未找到视频卡片');
                    return;
                }
            }

            let videoCards = Array.from(cards);

            // 过滤非视频内容
            videoCards = videoCards.filter(card => {
                const text = (card.textContent || '').toLowerCase();
                const cls = (card.className || '').toLowerCase();

                if (config.excludeLive && (cls.includes('live') || text.includes('直播') || text.includes('正在直播'))) {
                    return false;
                }
                if (config.excludeAd && (cls.includes('ad') || cls.includes('advert') || text.includes('广告') || text.includes('sponsor'))) {
                    return false;
                }
                if (config.excludeBangumi && (cls.includes('bangumi') || text.includes('番剧') || text.includes('追番'))) {
                    return false;
                }
                if (config.excludePaid && (text.includes('付费') || text.includes('课程') || text.includes('￥') || text.includes('¥'))) {
                    return false;
                }
                return true;
            });

            // 处理特殊保留（UP主ID）
            if (config.keepSpecialUPIDs && config.keepSpecialUPIDs.length > 0) {
                const keepSet = new Set(config.keepSpecialUPIDs.map(id => String(id)));
                const kept = [];
                const rest = [];
                for (const card of videoCards) {
                    const upLink = card.querySelector('a[href*="/space/"]');
                    let upid = null;
                    if (upLink) {
                        const match = upLink.href.match(/\/space\/(\d+)/);
                        if (match) upid = match[1];
                    }
                    if (upid && keepSet.has(upid)) {
                        kept.push(card);
                    } else {
                        rest.push(card);
                    }
                }
                videoCards = kept.concat(rest);
            }

            // 保留推广位
            let promotedCards = [];
            if (config.keepPromoted) {
                promotedCards = videoCards.filter(card => {
                    const text = (card.textContent || '').toLowerCase();
                    return text.includes('推广') || text.includes('广告') || text.includes('sponsor');
                });
                videoCards = videoCards.filter(card => !promotedCards.includes(card));
            }

            // 处理置顶/推荐卡片
            const topSelectors = ['.bili-feed__banner', '.bili-feed__top', '.top-banner', '.recommend-banner'];
            let topCards = [];
            for (const sel of topSelectors) {
                const tops = document.querySelectorAll(sel);
                for (const top of tops) {
                    const innerCards = top.querySelectorAll(selector);
                    for (const card of innerCards) {
                        if (videoCards.includes(card)) {
                            topCards.push(card);
                            const idx = videoCards.indexOf(card);
                            if (idx !== -1) videoCards.splice(idx, 1);
                        }
                    }
                }
            }

            // 限制数量
            const max = Math.max(1, Number(config.maxVideos) || 10);
            const toShow = videoCards.slice(0, max);
            const toHide = videoCards.slice(max);

            // 显示前max个
            toShow.forEach(card => {
                card.classList.remove('bili-limited-hide');
                card.style.display = '';
                card.style.visibility = '';
                card.style.opacity = '';
                card.style.height = '';
                card.style.margin = '';
                card.style.padding = '';
                card.style.overflow = '';
                card.style.position = '';
                card.style.flex = '';
            });

            // 隐藏其余
            toHide.forEach(card => {
                card.classList.add('bili-limited-hide');
                card.style.display = 'none';
                card.style.visibility = 'hidden';
                card.style.opacity = '0';
                card.style.height = '0';
                card.style.margin = '0';
                card.style.padding = '0';
                card.style.overflow = 'hidden';
                card.style.flex = '0 0 0';
                card.style.position = 'absolute';
            });

            // 确保推广位和置顶卡片可见
            [...promotedCards, ...topCards].forEach(card => {
                card.classList.remove('bili-limited-hide');
                card.style.display = '';
                card.style.visibility = '';
                card.style.opacity = '';
                card.style.height = '';
                card.style.margin = '';
                card.style.padding = '';
                card.style.overflow = '';
                card.style.position = '';
                card.style.flex = '';
            });

            log(`已处理: 总视频 ${videoCards.length + promotedCards.length + topCards.length}, 显示 ${toShow.length + promotedCards.length + topCards.length}, 隐藏 ${toHide.length}`);

        } catch (e) {
            errorLog('limitVideos 出错:', e);
        }
    }

    function restoreAllVideos() {
        const selector = detectSelector();
        if (!selector) return;
        const cards = document.querySelectorAll(selector);
        for (const card of cards) {
            card.classList.remove('bili-limited-hide');
            card.style.display = '';
            card.style.visibility = '';
            card.style.opacity = '';
            card.style.height = '';
            card.style.margin = '';
            card.style.padding = '';
            card.style.overflow = '';
            card.style.position = '';
            card.style.flex = '';
        }
    }

    // ======================== CSS 样式（仅过滤类和动态配置面板） ========================
    function injectStyles() {
        GM_addStyle(`
            .bili-limited-hide {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
                flex: 0 0 0 !important;
                position: absolute !important;
                pointer-events: none !important;
            }
        `);
    }

    // ======================== 配置面板（非侵入式：按需创建/销毁） ========================
    // 配置面板的 CSS（与页面样式完全隔离，使用独立沙盒）
    function injectPanelStyles() {
        // 面板样式仅在使用时注入一次
        if (document.getElementById('bili-compact-panel-styles')) return;
        const styleEl = document.createElement('style');
        styleEl.id = 'bili-compact-panel-styles';
        styleEl.textContent = `
            .bili-compact-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.4);
                z-index: 2147483646;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }
            .bili-compact-panel {
                background: #1e1e1e;
                color: #eee;
                padding: 24px 30px;
                border-radius: 16px;
                box-shadow: 0 8px 40px rgba(0,0,0,0.6);
                min-width: 320px;
                border: 1px solid #333;
                backdrop-filter: blur(8px);
                display: flex;
                flex-direction: column;
                gap: 14px;
                position: relative;
            }
            .bili-compact-panel h3 {
                margin: 0 0 4px 0;
                font-weight: 500;
                color: #fff;
                font-size: 16px;
            }
            .bili-compact-panel label {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 14px;
                color: #ccc;
            }
            .bili-compact-panel input[type="number"],
            .bili-compact-panel input[type="text"] {
                background: #2a2a2a;
                border: 1px solid #444;
                color: #fff;
                padding: 4px 10px;
                border-radius: 6px;
                width: 80px;
                font-size: 14px;
                font-family: inherit;
            }
            .bili-compact-panel input[type="text"] {
                width: 160px;
            }
            .bili-compact-panel input[type="checkbox"] {
                accent-color: #fb7299;
                width: 18px;
                height: 18px;
                cursor: pointer;
            }
            .bili-compact-panel .btn-row {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
                margin-top: 6px;
            }
            .bili-compact-panel button {
                background: #fb7299;
                border: none;
                color: #fff;
                padding: 6px 18px;
                border-radius: 20px;
                cursor: pointer;
                font-size: 14px;
                font-family: inherit;
                transition: background 0.2s;
            }
            .bili-compact-panel button.secondary {
                background: #444;
            }
            .bili-compact-panel button:hover {
                background: #ff85a8;
            }
            .bili-compact-panel button.secondary:hover {
                background: #555;
            }
            .bili-compact-panel .hint {
                font-size: 12px;
                color: #888;
                margin-top: -6px;
            }
            .bili-compact-panel .status-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 14px;
                color: #ccc;
            }
            .bili-compact-panel .status-badge {
                background: #fb7299;
                color: #fff;
                border-radius: 12px;
                padding: 2px 12px;
                font-size: 12px;
                font-weight: bold;
            }
            .bili-compact-panel .status-badge.off {
                background: #666;
            }
        `;
        document.head.appendChild(styleEl);
    }

    let panelDestroyFn = null; // 当前面板的销毁函数

    function openConfigPanel() {
        // 如果已有面板打开，先关闭
        if (panelDestroyFn) {
            panelDestroyFn();
            panelDestroyFn = null;
        }

        // 确保样式已注入
        injectPanelStyles();

        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.className = 'bili-compact-overlay';

        // 创建面板
        const panel = document.createElement('div');
        panel.className = 'bili-compact-panel';
        panel.innerHTML = `
            <h3>B站精简设置</h3>
            <div class="status-row">
                <span>当前状态</span>
                <span class="status-badge ${isActive ? '' : 'off'}" id="cfg-status-badge">${isActive ? '精简中' : '已暂停'}</span>
            </div>
            <label>最大显示数量 <input type="number" id="cfg-max" value="${config.maxVideos}" min="1" max="100"></label>
            <label>排除直播 <input type="checkbox" id="cfg-exclude-live" ${config.excludeLive ? 'checked' : ''}></label>
            <label>排除广告 <input type="checkbox" id="cfg-exclude-ad" ${config.excludeAd ? 'checked' : ''}></label>
            <label>排除番剧 <input type="checkbox" id="cfg-exclude-bangumi" ${config.excludeBangumi ? 'checked' : ''}></label>
            <label>排除付费课程 <input type="checkbox" id="cfg-exclude-paid" ${config.excludePaid ? 'checked' : ''}></label>
            <label>保留推广位 <input type="checkbox" id="cfg-keep-promoted" ${config.keepPromoted ? 'checked' : ''}></label>
            <label>启用快捷键 <input type="checkbox" id="cfg-enable-shortcuts" ${config.enableShortcuts ? 'checked' : ''}></label>
            <label>保留UP主ID（逗号分隔） <input type="text" id="cfg-keep-uids" value="${(config.keepSpecialUPIDs || []).join(',')}"></label>
            <label>调试模式 <input type="checkbox" id="cfg-debug" ${config.debug ? 'checked' : ''}></label>
            <div class="hint">快捷键: Ctrl+Shift+数字 快速调整数量（如 Ctrl+Shift+5 设为5，0 关闭精简）</div>
            <div class="btn-row">
                <button class="secondary" id="cfg-toggle">${isActive ? '暂停精简' : '启用精简'}</button>
                <button class="secondary" id="cfg-reset">恢复默认</button>
                <button id="cfg-save">保存并应用</button>
            </div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        // —— 事件绑定 ——

        // 保存
        document.getElementById('cfg-save').addEventListener('click', function() {
            const max = parseInt(document.getElementById('cfg-max').value) || 10;
            const newConfig = {
                maxVideos: max,
                excludeLive: document.getElementById('cfg-exclude-live').checked,
                excludeAd: document.getElementById('cfg-exclude-ad').checked,
                excludeBangumi: document.getElementById('cfg-exclude-bangumi').checked,
                excludePaid: document.getElementById('cfg-exclude-paid').checked,
                keepPromoted: document.getElementById('cfg-keep-promoted').checked,
                enableShortcuts: document.getElementById('cfg-enable-shortcuts').checked,
                keepSpecialUPIDs: document.getElementById('cfg-keep-uids').value.split(',').map(s => s.trim()).filter(Boolean).map(Number),
                debug: document.getElementById('cfg-debug').checked
            };
            Object.assign(config, newConfig);
            saveConfig(config);
            destroyPanel();
            limitVideos();
        });

        // 重置
        document.getElementById('cfg-reset').addEventListener('click', function() {
            Object.assign(config, DEFAULTS);
            saveConfig(config);
            // 刷新面板输入
            document.getElementById('cfg-max').value = config.maxVideos;
            document.getElementById('cfg-exclude-live').checked = config.excludeLive;
            document.getElementById('cfg-exclude-ad').checked = config.excludeAd;
            document.getElementById('cfg-exclude-bangumi').checked = config.excludeBangumi;
            document.getElementById('cfg-exclude-paid').checked = config.excludePaid;
            document.getElementById('cfg-keep-promoted').checked = config.keepPromoted;
            document.getElementById('cfg-enable-shortcuts').checked = config.enableShortcuts;
            document.getElementById('cfg-debug').checked = config.debug;
            document.getElementById('cfg-keep-uids').value = '';
            limitVideos();
        });

        // 切换精简状态
        document.getElementById('cfg-toggle').addEventListener('click', function() {
            isActive = !isActive;
            if (isActive) {
                limitVideos();
            } else {
                restoreAllVideos();
            }
            const badge = document.getElementById('cfg-status-badge');
            if (badge) {
                badge.textContent = isActive ? '精简中' : '已暂停';
                badge.className = 'status-badge' + (isActive ? '' : ' off');
            }
            this.textContent = isActive ? '暂停精简' : '启用精简';
        });

        // 点击遮罩关闭
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                destroyPanel();
            }
        });

        // ESC 关闭
        function onKeyDown(e) {
            if (e.key === 'Escape') {
                destroyPanel();
            }
        }
        document.addEventListener('keydown', onKeyDown);

        // —— 销毁函数 ——
        function destroyPanel() {
            document.removeEventListener('keydown', onKeyDown);
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
            panelDestroyFn = null;
        }

        panelDestroyFn = destroyPanel;
    }

    function closeConfigPanel() {
        if (panelDestroyFn) {
            panelDestroyFn();
            panelDestroyFn = null;
        }
    }

    // ======================== 快捷键 ========================
    function initShortcuts() {
        if (!config.enableShortcuts) return;
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.shiftKey && e.key >= '0' && e.key <= '9') {
                e.preventDefault();
                const num = parseInt(e.key);
                if (num === 0) {
                    // 0 表示关闭精简
                    if (isActive) {
                        isActive = false;
                        restoreAllVideos();
                    }
                } else {
                    // 1-9 设置数量
                    config.maxVideos = num;
                    saveConfig({ maxVideos: num });
                    if (!isActive) {
                        isActive = true;
                    }
                    limitVideos();
                }
                // 非侵入式反馈：使用 GM_notification 或静默执行（用户立即看到结果）
                log(`快捷键: ${num === 0 ? '关闭精简' : '设为 ' + num + ' 个视频'}`);
            }
        });
    }

    // ======================== 观察者 ========================
    function initObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }

        const container = detectContainer();
        if (!container) return;

        observer = new MutationObserver(function(mutations) {
            let shouldProcess = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1) {
                            const sel = detectSelector();
                            if (sel && (node.matches(sel) || node.querySelector(sel))) {
                                shouldProcess = true;
                                break;
                            }
                        }
                    }
                    if (!shouldProcess) {
                        for (const node of mutation.removedNodes) {
                            if (node.nodeType === 1) {
                                const sel = detectSelector();
                                if (sel && (node.matches(sel) || node.querySelector(sel))) {
                                    shouldProcess = true;
                                    break;
                                }
                            }
                        }
                    }
                }
                if (shouldProcess) break;
            }

            if (shouldProcess) {
                const now = Date.now();
                if (now - lastRun < THROTTLE_INTERVAL) {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        lastRun = Date.now();
                        limitVideos();
                    }, 300);
                } else {
                    lastRun = now;
                    limitVideos();
                }
            }
        });

        observer.observe(container, {
            childList: true,
            subtree: true,
            attributes: false
        });

        log('MutationObserver 已启动，监听容器:', container);
    }

    // ======================== 路由变化监听 ========================
    function watchUrlChange() {
        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                log('URL变化:', lastUrl);
                effectiveSelector = null;
                videoListContainer = null;
                setTimeout(() => {
                    detectSelector();
                    detectContainer();
                    limitVideos();
                }, 500);
            }
        }, 1000);
    }

    // ======================== 菜单命令（唯一入口） ========================
    function registerMenu() {
        GM_registerMenuCommand('B站精简设置', function() {
            openConfigPanel();
        });
        GM_registerMenuCommand('手动刷新精简', function() {
            effectiveSelector = null;
            videoListContainer = null;
            limitVideos();
        });
        GM_registerMenuCommand('切换精简状态', function() {
            isActive = !isActive;
            if (isActive) {
                limitVideos();
            } else {
                restoreAllVideos();
            }
            log('精简状态:', isActive ? '已开启' : '已关闭');
        });
        GM_registerMenuCommand('快速设数量', function() {
            const num = prompt('输入最大显示视频数量（1-100）：', config.maxVideos);
            if (num !== null) {
                const n = parseInt(num);
                if (n >= 1 && n <= 100) {
                    config.maxVideos = n;
                    saveConfig({ maxVideos: n });
                    if (!isActive) {
                        isActive = true;
                    }
                    limitVideos();
                    log('已设置最大数量:', n);
                }
            }
        });
    }

    // ======================== 初始化 ========================
    function init() {
        try {
            // 加载配置
            config = getConfig();
            log('配置加载完成:', config);

            // 注入样式（仅过滤类，不注入任何UI节点）
            injectStyles();

            // 注册菜单（TM菜单是唯一入口，不在页面注入UI）
            registerMenu();

            // 启动观察
            initObserver();

            // 路由监听
            watchUrlChange();

            // 快捷键
            initShortcuts();

            // 初次执行
            setTimeout(() => {
                detectSelector();
                detectContainer();
                limitVideos();
            }, 500);

            // 定时后备检查
            setInterval(() => {
                if (isActive) {
                    const selector = detectSelector();
                    if (selector) {
                        const cards = document.querySelectorAll(selector);
                        let visibleCount = 0;
                        for (const card of cards) {
                            if (!(card.style.display === 'none' || card.classList.contains('bili-limited-hide'))) {
                                visibleCount++;
                            }
                        }
                        if (visibleCount > config.maxVideos) {
                            log('定时器检测到可见视频过多，重新执行限制');
                            limitVideos();
                        }
                    }
                }
            }, 5000);

            log(' 脚本初始化完成，当前配置:', config);

        } catch (e) {
            errorLog('初始化失败:', e);
        }
    }

    // 页面加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
