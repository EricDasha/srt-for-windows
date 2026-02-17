/**
 * content.js - 主入口脚本
 * - subtitleParser.js
 * - subtitleEngine.js
 * - subtitleOverlay.js
 * - subtitleSettings.js
 */

(function () {
    'use strict';

    const VERSION = '2.0.0';
    console.log(`字幕挂载已加载`);

    // =================== 全局状态 ===================

    let engine = null;              // SubtitleEngine 实例
    let pageOverlay = null;         // 页面字幕覆盖层
    let currentFileName = null;     // 当前字幕文件名
    let currentSubtitles = [];      // 当前字幕数据
    let currentVideo = null;        // 当前视频元素
    let settings = {};              // 用户设置
    let statusFadeTimer = null;     // 状态条消失定时器

    // PiP 相关
    let pipWindow = null;
    let pipOverlay = null;
    let pipSettingsPanel = null;
    let pipDragOverlay = null;
    let pipControlBar = null;

    // =================== 初始化 ===================

    async function init() {
        settings = await SubtitleSettings.loadSettings();

        // 监听来自 popup 的消息
        if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
            chrome.runtime.onMessage.addListener(handleMessage);
        }

        // 监听 documentPictureInPicture 事件（自动注入）
        setupPiPDetection();

        // 监听视频元素的原生 PiP（非 documentPiP）
        setupNativePiPDetection();

        // 窗口大小变化时重新计算自适应字号
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => applyAllStyles(), 200);
        });
    }

    // =================== 消息处理 ===================

    function handleMessage(req, sender, sendResponse) {
        switch (req.action) {
            case 'loadSubtitles':
                handleLoadSubtitles(req.data, req.fileName, req.settings);
                sendResponse({ status: 'ok', count: currentSubtitles.length });
                break;

            case 'updateSettings':
                settings = { ...settings, ...req.settings };
                SubtitleSettings.saveSettings(settings);
                if (req.settings.timeOffset != null) {
                    engine?.setTimeOffset(req.settings.timeOffset / 10);
                }
                applyAllStyles();
                break;

            case 'removeOverlay':
                if (engine) { engine.destroy(); engine = null; }
                if (pageOverlay) { pageOverlay.destroy(); pageOverlay = null; }
                if (pipOverlay) { pipOverlay.destroy(); pipOverlay = null; }
                currentSubtitles = [];
                currentFileName = null;
                chrome.storage.local.remove(['lastFileName', 'lastCount']);
                sendResponse({ status: 'ok' });
                break;

            case 'resetSettings':
                settings = {};
                SubtitleSettings.saveSettings(settings);
                chrome.storage.local.remove(['srt_popup_settings']);
                applyAllStyles();
                sendResponse({ status: 'ok' });
                break;

            case 'getStatus':
                sendResponse({
                    fileName: currentFileName,
                    count: currentSubtitles.length,
                    progress: engine?.getProgress() || null,
                    version: VERSION,
                });
                break;

            case 'openPip':
                openSubtitlePiP();
                break;
        }
    }

    // =================== 字幕加载 ===================

    function handleLoadSubtitles(subtitles, fileName, newSettings) {
        currentSubtitles = subtitles;
        currentFileName = fileName;

        if (newSettings) {
            settings = { ...settings, ...newSettings };
        }

        // 查找视频
        if (!currentVideo || !currentVideo.isConnected) {
            currentVideo = SubtitleEngine.findLargestVideo();
        }

        if (!currentVideo) {
            console.warn('未找到视频元素');
            return;
        }

        // 初始化页面覆盖层
        if (!pageOverlay) {
            pageOverlay = SubtitleOverlay.createPageOverlay(settingsToOverlayConfig());
        }

        // 初始化引擎
        if (!engine) {
            engine = new SubtitleEngine();
            engine.onSubtitleChange = (text, activeSubs) => {
                pageOverlay?.updateText(text);
                pipOverlay?.updateText(text);
            };
            engine.onStateChange = (state) => {
                updateStatusDisplay(state);
            };
        }

        engine.setTimeOffset(settings.timeOffset || 0);
        engine.init(currentVideo, currentSubtitles);

        // 显示状态
        showStatus(`✅ ${fileName} (${currentSubtitles.length} 条)`, '#2e7d32');

        // 如果 PiP 窗口已打开，更新
        if (pipWindow && !pipWindow.closed) {
            showPiPNotification(`已加载: ${fileName}`);
        }
    }

    // =================== PiP 检测与注入 ===================

    function setupPiPDetection() {
        // 监听 Document PiP API
        if (typeof documentPictureInPicture !== 'undefined') {
            try {
                documentPictureInPicture.addEventListener('enter', (event) => {
                    const pipWin = event.window;
                    console.log('检测到 Document PiP 打开');
                    injectIntoPiPWindow(pipWin);
                });
            } catch (e) {
                console.log('documentPictureInPicture 事件监听失败:', e);
            }
        }

        // 轮询检测 Document PiP（部分浏览器不支持 enter 事件）
        let lastPipWin = null;
        setInterval(() => {
            if (typeof documentPictureInPicture !== 'undefined' && documentPictureInPicture.window) {
                const win = documentPictureInPicture.window;
                if (win !== lastPipWin) {
                    lastPipWin = win;
                    console.log('轮询检测到 Document PiP');
                    injectIntoPiPWindow(win);
                }
            } else {
                lastPipWin = null;
            }
        }, 1000);
    }

    function setupNativePiPDetection() {
        // 监听原生 PiP（video.requestPictureInPicture）
        document.addEventListener('enterpictureinpicture', (e) => {
            console.log('检测到原生 PiP');
            // 原生 PiP 不提供 window，但我们可以在页面上显示字幕
            const video = e.target;
            if (video instanceof HTMLVideoElement) {
                currentVideo = video;
                if (engine && currentSubtitles.length > 0) {
                    engine.updateVideoEl(video);
                }
            }
        });

        document.addEventListener('leavepictureinpicture', () => {
            console.log('原生 PiP 已关闭');
        });
    }

    /**
     * 注入字幕功能到 PiP 窗口
     */
    function injectIntoPiPWindow(win) {
        if (!win || win.closed) return;

        // 避免重复注入
        if (win === pipWindow) return;

        pipWindow = win;
        const doc = win.document;

        // 等待 PiP 窗口 DOM 加载完成
        const doInject = () => {
            console.log('正在注入到 PiP 窗口');

            // 1. 创建字幕悬浮按钮（控制栏）
            pipControlBar = createPiPControlBar(doc);

            // 2. 创建字幕覆盖层
            pipOverlay = SubtitleOverlay.createPiPOverlay(doc, settingsToOverlayConfig());

            // 3. 创建拖拽覆盖层
            pipDragOverlay = SubtitleOverlay.createDragOverlay(doc);
            setupPiPDragDrop(doc);

            // 4. 创建设置面板
            pipSettingsPanel = SubtitleSettings.createSettingsPanel(
                doc,
                settings,
                handlePiPSettingChange
            );

            // 5. 如果有字幕数据，立即同步
            if (engine && currentSubtitles.length > 0 && currentVideo) {
                // 引擎已活跃，字幕会自动通过回调更新到 PiP
            }

            // 6. 自定义字体注入
            if (settings.customFontData) {
                const fontStyle = doc.createElement('style');
                fontStyle.textContent = `@font-face { font-family: 'SRTCustomFont'; src: url('${settings.customFontData}'); font-display: swap; }`;
                doc.head.appendChild(fontStyle);
            }
        };

        // PiP 窗口可能还没有完全加载
        if (doc.readyState === 'complete' || doc.readyState === 'interactive') {
            setTimeout(doInject, 100); // 给 dmMiniPlayer 的渲染一点时间
        } else {
            doc.addEventListener('DOMContentLoaded', () => setTimeout(doInject, 100));
        }

        // 监听 PiP 窗口关闭
        win.addEventListener('pagehide', () => {
            console.log('PiP 窗口已关闭');
            pipWindow = null;
            pipOverlay = null;
            pipSettingsPanel = null;
            pipDragOverlay = null;
            pipControlBar = null;
        });

        // PiP 窗口大小变化时的字幕自动缩放
        let resizeTimer = null;
        const baseWidth = settings.autoScaleBaseWidth || 600;
        const baseFontSize = settings.fontSize;

        win.addEventListener('resize', () => {
            if (!settings.autoScale) return;

            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                const ratio = win.innerWidth / baseWidth;
                const newSize = Math.round(baseFontSize * Math.max(0.5, Math.min(2, ratio)));
                pipOverlay?.updateStyle({ fontSize: newSize });
            }, 150);
        });
    }

    // =================== PiP 控制栏 ===================

    function createPiPControlBar(doc) {
        const style = doc.createElement('style');
        style.textContent = `
            #srt-control-bar {
                position: fixed;
                top: 0; right: 0;
                display: flex;
                gap: 6px;
                padding: 8px 10px;
                z-index: 9999;
                opacity: 0;
                transition: opacity 0.3s ease;
                pointer-events: none;
            }
            body:hover #srt-control-bar,
            #srt-control-bar:hover {
                opacity: 1;
                pointer-events: auto;
            }
            .srt-pip-btn {
                background: rgba(0,0,0,0.55);
                backdrop-filter: blur(8px);
                border: 1px solid rgba(255,255,255,0.12);
                color: #e0e0e0;
                padding: 5px 10px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                transition: all 0.2s;
                user-select: none;
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .srt-pip-btn:hover {
                background: rgba(79, 195, 247, 0.3);
                border-color: rgba(79, 195, 247, 0.4);
                color: #fff;
            }
            .srt-pip-btn:active {
                transform: scale(0.95);
            }
            .srt-pip-btn .icon {
                font-size: 14px;
            }
            #srt-pip-notification {
                position: fixed;
                top: 10px;
                left: 50%;
                transform: translateX(-50%) translateY(-60px);
                background: rgba(0,0,0,0.8);
                backdrop-filter: blur(8px);
                color: #fff;
                padding: 8px 16px;
                border-radius: 8px;
                font-size: 13px;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                z-index: 99999;
                transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s;
                opacity: 0;
                pointer-events: none;
            }
            #srt-pip-notification.show {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
            }
        `;
        doc.head.appendChild(style);

        // 控制栏
        const bar = doc.createElement('div');
        bar.id = 'srt-control-bar';
        bar.innerHTML = `
            <button class="srt-pip-btn" id="srt-btn-import" title="导入字幕文件">
                <span class="icon">📂</span>
                <span>字幕</span>
            </button>
            <button class="srt-pip-btn" id="srt-btn-settings" title="字幕设置">
                <span class="icon">⚙️</span>
            </button>
        `;
        doc.body.appendChild(bar);

        // 通知元素
        const notification = doc.createElement('div');
        notification.id = 'srt-pip-notification';
        doc.body.appendChild(notification);

        // 绑定事件
        doc.getElementById('srt-btn-import')?.addEventListener('click', () => {
            triggerFileImport(doc);
        });

        doc.getElementById('srt-btn-settings')?.addEventListener('click', () => {
            pipSettingsPanel?.toggle();
        });

        return { bar, notification, style };
    }

    /**
     * 触发文件选择导入
     */
    function triggerFileImport(doc) {
        const input = doc.createElement('input');
        input.type = 'file';
        input.accept = '.srt,.ass,.ssa,.vtt';
        input.style.display = 'none';

        input.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            await importSubtitleFile(file);
            input.remove();
        });

        doc.body.appendChild(input);
        input.click();
    }

    // =================== 拖拽导入 ===================

    function setupPiPDragDrop(doc) {
        let dragCounter = 0;

        doc.body.addEventListener('dragenter', (e) => {
            if (!e.dataTransfer?.types.includes('Files')) return;
            e.preventDefault();
            dragCounter++;
            pipDragOverlay?.show();
        });

        doc.body.addEventListener('dragleave', (e) => {
            dragCounter--;
            if (dragCounter <= 0) {
                dragCounter = 0;
                pipDragOverlay?.hide();
            }
        });

        doc.body.addEventListener('dragover', (e) => {
            if (!e.dataTransfer?.types.includes('Files')) return;
            e.preventDefault();
        });

        doc.body.addEventListener('drop', async (e) => {
            e.preventDefault();
            dragCounter = 0;

            const file = e.dataTransfer?.files[0];
            if (!file) {
                pipDragOverlay?.hide();
                return;
            }

            pipDragOverlay?.show('parsing', '正在解析...');
            await importSubtitleFile(file);
        });
    }

    /**
     * 导入字幕文件（拖拽或点击）
     */
    async function importSubtitleFile(file) {
        try {
            const result = await SubtitleParser.readAndParse(file);

            // 查找视频
            if (!currentVideo || !currentVideo.isConnected) {
                currentVideo = SubtitleEngine.findLargestVideo();
            }
            if (!currentVideo) {
                // 如果当前页面没有视频，尝试在 PiP 里查找
                if (pipWindow && !pipWindow.closed) {
                    currentVideo = SubtitleEngine.findLargestVideo(pipWindow.document);
                }
            }

            handleLoadSubtitles(result.subtitles, result.fileName);

            pipDragOverlay?.showSuccess(`✅ ${result.fileName} (${result.count} 条)`);
            showPiPNotification(`已加载: ${result.fileName}`);

            // 保存最后使用的文件信息
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                chrome.storage.local.set({
                    lastFileName: result.fileName,
                    lastCount: result.count,
                });
            }

        } catch (err) {
            console.error('字幕导入失败:', err);
            pipDragOverlay?.showError(err.message);
            showPiPNotification('❌ ' + err.message);
        }
    }

    // =================== 独立 PiP 窗口（纯字幕） ===================

    async function openSubtitlePiP() {
        if (pipWindow && !pipWindow.closed) {
            pipWindow.focus();
            return;
        }

        try {
            const win = await documentPictureInPicture.requestWindow({
                width: 500,
                height: 180,
            });

            // 基本样式
            const baseStyle = win.document.createElement('style');
            baseStyle.textContent = `
                body {
                    margin: 0; padding: 0;
                    background: #0a0a0f;
                    color: #fff;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    user-select: none;
                }
            `;
            win.document.head.appendChild(baseStyle);

            // 让 injectIntoPiPWindow 处理剩余的注入
            injectIntoPiPWindow(win);

        } catch (err) {
            console.error('打开 PiP 失败:', err);
        }
    }

    // =================== 设置变更处理 ===================

    function handlePiPSettingChange(key, value, allSettings) {
        settings = { ...settings, ...allSettings };

        switch (key) {
            case 'fontSize':
            case 'bottomPos':
            case 'bgOpacity':
            case 'textStroke':
            case 'strokeWidth':
            case 'textShadow':
            case 'shadowDistance':
            case 'fontFamily':
                applyAllStyles();
                break;

            case 'timeOffset':
                engine?.setTimeOffset(value);
                break;

            case 'autoScale':
                // 无需实时操作，resize 事件中检查
                break;
        }
    }

    function applyAllStyles() {
        const config = settingsToOverlayConfig();
        pageOverlay?.updateStyle(config);
        pipOverlay?.updateStyle(config);
    }

    function settingsToOverlayConfig() {
        const base = {
            fontSize: settings.fontSize || 16,
            fontFamily: settings.fontFamily || SubtitleOverlay.DEFAULT_STYLE.fontFamily,
            fontColor: '#ffffff',
            fontWeight: 600,
            bottomPos: settings.bottomPos || 12,
            bgColor: '#000000',
            bgOpacity: (settings.bgOpacity != null ? settings.bgOpacity : 30) / 100,
            bgPadding: settings.bgPadding != null ? settings.bgPadding : 8,
            textStroke: !!settings.textStroke,
            strokeWidth: settings.strokeWidth || 2,
            textShadow: !!settings.textShadow,
            shadowDistance: settings.shadowDistance || 2,
            shadowBlur: 4,
            customFontData: settings.customFontData || null,
            borderRadius: 4,
            autoScale: settings.autoScale !== false,
            autoScaleBaseWidth: 800,
        };

        // 分辨率自适应：根据视频/窗口宽度缩放字号
        if (base.autoScale && currentVideo) {
            const w = currentVideo.clientWidth || window.innerWidth;
            const scale = Math.max(0.6, Math.min(2.5, w / base.autoScaleBaseWidth));
            base.fontSize = Math.round(base.fontSize * scale);
            base.bottomPos = Math.round(base.bottomPos * scale);
            base.bgPadding = Math.round(base.bgPadding * scale);
        }

        return base;
    }

    // =================== UI 辅助 ===================

    function showStatus(msg, color) {
        if (!pageOverlay) return;
        pageOverlay.updateStatus(msg, color);
        clearTimeout(statusFadeTimer);
        statusFadeTimer = setTimeout(() => {
            pageOverlay?.hideStatus();
        }, 3000);
    }

    function updateStatusDisplay(state) {
        if (!pageOverlay) return;
        if (state.type === 'pause') {
            showStatus('⏸ 已暂停', '#d32f2f');
        } else if (state.type === 'play') {
            showStatus('▶ 播放中', '#2e7d32');
        }
    }

    let pipNotifyTimer = null;
    function showPiPNotification(msg) {
        if (!pipWindow || pipWindow.closed) return;
        const notif = pipWindow.document.getElementById('srt-pip-notification');
        if (!notif) return;
        notif.textContent = msg;
        notif.classList.add('show');
        clearTimeout(pipNotifyTimer);
        pipNotifyTimer = setTimeout(() => {
            notif.classList.remove('show');
        }, 2500);
    }

    // =================== 视频元素监控 ===================

    // 定期检查视频元素是否还有效
    setInterval(() => {
        if (!engine || currentSubtitles.length === 0) return;

        if (!currentVideo || !currentVideo.isConnected) {
            const newVideo = SubtitleEngine.findLargestVideo();
            if (newVideo && newVideo !== currentVideo) {
                currentVideo = newVideo;
                engine.updateVideoEl(currentVideo);
                console.log('视频元素已更新');
            }
        }
    }, 2000);

    // =================== 启动 ===================

    init();

})();