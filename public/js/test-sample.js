/**
 * テストシナリオ用のサンプルコード
 * クローズ判定機能のテストに使用
 *
 * TODO-005: テストシナリオ用のサンプルコード追加
 */

/**
 * 2つの数値を加算する関数
 * @param {number} a - 第1引数
 * @param {number} b - 第2引数
 * @returns {number} 加算結果
 */
function add(a, b) {
  return a + b;
}

/**
 * 配列の要素を合計する関数
 * @param {number[]} numbers - 数値の配列
 * @returns {number} 合計値
 */
function sum(numbers) {
  return numbers.reduce((acc, num) => acc + num, 0);
}

/**
 * 文字列を逆順にする関数
 * @param {string} str - 入力文字列
 * @returns {string} 逆順の文字列
 */
function reverseString(str) {
  return str.split('').reverse().join('');
}

/**
 * オブジェクトが空かどうかを判定する関数
 * @param {Object} obj - チェック対象のオブジェクト
 * @returns {boolean} 空の場合true
 */
function isEmpty(obj) {
  return Object.keys(obj).length === 0;
}

// エクスポート（Node.js環境用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    add,
    sum,
    reverseString,
    isEmpty
  };
}
