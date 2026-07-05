// ==UserScript==
// @name         更重的网页端B站精简
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  你是否厌倦了B站网页端极多视频？想要更简要的界面？这个插件将帮助你只显示指定数量的视频，支持多种页面、黑/白名单、快捷键、悬浮面板，配置持久化。\n本人技术极渣，绝不维护，部分代码有AI-coding。
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
        showCounter: true,            // 显示计数器
        showToggleBtn: true,          // 显示切换按钮
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
    let throttleTimer = null;
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
                // 进一步检查是否是视频卡片（父级或自身包含链接）
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

        // 最终失败
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
        // 若找不到，使用 body
        videoListContainer = document.body;
        return videoListContainer;
    }

    // ======================== 核心过滤逻辑 ========================
    function limitVideos() {
        if (!isActive) {
            // 如果关闭，恢复所有视频显示
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
                // 尝试通过链接查找
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

            // 转换为数组并过滤
            let videoCards = Array.from(cards);

            // 过滤掉非视频（直播、广告等）
            videoCards = videoCards.filter(card => {
                const text = (card.textContent || '').toLowerCase();
                const cls = (card.className || '').toLowerCase();

                // 排除直播
                if (config.excludeLive && (cls.includes('live') || text.includes('直播') || text.includes('正在直播'))) {
                    return false;
                }
                // 排除广告
                if (config.excludeAd && (cls.includes('ad') || cls.includes('advert') || text.includes('广告') || text.includes('sponsor'))) {
                    return false;
                }
                // 排除番剧（通常有“番剧”或“追番”标记）
                if (config.excludeBangumi && (cls.includes('bangumi') || text.includes('番剧') || text.includes('追番'))) {
                    return false;
                }
                // 排除付费课程
                if (config.excludePaid && (text.includes('付费') || text.includes('课程') || text.includes('￥') || text.includes('¥'))) {
                    return false;
                }
                return true;
            });

            // 处理特殊保留（UP主ID）
            if (config.keepSpecialUPIDs && config.keepSpecialUPIDs.length > 0) {
                // 尝试从卡片中提取UP主ID（可能通过data属性或链接）
                const keepSet = new Set(config.keepSpecialUPIDs.map(id => String(id)));
                const kept = [];
                const rest = [];
                for (const card of videoCards) {
                    // 查找UP主链接
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
                // 先放保留的，再放其他的
                videoCards = kept.concat(rest);
            }

            // 如果保留推广位，需要从总数中排除推广位卡片（不计入数量）
            let promotedCards = [];
            if (config.keepPromoted) {
                promotedCards = videoCards.filter(card => {
                    const text = (card.textContent || '').toLowerCase();
                    return text.includes('推广') || text.includes('广告') || text.includes('sponsor');
                });
                // 从主列表中移除推广位，它们会单独显示
                videoCards = videoCards.filter(card => !promotedCards.includes(card));
            }

            // 处理置顶/推荐卡片：尝试识别特殊容器，将其移出计数（但保留显示）
            const topSelectors = ['.bili-feed__banner', '.bili-feed__top', '.top-banner', '.recommend-banner'];
            let topCards = [];
            for (const sel of topSelectors) {
                const tops = document.querySelectorAll(sel);
                for (const top of tops) {
                    // 检查top是否包含视频卡片
                    const innerCards = top.querySelectorAll(selector);
                    for (const card of innerCards) {
                        if (videoCards.includes(card)) {
                            topCards.push(card);
                            // 从主列表移除
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

            // 显示前max个（并确保它们可见）
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
                // 同时设置内联样式确保隐藏（但如果CSS类已定义，可省略）
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

            // 更新计数器
            updateCounter(videoCards.length, toShow.length, toHide.length + promotedCards.length + topCards.length);

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
        // 隐藏计数器（关闭时）
        const counter = document.getElementById('bili-lite-counter');
        if (counter) counter.style.display = 'none';
        const toggleBtn = document.getElementById('bili-lite-toggle');
        if (toggleBtn) toggleBtn.textContent = '🟢 精简已关闭';
    }

    // ======================== UI 组件 ========================
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
            #bili-lite-counter {
                position: fixed;
                top: 10px;
                left: 10px;
                background: rgba(0, 0, 0, 0.7);
                color: #fff;
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 13px;
                z-index: 99999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                user-select: none;
                pointer-events: auto;
                backdrop-filter: blur(4px);
                border: 1px solid rgba(255,255,255,0.15);
                display: flex;
                align-items: center;
                gap: 8px;
                box-shadow: 0 2px 12px rgba(0,0,0,0.3);
            }
            #bili-lite-counter button {
                background: rgba(255,255,255,0.15);
                border: none;
                color: #fff;
                padding: 2px 8px;
                border-radius: 12px;
                cursor: pointer;
                font-size: 12px;
                transition: background 0.2s;
            }
            #bili-lite-counter button:hover {
                background: rgba(255,255,255,0.3);
            }
            #bili-lite-counter .badge {
                background: #fb7299;
                color: #fff;
                border-radius: 12px;
                padding: 0 8px;
                font-weight: bold;
                font-size: 12px;
            }
            #bili-lite-toggle {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: rgba(0, 0, 0, 0.7);
                color: #fff;
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 30px;
                padding: 8px 16px;
                font-size: 13px;
                z-index: 99999;
                cursor: pointer;
                backdrop-filter: blur(4px);
                box-shadow: 0 2px 12px rgba(0,0,0,0.3);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                transition: all 0.2s;
                user-select: none;
            }
            #bili-lite-toggle:hover {
                background: rgba(0, 0, 0, 0.85);
                transform: scale(1.05);
            }
            #bili-lite-config-panel {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #1e1e1e;
                color: #eee;
                padding: 24px 30px;
                border-radius: 16px;
                z-index: 100000;
                box-shadow: 0 8px 40px rgba(0,0,0,0.6);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                min-width: 320px;
                border: 1px solid #333;
                display: none;
                flex-direction: column;
                gap: 14px;
                backdrop-filter: blur(8px);
            }
            #bili-lite-config-panel.active {
                display: flex;
            }
            #bili-lite-config-panel h3 {
                margin: 0 0 4px 0;
                font-weight: 500;
                color: #fff;
            }
            #bili-lite-config-panel label {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 14px;
            }
            #bili-lite-config-panel input[type="number"],
            #bili-lite-config-panel input[type="text"] {
                background: #2a2a2a;
                border: 1px solid #444;
                color: #fff;
                padding: 4px 10px;
                border-radius: 6px;
                width: 80px;
                font-size: 14px;
            }
            #bili-lite-config-panel input[type="checkbox"] {
                accent-color: #fb7299;
                width: 18px;
                height: 18px;
                cursor: pointer;
            }
            #bili-lite-config-panel .btn-row {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
                margin-top: 6px;
            }
            #bili-lite-config-panel button {
                background: #fb7299;
                border: none;
                color: #fff;
                padding: 6px 18px;
                border-radius: 20px;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.2s;
            }
            #bili-lite-config-panel button.secondary {
                background: #444;
            }
            #bili-lite-config-panel button:hover {
                background: #ff85a8;
            }
            #bili-lite-config-panel button.secondary:hover {
                background: #555;
            }
            #bili-lite-config-panel .hint {
                font-size: 12px;
                color: #888;
                margin-top: -6px;
            }
            .bili-lite-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.4);
                z-index: 99999;
                display: none;
            }
            .bili-lite-overlay.active {
                display: block;
            }
        `);
    }

    function createCounter() {
        const existing = document.getElementById('bili-lite-counter');
        if (existing) existing.remove();

        const div = document.createElement('div');
        div.id = 'bili-lite-counter';
        div.innerHTML = `
            <span>📺 <span id="bili-lite-count-text">0/0</span></span>
            <button id="bili-lite-show-all">显示全部</button>
            <span class="badge" id="bili-lite-status">精简中</span>
        `;
        document.body.appendChild(div);

        // 显示全部按钮
        document.getElementById('bili-lite-show-all').addEventListener('click', function() {
            if (isActive) {
                isActive = false;
                this.textContent = '恢复精简';
                document.getElementById('bili-lite-status').textContent = '已暂停';
                restoreAllVideos();
                // 更新切换按钮状态
                const toggleBtn = document.getElementById('bili-lite-toggle');
                if (toggleBtn) toggleBtn.textContent = '🟢 精简已关闭';
            } else {
                isActive = true;
                this.textContent = '显示全部';
                document.getElementById('bili-lite-status').textContent = '精简中';
                limitVideos();
                const toggleBtn = document.getElementById('bili-lite-toggle');
                if (toggleBtn) toggleBtn.textContent = '🔴 精简已开启';
            }
        });

        if (!config.showCounter) {
            div.style.display = 'none';
        }
        return div;
    }

    function updateCounter(total, shown, hidden) {
        const counter = document.getElementById('bili-lite-counter');
        if (!counter || !config.showCounter) return;
        const text = document.getElementById('bili-lite-count-text');
        if (text) {
            text.textContent = `${shown}/${total}`;
        }
        const status = document.getElementById('bili-lite-status');
        if (status) {
            status.textContent = isActive ? `精简中 (隐藏${hidden})` : '已暂停';
        }
    }

    function createToggleButton() {
        const existing = document.getElementById('bili-lite-toggle');
        if (existing) existing.remove();

        const btn = document.createElement('button');
        btn.id = 'bili-lite-toggle';
        btn.textContent = isActive ? '🔴 精简已开启' : '🟢 精简已关闭';
        btn.title = '点击切换精简模式';
        document.body.appendChild(btn);

        btn.addEventListener('click', function() {
            isActive = !isActive;
            if (isActive) {
                this.textContent = '🔴 精简已开启';
                limitVideos();
                // 恢复计数器显示
                const counter = document.getElementById('bili-lite-counter');
                if (counter && config.showCounter) counter.style.display = '';
                // 更新显示全部按钮
                const showAllBtn = document.getElementById('bili-lite-show-all');
                if (showAllBtn) showAllBtn.textContent = '显示全部';
                document.getElementById('bili-lite-status').textContent = '精简中';
            } else {
                this.textContent = '🟢 精简已关闭';
                restoreAllVideos();
                const counter = document.getElementById('bili-lite-counter');
                if (counter) counter.style.display = 'none';
            }
        });

        if (!config.showToggleBtn) {
            btn.style.display = 'none';
        }
        return btn;
    }

    // ======================== 配置面板 ========================
    let configPanelVisible = false;

    function createConfigPanel() {
        const overlay = document.createElement('div');
        overlay.id = 'bili-lite-overlay';
        overlay.className = 'bili-lite-overlay';
        document.body.appendChild(overlay);

        const panel = document.createElement('div');
        panel.id = 'bili-lite-config-panel';
        panel.innerHTML = `
            <h3>⚙️ B站精简设置</h3>
            <label>最大显示数量 <input type="number" id="cfg-max" value="${config.maxVideos}" min="1" max="100"></label>
            <label>排除直播 <input type="checkbox" id="cfg-exclude-live" ${config.excludeLive ? 'checked' : ''}></label>
            <label>排除广告 <input type="checkbox" id="cfg-exclude-ad" ${config.excludeAd ? 'checked' : ''}></label>
            <label>排除番剧 <input type="checkbox" id="cfg-exclude-bangumi" ${config.excludeBangumi ? 'checked' : ''}></label>
            <label>排除付费课程 <input type="checkbox" id="cfg-exclude-paid" ${config.excludePaid ? 'checked' : ''}></label>
            <label>保留推广位 <input type="checkbox" id="cfg-keep-promoted" ${config.keepPromoted ? 'checked' : ''}></label>
            <label>显示计数器 <input type="checkbox" id="cfg-show-counter" ${config.showCounter ? 'checked' : ''}></label>
            <label>显示切换按钮 <input type="checkbox" id="cfg-show-toggle" ${config.showToggleBtn ? 'checked' : ''}></label>
            <label>启用快捷键 <input type="checkbox" id="cfg-enable-shortcuts" ${config.enableShortcuts ? 'checked' : ''}></label>
            <label>保留UP主ID（逗号分隔） <input type="text" id="cfg-keep-uids" value="${(config.keepSpecialUPIDs || []).join(',')}" style="width:160px;"></label>
            <div class="hint">快捷键: Ctrl+Shift+数字 快速调整数量（如 Ctrl+Shift+5 设为5）</div>
            <div class="btn-row">
                <button class="secondary" id="cfg-reset">恢复默认</button>
                <button id="cfg-save">保存并应用</button>
            </div>
        `;
        document.body.appendChild(panel);

        // 事件
        document.getElementById('cfg-save').addEventListener('click', function() {
            const max = parseInt(document.getElementById('cfg-max').value) || 10;
            const excludeLive = document.getElementById('cfg-exclude-live').checked;
            const excludeAd = document.getElementById('cfg-exclude-ad').checked;
            const excludeBangumi = document.getElementById('cfg-exclude-bangumi').checked;
            const excludePaid = document.getElementById('cfg-exclude-paid').checked;
            const keepPromoted = document.getElementById('cfg-keep-promoted').checked;
            const showCounter = document.getElementById('cfg-show-counter').checked;
            const showToggleBtn = document.getElementById('cfg-show-toggle').checked;
            const enableShortcuts = document.getElementById('cfg-enable-shortcuts').checked;
            const keepUids = document.getElementById('cfg-keep-uids').value.split(',').map(s => s.trim()).filter(Boolean).map(Number);

            const newConfig = {
                maxVideos: max,
                excludeLive,
                excludeAd,
                excludeBangumi,
                excludePaid,
                keepPromoted,
                showCounter,
                showToggleBtn,
                enableShortcuts,
                keepSpecialUPIDs: keepUids,
                debug: config.debug
            };
            Object.assign(config, newConfig);
            saveConfig(config);
            hideConfigPanel();
            // 重新应用
            limitVideos();
            // 刷新UI
            refreshUI();
        });

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
            document.getElementById('cfg-show-counter').checked = config.showCounter;
            document.getElementById('cfg-show-toggle').checked = config.showToggleBtn;
            document.getElementById('cfg-enable-shortcuts').checked = config.enableShortcuts;
            document.getElementById('cfg-keep-uids').value = (config.keepSpecialUPIDs || []).join(',');
            limitVideos();
            refreshUI();
        });

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                hideConfigPanel();
            }
        });

        // 点击面板外部不关闭（由overlay处理）
        return panel;
    }

    function showConfigPanel() {
        const panel = document.getElementById('bili-lite-config-panel');
        const overlay = document.getElementById('bili-lite-overlay');
        if (panel) {
            panel.classList.add('active');
            overlay.classList.add('active');
            configPanelVisible = true;
        }
    }

    function hideConfigPanel() {
        const panel = document.getElementById('bili-lite-config-panel');
        const overlay = document.getElementById('bili-lite-overlay');
        if (panel) {
            panel.classList.remove('active');
            overlay.classList.remove('active');
            configPanelVisible = false;
        }
    }

    function refreshUI() {
        // 重新创建计数器与按钮（或更新显示）
        const counter = document.getElementById('bili-lite-counter');
        if (counter) {
            if (config.showCounter) counter.style.display = '';
            else counter.style.display = 'none';
        }
        const toggleBtn = document.getElementById('bili-lite-toggle');
        if (toggleBtn) {
            if (config.showToggleBtn) toggleBtn.style.display = '';
            else toggleBtn.style.display = 'none';
            toggleBtn.textContent = isActive ? '🔴 精简已开启' : '🟢 精简已关闭';
        }
        // 更新状态文本
        const status = document.getElementById('bili-lite-status');
        if (status) {
            status.textContent = isActive ? '精简中' : '已暂停';
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
                        refreshUI();
                        const showAllBtn = document.getElementById('bili-lite-show-all');
                        if (showAllBtn) showAllBtn.textContent = '恢复精简';
                        document.getElementById('bili-lite-status').textContent = '已暂停';
                    }
                } else {
                    // 1-9 设置数量
                    config.maxVideos = num;
                    saveConfig({ maxVideos: num });
                    // 更新面板输入
                    const input = document.getElementById('cfg-max');
                    if (input) input.value = num;
                    if (!isActive) {
                        isActive = true;
                        const showAllBtn = document.getElementById('bili-lite-show-all');
                        if (showAllBtn) showAllBtn.textContent = '显示全部';
                        document.getElementById('bili-lite-status').textContent = '精简中';
                    }
                    limitVideos();
                    refreshUI();
                    // 显示提示
                    const counter = document.getElementById('bili-lite-counter');
                    if (counter) {
                        const oldText = counter.innerHTML;
                        counter.innerHTML = `✅ 已设为 ${num} 个视频`;
                        setTimeout(() => {
                            counter.innerHTML = oldText;
                            // 重新绑定事件（略繁琐，但简单起见刷新整个计数器）
                            // 但因为我们动态更新，可重新创建
                            // 直接重新创建计数器会丢失事件，但我们可以更新文本
                            // 简单做法：重新创建
                            const countText = document.getElementById('bili-lite-count-text');
                            if (countText) {
                                // 已存在则更新
                                limitVideos(); // 会自动更新计数器
                            }
                        }, 1500);
                    }
                }
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
            // 精细过滤：只关心子节点增加或减少
            let shouldProcess = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
                    // 检查是否有视频卡片相关的节点
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
                // 防抖+节流
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
                // 清空选择器缓存，因为新页面可能不同
                effectiveSelector = null;
                videoListContainer = null;
                setTimeout(() => {
                    // 重新探测并应用
                    detectSelector();
                    detectContainer();
                    limitVideos();
                }, 500);
            }
        }, 1000);
    }

    // ======================== 菜单命令 ========================
    function registerMenu() {
        GM_registerMenuCommand('⚙️ B站精简设置', function() {
            if (configPanelVisible) {
                hideConfigPanel();
            } else {
                showConfigPanel();
            }
        });
        GM_registerMenuCommand('🔄 手动刷新精简', function() {
            effectiveSelector = null;
            videoListContainer = null;
            limitVideos();
        });
        GM_registerMenuCommand('📊 切换精简状态', function() {
            isActive = !isActive;
            if (isActive) {
                limitVideos();
            } else {
                restoreAllVideos();
            }
            refreshUI();
        });
    }

    // ======================== 初始化 ========================
    function init() {
        try {
            // 加载配置
            config = getConfig();
            log('配置加载完成:', config);

            // 注入样式
            injectStyles();

            // 创建UI
            createCounter();
            createToggleButton();
            createConfigPanel();

            // 注册菜单
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

            // 定时后备（每5秒检查一次，但只在必要时执行）
            setInterval(() => {
                if (isActive) {
                    // 检查是否有新的视频卡片未被隐藏（由于动态加载可能漏掉）
                    // 但我们的观察者应该能捕获，这里作为后备
                    const selector = detectSelector();
                    if (selector) {
                        const cards = document.querySelectorAll(selector);
                        let hiddenCount = 0;
                        let visibleCount = 0;
                        for (const card of cards) {
                            if (card.style.display === 'none' || card.classList.contains('bili-limited-hide')) {
                                hiddenCount++;
                            } else {
                                visibleCount++;
                            }
                        }
                        // 如果可见数量大于配置，说明可能漏掉了，重新执行
                        if (visibleCount > config.maxVideos) {
                            log('定时器检测到可见视频过多，重新执行限制');
                            limitVideos();
                        }
                    }
                }
            }, 5000);

            log('🚀 脚本初始化完成，当前配置:', config);

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
