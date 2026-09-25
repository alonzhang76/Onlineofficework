/* =====================================================================
 * 日历记事功能（移植自 orderschedule 应用）
 * 数据存储：localStorage['calendarNotes']
 * 数据格式：{ "YYYY-MM-DD": [{ content, completed, source?, orderNo? }] }
 * 与 orderschedule 同源共享同一个 localStorage 键，两应用数据互通。
 * ===================================================================== */
(function () {
    'use strict';

    /* ==================== 注入样式（作用域限定在 #calendarTab） ==================== */
    var CSS = `
#calendarTab .cal-three-column {
    display: flex;
    gap: 0;
    justify-content: flex-start;
    align-items: stretch;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    overflow: hidden;
    min-height: 360px;
    background: #fff;
}
#calendarTab .cal-column {
    flex: 0 0 280px;
    background: #f8f9fa;
    padding: 15px;
    border-right: 1px solid #e5e7eb;
}
#calendarTab .cal-input-column {
    flex: 0 0 300px;
    background: #f8f9fa;
    padding: 15px;
    border-right: 1px solid #e5e7eb;
}
#calendarTab .cal-list-column {
    flex: 1;
    min-width: 300px;
    background: #ffffff;
    padding: 15px;
}
#calendarTab .calendar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    font-size: 17px;
    font-weight: bold;
    color: #2563eb;
}
#calendarTab .calendar-nav-btn {
    background: #2563eb;
    color: white;
    border: none;
    padding: 6px 14px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
}
#calendarTab .calendar-nav-btn:hover { background: #1d4ed8; }
#calendarTab .calendar-grid,
#calendarTab .calendar-days {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
}
#calendarTab .calendar-weekday {
    text-align: center;
    padding: 8px 0;
    font-weight: bold;
    color: #6b7280;
    background: #f0f2f5;
    border-radius: 5px;
    font-size: 13px;
}
#calendarTab .calendar-day {
    text-align: center;
    padding: 9px 0;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.2s;
    min-height: 38px;
    position: relative;
    font-size: 13px;
}
#calendarTab .calendar-day:hover { background: #dbeafe; }
#calendarTab .calendar-day.selected { background: #2563eb; color: white; }
#calendarTab .calendar-day.today { border: 2px solid #2563eb; }
#calendarTab .calendar-day.has-note::after {
    content: '';
    position: absolute;
    bottom: 3px;
    left: 50%;
    transform: translateX(-50%);
    width: 6px;
    height: 6px;
    background: #dc2626;
    border-radius: 50%;
}
#calendarTab .calendar-day.other-month { color: #ccc; background: #f9f9f9; }
#calendarTab .cal-input-column h3 {
    color: #2563eb;
    margin-bottom: 12px;
    font-size: 15px;
}
#calendarTab .note-help-text {
    background: #eff6ff;
    border-left: 3px solid #2563eb;
    padding: 10px 12px;
    margin-bottom: 15px;
    font-size: 12px;
    color: #4b5563;
    border-radius: 0 5px 5px 0;
}
#calendarTab .note-help-text ul { margin: 6px 0 0 18px; }
#calendarTab .note-help-text li { margin-bottom: 3px; }
#calendarTab .note-input-area textarea {
    width: 100%;
    padding: 10px;
    border: 1px solid #d1d5db;
    border-radius: 5px;
    resize: vertical;
    min-height: 80px;
    font-size: 14px;
    box-sizing: border-box;
}
#calendarTab .note-input-area textarea:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
}
#calendarTab .cal-btn {
    margin-top: 10px;
    margin-right: 10px;
    padding: 7px 16px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 13px;
    color: #fff;
}
#calendarTab .cal-btn-save { background: #059669; }
#calendarTab .cal-btn-save:hover { background: #047857; }
#calendarTab .cal-btn-del { background: #dc2626; }
#calendarTab .cal-btn-del:hover { background: #b91c1c; }
#calendarTab .cal-list-column h3 {
    color: #2563eb;
    margin-bottom: 12px;
    font-size: 16px;
}
#calendarTab .search-box-container { margin-bottom: 12px; }
#calendarTab .search-input {
    width: 100%;
    padding: 9px 14px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    background: #f9fafb;
    transition: all 0.3s ease;
    box-sizing: border-box;
}
#calendarTab .search-input:focus {
    outline: none;
    border-color: #2563eb;
    background: #ffffff;
    box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
}
#calendarTab .notes-list {
    max-height: 420px;
    overflow-y: auto;
}
#calendarTab .note-item {
    background: #f9fafb;
    padding: 10px 12px;
    border-radius: 5px;
    margin-bottom: 8px;
    border-left: 3px solid #2563eb;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 13px;
    word-break: break-all;
}
#calendarTab .note-item:hover { background: #eff6ff; }
#calendarTab .note-item.completed {
    text-decoration: line-through;
    color: #9ca3af;
    border-left-color: #d1d5db;
    background: #f9f9f9;
}
#calendarTab .note-item.selected {
    border-left-color: #dc2626;
    background: #fef3c7;
}
#calendarTab .note-item .note-date-tag {
    font-size: 12px;
    color: #9ca3af;
    margin-right: 8px;
}
#calendarTab .note-empty { color: #9ca3af; font-size: 13px; }
`;
    var styleEl = document.createElement('style');
    styleEl.setAttribute('data-calendar-notes', '1');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);

    /* ==================== 状态与数据层 ==================== */
    var STORAGE_KEY = 'calendarNotes';
    var currentCalendarDate = new Date();
    var selectedCalendarDate = null;
    var selectedNoteIndex = -1;
    var calendarNotesCache = {};
    var clickTimer = null;

    function getCalendarNotes() {
        try {
            var stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                calendarNotesCache = JSON.parse(stored) || {};
            }
        } catch (e) {
            console.error('读取日历记事失败:', e);
        }
        return calendarNotesCache;
    }

    function saveCalendarNotes(notes) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
            calendarNotesCache = notes;
        } catch (e) {
            console.error('保存日历记事失败:', e);
            calNotify('保存失败，请检查浏览器存储设置', 'error');
        }
    }

    function calNotify(message, type) {
        if (window.pageController && typeof window.pageController.showNotification === 'function') {
            window.pageController.showNotification(message, type || 'success');
        } else {
            console.log('[日历记事]', message);
        }
    }

    function pad2(n) { return String(n).padStart(2, '0'); }
    function fmtDate(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }

    /* ==================== 日历渲染 ==================== */
    function renderCalendar() {
        var titleEl = document.getElementById('calendar-title');
        var daysEl = document.getElementById('calendar-days');
        if (!titleEl || !daysEl) return;

        var year = currentCalendarDate.getFullYear();
        var month = currentCalendarDate.getMonth();
        titleEl.textContent = year + '年 ' + (month + 1) + '月';

        var firstDay = new Date(year, month, 1);
        var totalDays = new Date(year, month + 1, 0).getDate();
        var startDay = firstDay.getDay();

        var notes = getCalendarNotes();
        var today = new Date();
        var todayStr = fmtDate(today.getFullYear(), today.getMonth() + 1, today.getDate());

        var html = '';

        // 上月补格
        var prevMonthLastDay = new Date(year, month, 0).getDate();
        for (var i = startDay - 1; i >= 0; i--) {
            html += '<div class="calendar-day other-month">' + (prevMonthLastDay - i) + '</div>';
        }

        // 本月日期
        for (var day = 1; day <= totalDays; day++) {
            var dateStr = fmtDate(year, month + 1, day);
            var hasNote = notes[dateStr] && notes[dateStr].length > 0;
            var classes = 'calendar-day';
            if (hasNote) classes += ' has-note';
            if (dateStr === todayStr) classes += ' today';
            if (selectedCalendarDate === dateStr) classes += ' selected';
            html += '<div class="' + classes + '" onclick="CalendarNotes.selectDate(\'' + dateStr + '\')">' + day + '</div>';
        }

        // 下月补格（补满 6 行 42 格）
        var remaining = 42 - (startDay + totalDays);
        for (var d = 1; d <= remaining; d++) {
            html += '<div class="calendar-day other-month">' + d + '</div>';
        }

        daysEl.innerHTML = html;
    }

    function prevMonth() {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        renderCalendar();
    }

    function nextMonth() {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        renderCalendar();
    }

    /* ==================== 日期选择与记事列表 ==================== */
    function noteContent(note) {
        return typeof note === 'string' ? note : (note.content || '');
    }
    function noteCompleted(note) {
        return typeof note === 'string' ? false : !!note.completed;
    }

    function renderDayNotes(dateStr) {
        var listEl = document.getElementById('calendar-notes-list');
        var notes = getCalendarNotes();
        var dateNotes = (notes && notes[dateStr]) || [];

        document.getElementById('note-date-title').textContent = dateStr + ' 的记事';
        document.getElementById('calendar-note-input').value = '';

        var html = '';
        if (Array.isArray(dateNotes) && dateNotes.length > 0) {
            dateNotes.forEach(function (note, index) {
                var cls = 'note-item';
                if (noteCompleted(note)) cls += ' completed';
                if (index === selectedNoteIndex) cls += ' selected';
                html += '<div class="' + cls + '" onclick="CalendarNotes.handleClick(\'' + dateStr + '\',' + index + ')">' +
                    escapeHtml(noteContent(note)) + '</div>';
            });
        } else {
            html = '<p class="note-empty">暂无记事</p>';
        }
        listEl.innerHTML = html;
    }

    function selectDate(dateStr) {
        selectedCalendarDate = dateStr;
        selectedNoteIndex = -1;
        renderCalendar();
        renderDayNotes(dateStr);
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /* 单击：标记完成；双击：选中待删 */
    function handleClick(dateStr, index) {
        if (selectedNoteIndex === index) {
            selectedNoteIndex = -1;
            renderDayNotes(dateStr);
            return;
        }
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
            selectForDelete(dateStr, index);
        } else {
            clickTimer = setTimeout(function () {
                clickTimer = null;
                toggleCompleted(dateStr, index);
            }, 350);
        }
    }

    function toggleCompleted(dateStr, index) {
        var notes = getCalendarNotes();
        if (!notes[dateStr] || !Array.isArray(notes[dateStr])) return;
        var note = notes[dateStr][index];
        if (!note) return;
        if (typeof note === 'string') {
            notes[dateStr][index] = { content: note, completed: true };
        } else {
            note.completed = !note.completed;
        }
        saveCalendarNotes(notes);
        renderDayNotes(dateStr);
        renderCalendar();
    }

    function selectForDelete(dateStr, index) {
        selectedCalendarDate = dateStr;
        selectedNoteIndex = index;
        renderDayNotes(dateStr);
        calNotify('已选中记事，点击“删除记事”按钮删除', 'info');
    }

    function saveNote() {
        if (!selectedCalendarDate) {
            calNotify('请先选择日期', 'warning');
            return;
        }
        var input = document.getElementById('calendar-note-input');
        var content = input.value.trim();
        if (!content) {
            calNotify('请输入记事内容', 'warning');
            return;
        }
        var notes = getCalendarNotes();
        if (!notes[selectedCalendarDate] || !Array.isArray(notes[selectedCalendarDate])) {
            notes[selectedCalendarDate] = [];
        }
        notes[selectedCalendarDate].push({ content: content, completed: false });
        saveCalendarNotes(notes);
        input.value = '';
        renderDayNotes(selectedCalendarDate);
        renderCalendar();
        calNotify('记事保存成功', 'success');
    }

    function deleteNote() {
        if (!selectedCalendarDate) {
            calNotify('请先选择日期', 'warning');
            return;
        }
        if (selectedNoteIndex === -1) {
            calNotify('请先选中要删除的记事', 'warning');
            return;
        }
        var notes = getCalendarNotes();
        if (!notes[selectedCalendarDate] || !Array.isArray(notes[selectedCalendarDate])) return;
        notes[selectedCalendarDate].splice(selectedNoteIndex, 1);
        if (notes[selectedCalendarDate].length === 0) delete notes[selectedCalendarDate];
        saveCalendarNotes(notes);
        selectedNoteIndex = -1;
        renderDayNotes(selectedCalendarDate);
        renderCalendar();
        calNotify('记事已删除', 'success');
    }

    function filterNotes() {
        var keyword = (document.getElementById('calendar-note-search').value || '').toLowerCase().trim();
        var notes = getCalendarNotes();
        var all = [];

        var dates = selectedCalendarDate ? [selectedCalendarDate] : Object.keys(notes);
        dates.forEach(function (dateStr) {
            if (!Array.isArray(notes[dateStr])) return;
            notes[dateStr].forEach(function (note, index) {
                all.push({ date: dateStr, content: noteContent(note), completed: noteCompleted(note), originalIndex: index });
            });
        });

        if (keyword) {
            all = all.filter(function (n) { return n.content.toLowerCase().indexOf(keyword) !== -1; });
        }

        var html = '';
        if (all.length > 0) {
            all.forEach(function (n) {
                var cls = 'note-item';
                if (n.completed) cls += ' completed';
                html += '<div class="' + cls + '" onclick="CalendarNotes.handleClick(\'' + n.date + '\',' + n.originalIndex + ')">' +
                    '<span class="note-date-tag">' + n.date + '</span>' + escapeHtml(n.content) + '</div>';
            });
        } else {
            html = '<p class="note-empty">' + (keyword ? '暂无匹配的记事' : '暂无记事') + '</p>';
        }
        document.getElementById('calendar-notes-list').innerHTML = html;
    }

    /* ==================== 订单交货日期同步 ====================
     * 以 orderNo 为唯一标识做 upsert：
     *  - 同一订单再次保存（含编辑改期）时，先移除旧日期上的该订单记事
     *  - 交货日期有效则写入新日期
     * 返回 true 表示有写入。
     */
    function upsertOrderDeliveryNote(orderNo, customer, deliveryDate) {
        if (!orderNo) return false;
        var notes = getCalendarNotes();
        if (!notes || typeof notes !== 'object') notes = {};

        // 清除该订单旧的交货记事（可能位于其他日期）
        Object.keys(notes).forEach(function (dateStr) {
            if (!Array.isArray(notes[dateStr])) return;
            notes[dateStr] = notes[dateStr].filter(function (n) {
                return !(n && n.source === 'order' && n.orderNo === orderNo);
            });
            if (notes[dateStr].length === 0) delete notes[dateStr];
        });

        if (!deliveryDate) {
            saveCalendarNotes(notes);
            return false;
        }

        var content = '📦【交货】' + (customer ? customer + ' ' : '') + orderNo;
        if (!notes[deliveryDate] || !Array.isArray(notes[deliveryDate])) {
            notes[deliveryDate] = [];
        }
        notes[deliveryDate].push({
            content: content,
            completed: false,
            source: 'order',
            orderNo: orderNo
        });
        saveCalendarNotes(notes);

        // 若日历当前可见则刷新
        var tab = document.getElementById('calendarTab');
        if (tab && !tab.classList.contains('hidden')) {
            renderCalendar();
            if (selectedCalendarDate) renderDayNotes(selectedCalendarDate);
        }
        return true;
    }

    /* ==================== 对外接口 ==================== */
    window.CalendarNotes = {
        render: renderCalendar,
        prevMonth: prevMonth,
        nextMonth: nextMonth,
        selectDate: selectDate,
        saveNote: saveNote,
        deleteNote: deleteNote,
        handleClick: handleClick,
        filterNotes: filterNotes,
        upsertOrderDeliveryNote: upsertOrderDeliveryNote
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderCalendar);
    } else {
        renderCalendar();
    }
})();
