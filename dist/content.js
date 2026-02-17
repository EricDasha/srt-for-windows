(function () {
    console.log("【字幕插件】V1.1.0 PiP Support Loaded");

    let subtitles = [];
    let currentFileName = null;
    let loopTimer = null;
    let currentVideo = null;

    let config = {
        fontSize: 28, bottomPos: 60, bgPadding: 10, bgOpacity: 0.65, timeOffset: 0, barPersistent: false,
        fontFamily: 'sans-serif', textStroke: false, textShadow: true, customFontData: null,
        strokeWidth: 4, shadowDistance: 4, language: 'zh'
    };

    // Overlay Elements
    let hostElement = null;
    let shadowRoot = null;
    let debugBar = null;
    let subtitleBox = null;
    let styleElement = null;

    // PiP Elements
    let pipWindow = null;
    let pipSubtitleContainer = null;
    let pipSettingsPanel = null;

    let fadeTimer = null;
    let previewTimer = null;
    let isPreviewing = false;

    // --- Subtitle Parser Functions (Copied from popup.js) ---
    function parseSRT(data) {
        const srtRegex = /(\d+)\r?\n(\d{2}:\d{2}:\d{2}[,.]\d{3}) --> (\d{2}:\d{2}:\d{2}[,.]\d{3})\r?\n([\s\S]*?)(?=\r?\n\r?\n|$)/g;
        const subs = []; let m;
        while ((m = srtRegex.exec(data)) !== null) subs.push({ start: timeToSec(m[2]), end: timeToSec(m[3]), text: m[4].trim().replace(/\n/g, '<br>') });
        return subs;
    }

    function parseASS_Advanced(data) {
        const lines = data.split(/\r?\n/); const subs = []; let evt = false, fmt = null;
        for (let line of lines) {
            line = line.trim(); if (!line) continue;
            if (line.toLowerCase() === '[events]') { evt = true; continue; }
            if (!evt) continue; if (line.startsWith('Comment:')) continue;
            if (line.startsWith('Format:')) {
                const keys = line.substring(7).split(',').map(k => k.trim().toLowerCase());
                fmt = { s: keys.indexOf('start'), e: keys.indexOf('end'), t: keys.indexOf('text') };
                if (fmt.s === -1) fmt.s = keys.indexOf('start time'); if (fmt.e === -1) fmt.e = keys.indexOf('end time');
                continue;
            }
            if (line.startsWith('Dialogue:') && fmt) {
                const content = line.substring(9).trim(); const parts = content.split(',');
                if (parts.length > fmt.s && parts.length > fmt.e) {
                    const rawText = parts.slice(fmt.t).join(',');
                    const clean = rawText.replace(/{.*?}/g, '').replace(/\\N/g, '<br>').replace(/\\n/g, ' ').replace(/\\h/g, ' ').replace(/\\h/g, ' ').replace(/\\h/g, ' ').trim();
                    if (clean) subs.push({ start: timeToSec(parts[fmt.s]), end: timeToSec(parts[fmt.e]), text: clean });
                }
            }
        }
        return subs;
    }

    function timeToSec(t) {
        if (!t) return 0;
        const p = t.trim().split(':'); if (p.length < 3) return 0;
        const sArr = p[2].split('.'); let ms = 0;
        if (sArr.length > 1) { ms = parseInt(sArr[1]); if (sArr[1].length === 2) ms *= 10; else if (sArr[1].length === 1) ms *= 100; }
        return parseInt(p[0]) * 3600 + parseInt(p[1]) * 60 + parseInt(sArr[0]) + ms / 1000;
    }
    // -----------------------------------------------------

    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
        // 1. Load Subtitles (from Popup)
        if (req.action === "loadSubtitles") {
            loadSubs(req.data, req.fileName, req.settings);
            sendResponse({ status: "received", count: subtitles.length });
        }

        // 2. Update Settings (Preview)
        if (req.action === "updateSettings") {
            if (!hostElement) initUI();
            config = { ...config, ...req.settings };
            applyStyles();
            applyPiPStyles(); // Sync to PiP
            triggerPreview();
        }

        // 3. Get Status
        if (req.action === "getPlaybackStatus") {
            sendResponse({ fileName: currentFileName, count: subtitles.length });
        }

        // 4. Open PiP (New)
        if (req.action === "openPip") {
            openPiP();
        }
    });

    function loadSubs(data, fileName, settings) {
        subtitles = data;
        currentFileName = fileName;
        if (settings) config = { ...config, ...settings };

        initUI();
        if (loopTimer) clearInterval(loopTimer);
        loopTimer = setInterval(syncLoop, 100);

        applyStyles();
        triggerRedBarInteraction();

        // Notify PiP if open
        if (pipWindow && !pipWindow.closed) {
            const dragOverlay = pipWindow.document.getElementById('drag-overlay');
            if (dragOverlay) {
                dragOverlay.innerText = "Loaded: " + fileName;
                setTimeout(() => dragOverlay.classList.remove('active'), 1500);
            }
        }
    }

    async function openPiP() {
        if (pipWindow && !pipWindow.closed) {
            pipWindow.focus();
            return;
        }

        try {
            // 1. Request Window
            pipWindow = await documentPictureInPicture.requestWindow({
                width: 600,
                height: 200
            });

            // 2. Load Content
            const html = await fetch(chrome.runtime.getURL('pip.html')).then(r => r.text());
            pipWindow.document.body.innerHTML = html;

            // 3. Inject Styles (from content.js context)
            // We need to copy global font styles if any
            const pipStyle = pipWindow.document.createElement('style');
            if (config.customFontData) {
                pipStyle.textContent = `@font-face { font-family: 'EatfishCustomFont'; src: url('${config.customFontData}'); font-display: swap; } body { font-family: 'EatfishCustomFont', sans-serif; }`;
            }
            pipWindow.document.head.appendChild(pipStyle);

            // 4. Bind Elements
            pipSubtitleContainer = pipWindow.document.getElementById('pip-subtitle-container');
            pipSettingsPanel = pipWindow.document.getElementById('settings-panel');

            // 5. Apply Initial Settings
            applyPiPStyles();
            setupPiPEvents(pipWindow);

            // 6. Handle Close
            pipWindow.addEventListener('pagehide', () => {
                pipWindow = null;
                pipSubtitleContainer = null;
                pipSettingsPanel = null;
            });

        } catch (err) {
            console.error("PiP Error:", err);
            alert("Failed to open PiP: " + err.message);
        }
    }

    function setupPiPEvents(win) {
        const doc = win.document;

        // Toggle Settings
        doc.getElementById('btn-toggle-settings').addEventListener('click', () => {
            doc.getElementById('settings-panel').classList.add('visible');
        });
        doc.getElementById('btn-close-settings').addEventListener('click', () => {
            doc.getElementById('settings-panel').classList.remove('visible');
        });

        // Settings Inputs
        function bindPiPInput(id, key, isRatio = false) {
            const range = doc.getElementById(id);
            const val = doc.getElementById('val-' + id.split('-').pop()); // e.g. val-size
            if (!range || !val) return;

            // Init value
            let curr = config[key];
            if (isRatio) curr = Math.round(curr * 100);
            range.value = curr;
            val.innerText = curr;

            range.addEventListener('input', (e) => {
                const v = parseInt(e.target.value);
                val.innerText = v;
                config[key] = isRatio ? v / 100 : v;

                // Sync everywhere
                applyStyles();
                applyPiPStyles();
                chrome.storage.local.set({ settings: config });
            });
        }

        bindPiPInput('pip-setting-size', 'fontSize');
        bindPiPInput('pip-setting-bg', 'bgOpacity', true);

        // Time Offset Buttons
        const updateOffset = () => {
            doc.getElementById('val-offset').innerText = config.timeOffset.toFixed(1);
        };
        updateOffset(); // Init

        doc.getElementById('pip-btn-offset-minus').addEventListener('click', () => {
            config.timeOffset = parseFloat((config.timeOffset - 0.5).toFixed(1));
            updateOffset();
            chrome.storage.local.set({ settings: config });
        });
        doc.getElementById('pip-btn-offset-plus').addEventListener('click', () => {
            config.timeOffset = parseFloat((config.timeOffset + 0.5).toFixed(1));
            updateOffset();
            chrome.storage.local.set({ settings: config });
        });

        // Font Auto-Scale on Resize
        win.addEventListener('resize', () => {
            // Optional: Implement smart scaling logic here
            // For now, let's keep user setting but maybe ensure it fits?
            // config.fontSize = Math.floor(win.innerHeight * 0.15); 
            // applyPiPStyles();
        });

        // Drag and Drop
        const dragOverlay = doc.getElementById('drag-overlay');
        doc.body.addEventListener('dragover', (e) => {
            e.preventDefault();
            dragOverlay.classList.add('active');
        });

        const removeOverlay = (e) => {
            // Only remove if leaving the body,/window
            if (e.relatedTarget === null || e.relatedTarget.nodeName === "HTML") {
                dragOverlay.classList.remove('active');
            }
        };

        doc.body.addEventListener('dragleave', removeOverlay);
        doc.body.addEventListener('dragend', removeOverlay);

        doc.body.addEventListener('drop', (e) => {
            e.preventDefault();
            // dragOverlay.classList.remove('active'); // Keep active until parsed

            const file = e.dataTransfer.files[0];
            if (!file) {
                dragOverlay.classList.remove('active');
                return;
            }

            dragOverlay.innerText = "Parsing...";

            const reader = new FileReader();
            // Detect encoding? Default to UTF-8 for drag-drop for now or use config?
            // The popup allows selection. Here we might guess or use UTF-8.
            // Let's assume UTF-8 or try to use config.encoding if we had it.
            // Since config is only styling, we default to UTF-8.
            reader.readAsText(file, 'UTF-8');
            reader.onload = (evt) => {
                try {
                    const content = evt.target.result;
                    let subs = [];
                    if (file.name.toLowerCase().endsWith('.srt')) subs = parseSRT(content);
                    else subs = parseASS_Advanced(content);

                    if (subs.length === 0) throw new Error("No subs found");

                    subs.sort((a, b) => a.start - b.start);

                    // Update Global State
                    loadSubs(subs, file.name);

                    // Save
                    chrome.storage.local.set({ lastFileName: file.name, lastCount: subs.length });

                    dragOverlay.innerText = "Success!";
                    setTimeout(() => dragOverlay.classList.remove('active'), 1000);

                } catch (err) {
                    dragOverlay.innerText = "Error: " + err.message;
                    setTimeout(() => dragOverlay.classList.remove('active'), 2000);
                }
            };
        });
    }

    function applyPiPStyles() {
        if (!pipWindow || !pipSubtitleContainer) return;

        pipSubtitleContainer.style.fontSize = config.fontSize + 'px';
        pipSubtitleContainer.style.backgroundColor = `rgba(0,0,0,${config.bgOpacity})`;
        // Padding/etc can be added
        if (config.customFontData) {
            pipSubtitleContainer.style.fontFamily = "'EatfishCustomFont', sans-serif";
        } else {
            pipSubtitleContainer.style.fontFamily = config.fontFamily;
        }
    }

    function triggerPreview() {
        if (!subtitleBox) return;
        isPreviewing = true;
        syncLoop();

        if (previewTimer) clearTimeout(previewTimer);
        previewTimer = setTimeout(() => {
            isPreviewing = false;
            syncLoop();
        }, 3000);
    }

    function injectGlobalFont() {
        let styleTag = document.getElementById('anysub-global-font');
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'anysub-global-font';
            document.head.appendChild(styleTag);
        }

        if (config.customFontData) {
            styleTag.textContent = `@font-face { font-family: 'EatfishCustomFont'; src: url('${config.customFontData}'); font-display: swap; }`;
        } else {
            styleTag.textContent = "";
        }
    }

    function initUI() {
        const oldHost = document.getElementById('anysub-host-v10');
        if (oldHost) oldHost.remove();

        hostElement = document.createElement('div');
        hostElement.id = 'anysub-host-v10';
        Object.assign(hostElement.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            zIndex: '2147483647', pointerEvents: 'none', display: 'block'
        });

        shadowRoot = hostElement.attachShadow({ mode: 'open' });
        styleElement = document.createElement('style');
        shadowRoot.appendChild(styleElement);

        debugBar = document.createElement('div');
        debugBar.id = 'debug-bar';
        Object.assign(debugBar.style, {
            position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)',
            padding: '5px 12px', fontSize: '13px', fontWeight: 'bold', fontFamily: 'Consolas, monospace',
            borderRadius: '0 0 6px 6px',
            whiteSpace: 'nowrap', transition: 'background-color 0.3s, color 0.3s, box-shadow 0.3s',
            pointerEvents: 'auto',
            backgroundColor: 'rgba(0,0,0,0)', color: 'rgba(0,0,0,0)', boxShadow: 'none'
        });

        subtitleBox = document.createElement('div');
        subtitleBox.id = 'subtitle-box';
        Object.assign(subtitleBox.style, {
            position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            color: 'white', fontWeight: 'bold',
            borderRadius: '8px', textAlign: 'center', lineHeight: '1.4',
            maxWidth: '85%', whiteSpace: 'pre-wrap', display: 'none',
            transition: 'bottom 0.2s, font-size 0.2s, background-color 0.2s, padding 0.2s',
            pointerEvents: 'none'
        });

        shadowRoot.appendChild(debugBar);
        shadowRoot.appendChild(subtitleBox);
        document.documentElement.appendChild(hostElement);

        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('fullscreenchange', handleFullscreenChange);

        document.removeEventListener('mousemove', handleMouseMove);
        document.addEventListener('mousemove', handleMouseMove);

        applyStyles();
    }

    function handleMouseMove() {
        triggerRedBarInteraction();
    }

    function handleFullscreenChange() {
        const fsEl = document.fullscreenElement;
        if (fsEl) {
            fsEl.appendChild(hostElement);
        } else {
            document.documentElement.appendChild(hostElement);
        }
        triggerRedBarInteraction();
    }

    function triggerRedBarInteraction() {
        if (!debugBar) return;
        if (subtitles.length === 0) return;

        setBarVisible(true);
        if (config.barPersistent) {
            clearTimeout(fadeTimer);
            return;
        }
        clearTimeout(fadeTimer);
        fadeTimer = setTimeout(() => { setBarVisible(false); }, 2000);
    }

    function setBarVisible(visible) {
        if (!debugBar) return;
        const paused = currentVideo ? currentVideo.paused : false;
        const color = paused ? '#d32f2f' : '#2e7d32';

        if (visible) {
            debugBar.style.backgroundColor = color;
            debugBar.style.color = 'white';
            debugBar.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
            debugBar.style.opacity = '1';
        } else {
            debugBar.style.backgroundColor = 'rgba(0,0,0,0)';
            debugBar.style.color = 'rgba(0,0,0,0)';
            debugBar.style.boxShadow = 'none';
        }
    }

    function applyStyles() {
        if (!subtitleBox || !debugBar || !styleElement) return;

        injectGlobalFont();

        // Overlay Styles
        if (config.customFontData) {
            subtitleBox.style.fontFamily = "'EatfishCustomFont', sans-serif";
        } else if (config.fontFamily) {
            subtitleBox.style.fontFamily = config.fontFamily;
        } else {
            subtitleBox.style.fontFamily = "sans-serif";
        }

        subtitleBox.style.fontSize = config.fontSize + 'px';
        subtitleBox.style.bottom = config.bottomPos + 'px';
        subtitleBox.style.backgroundColor = `rgba(0, 0, 0, ${config.bgOpacity})`;
        const p = config.bgPadding;
        subtitleBox.style.padding = `${p}px ${p + 10}px`;

        if (config.textStroke) {
            subtitleBox.style.webkitTextStroke = `${config.strokeWidth}px black`;
            subtitleBox.style.paintOrder = "stroke fill";
        } else {
            subtitleBox.style.webkitTextStroke = "0";
        }

        if (config.textShadow) {
            const d = config.shadowDistance;
            subtitleBox.style.textShadow = `0 0 4px black, ${d}px ${d}px 4px black`;
        } else {
            subtitleBox.style.textShadow = "none";
        }
    }

    function syncLoop() {
        // Preview Mode
        if (subtitles.length === 0) {
            const previewText = "字幕示例 AnySub<br>Subtitle Preview";
            if (isPreviewing && subtitleBox) {
                subtitleBox.innerHTML = previewText;
                subtitleBox.style.display = 'block';
            } else if (subtitleBox) {
                subtitleBox.style.display = 'none';
            }

            // Preview in PiP too?
            if (pipWindow && !pipWindow.closed && pipSubtitleContainer) {
                if (isPreviewing) pipSubtitleContainer.innerHTML = previewText;
                else pipSubtitleContainer.innerHTML = "Waiting for subtitles...";
            }
            return;
        }

        // Find Video
        if (!currentVideo || !currentVideo.isConnected) {
            findVideo();
            // If no video, show status in debug bar
            if (!currentVideo && debugBar) {
                setBarVisible(true);
                const text = config.language === 'en' ? "🔍 Finding video..." : "🔍 正在寻找视频...";
                debugBar.innerText = text;
                debugBar.style.backgroundColor = '#555';

                // Show in PiP
                if (pipWindow && !pipWindow.closed && pipSubtitleContainer) {
                    pipSubtitleContainer.innerText = text;
                }
                return;
            }
        }

        const t = currentVideo.currentTime;
        const paused = currentVideo.paused;
        const effectiveTime = t - config.timeOffset;
        const activeSubs = subtitles.filter(s => effectiveTime >= s.start && effectiveTime <= (s.end + 0.2));

        // Update Debug Bar (Overlay)
        if (debugBar) {
            if (debugBar.style.color !== 'rgba(0, 0, 0, 0)') {
                debugBar.style.backgroundColor = paused ? '#d32f2f' : '#2e7d32';
            }

            const isEn = config.language === 'en';
            const labelNext = isEn ? "Next" : "下句";
            const labelEnd = isEn ? "End" : "结束";
            const labelProg = isEn ? "Progress" : "进度";

            const nextSub = subtitles.find(s => s.start > effectiveTime);
            let nextInfoStr = nextSub ? ` | ${labelNext}: ${formatTime(nextSub.start + config.timeOffset)}` : ` | ${labelNext}: ${labelEnd}`;
            let progressNum = nextSub ? subtitles.findIndex(s => s.start > effectiveTime) : subtitles.length;

            const currentTimeStr = formatTime(t);
            let offsetStr = config.timeOffset !== 0 ? ` [${config.timeOffset > 0 ? "+" : ""}${config.timeOffset}s]` : "";
            debugBar.innerText = `${currentTimeStr}${offsetStr} | ${labelProg}: ${progressNum} / ${subtitles.length}${nextInfoStr}`;
        }

        // Render Subtitles
        let text = "";
        if (activeSubs.length > 0) {
            text = activeSubs.map(s => s.text).join('<br>');
        }

        // 1. Overlay
        if (subtitleBox) {
            if (activeSubs.length > 0) {
                if (subtitleBox.innerHTML !== text) subtitleBox.innerHTML = text;
                subtitleBox.style.display = 'block';
            } else if (isPreviewing) {
                subtitleBox.innerHTML = "字幕示例 AnySub<br>Subtitle Preview";
                subtitleBox.style.display = 'block';
            } else {
                subtitleBox.style.display = 'none';
            }
        }

        // 2. PiP
        if (pipWindow && !pipWindow.closed && pipSubtitleContainer) {
            if (activeSubs.length > 0) {
                if (pipSubtitleContainer.innerHTML !== text) pipSubtitleContainer.innerHTML = text;
            } else {
                pipSubtitleContainer.innerHTML = "";
            }
        }
    }

    function findVideo() {
        const videos = Array.from(document.querySelectorAll('video'));
        if (videos.length === 0) return;
        // Prioritize largest video by area
        currentVideo = videos.sort((a, b) => (b.videoWidth * b.videoHeight) - (a.videoWidth * a.videoHeight))[0];
    }

    function formatTime(seconds) {
        if (seconds < 0) seconds = 0;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const pad = (num) => num.toString().padStart(2, '0');
        if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
        else return `${pad(m)}:${pad(s)}`;
    }
})();