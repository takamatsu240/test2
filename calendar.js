// カレンダー管理クラス
class CalendarManager {
    constructor(onDateSelect) {
        this.currentDate = new Date();
        this.selectedDate = null;
        this.onDateSelect = onDateSelect;
    }

    render(memos) {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        document.getElementById('calendarMonth').textContent =
            `${year}年 ${month + 1}月`;

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const prevLastDay = new Date(year, month, 0);

        const firstDayOfWeek = firstDay.getDay();
        const lastDate = lastDay.getDate();
        const prevLastDate = prevLastDay.getDate();

        const today = new Date();
        const todayStr = this.formatDateOnly(today);

        let days = [];

        // 前月の日付
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            const date = new Date(year, month - 1, prevLastDate - i);
            days.push({ date, otherMonth: true });
        }

        // 当月の日付
        for (let i = 1; i <= lastDate; i++) {
            const date = new Date(year, month, i);
            days.push({ date, otherMonth: false });
        }

        // 次月の日付（6週表示にする）
        const remainingCells = 42 - days.length;
        for (let i = 1; i <= remainingCells; i++) {
            const date = new Date(year, month + 1, i);
            days.push({ date, otherMonth: true });
        }

        const calendarDays = document.getElementById('calendarDays');
        calendarDays.innerHTML = days.map(({ date, otherMonth }) => {
            const dateStr = this.formatDateOnly(date);
            const isToday = dateStr === todayStr;
            const isSelected = this.selectedDate && dateStr === this.formatDateOnly(this.selectedDate);
            const hasMemo = memos.some(memo =>
                this.formatDateOnly(new Date(memo.createdAt)) === dateStr
            );

            let classes = ['calendar-day'];
            if (otherMonth) classes.push('other-month');
            if (isToday) classes.push('today');
            if (isSelected) classes.push('selected');
            if (hasMemo) classes.push('has-memo');

            return `
                <div class="${classes.join(' ')}" onclick="calendar.selectDate('${dateStr}')">
                    ${date.getDate()}
                </div>
            `;
        }).join('');
    }

    selectDate(dateStr) {
        const [year, month, day] = dateStr.split('-');
        this.selectedDate = new Date(year, month - 1, day);

        if (this.onDateSelect) {
            this.onDateSelect(this.selectedDate);
        }
    }

    clearSelection() {
        this.selectedDate = null;
    }

    previousMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    }

    nextMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    }

    formatDateOnly(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    getMemosForDate(memos, date) {
        const dateStr = this.formatDateOnly(date);
        return memos.filter(memo =>
            this.formatDateOnly(new Date(memo.createdAt)) === dateStr
        );
    }

    getMemosForMonth(memos) {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        return memos.filter(memo => {
            const memoDate = new Date(memo.createdAt);
            return memoDate.getFullYear() === year && memoDate.getMonth() === month;
        });
    }

    getMemosForWeek(memos, date) {
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        return memos.filter(memo => {
            const memoDate = new Date(memo.createdAt);
            return memoDate >= startOfWeek && memoDate <= endOfWeek;
        });
    }
}
