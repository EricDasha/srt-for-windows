/**
 * subtitleOverlay.js - 字幕覆盖层 UI
 * 负责在页面和 PiP 窗口中显示字幕
 */

const SubtitleOverlay = (() => {
    'use strict';

    /**
     * 默认样式配置
     */
    const DEFAULT_STYLE = {
        fontSize: 16,
        fontFamily: "arial, 'Microsoft YaHei', 'PingFang SC', helvetica, sans-serif",
        fontColor: '#ffffff',
        fontWeight: 600,
        bottomPos: 12,
        bgColor: '#000000',
        bgOpacity: 0.3,
        bgPadding: 8,
        textStroke: false,
        strokeWidth: 2,
        textShadow: false,
        shadowDistance: 2,
        shadowBlur: 4,
        autoScale: true,
        autoScaleBaseWidth: 500,
        customFontData: null,
        borderRadius: 4,
    };

    /**
     * 创建页面覆盖层（Shadow DOM 隔离）
     */
    function createPageOverlay(config = {}) {
        const style = { ...DEFAULT_STYLE, ...config };

        // 移除旧的覆盖层
        const old = document.getElementById('srt-overlay-host');
        if (old) old.remove();

        // 创建宿主元素
        const host = document.createElement('div');
        host.id = 'srt-overlay-host';
        Object.assign(host.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            zIndex: '2147483647',
            pointerEvents: 'none',
            display: 'block',
        });

        const shadow = host.attachShadow({ mode: 'open' });

        // 字幕盒子
        const subtitleBox = document.createElement('div');
        subtitleBox.id = 'subtitle-display';

        // 状态条
        const statusBar = document.createElement('div');
        statusBar.id = 'status-bar';

        // 样式
        const styleEl = document.createElement('style');
        styleEl.textContent = _buildCSS(style);

        shadow.appendChild(styleEl);
        shadow.appendChild(statusBar);
        shadow.appendChild(subtitleBox);
        document.documentElement.appendChild(host);

        // 全屏处理
        const handleFullscreen = () => {
            const fsEl = document.fullscreenElement;
            if (fsEl) {
                fsEl.appendChild(host);
            } else {
                document.documentElement.appendChild(host);
            }
        };
        document.addEventListener('fullscreenchange', handleFullscreen);

        return {
            host,
            shadow,
            subtitleBox,
            statusBar,
            styleEl,
            updateText: (text) => {
                if (text) {
                    subtitleBox.innerHTML = text.replace(/\n/g, '<br>');
                    subtitleBox.style.display = 'block';
                } else {
                    subtitleBox.style.display = 'none';
                    subtitleBox.innerHTML = '';
                }
            },
            updateStatus: (msg, color) => {
                statusBar.textContent = msg;
                statusBar.style.backgroundColor = color || 'rgba(0,0,0,0.7)';
                statusBar.style.color = '#fff';
                statusBar.style.opacity = '1';
            },
            hideStatus: () => {
                statusBar.style.opacity = '0';
            },
            updateStyle: (newConfig) => {
                Object.assign(style, newConfig);
                styleEl.textContent = _buildCSS(style);
            },
            destroy: () => {
                document.removeEventListener('fullscreenchange', handleFullscreen);
                host.remove();
            },
        };
    }

    /**
     * 在 PiP 窗口中创建字幕层
     */
    function createPiPOverlay(pipDocument, config = {}) {
        const style = { ...DEFAULT_STYLE, ...config };

        // 字幕容器
        const container = pipDocument.createElement('div');
        container.id = 'pip-subtitle-container';

        // 样式
        const styleEl = pipDocument.createElement('style');
        styleEl.textContent = _buildPiPCSS(style);

        pipDocument.head.appendChild(styleEl);
        pipDocument.body.appendChild(container);

        return {
            container,
            styleEl,
            updateText: (text) => {
                if (text) {
                    container.innerHTML = text.replace(/\n/g, '<br>');
                    container.classList.add('visible');
                } else {
                    container.innerHTML = '';
                    container.classList.remove('visible');
                }
            },
            updateStyle: (newConfig) => {
                Object.assign(style, newConfig);
                styleEl.textContent = _buildPiPCSS(style);
            },
            destroy: () => {
                container.remove();
                styleEl.remove();
            },
        };
    }

    /**
     * 创建拖拽覆盖层
     */
    function createDragOverlay(targetDocument) {
        const overlay = targetDocument.createElement('div');
        overlay.id = 'drag-overlay';
        overlay.innerHTML = `
            <div class="drag-inner">
                <div class="drag-icon">📂</div>
                <div class="drag-text">拖入字幕文件</div>
                <div class="drag-hint">.srt / .ass / .ssa / .vtt</div>
            </div>
        `;

        const style = targetDocument.createElement('style');
        style.textContent = `
            #drag-overlay {
                position: fixed;
                top: 0; left: 0;
                width: 100%; height: 100%;
                background: rgba(25, 118, 210, 0.85);
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.25s ease;
                z-index: 99999;
                backdrop-filter: blur(8px);
            }
            #drag-overlay.active {
                opacity: 1;
                pointer-events: auto;
            }
            .drag-inner {
                text-align: center;
                color: white;
                animation: drag-bounce 0.5s ease;
            }
            .drag-icon {
                font-size: 48px;
                margin-bottom: 12px;
                filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));
            }
            .drag-text {
                font-size: 20px;
                font-weight: 700;
                margin-bottom: 6px;
                text-shadow: 0 1px 4px rgba(0,0,0,0.3);
            }
            .drag-hint {
                font-size: 13px;
                opacity: 0.75;
            }
            #drag-overlay.success { background: rgba(46, 125, 50, 0.9); }
            #drag-overlay.error { background: rgba(211, 47, 47, 0.9); }
            #drag-overlay.parsing { background: rgba(245, 124, 0, 0.9); }
            @keyframes drag-bounce {
                0% { transform: scale(0.9); opacity: 0; }
                100% { transform: scale(1); opacity: 1; }
            }
        `;

        targetDocument.head.appendChild(style);
        targetDocument.body.appendChild(overlay);

        return {
            overlay,
            show: (state, message) => {
                overlay.className = 'active' + (state ? ' ' + state : '');
                if (message) {
                    overlay.querySelector('.drag-text').textContent = message;
                }
            },
            hide: () => {
                overlay.className = '';
                // 恢复默认文案
                overlay.querySelector('.drag-text').textContent = '拖入字幕文件';
                overlay.querySelector('.drag-hint').textContent = '.srt / .ass / .ssa / .vtt';
            },
            showSuccess: (msg) => {
                overlay.className = 'active success';
                overlay.querySelector('.drag-icon').textContent = '✅';
                overlay.querySelector('.drag-text').textContent = msg || '加载成功';
                overlay.querySelector('.drag-hint').textContent = '';
                setTimeout(() => {
                    overlay.className = '';
                    overlay.querySelector('.drag-icon').textContent = '📂';
                    overlay.querySelector('.drag-text').textContent = '拖入字幕文件';
                    overlay.querySelector('.drag-hint').textContent = '.srt / .ass / .ssa / .vtt';
                }, 1500);
            },
            showError: (msg) => {
                overlay.className = 'active error';
                overlay.querySelector('.drag-icon').textContent = '❌';
                overlay.querySelector('.drag-text').textContent = msg || '加载失败';
                overlay.querySelector('.drag-hint').textContent = '';
                setTimeout(() => {
                    overlay.className = '';
                    overlay.querySelector('.drag-icon').textContent = '📂';
                    overlay.querySelector('.drag-text').textContent = '拖入字幕文件';
                    overlay.querySelector('.drag-hint').textContent = '.srt / .ass / .ssa / .vtt';
                }, 2500);
            },
            destroy: () => {
                overlay.remove();
                style.remove();
            },
        };
    }

    // =================== CSS 构建 ===================

    function _buildCSS(s) {
        const textStroke = s.textStroke
            ? `-webkit-text-stroke: ${s.strokeWidth}px rgba(0,0,0,0.8); paint-order: stroke fill;`
            : '';
        const textShadow = s.textShadow
            ? `text-shadow: 0 0 ${s.shadowBlur}px rgba(0,0,0,0.9), ${s.shadowDistance}px ${s.shadowDistance}px ${s.shadowBlur}px rgba(0,0,0,0.7), -1px -1px ${s.shadowBlur}px rgba(0,0,0,0.5);`
            : 'text-shadow: none;';
        const fontFamily = s.customFontData
            ? `@font-face { font-family: 'SRTCustomFont'; src: url('${s.customFontData}'); font-display: swap; }\n`
            : '';
        const fontFamilyValue = s.customFontData
            ? "'SRTCustomFont', " + s.fontFamily
            : s.fontFamily;

        return `
            ${fontFamily}
            #subtitle-display {
                position: absolute;
                bottom: ${s.bottomPos}px;
                left: 50%;
                transform: translateX(-50%);
                color: ${s.fontColor};
                font-family: ${fontFamilyValue};
                font-size: ${s.fontSize}px;
                font-weight: ${s.fontWeight};
                background-color: rgba(${_hexToRgb(s.bgColor)}, ${s.bgOpacity});
                padding: ${s.bgPadding}px ${s.bgPadding + 12}px;
                border-radius: ${s.borderRadius}px;
                text-align: center;
                line-height: 1.45;
                max-width: 85%;
                white-space: pre-wrap;
                word-break: break-word;
                display: none;
                pointer-events: none;
                transition: opacity 0.15s ease, bottom 0.2s ease;
                z-index: 1;
                ${textStroke}
                ${textShadow}
            }
            #status-bar {
                position: absolute;
                top: 0;
                left: 50%;
                transform: translateX(-50%);
                padding: 4px 14px;
                font-size: 12px;
                font-weight: 600;
                font-family: 'Consolas', 'SF Mono', monospace;
                border-radius: 0 0 6px 6px;
                white-space: nowrap;
                pointer-events: auto;
                cursor: default;
                opacity: 0;
                transition: opacity 0.3s ease, background-color 0.3s ease;
                z-index: 2;
            }
        `;
    }

    function _buildPiPCSS(s) {
        const textStroke = s.textStroke
            ? `-webkit-text-stroke: ${s.strokeWidth}px rgba(0,0,0,0.8); paint-order: stroke fill;`
            : '';
        const textShadow = s.textShadow
            ? `text-shadow: 0 0 ${s.shadowBlur}px rgba(0,0,0,0.9), ${s.shadowDistance}px ${s.shadowDistance}px ${s.shadowBlur}px rgba(0,0,0,0.7);`
            : '';
        const fontFamilyValue = s.customFontData
            ? "'SRTCustomFont', " + s.fontFamily
            : s.fontFamily;

        return `
            #pip-subtitle-container {
                position: fixed;
                bottom: 12px;
                left: 50%;
                transform: translateX(-50%);
                color: ${s.fontColor};
                font-family: ${fontFamilyValue};
                font-size: ${s.fontSize}px;
                font-weight: ${s.fontWeight};
                background-color: rgba(${_hexToRgb(s.bgColor)}, ${s.bgOpacity});
                padding: ${s.bgPadding}px ${s.bgPadding + 12}px;
                border-radius: ${s.borderRadius}px;
                text-align: center;
                line-height: 1.45;
                max-width: 90%;
                white-space: pre-wrap;
                word-break: break-word;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.15s ease, font-size 0.15s ease;
                z-index: 10;
                ${textStroke}
                ${textShadow}
            }
            #pip-subtitle-container.visible {
                opacity: 1;
            }
        `;
    }

    function _hexToRgb(hex) {
        if (!hex) return '0, 0, 0';
        const c = hex.replace('#', '');
        if (c.length === 3) {
            return [
                parseInt(c[0] + c[0], 16),
                parseInt(c[1] + c[1], 16),
                parseInt(c[2] + c[2], 16),
            ].join(', ');
        }
        return [
            parseInt(c.substring(0, 2), 16),
            parseInt(c.substring(2, 4), 16),
            parseInt(c.substring(4, 6), 16),
        ].join(', ');
    }

    return {
        createPageOverlay,
        createPiPOverlay,
        createDragOverlay,
        DEFAULT_STYLE,
    };
})();
