/**
 * popup.js
 */
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);

    // DOM refs
    const drop = $('drop');
    const fileIn = $('fileIn');
    const stFile = $('stFile');
    const stCount = $('stCount');
    const enc = $('enc');
    const toast = $('toast');

    // settings controls
    const settingsToggle = $('settingsToggle');
    const settingsBody = $('settingsBody');

    const sliders = {
        fontSize: { el: $('sFontSize'), val: $('vFontSize'), fmt: v => v },
        bottomPos: { el: $('sBottom'), val: $('vBottom'), fmt: v => v },
        bgOpacity: { el: $('sBgOp'), val: $('vBgOp'), fmt: v => v + '%' },
        bgPadding: { el: $('sPad'), val: $('vPad'), fmt: v => v },
        timeOffset: { el: $('sOffset'), val: $('vOffset'), fmt: v => (v / 10).toFixed(1) + 's' },
    };
    const checks = {
        textStroke: $('cStroke'),
        textShadow: $('cShadow'),
        autoScale: $('cScale'),
    };

    const DEFAULTS = {
        fontSize: 16, bottomPos: 12, bgOpacity: 30,
        bgPadding: 8, timeOffset: 0,
        textStroke: false, textShadow: false, autoScale: true,
    };

    // ---- init ----
    loadSavedSettings();
    refreshStatus();

    // ---- settings toggle ----
    settingsToggle.addEventListener('click', () => {
        settingsToggle.classList.toggle('open');
        settingsBody.classList.toggle('open');
    });

    // ---- slider events ----
    for (const [key, s] of Object.entries(sliders)) {
        s.el.addEventListener('input', () => {
            const v = parseInt(s.el.value);
            s.val.textContent = s.fmt(v);
            pushSettings();
        });
    }

    // ---- checkbox events ----
    for (const [key, el] of Object.entries(checks)) {
        el.addEventListener('change', () => pushSettings());
    }

    function gatherSettings() {
        const o = {};
        for (const [key, s] of Object.entries(sliders)) {
            o[key] = parseInt(s.el.value);
        }
        // timeOffset slider is in tenths of seconds; convert to seconds
        if (o.timeOffset != null) o.timeOffset = o.timeOffset / 10;
        for (const [key, el] of Object.entries(checks)) {
            o[key] = el.checked;
        }
        return o;
    }

    function applyToControls(s) {
        for (const [key, sl] of Object.entries(sliders)) {
            if (s[key] !== undefined) {
                sl.el.value = s[key];
                sl.val.textContent = sl.fmt(s[key]);
            }
        }
        for (const [key, el] of Object.entries(checks)) {
            if (s[key] !== undefined) el.checked = s[key];
        }
    }

    function pushSettings() {
        const s = gatherSettings();
        sendMsg({ action: 'updateSettings', settings: s });
        chrome.storage.local.set({ srt_popup_settings: s });
    }

    function loadSavedSettings() {
        chrome.storage.local.get(['srt_popup_settings'], (data) => {
            const s = { ...DEFAULTS, ...(data.srt_popup_settings || {}) };
            // convert timeOffset from seconds back to slider raw value
            if (s.timeOffset != null) s.timeOffset = Math.round(s.timeOffset * 10);
            applyToControls(s);
        });
    }

    // ---- file import ----
    drop.addEventListener('click', () => fileIn.click());

    fileIn.addEventListener('change', async (e) => {
        const f = e.target.files?.[0];
        if (f) await loadFile(f);
    });

    drop.addEventListener('dragover', (e) => {
        e.preventDefault();
        drop.classList.add('over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', async (e) => {
        e.preventDefault();
        drop.classList.remove('over');
        const f = e.dataTransfer?.files[0];
        if (f) await loadFile(f);
    });

    async function loadFile(file) {
        try {
            const ext = file.name.split('.').pop().toLowerCase();
            if (!['srt', 'ass', 'ssa', 'vtt'].includes(ext)) {
                notify('不支持的格式', true);
                return;
            }

            const encoding = enc.value;
            let subtitles, count;

            if (encoding === 'auto') {
                const r = await SubtitleParser.readAndParse(file);
                subtitles = r.subtitles;
                count = r.count;
            } else {
                const content = await readText(file, encoding);
                subtitles = SubtitleParser.parseText(content, ext);
                count = subtitles.length;
            }

            if (!count) { notify('未找到有效字幕', true); return; }

            sendMsg({
                action: 'loadSubtitles',
                data: subtitles,
                fileName: file.name,
            });
            chrome.storage.local.set({ lastFileName: file.name, lastCount: count });
            setStatus(file.name, count);
            notify('已加载 ' + count + ' 条');
        } catch (err) {
            notify(err.message, true);
        }
    }

    function readText(file, encoding) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = (e) => resolve(e.target.result);
            r.onerror = () => reject(new Error('读取失败'));
            r.readAsText(file, encoding);
        });
    }

    // ---- toolbar buttons ----
    $('tbPip').addEventListener('click', () => {
        sendMsg({ action: 'openPip' });
        notify('PiP...');
    });

    $('tbClose').addEventListener('click', () => {
        sendMsg({ action: 'removeOverlay' });
        setStatus(null);
        notify('已关闭');
    });

    $('tbReset').addEventListener('click', () => {
        applyToControls(DEFAULTS);
        pushSettings();
        sendMsg({ action: 'resetSettings' });
        notify('已恢复默认');
    });

    $('tbRefresh').addEventListener('click', () => {
        refreshStatus();
        notify('已刷新');
    });

    // ---- status ----
    function refreshStatus() {
        sendMsg({ action: 'getStatus' }, (resp) => {
            if (resp && resp.fileName) {
                setStatus(resp.fileName, resp.count);
            } else {
                chrome.storage.local.get(['lastFileName', 'lastCount'], (d) => {
                    if (d.lastFileName) setStatus(d.lastFileName, d.lastCount);
                });
            }
        });
    }

    function setStatus(name, count) {
        if (name) {
            stFile.textContent = name;
            stFile.className = 'status-file';
            stCount.textContent = count + ' 条';
            stCount.style.display = 'block';
        } else {
            stFile.textContent = '未加载';
            stFile.className = 'status-file none';
            stCount.style.display = 'none';
        }
    }

    // ---- messaging ----
    function sendMsg(msg, cb) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]?.id) return;
            if (cb) {
                chrome.tabs.sendMessage(tabs[0].id, msg, (resp) => {
                    if (chrome.runtime.lastError) { cb(null); return; }
                    cb(resp);
                });
            } else {
                chrome.tabs.sendMessage(tabs[0].id, msg);
            }
        });
    }

    // ---- toast ----
    let toastTimer = null;
    function notify(msg, err) {
        toast.textContent = msg;
        toast.className = 'toast show' + (err ? ' err' : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
    }
})();