let settings = {
    fontSize: 28, bottomPos: 60, bgPadding: 10, bgOpacity: 0.65, timeOffset: 0, barPersistent: false,
    fontFamily: 'sans-serif', textStroke: false, textShadow: true, customFontData: null, customFontName: '',
    strokeWidth: 4, shadowDistance: 4, language: 'zh'
};

let lastKnownFileName = "";
let lastKnownCount = 0;

const fontMap = {
    "sans-serif": { zh: "系统默认", en: "System Default" },
    "Microsoft YaHei, PingFang SC, sans-serif": { zh: "黑体 (微软雅黑)", en: "SimHei (Sans-serif)" },
    "SimSun, Songti SC, serif": { zh: "宋体", en: "SimSun (Serif)" },
    "KaiTi, STKaiti, serif": { zh: "楷体", en: "KaiTi" },
    "YouYuan, Yuanti SC, sans-serif": { zh: "幼圆", en: "YouYuan" },
    "Arial, sans-serif": { zh: "Arial", en: "Arial" },
    "Times New Roman, serif": { zh: "Times New Roman", en: "Times New Roman" },
    "Georgia, serif": { zh: "Georgia", en: "Georgia" },
    "Verdana, sans-serif": { zh: "Verdana", en: "Verdana" }
};

const i18nData = {
    zh: {
        appTitle: "字在 AnySub", clickLoad: "点击加载字幕", supportFormats: "支持 .srt .ass .ssa",
        running: "✅ 字幕服务运行中", loadedPrefix: "已挂载 ", loadedSuffix: " 条字幕",
        clickChange: "点击更换字幕文件", clickSelect: "点击选择文件", readyMsg: "准备就绪", parsing: "正在解析...",
        syncTitle: "同步校准 (秒)", styleTitle: "样式调整", sizeLabel: "字号", posLabel: "位置", padLabel: "留白", bgLabel: "背景",
        strokeLabel: "文字描边", shadowLabel: "文字阴影", backBtn: "返回", fontTitle: "字体外观",
        currentPrefix: "当前: ", strokeW: "描边粗细", shadowD: "阴影偏移", barTitle: "状态栏常驻",
        barDesc: "关闭后，鼠标静止2秒自动隐藏", encTitle: "字符编码", encDesc: "字幕乱码时切换此项",
        encUtf8: "UTF-8 (默认)", encGbk: "GBK (简体中文)", encUtf16: "UTF-16", encBig5: "Big5 (繁体中文)",
        fontLoadErr: "字体文件无效或浏览器不支持", fontSuccess: "字体加载成功",
        refreshTip: "⚠️ 检测到连接断开，请刷新视频页面！"
    },
    en: {
        appTitle: "AnySub", clickLoad: "Load Subtitles", supportFormats: "Supports .srt .ass .ssa",
        running: "✅ Service Running", loadedPrefix: "Loaded ", loadedSuffix: " subtitles",
        clickChange: "Click to change file", clickSelect: "Click to select file", readyMsg: "Ready", parsing: "Parsing...",
        syncTitle: "Sync Offset (s)", styleTitle: "Appearance", sizeLabel: "Size", posLabel: "Pos", padLabel: "Pad", bgLabel: "Bg",
        strokeLabel: "Stroke", shadowLabel: "Shadow", backBtn: "Back", fontTitle: "Font Settings",
        currentPrefix: "Current: ", strokeW: "Stroke", shadowD: "Shadow", barTitle: "Always Visible Bar",
        barDesc: "If off, hides after 2s inactivity", encTitle: "Encoding", encDesc: "Change if text is garbled",
        encUtf8: "UTF-8 (Default)", encGbk: "GBK (Chinese)", encUtf16: "UTF-16", encBig5: "Big5 (Traditional)",
        fontLoadErr: "Invalid font file", fontSuccess: "Font loaded successfully",
        refreshTip: "⚠️ Connection lost. Please refresh the page!"
    }
};

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['settings', 'lastFileName', 'lastCount'], (res) => {
        if (res.settings) settings = { ...settings, ...res.settings };
        if (res.lastFileName) {
            lastKnownFileName = res.lastFileName;
            lastKnownCount = res.lastCount || 0;
        }
        if (!settings.language) settings.language = 'zh';

        updateUIFromSettings();
        if (res.lastFileName) setActionMode('running', res.lastFileName, res.lastCount || 0);
        else setActionMode('upload');

        applyLanguage(settings.language);
        checkRealStatus();
    });
});

function checkRealStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs.length) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: "getPlaybackStatus" }, (response) => {
            // 错误处理逻辑
            if (chrome.runtime.lastError) {
                // 如果连接失败，说明需要刷新页面
                const t = i18nData[settings.language || 'zh'];
                document.getElementById('msg-area').innerText = t.refreshTip;
                document.getElementById('msg-area').style.color = "#d32f2f";
                setActionMode('upload');
            } else if (!response || !response.fileName) {
                setActionMode('upload');
                chrome.storage.local.remove(['lastFileName', 'lastCount']);
            } else {
                setActionMode('running', response.fileName, response.count);
            }
        });
    });
}

// ... 剩余代码保持不变，直接复制之前的 parser 逻辑即可 ...
// 为了节省篇幅，请保留之前 popup.js 中从 function setActionMode 开始到底部的所有代码
// 重点是替换上面的 checkRealStatus 和 i18nData (新增了 refreshTip)

function setActionMode(mode, fileName = "", count = 0) {
    const card = document.getElementById('action-card');
    const iconBox = document.getElementById('action-icon-box');
    const title = document.getElementById('action-title');
    const sub = document.getElementById('action-sub');
    const msg = document.getElementById('msg-area');
    const t = i18nData[settings.language || 'zh'];

    const svgUpload = '<svg class="icon" style="fill:currentColor" viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>';
    const svgRunning = '<svg class="icon" style="fill:currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

    card.classList.remove('upload', 'running');

    if (mode === 'running') {
        lastKnownFileName = fileName;
        lastKnownCount = count;
        card.classList.add('running');
        card.setAttribute('title', t.clickChange);
        iconBox.innerHTML = svgRunning;
        title.innerText = fileName;
        sub.innerText = `${t.loadedPrefix}${count}${t.loadedSuffix}`;
        msg.innerText = t.running;
        msg.style.color = "#2e7d32";
    } else {
        lastKnownFileName = "";
        lastKnownCount = 0;
        card.classList.add('upload');
        card.setAttribute('title', t.clickSelect);
        iconBox.innerHTML = svgUpload;
        title.innerText = t.clickLoad;
        sub.innerText = t.supportFormats;
        // 如果不是连接错误提示，才显示准备就绪
        if (msg.innerText !== t.refreshTip) {
            msg.innerText = t.readyMsg;
            msg.style.color = "#90a4ae";
        }
    }
}

// 下面是通用的辅助函数，请直接复制粘贴
function applyLanguage(lang) {
    const data = i18nData[lang];
    const isRunning = document.getElementById('action-card').classList.contains('running');
    document.getElementById('lang-toggle').setAttribute('data-lang', lang);
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (isRunning && (key === 'clickLoad' || key === 'supportFormats')) return;
        if (data[key]) el.innerText = data[key];
    });
    document.getElementById('opt-utf8').innerText = data.encUtf8;
    document.getElementById('opt-gbk').innerText = data.encGbk;
    document.getElementById('opt-utf16').innerText = data.encUtf16;
    document.getElementById('opt-big5').innerText = data.encBig5;
    const fontSelect = document.getElementById('font-family-select');
    Array.from(fontSelect.options).forEach(opt => {
        const map = fontMap[opt.value];
        if (map) opt.innerText = map[lang];
    });
    if (isRunning) {
        document.getElementById('action-title').innerText = lastKnownFileName;
        document.getElementById('action-sub').innerText = `${data.loadedPrefix}${lastKnownCount}${data.loadedSuffix}`;
        if (document.getElementById('msg-area').innerText !== data.refreshTip) {
            document.getElementById('msg-area').innerText = data.running;
        }
        document.getElementById('action-card').setAttribute('title', data.clickChange);
    } else {
        document.getElementById('action-card').setAttribute('title', data.clickSelect);
    }
    updateFontDisplay();
}

function updateFontDisplay() {
    const fontSelect = document.getElementById('font-family-select');
    const t = i18nData[settings.language || 'zh'];
    let fontName = "";
    if (settings.customFontName) fontName = settings.customFontName;
    else {
        const idx = fontSelect.selectedIndex;
        if (idx >= 0) fontName = fontSelect.options[idx].text;
    }
    document.getElementById('current-font-display').innerText = `${t.currentPrefix}${fontName}`;
}

document.getElementById('lang-toggle').addEventListener('click', () => {
    settings.language = settings.language === 'zh' ? 'en' : 'zh';
    applyLanguage(settings.language);
    saveAndSend();
});

document.getElementById('btn-settings').addEventListener('click', () => document.getElementById('flipper').classList.add('flipped'));
document.getElementById('btn-back').addEventListener('click', () => document.getElementById('flipper').classList.remove('flipped'));

function updateUIFromSettings() {
    document.getElementById('bar-persistent').checked = settings.barPersistent;
    setVal('font-size', 'num-font-size', settings.fontSize);
    setVal('bottom-pos', 'num-bottom-pos', settings.bottomPos);
    setVal('bg-padding', 'num-bg-padding', settings.bgPadding);
    setVal('bg-opacity', 'num-bg-opacity', Math.round(settings.bgOpacity * 100));
    setVal('stroke-width', 'num-stroke-width', settings.strokeWidth);
    setVal('shadow-distance', 'num-shadow-distance', settings.shadowDistance);
    document.getElementById('time-val').value = settings.timeOffset.toFixed(1);
    document.getElementById('text-stroke').checked = settings.textStroke;
    document.getElementById('text-shadow').checked = settings.textShadow;
    const fontSelect = document.getElementById('font-family-select');
    if (!settings.customFontName) fontSelect.value = settings.fontFamily;
    updateFontDisplay();
    sendSettingsToContent();
}

function setVal(sId, iId, val) {
    const s = document.getElementById(sId);
    const i = document.getElementById(iId);
    if (s) s.value = val;
    if (i) i.value = val;
}

function saveAndSend() {
    chrome.storage.local.set({ settings: settings });
    sendSettingsToContent();
}

function sendSettingsToContent() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs.length) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: "updateSettings", settings: settings });
    });
}

const fontSelect = document.getElementById('font-family-select');
fontSelect.addEventListener('change', (e) => {
    settings.fontFamily = e.target.value;
    settings.customFontData = null;
    settings.customFontName = '';
    updateFontDisplay();
    saveAndSend();
});

document.getElementById('text-stroke').addEventListener('change', (e) => { settings.textStroke = e.target.checked; saveAndSend(); });
document.getElementById('text-shadow').addEventListener('change', (e) => { settings.textShadow = e.target.checked; saveAndSend(); });

document.getElementById('btn-upload-font').addEventListener('click', () => document.getElementById('font-file-input').click());

document.getElementById('font-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
        alert(i18nData[settings.language].fontLoadErr + " (>20MB)");
        return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async function (evt) {
        const newData = evt.target.result;
        try {
            const fontCheck = new FontFace('TempCheckFont', `url(${newData})`);
            await fontCheck.load();
            settings.customFontData = newData;
            settings.customFontName = file.name;
            chrome.storage.local.set({ settings: settings }, () => {
                if (chrome.runtime.lastError) {
                    alert(i18nData[settings.language].fontLoadErr + "\n" + chrome.runtime.lastError.message);
                } else {
                    updateFontDisplay();
                    sendSettingsToContent();
                }
            });
        } catch (err) {
            alert(i18nData[settings.language].fontLoadErr);
        }
    };
});

function bindInput(sId, iId, key, isPercent = false) {
    const s = document.getElementById(sId);
    const i = document.getElementById(iId);
    if (!s || !i) return;
    const update = (val) => { s.value = val; i.value = val; settings[key] = isPercent ? val / 100 : val; saveAndSend(); };
    s.addEventListener('input', (e) => update(parseInt(e.target.value)));
    i.addEventListener('input', (e) => { let v = parseInt(e.target.value); if (!isNaN(v)) update(v); });
}

bindInput('font-size', 'num-font-size', 'fontSize');
bindInput('bottom-pos', 'num-bottom-pos', 'bottomPos');
bindInput('bg-padding', 'num-bg-padding', 'bgPadding');
bindInput('bg-opacity', 'num-bg-opacity', 'bgOpacity', true);
bindInput('stroke-width', 'num-stroke-width', 'strokeWidth');
bindInput('shadow-distance', 'num-shadow-distance', 'shadowDistance');

document.getElementById('bar-persistent').addEventListener('change', (e) => { settings.barPersistent = e.target.checked; saveAndSend(); });

const adjustTime = (delta) => { settings.timeOffset = parseFloat((settings.timeOffset + delta).toFixed(1)); updateUIFromSettings(); saveAndSend(); };
document.getElementById('btn-minus-05s').onclick = () => adjustTime(-0.5);
document.getElementById('btn-minus-01s').onclick = () => adjustTime(-0.1);
document.getElementById('btn-plus-01s').onclick = () => adjustTime(0.1);
document.getElementById('btn-plus-05s').onclick = () => adjustTime(0.5);

document.getElementById('action-card').addEventListener('click', () => document.getElementById('hidden-file-input').click());

document.getElementById('btn-pip').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs.length) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: "openPip" });
        window.close(); // Close popup to let user focus on PiP
    });
});

document.getElementById('hidden-file-input').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const encoding = document.getElementById('encoding').value;
    const msg = document.getElementById('msg-area');
    const t = i18nData[settings.language || 'zh'];
    msg.innerText = t.parsing;
    msg.style.color = "#1976d2";
    const reader = new FileReader();
    reader.readAsText(file, encoding);
    reader.onload = function (e) {
        try {
            const content = e.target.result;
            let subs = [];
            if (file.name.toLowerCase().endsWith('.srt')) subs = parseSRT(content);
            else subs = parseASS_Advanced(content);
            if (subs.length === 0) throw new Error("Empty or invalid file");
            subs.sort((a, b) => a.start - b.start);
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (!tabs.length) return;
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "loadSubtitles", data: subs, fileName: file.name, settings: settings
                }, { frameId: null }, () => {
                    chrome.storage.local.set({ lastFileName: file.name, lastCount: subs.length });
                    setActionMode('running', file.name, subs.length);
                });
            });
        } catch (err) {
            msg.innerText = "❌ " + err.message;
            msg.style.color = "#d32f2f";
        }
    };
});

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
                const clean = rawText.replace(/{.*?}/g, '').replace(/\\N/g, '<br>').replace(/\\n/g, ' ').replace(/\\h/g, ' ').replace(/\\h/g, ' ').trim();
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