// ==UserScript==
// @name         IDKey Daily Check-in Reminder
// @namespace    https://github.com/EricDasha
// @version      0.1
// @description  Remind to check in at https://one.idkey.cc/ daily when opening any webpage.
// @author       Antigravity
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const CHECKIN_URL = "https://one.idkey.cc/";
    const STORAGE_KEY = "last_checkin_date";

    // Obtain today's date string in YYYY-MM-DD format
    function getTodayString() {
        const today = new Date();
        return today.getFullYear() + '-' + (today.getMonth() + 1).toString().padStart(2, '0') + '-' + today.getDate().toString().padStart(2, '0');
    }

    // 调试日志
    function log(msg) {
        console.log(`[IDKey Reminder] ${msg}`);
    }

    function checkAndRemind() {
        // ScriptCat/Tampermonkey storage is unique to the script, so this persists globally
        const lastCheckIn = GM_getValue(STORAGE_KEY, "");
        const today = getTodayString();

        log(`Current Date: ${today}, Last Check-in: ${lastCheckIn}`);

        if (lastCheckIn !== today) {
            log("Date mismatch, attempting to show reminder...");
            showReminder();
        } else {
            log("Already checked in today.");
        }
    }

    function showReminder() {
        // Prevent duplicate reminders if script runs multiple times
        if (document.getElementById('idkey-checkin-reminder')) return;

        log("Creating reminder UI...");

        const container = document.createElement('div');
        container.id = 'idkey-checkin-reminder';
        // ... properties ...
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: #2b2b2b;
            color: #e0e0e0;
            padding: 16px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 2147483647; /* Max z-index */
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 14px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            border: 1px solid #444;
            min-width: 200px;
            transition: opacity 0.3s ease;
        `;

        const text = document.createElement('div');
        text.innerHTML = `📅 记得去签到: <br><a href="${CHECKIN_URL}" target="_blank" style="color: #4da6ff; text-decoration: none; font-weight: bold; display: block; margin-top: 4px;">one.idkey.cc</a>`;
        container.appendChild(text);

        const btn = document.createElement('button');
        btn.textContent = "我已签到";
        btn.style.cssText = `
            background-color: #28a745;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            align-self: flex-end;
            transition: background-color 0.2s;
        `;

        btn.addEventListener('click', function () {
            GM_setValue(STORAGE_KEY, getTodayString());
            container.style.opacity = '0';
            setTimeout(() => container.remove(), 300);
            log("Clicked 'Signed In', status saved.");
        });

        // Hover effect helper
        btn.onmouseenter = () => btn.style.backgroundColor = '#218838';
        btn.onmouseleave = () => btn.style.backgroundColor = '#28a745';

        container.appendChild(btn);

        // Ensure body exists before appending
        const target = document.body || document.documentElement;
        if (target) {
            target.appendChild(container);
            log("Reminder appended to document.");
        } else {
            log("Error: No document.body or documentElement found.");
        }
    }

    // Initialize with robust state check
    function init() {
        checkAndRemind();
    }

    if (document.readyState === 'loading') {
        window.addEventListener('load', init); // window load ensures all resources including body are ready
    } else {
        init();
    }
})();
