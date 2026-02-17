/**
 * subtitleEngine.js - 字幕同步引擎
 * 负责将字幕与视频播放状态实时同步
 */

const SubtitleEngine = (() => {
    'use strict';

    class Engine {
        constructor() {
            this.subtitles = [];
            this.videoEl = null;
            this.isActive = false;
            this.isPaused = false;
            this.timeOffset = 0;
            this.currentIndex = -1;
            this.lastRenderedText = '';

            // 回调
            this.onSubtitleChange = null; // (text: string, activeSubs: Array) => void
            this.onStateChange = null;    // (state: {paused, currentTime, ...}) => void

            // 定时器
            this._rafId = null;
            this._intervalId = null;
            this._boundHandlers = {};
        }

        /**
         * 初始化引擎
         * @param {HTMLVideoElement} videoEl - 视频元素
         * @param {Array} subtitles - 已解析的字幕数组 [{start, end, text}]
         */
        init(videoEl, subtitles) {
            this.destroy();

            this.videoEl = videoEl;
            this.subtitles = subtitles || [];
            this.isActive = true;
            this.isPaused = videoEl.paused;
            this.currentIndex = -1;
            this.lastRenderedText = '';

            this._bindVideoEvents();
            this._startSyncLoop();
        }

        /**
         * 加载新字幕（不重新绑定视频）
         */
        loadSubtitles(subtitles) {
            this.subtitles = subtitles || [];
            this.currentIndex = -1;
            this.lastRenderedText = '';
            this._syncNow();
        }

        /**
         * 更新视频元素引用
         */
        updateVideoEl(videoEl) {
            if (this.videoEl === videoEl) return;
            this._unbindVideoEvents();
            this.videoEl = videoEl;
            this.isPaused = videoEl.paused;
            this._bindVideoEvents();
            this._syncNow();
        }

        /**
         * 设置时间偏移
         * @param {number} offset - 秒数，正数为字幕提前，负数为延后
         */
        setTimeOffset(offset) {
            this.timeOffset = offset;
            this._syncNow();
        }

        /**
         * 销毁引擎
         */
        destroy() {
            this.isActive = false;
            this._stopSyncLoop();
            this._unbindVideoEvents();
            this.subtitles = [];
            this.videoEl = null;
            this.currentIndex = -1;
            this.lastRenderedText = '';
        }

        // =================== 视频事件绑定 ===================

        _bindVideoEvents() {
            if (!this.videoEl) return;

            this._boundHandlers = {
                play: () => {
                    this.isPaused = false;
                    this._startSyncLoop();
                    this.onStateChange?.({ type: 'play', paused: false, currentTime: this.videoEl?.currentTime });
                },
                pause: () => {
                    this.isPaused = true;
                    // 暂停时做最后一次同步，确保字幕状态正确
                    this._syncNow();
                    this.onStateChange?.({ type: 'pause', paused: true, currentTime: this.videoEl?.currentTime });
                },
                seeked: () => {
                    this.currentIndex = -1; // 重置索引
                    this._syncNow();
                    this.onStateChange?.({ type: 'seeked', paused: this.isPaused, currentTime: this.videoEl?.currentTime });
                },
                seeking: () => {
                    // 拖动时也实时更新
                    this._syncNow();
                },
                ratechange: () => {
                    this.onStateChange?.({ type: 'ratechange', rate: this.videoEl?.playbackRate });
                },
                ended: () => {
                    this.isPaused = true;
                    this._syncNow();
                    this.onStateChange?.({ type: 'ended' });
                },
                // 视频元素被从 DOM 移除时
                emptied: () => {
                    this.lastRenderedText = '';
                    this.onSubtitleChange?.('', []);
                },
            };

            for (const [event, handler] of Object.entries(this._boundHandlers)) {
                this.videoEl.addEventListener(event, handler);
            }
        }

        _unbindVideoEvents() {
            if (!this.videoEl || !this._boundHandlers) return;

            for (const [event, handler] of Object.entries(this._boundHandlers)) {
                this.videoEl.removeEventListener(event, handler);
            }
            this._boundHandlers = {};
        }

        // =================== 同步循环 ===================

        _startSyncLoop() {
            this._stopSyncLoop();
            if (!this.isActive) return;

            // 使用 RAF 进行高效同步
            const loop = () => {
                if (!this.isActive) return;
                if (!this.isPaused) {
                    this._syncNow();
                }
                this._rafId = requestAnimationFrame(loop);
            };
            this._rafId = requestAnimationFrame(loop);

            // 回退 interval（某些环境 RAF 在后台不工作）
            this._intervalId = setInterval(() => {
                if (!this.isActive || this.isPaused) return;
                this._syncNow();
            }, 250);
        }

        _stopSyncLoop() {
            if (this._rafId) {
                cancelAnimationFrame(this._rafId);
                this._rafId = null;
            }
            if (this._intervalId) {
                clearInterval(this._intervalId);
                this._intervalId = null;
            }
        }

        /**
         * 立即执行一次同步
         */
        _syncNow() {
            if (!this.videoEl || this.subtitles.length === 0) {
                if (this.lastRenderedText !== '') {
                    this.lastRenderedText = '';
                    this.onSubtitleChange?.('', []);
                }
                return;
            }

            // 检查视频元素是否还在 DOM 中
            if (!this.videoEl.isConnected) {
                return;
            }

            const currentTime = this.videoEl.currentTime - this.timeOffset;
            const activeSubs = this._findActiveSubtitles(currentTime);

            // 合并所有激活字幕文本
            const text = activeSubs.map(s => s.text).join('\n');

            // 仅当文本变化时触发回调（性能优化）
            if (text !== this.lastRenderedText) {
                this.lastRenderedText = text;
                this.onSubtitleChange?.(text, activeSubs);
            }
        }

        /**
         * 二分查找 + 线性扫描找到当前时间的所有激活字幕
         */
        _findActiveSubtitles(time) {
            const subs = this.subtitles;
            if (subs.length === 0) return [];

            // 二分查找：找到第一个 end >= time 的字幕
            let lo = 0, hi = subs.length - 1;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (subs[mid].end < time) {
                    lo = mid + 1;
                } else {
                    hi = mid;
                }
            }

            // 从找到的位置向两边线性扫描
            const active = [];
            // 向前扫描（可能有重叠字幕）
            for (let i = Math.max(0, lo - 5); i < subs.length && subs[i].start <= time + 0.1; i++) {
                if (time >= subs[i].start - 0.05 && time <= subs[i].end + 0.15) {
                    active.push(subs[i]);
                }
            }

            return active;
        }

        // =================== 辅助方法 ===================

        /**
         * 获取当前进度信息
         */
        getProgress() {
            if (!this.videoEl || this.subtitles.length === 0) {
                return { current: 0, total: 0, currentTime: 0, nextStart: null };
            }

            const time = this.videoEl.currentTime - this.timeOffset;
            let current = 0;
            let nextStart = null;

            for (let i = 0; i < this.subtitles.length; i++) {
                if (this.subtitles[i].start <= time) {
                    current = i + 1;
                } else {
                    if (nextStart === null) nextStart = this.subtitles[i].start + this.timeOffset;
                }
            }

            return {
                current,
                total: this.subtitles.length,
                currentTime: this.videoEl.currentTime,
                nextStart,
                isPaused: this.isPaused,
            };
        }

        /**
         * 查找页面中最大的视频元素
         */
        static findLargestVideo(doc = document) {
            const videos = Array.from(doc.querySelectorAll('video'));
            if (videos.length === 0) return null;

            return videos.reduce((largest, current) => {
                const lArea = (largest.videoWidth || largest.clientWidth) * (largest.videoHeight || largest.clientHeight);
                const cArea = (current.videoWidth || current.clientWidth) * (current.videoHeight || current.clientHeight);
                return cArea > lArea ? current : largest;
            }, videos[0]);
        }
    }

    return Engine;
})();
