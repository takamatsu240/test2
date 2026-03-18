// ローカルストレージ管理クラス
class StorageManager {
    constructor() {
        this.MEMOS_KEY = 'memos';
        this.CATEGORIES_KEY = 'categories';
        this.THEME_KEY = 'theme';
    }

    // メモの取得
    getMemos() {
        const stored = localStorage.getItem(this.MEMOS_KEY);
        return stored ? JSON.parse(stored) : [];
    }

    // メモの保存
    saveMemos(memos) {
        localStorage.setItem(this.MEMOS_KEY, JSON.stringify(memos));
    }

    // メモの追加
    addMemo(memo) {
        const memos = this.getMemos();
        memos.unshift(memo);
        this.saveMemos(memos);
        return memo;
    }

    // メモの更新
    updateMemo(id, updates) {
        const memos = this.getMemos();
        const index = memos.findIndex(m => m.id === id);
        if (index !== -1) {
            memos[index] = { ...memos[index], ...updates, updatedAt: new Date().toISOString() };
            this.saveMemos(memos);
            return memos[index];
        }
        return null;
    }

    // メモの削除
    deleteMemo(id) {
        const memos = this.getMemos();
        const filtered = memos.filter(m => m.id !== id);
        this.saveMemos(filtered);
        return filtered;
    }

    // カテゴリの取得
    getCategories() {
        const stored = localStorage.getItem(this.CATEGORIES_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
        // デフォルトカテゴリ
        const defaults = ['仕事', 'プライベート', 'アイデア'];
        this.saveCategories(defaults);
        return defaults;
    }

    // カテゴリの保存
    saveCategories(categories) {
        localStorage.setItem(this.CATEGORIES_KEY, JSON.stringify(categories));
    }

    // カテゴリの追加
    addCategory(category) {
        const categories = this.getCategories();
        if (!categories.includes(category)) {
            categories.push(category);
            this.saveCategories(categories);
        }
        return categories;
    }

    // カテゴリの削除
    deleteCategory(category) {
        const categories = this.getCategories();
        const filtered = categories.filter(c => c !== category);
        this.saveCategories(filtered);
        return filtered;
    }

    // テーマの取得
    getTheme() {
        return localStorage.getItem(this.THEME_KEY) || 'dark';
    }

    // テーマの保存
    saveTheme(theme) {
        localStorage.setItem(this.THEME_KEY, theme);
    }

    // データのエクスポート
    exportData() {
        return {
            memos: this.getMemos(),
            categories: this.getCategories(),
            exportDate: new Date().toISOString(),
            version: '1.0'
        };
    }

    // データのインポート
    importData(data) {
        try {
            if (data.memos) {
                this.saveMemos(data.memos);
            }
            if (data.categories) {
                this.saveCategories(data.categories);
            }
            return true;
        } catch (error) {
            console.error('Import failed:', error);
            return false;
        }
    }

    // すべてのデータをクリア
    clearAll() {
        localStorage.removeItem(this.MEMOS_KEY);
        localStorage.removeItem(this.CATEGORIES_KEY);
    }

    // 統計情報の取得
    getStats() {
        const memos = this.getMemos();
        const categories = this.getCategories();

        const categoryCount = {};
        categories.forEach(cat => {
            categoryCount[cat] = memos.filter(m => m.category === cat).length;
        });

        return {
            totalMemos: memos.length,
            pinnedMemos: memos.filter(m => m.pinned).length,
            categoryCount,
            oldestMemo: memos.length > 0 ? new Date(memos[memos.length - 1].createdAt) : null,
            newestMemo: memos.length > 0 ? new Date(memos[0].createdAt) : null
        };
    }
}
