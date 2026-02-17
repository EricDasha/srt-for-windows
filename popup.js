/**
 * popup.js - Popup 页面逻辑
 * AnySub 字幕挂载
 * 自主创作，独立实现
 */

(function () {
    'use strict';

    // =================== DOM 引用 ===================

    const $ = (id) => document.getElementById(id);
    const dropZone = $('dropZone');
    const fileInput = $('fileInput');
    const statusFileName = $('statusFileName');
    const statusCount = $('statusCount');
    const btnOpenPip = $('btnOpenPip');
    const btnRefresh = $('btnRefresh');
    const notification = $('notification');
    const encodingSelect = $('encodingSelect');

    // =================== 初始化 ===================

    refreshStatus();

    // =================== 文件导入 ===================

    // 点击选择文件
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await loadFile(file);
    });

    // 拖拽
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer?.files[0];
        if (!file) return;
        await loadFile(file);
    });

    // =================== 文件加载 ===================

    async function loadFile(file) {
        try {
            const ext = file.name.split('.').pop().toLowerCase();
            if (!['srt', 'ass', 'ssa', 'vtt'].includes(ext)) {
                showNotification('不支持的文件格式', true);
                return;
            }

            const encoding = encodingSelect.value;
            let content;

            if (encoding === 'auto') {
                // 使用 SubtitleParser 的自动编码检测
                const result = await SubtitleParser.readAndParse(file);
                sendToContent(result.subtitles, result.fileName);
                updateStatus(result.fileName, result.count);
                showNotification(`✅ 加载成功: ${result.count} 条字幕`);
                return;
            }

            // 手动指定编码
            content = await readFileAsText(file, encoding);
            const subtitles = SubtitleParser.parseText(content, ext);

            if (subtitles.length === 0) {
                showNotification('未找到有效字幕', true);
                return;
            }

            sendToContent(subtitles, file.name);
            updateStatus(file.name, subtitles.length);
            showNotification(`✅ 加载成功: ${subtitles.length} 条字幕`);

        } catch (err) {
            console.error('加载失败:', err);
            showNotification(err.message, true);
        }
    }

    function readFileAsText(file, encoding) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('读取文件失败'));
            reader.readAsText(file, encoding);
        });
    }

    // =================== 与 Content Script 通信 ===================

    function sendToContent(subtitles, fileName) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]?.id) return;
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'loadSubtitles',
                data: subtitles,
                fileName: fileName,
            });
        });

        // 保存
        chrome.storage.local.set({
            lastFileName: fileName,
            lastCount: subtitles.length,
        });
    }

    // =================== 状态 ===================

    function refreshStatus() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]?.id) return;
            chrome.tabs.sendMessage(tabs[0].id, { action: 'getStatus' }, (response) => {
                if (chrome.runtime.lastError || !response) {
                    // content script 可能还没加载
                    chrome.storage.local.get(['lastFileName', 'lastCount'], (data) => {
                        if (data.lastFileName) {
                            updateStatus(data.lastFileName, data.lastCount);
                        }
                    });
                    return;
                }
                if (response.fileName) {
                    updateStatus(response.fileName, response.count);
                }
            });
        });
    }

    function updateStatus(fileName, count) {
        if (fileName) {
            statusFileName.textContent = fileName;
            statusFileName.classList.remove('empty');
            statusCount.textContent = `${count} 条字幕`;
            statusCount.style.display = 'block';
        } else {
            statusFileName.textContent = '未加载字幕文件';
            statusFileName.classList.add('empty');
            statusCount.style.display = 'none';
        }
    }

    // =================== 按钮 ===================

    btnOpenPip.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]?.id) return;
            chrome.tabs.sendMessage(tabs[0].id, { action: 'openPip' });
            showNotification('正在打开 PiP 字幕窗...');
        });
    });

    btnRefresh.addEventListener('click', () => {
        refreshStatus();
        showNotification('已刷新');
    });

    // =================== 通知 ===================

    let notifyTimer = null;
    function showNotification(msg, isError = false) {
        notification.textContent = msg;
        notification.className = 'notification show' + (isError ? ' error' : '');
        clearTimeout(notifyTimer);
        notifyTimer = setTimeout(() => {
            notification.classList.remove('show');
        }, 2500);
    }

})();