/**
 * subtitleSettings.js - PiP 内嵌字幕设置面板
 */

const SubtitleSettings = (() => {
    'use strict';

    const STORAGE_KEY = 'srt_settings';

    /**
     * 默认设置项
     */
    const DEFAULTS = {
        fontSize: 16,
        bottomPos: 12,
        bgOpacity: 30,       // 百分比 0-100
        bgPadding: 8,
        timeOffset: 0,
        fontFamily: 'sans-serif',
        textStroke: false,
        textShadow: false,
        strokeWidth: 2,
        shadowDistance: 2,
        autoScale: true,
        customFontData: null,
        language: 'zh',
    };

    /**
     * 加载持久化设置
     */
    function loadSettings() {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                chrome.storage.local.get(STORAGE_KEY, (result) => {
                    resolve({ ...DEFAULTS, ...(result[STORAGE_KEY] || {}) });
                });
            } else {
                try {
                    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
                    resolve({ ...DEFAULTS, ...(saved || {}) });
                } catch {
                    resolve({ ...DEFAULTS });
                }
            }
        });
    }

    /**
     * 保存设置
     */
    function saveSettings(settings) {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({ [STORAGE_KEY]: settings });
        } else {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
            } catch { }
        }
    }

    /**
     * 在 PiP 窗口中创建设置面板
     * @param {Document} doc - PiP 窗口的 document
     * @param {object} currentSettings - 当前设置
     * @param {function} onChange - 设置变更回调 (key, value, allSettings)
     */
    function createSettingsPanel(doc, currentSettings, onChange) {
        const settings = { ...DEFAULTS, ...currentSettings };

        // 注入样式
        const style = doc.createElement('style');
        style.textContent = `
            #srt-settings-panel {
                position: fixed;
                bottom: 0; left: 0;
                width: 100%;
                background: rgba(15, 15, 20, 0.95);
                backdrop-filter: blur(16px);
                padding: 16px 20px 12px;
                box-sizing: border-box;
                transform: translateY(100%);
                transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
                z-index: 9990;
                border-top: 1px solid rgba(255,255,255,0.08);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                max-height: 70vh;
                overflow-y: auto;
                scrollbar-width: thin;
                scrollbar-color: rgba(255,255,255,0.2) transparent;
            }
            #srt-settings-panel.visible {
                transform: translateY(0);
            }
            #srt-settings-panel::-webkit-scrollbar {
                width: 4px;
            }
            #srt-settings-panel::-webkit-scrollbar-track {
                background: transparent;
            }
            #srt-settings-panel::-webkit-scrollbar-thumb {
                background: rgba(255,255,255,0.2);
                border-radius: 2px;
            }
            .as-setting-title {
                font-size: 13px;
                font-weight: 600;
                color: rgba(255,255,255,0.5);
                text-transform: uppercase;
                letter-spacing: 1px;
                margin-bottom: 12px;
                user-select: none;
            }
            .as-setting-row {
                display: flex;
                align-items: center;
                margin-bottom: 10px;
                font-size: 13px;
                color: #ccc;
                gap: 10px;
            }
            .as-setting-row label {
                width: 72px;
                flex-shrink: 0;
                color: #aab;
                font-size: 12px;
                user-select: none;
            }
            .as-setting-row input[type="range"] {
                flex: 1;
                height: 4px;
                appearance: none;
                background: rgba(255,255,255,0.12);
                border-radius: 2px;
                outline: none;
                cursor: pointer;
            }
            .as-setting-row input[type="range"]::-webkit-slider-thumb {
                appearance: none;
                width: 14px; height: 14px;
                border-radius: 50%;
                background: #4fc3f7;
                border: 2px solid rgba(255,255,255,0.3);
                cursor: pointer;
                transition: transform 0.15s;
            }
            .as-setting-row input[type="range"]::-webkit-slider-thumb:hover {
                transform: scale(1.2);
            }
            .as-setting-row .as-val {
                width: 36px;
                text-align: right;
                font-family: 'SF Mono', 'Consolas', monospace;
                font-size: 12px;
                color: #4fc3f7;
                font-weight: 600;
                flex-shrink: 0;
            }
            .as-btn {
                background: rgba(255,255,255,0.08);
                border: 1px solid rgba(255,255,255,0.15);
                color: #ddd;
                padding: 4px 10px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.15s;
                user-select: none;
            }
            .as-btn:hover {
                background: rgba(255,255,255,0.15);
                color: #fff;
            }
            .as-btn:active {
                transform: scale(0.95);
            }
            .as-btn-primary {
                background: rgba(79, 195, 247, 0.2);
                border-color: rgba(79, 195, 247, 0.3);
                color: #4fc3f7;
            }
            .as-btn-primary:hover {
                background: rgba(79, 195, 247, 0.3);
            }
            .as-close-btn {
                text-align: center;
                margin-top: 8px;
                cursor: pointer;
                color: rgba(255,255,255,0.35);
                font-size: 11px;
                padding: 6px;
                transition: color 0.2s;
                user-select: none;
            }
            .as-close-btn:hover { color: rgba(255,255,255,0.7); }
            .as-divider {
                height: 1px;
                background: rgba(255,255,255,0.06);
                margin: 10px 0;
            }
            .as-toggle {
                position: relative;
                width: 36px; height: 20px;
                background: rgba(255,255,255,0.15);
                border-radius: 10px;
                cursor: pointer;
                transition: background 0.25s;
                flex-shrink: 0;
            }
            .as-toggle.on {
                background: rgba(79, 195, 247, 0.6);
            }
            .as-toggle::after {
                content: '';
                position: absolute;
                top: 2px; left: 2px;
                width: 16px; height: 16px;
                border-radius: 50%;
                background: #fff;
                transition: transform 0.25s;
            }
            .as-toggle.on::after {
                transform: translateX(16px);
            }
        `;
        doc.head.appendChild(style);

        // 创建面板
        const panel = doc.createElement('div');
        panel.id = 'srt-settings-panel';

        const emit = (key, value) => {
            settings[key] = value;
            saveSettings(settings);
            onChange?.(key, value, { ...settings });
        };

        panel.innerHTML = `
            <div class="as-setting-title">字幕设置 / Subtitle Settings</div>

            <div class="as-setting-row">
                <label>字体大小</label>
                <input type="range" id="as-fontSize" min="12" max="80" value="${settings.fontSize}">
                <span class="as-val" id="as-val-fontSize">${settings.fontSize}</span>
            </div>

            <div class="as-setting-row">
                <label>底部位置</label>
                <input type="range" id="as-bottomPos" min="0" max="200" value="${settings.bottomPos}">
                <span class="as-val" id="as-val-bottomPos">${settings.bottomPos}</span>
            </div>

            <div class="as-setting-row">
                <label>背景透明</label>
                <input type="range" id="as-bgOpacity" min="0" max="100" value="${settings.bgOpacity}">
                <span class="as-val" id="as-val-bgOpacity">${settings.bgOpacity}%</span>
            </div>

            <div class="as-divider"></div>

            <div class="as-setting-row">
                <label>时间偏移</label>
                <button class="as-btn" id="as-offset-minus">-0.5s</button>
                <button class="as-btn" id="as-offset-plus">+0.5s</button>
                <span class="as-val" id="as-val-offset" style="width:50px">${settings.timeOffset.toFixed(1)}s</span>
            </div>

            <div class="as-divider"></div>

            <div class="as-setting-row">
                <label>文字描边</label>
                <div class="as-toggle ${settings.textStroke ? 'on' : ''}" id="as-toggle-stroke"></div>
            </div>

            <div class="as-setting-row">
                <label>文字阴影</label>
                <div class="as-toggle ${settings.textShadow ? 'on' : ''}" id="as-toggle-shadow"></div>
            </div>

            <div class="as-setting-row">
                <label>自动缩放</label>
                <div class="as-toggle ${settings.autoScale ? 'on' : ''}" id="as-toggle-autoScale"></div>
            </div>

            <div class="as-close-btn" id="as-close-settings">▼ 收起面板</div>
        `;

        doc.body.appendChild(panel);

        // ===== 绑定事件 =====

        const bindRange = (id, key, suffix = '') => {
            const input = doc.getElementById(id);
            const valEl = doc.getElementById('as-val-' + key);
            if (!input || !valEl) return;
            input.addEventListener('input', (e) => {
                const v = parseInt(e.target.value);
                valEl.textContent = v + suffix;
                emit(key, v);
            });
        };

        bindRange('as-fontSize', 'fontSize');
        bindRange('as-bottomPos', 'bottomPos');
        bindRange('as-bgOpacity', 'bgOpacity', '%');

        // 时间偏移
        const offsetVal = doc.getElementById('as-val-offset');
        doc.getElementById('as-offset-minus')?.addEventListener('click', () => {
            settings.timeOffset = parseFloat((settings.timeOffset - 0.5).toFixed(1));
            offsetVal.textContent = settings.timeOffset.toFixed(1) + 's';
            emit('timeOffset', settings.timeOffset);
        });
        doc.getElementById('as-offset-plus')?.addEventListener('click', () => {
            settings.timeOffset = parseFloat((settings.timeOffset + 0.5).toFixed(1));
            offsetVal.textContent = settings.timeOffset.toFixed(1) + 's';
            emit('timeOffset', settings.timeOffset);
        });

        // Toggle 开关
        const bindToggle = (id, key) => {
            const toggle = doc.getElementById(id);
            if (!toggle) return;
            toggle.addEventListener('click', () => {
                settings[key] = !settings[key];
                toggle.classList.toggle('on', settings[key]);
                emit(key, settings[key]);
            });
        };

        bindToggle('as-toggle-stroke', 'textStroke');
        bindToggle('as-toggle-shadow', 'textShadow');
        bindToggle('as-toggle-autoScale', 'autoScale');

        // 关闭面板
        doc.getElementById('as-close-settings')?.addEventListener('click', () => {
            panel.classList.remove('visible');
        });

        return {
            panel,
            show: () => panel.classList.add('visible'),
            hide: () => panel.classList.remove('visible'),
            toggle: () => panel.classList.toggle('visible'),
            getSettings: () => ({ ...settings }),
            updateSetting: (key, value) => {
                settings[key] = value;
                // 更新 UI 如果需要
                const input = doc.getElementById('as-' + key);
                if (input) input.value = value;
                const val = doc.getElementById('as-val-' + key);
                if (val) val.textContent = value;
            },
            destroy: () => {
                panel.remove();
                style.remove();
            },
        };
    }

    return {
        createSettingsPanel,
        loadSettings,
        saveSettings,
        DEFAULTS,
        STORAGE_KEY,
    };
})();
