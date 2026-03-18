// メインアプリケーションクラス
class MemoApp {
    constructor() {
        this.storage = new StorageManager();
        this.calendar = new CalendarManager((date) => this.onDateSelected(date));
        this.editingId = null;
        this.currentFilter = null;
        this.init();
    }

    init() {
        // テーマの初期化
        const theme = this.storage.getTheme();
        if (theme === 'light') {
            document.body.classList.add('light-theme');
            document.getElementById('themeIcon').textContent = '☀️';
        }

        // フォームのイベントリスナー
        document.getElementById('memoForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveMemo();
        });

        // カレンダーのイベントリスナー
        document.getElementById('prevMonth').addEventListener('click', () => {
            this.calendar.previousMonth();
            this.calendar.render(this.storage.getMemos());
        });

        document.getElementById('nextMonth').addEventListener('click', () => {
            this.calendar.nextMonth();
            this.calendar.render(this.storage.getMemos());
        });

        // 検索のイベントリスナー
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.search(e.target.value);
        });

        // 初期レンダリング
        this.renderCategories();
        this.renderCategorySelect();
        this.calendar.render(this.storage.getMemos());
        this.renderMemos();
    }

    saveMemo() {
        const title = document.getElementById('memoTitle').value.trim();
        const content = document.getElementById('memoContent').value.trim();
        const category = document.getElementById('memoCategory').value;
        const pinned = document.getElementById('memoPinned').checked;

        if (!title || !content) return;

        if (this.editingId !== null) {
            // 編集モード
            this.storage.updateMemo(this.editingId, {
                title,
                content,
                category,
                pinned
            });
            this.editingId = null;
            document.getElementById('submitBtn').textContent = 'メモを追加';
        } else {
            // 新規追加
            const memo = {
                id: Date.now(),
                title,
                content,
                category,
                pinned,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            this.storage.addMemo(memo);
        }

        this.calendar.render(this.storage.getMemos());
        this.renderMemos();
        document.getElementById('memoForm').reset();
    }

    editMemo(id) {
        const memos = this.storage.getMemos();
        const memo = memos.find(m => m.id === id);
        if (!memo) return;

        document.getElementById('memoTitle').value = memo.title;
        document.getElementById('memoContent').value = memo.content;
        document.getElementById('memoCategory').value = memo.category || '';
        document.getElementById('memoPinned').checked = memo.pinned || false;
        document.getElementById('submitBtn').textContent = 'メモを更新';
        this.editingId = id;

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    deleteMemo(id) {
        if (!confirm('このメモを削除してもよろしいですか?')) return;

        this.storage.deleteMemo(id);
        this.calendar.render(this.storage.getMemos());
        this.renderMemos();

        if (this.editingId === id) {
            this.editingId = null;
            document.getElementById('memoForm').reset();
            document.getElementById('submitBtn').textContent = 'メモを追加';
        }
    }

    renderMemos() {
        const list = document.getElementById('memosList');
        let memos = this.storage.getMemos();

        // フィルタリング
        if (this.currentFilter) {
            if (this.currentFilter.type === 'date') {
                memos = this.calendar.getMemosForDate(memos, this.currentFilter.value);
            } else if (this.currentFilter.type === 'category') {
                memos = memos.filter(m => m.category === this.currentFilter.value);
            }
        }

        // ピン留めメモを上に
        memos.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });

        if (memos.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <h2>メモがまだありません</h2>
                    <p>${this.currentFilter ? 'この条件に一致するメモはありません' : '上のフォームから新しいメモを作成してください'}</p>
                </div>
            `;
            return;
        }

        list.innerHTML = memos.map(memo => `
            <div class="memo-card ${memo.pinned ? 'pinned' : ''}">
                ${memo.category ? `<div class="memo-category">${this.escapeHtml(memo.category)}</div>` : ''}
                <div class="memo-title">${this.escapeHtml(memo.title)}</div>
                <div class="memo-content">${this.escapeHtml(memo.content)}</div>
                <div class="memo-footer">
                    <div class="memo-date">
                        ${this.formatDate(memo.updatedAt)}
                    </div>
                    <div class="memo-actions">
                        <button class="btn btn-edit" onclick="app.editMemo(${memo.id})">
                            編集
                        </button>
                        <button class="btn btn-delete" onclick="app.deleteMemo(${memo.id})">
                            削除
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderCategories() {
        const categories = this.storage.getCategories();
        const memos = this.storage.getMemos();
        const list = document.getElementById('categoryList');

        list.innerHTML = categories.map(category => {
            const count = memos.filter(m => m.category === category).length;
            const isActive = this.currentFilter?.type === 'category' && this.currentFilter.value === category;

            return `
                <div class="category-item ${isActive ? 'active' : ''}" onclick="app.filterByCategory('${this.escapeHtml(category)}')">
                    <span>${this.escapeHtml(category)}</span>
                    <span class="category-badge">${count}</span>
                </div>
            `;
        }).join('');
    }

    renderCategorySelect() {
        const categories = this.storage.getCategories();
        const select = document.getElementById('memoCategory');

        select.innerHTML = '<option value="">カテゴリを選択（任意）</option>' +
            categories.map(cat => `<option value="${this.escapeHtml(cat)}">${this.escapeHtml(cat)}</option>`).join('');
    }

    addCategory() {
        const category = prompt('新しいカテゴリ名を入力してください:');
        if (category && category.trim()) {
            this.storage.addCategory(category.trim());
            this.renderCategories();
            this.renderCategorySelect();
        }
    }

    filterByCategory(category) {
        if (this.currentFilter?.type === 'category' && this.currentFilter.value === category) {
            this.clearFilter();
            return;
        }

        this.currentFilter = { type: 'category', value: category };

        const filterInfo = document.getElementById('filterInfo');
        const filterText = document.getElementById('filterText');
        filterInfo.style.display = 'block';
        filterText.textContent = `🏷️ カテゴリ: ${category}`;

        this.renderCategories();
        this.renderMemos();
    }

    onDateSelected(date) {
        this.currentFilter = { type: 'date', value: date };

        const filterInfo = document.getElementById('filterInfo');
        const filterText = document.getElementById('filterText');
        filterInfo.style.display = 'block';

        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        filterText.textContent = `📅 ${year}年${month}月${day}日のメモ`;

        this.calendar.render(this.storage.getMemos());
        this.renderMemos();
    }

    clearFilter() {
        this.currentFilter = null;
        this.calendar.clearSelection();
        document.getElementById('filterInfo').style.display = 'none';

        this.calendar.render(this.storage.getMemos());
        this.renderCategories();
        this.renderMemos();
    }

    toggleTheme() {
        const body = document.body;
        const icon = document.getElementById('themeIcon');

        if (body.classList.contains('light-theme')) {
            body.classList.remove('light-theme');
            icon.textContent = '🌙';
            this.storage.saveTheme('dark');
        } else {
            body.classList.add('light-theme');
            icon.textContent = '☀️';
            this.storage.saveTheme('light');
        }
    }

    showSearchModal() {
        const modal = document.getElementById('searchModal');
        modal.classList.add('active');
        document.getElementById('searchInput').focus();
    }

    closeSearchModal() {
        const modal = document.getElementById('searchModal');
        modal.classList.remove('active');
        document.getElementById('searchInput').value = '';
        document.getElementById('searchResults').innerHTML = '';
    }

    search(query) {
        const results = document.getElementById('searchResults');

        if (!query.trim()) {
            results.innerHTML = '<p style="color: var(--text-tertiary); text-align: center;">検索キーワードを入力してください</p>';
            return;
        }

        const memos = this.storage.getMemos();
        const filtered = memos.filter(memo =>
            memo.title.toLowerCase().includes(query.toLowerCase()) ||
            memo.content.toLowerCase().includes(query.toLowerCase())
        );

        if (filtered.length === 0) {
            results.innerHTML = '<p style="color: var(--text-tertiary); text-align: center;">検索結果が見つかりませんでした</p>';
            return;
        }

        results.innerHTML = filtered.map(memo => `
            <div class="search-result-item" onclick="app.editMemo(${memo.id}); app.closeSearchModal();">
                <div class="search-result-title">${this.escapeHtml(memo.title)}</div>
                <div class="search-result-content">${this.escapeHtml(memo.content)}</div>
            </div>
        `).join('');
    }

    exportData() {
        const data = this.storage.exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `memo-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        alert('メモをエクスポートしました！');
    }

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (confirm('現在のデータを上書きしてインポートしますか？')) {
                    if (this.storage.importData(data)) {
                        alert('データをインポートしました！');
                        this.renderCategories();
                        this.renderCategorySelect();
                        this.calendar.render(this.storage.getMemos());
                        this.renderMemos();
                    } else {
                        alert('インポートに失敗しました');
                    }
                }
            } catch (error) {
                alert('無効なファイル形式です');
            }
        };
        reader.readAsText(file);
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}/${month}/${day} ${hours}:${minutes}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// アプリケーションの初期化
const app = new MemoApp();
const calendar = app.calendar;
