/**
 * subtitleParser.js - 字幕文件解析模块
 * 支持 SRT / ASS(SSA) / VTT 格式
 * 自主创作，独立实现
 */

const SubtitleParser = (() => {
    'use strict';

    /**
     * 时间码转换为秒数
     * 支持格式：HH:MM:SS,mmm / HH:MM:SS.mmm / H:MM:SS.mm
     */
    function timeToSeconds(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') return 0;
        const cleaned = timeStr.trim().replace(',', '.');
        const parts = cleaned.split(':');
        if (parts.length < 2) return 0;

        let hours = 0, minutes = 0, seconds = 0;

        if (parts.length === 3) {
            hours = parseInt(parts[0], 10) || 0;
            minutes = parseInt(parts[1], 10) || 0;
            seconds = parseFloat(parts[2]) || 0;
        } else if (parts.length === 2) {
            minutes = parseInt(parts[0], 10) || 0;
            seconds = parseFloat(parts[1]) || 0;
        }

        return hours * 3600 + minutes * 60 + seconds;
    }

    /**
     * 清理 HTML 和样式标签，保留换行
     */
    function cleanTextContent(text) {
        return text
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/?[^>]+>/g, '')
            .replace(/\r\n/g, '\n')
            .trim();
    }

    // =================== SRT 解析 ===================

    function parseSRT(content) {
        const subtitles = [];
        // 标准化换行
        const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        // 按双换行分割字幕块
        const blocks = normalized.split(/\n\n+/).filter(b => b.trim());

        for (const block of blocks) {
            const lines = block.trim().split('\n');
            if (lines.length < 2) continue;

            // 查找时间行（包含 -->）
            let timeLineIdx = -1;
            for (let i = 0; i < Math.min(lines.length, 3); i++) {
                if (lines[i].includes('-->')) {
                    timeLineIdx = i;
                    break;
                }
            }
            if (timeLineIdx === -1) continue;

            const timeLine = lines[timeLineIdx];
            const timeMatch = timeLine.match(
                /(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})/
            );
            if (!timeMatch) continue;

            const start = timeToSeconds(timeMatch[1]);
            const end = timeToSeconds(timeMatch[2]);
            const textLines = lines.slice(timeLineIdx + 1);
            const text = cleanTextContent(textLines.join('\n'));

            if (text && end > start) {
                subtitles.push({ start, end, text });
            }
        }

        return subtitles;
    }

    // =================== ASS/SSA 解析 ===================

    function parseASS(content) {
        const subtitles = [];
        const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

        let inEvents = false;
        let formatFields = null;

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;

            // 检测 [Events] 段
            if (/^\[events\]$/i.test(line)) {
                inEvents = true;
                continue;
            }
            // 离开 Events 段
            if (line.startsWith('[') && !/^\[events\]$/i.test(line)) {
                if (inEvents) break; // 已经在 Events 中，遇到新段就结束
                continue;
            }

            if (!inEvents) continue;

            // 跳过注释行
            if (line.startsWith('Comment:')) continue;

            // 解析 Format 行
            if (line.startsWith('Format:')) {
                const keys = line.substring(7).split(',').map(k => k.trim().toLowerCase());
                formatFields = {
                    start: keys.indexOf('start'),
                    end: keys.indexOf('end'),
                    text: keys.indexOf('text'),
                };
                // 兼容 "start time" 等变体
                if (formatFields.start === -1) formatFields.start = keys.indexOf('start time');
                if (formatFields.end === -1) formatFields.end = keys.indexOf('end time');
                continue;
            }

            // 解析 Dialogue 行
            if (line.startsWith('Dialogue:') && formatFields) {
                const dialogueContent = line.substring(9).trim();
                // ASS 的 Text 字段是最后一个字段，可能包含逗号
                // 所以只 split 到 text 字段之前的字段数
                const maxSplits = formatFields.text;
                const parts = splitWithLimit(dialogueContent, ',', maxSplits);

                if (parts.length <= Math.max(formatFields.start, formatFields.end)) continue;

                const startTime = timeToSeconds(parts[formatFields.start]);
                const endTime = timeToSeconds(parts[formatFields.end]);
                const rawText = parts[formatFields.text] || '';

                // 清理 ASS 样式标签
                const cleanedText = rawText
                    .replace(/\{[^}]*\}/g, '')     // 移除 {xxx} 样式覆盖
                    .replace(/\\N/g, '\n')          // ASS 换行符
                    .replace(/\\n/g, ' ')           // soft break
                    .replace(/\\h/g, ' ')           // hard space
                    .trim();

                if (cleanedText && endTime > startTime) {
                    subtitles.push({ start: startTime, end: endTime, text: cleanedText });
                }
            }
        }

        return subtitles;
    }

    /**
     * 带限制的字符串分割
     * 分割到 limit 个分隔符后，剩余部分作为最后一个元素
     */
    function splitWithLimit(str, delimiter, limit) {
        const result = [];
        let remaining = str;

        for (let i = 0; i < limit; i++) {
            const idx = remaining.indexOf(delimiter);
            if (idx === -1) break;
            result.push(remaining.substring(0, idx).trim());
            remaining = remaining.substring(idx + 1);
        }
        result.push(remaining.trim());
        return result;
    }

    // =================== VTT 解析 ===================

    function parseVTT(content) {
        const subtitles = [];
        const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // 移除 WEBVTT 头部和元数据
        let body = normalized;
        const headerEnd = normalized.indexOf('\n\n');
        if (headerEnd !== -1) {
            body = normalized.substring(headerEnd + 2);
        }

        const blocks = body.split(/\n\n+/).filter(b => b.trim());

        for (const block of blocks) {
            const lines = block.trim().split('\n');
            if (lines.length < 2) continue;

            let timeLineIdx = -1;
            for (let i = 0; i < Math.min(lines.length, 3); i++) {
                if (lines[i].includes('-->')) {
                    timeLineIdx = i;
                    break;
                }
            }
            if (timeLineIdx === -1) continue;

            const timeLine = lines[timeLineIdx];
            // VTT 支持 MM:SS.mmm 和 HH:MM:SS.mmm
            const timeMatch = timeLine.match(
                /(\d{1,2}:?\d{2}:\d{2}\.\d{1,3})\s*-->\s*(\d{1,2}:?\d{2}:\d{2}\.\d{1,3})/
            );
            if (!timeMatch) continue;

            const start = timeToSeconds(timeMatch[1]);
            const end = timeToSeconds(timeMatch[2]);
            const textLines = lines.slice(timeLineIdx + 1);
            const text = cleanTextContent(textLines.join('\n'));

            if (text && end > start) {
                subtitles.push({ start, end, text });
            }
        }

        return subtitles;
    }

    // =================== 编码检测与读取 ===================

    /**
     * 检测文件是否为 UTF-8 编码
     * 通过检查 BOM 和 UTF-8 字节序列
     */
    function detectEncoding(buffer) {
        const bytes = new Uint8Array(buffer);

        // 检查 BOM
        if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
            return 'utf-8';
        }
        if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
            return 'utf-16le';
        }
        if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
            return 'utf-16be';
        }

        // 统计 UTF-8 有效序列 vs 高字节（GBK 特征）
        let utf8Valid = 0;
        let highBytes = 0;
        let i = 0;

        while (i < Math.min(bytes.length, 8192)) {
            if (bytes[i] < 0x80) {
                i++;
                continue;
            }

            highBytes++;

            // 检查 UTF-8 多字节序列
            if ((bytes[i] & 0xE0) === 0xC0 && i + 1 < bytes.length && (bytes[i + 1] & 0xC0) === 0x80) {
                utf8Valid++;
                i += 2;
            } else if ((bytes[i] & 0xF0) === 0xE0 && i + 2 < bytes.length && (bytes[i + 1] & 0xC0) === 0x80 && (bytes[i + 2] & 0xC0) === 0x80) {
                utf8Valid++;
                i += 3;
            } else if ((bytes[i] & 0xF8) === 0xF0 && i + 3 < bytes.length && (bytes[i + 1] & 0xC0) === 0x80 && (bytes[i + 2] & 0xC0) === 0x80 && (bytes[i + 3] & 0xC0) === 0x80) {
                utf8Valid++;
                i += 4;
            } else {
                i++;
            }
        }

        // 如果大部分高字节都符合 UTF-8 模式，则认为是 UTF-8
        if (highBytes > 0 && utf8Valid / highBytes > 0.8) {
            return 'utf-8';
        }

        // 否则回退到 GBK（中日韩常用编码）
        return highBytes > 0 ? 'gbk' : 'utf-8';
    }

    /**
     * 读取文件并返回解析后的字幕数组
     * @param {File} file - 字幕文件对象
     * @returns {Promise<{subtitles: Array, fileName: string, format: string}>}
     */
    function readAndParse(file) {
        return new Promise((resolve, reject) => {
            const extension = file.name.split('.').pop().toLowerCase();
            const validFormats = ['srt', 'ass', 'ssa', 'vtt'];

            if (!validFormats.includes(extension)) {
                reject(new Error(`不支持的字幕格式: .${extension}，支持: ${validFormats.join(', ')}`));
                return;
            }

            // 先以 ArrayBuffer 读取，检测编码
            const bufferReader = new FileReader();
            bufferReader.onload = (e) => {
                const buffer = e.target.result;
                const encoding = detectEncoding(buffer);

                // 用检测到的编码重新读取
                const textReader = new FileReader();
                textReader.onload = (e2) => {
                    const content = e2.target.result;
                    let subtitles = [];

                    try {
                        switch (extension) {
                            case 'srt':
                                subtitles = parseSRT(content);
                                break;
                            case 'ass':
                            case 'ssa':
                                subtitles = parseASS(content);
                                break;
                            case 'vtt':
                                subtitles = parseVTT(content);
                                break;
                        }

                        // 按开始时间排序
                        subtitles.sort((a, b) => a.start - b.start);

                        if (subtitles.length === 0) {
                            reject(new Error('未在文件中找到有效的字幕条目'));
                            return;
                        }

                        resolve({
                            subtitles,
                            fileName: file.name,
                            format: extension,
                            count: subtitles.length,
                            encoding,
                        });
                    } catch (err) {
                        reject(new Error(`解析 ${extension.toUpperCase()} 文件失败: ${err.message}`));
                    }
                };
                textReader.onerror = () => reject(new Error('读取文件内容失败'));
                textReader.readAsText(file, encoding);
            };
            bufferReader.onerror = () => reject(new Error('读取文件失败'));
            bufferReader.readAsArrayBuffer(file);
        });
    }

    /**
     * 直接解析字幕文本
     * @param {string} content - 字幕文本内容
     * @param {string} format - 格式: 'srt', 'ass', 'ssa', 'vtt'
     * @returns {Array} 字幕条目数组
     */
    function parseText(content, format) {
        let subtitles = [];
        switch (format.toLowerCase()) {
            case 'srt':
                subtitles = parseSRT(content);
                break;
            case 'ass':
            case 'ssa':
                subtitles = parseASS(content);
                break;
            case 'vtt':
                subtitles = parseVTT(content);
                break;
            default:
                throw new Error(`不支持的格式: ${format}`);
        }
        subtitles.sort((a, b) => a.start - b.start);
        return subtitles;
    }

    // 公共 API
    return {
        readAndParse,
        parseText,
        parseSRT,
        parseASS,
        parseVTT,
        timeToSeconds,
        detectEncoding,
    };
})();
