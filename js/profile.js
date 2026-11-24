/* 入力値の記憶（共通プロファイル）— サイト共通部品
 * 仕様: ~/workspace/notes/tax-tools-spec-13-composite.md §1.7・§4.3
 * 保存先は利用者のブラウザの localStorage のみ。サーバーへの送信・保存は一切しない。
 * キー: 共通プロファイル zn.profile.v1 ／ ツールごとの前回入力 zn.tool.<ツールID>.v1
 * 保存対象は年収・自治体・家族構成などに限る。氏名・住所・勤務先名など
 * 個人を特定する情報は保存対象に含めない（入力欄自体も設けない）。
 * localStorage が使えない環境（プライベートモード等）では全操作が無言で無効になる。
 */
(function (global) {
'use strict';

var PROFILE_KEY = 'zn.profile.v1';
var TOOL_PREFIX = 'zn.tool.';
var TOOL_SUFFIX = '.v1';

function storage() {
  try { return global.localStorage || null; } catch (e) { return null; }
}
function read(key) {
  var s = storage();
  if (!s) return null;
  try {
    var v = s.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}
function write(key, obj) {
  var s = storage();
  if (!s) return false;
  try { s.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
}

/* 共通プロファイルを読む（なければ空オブジェクト） */
function loadProfile() { return read(PROFILE_KEY) || {}; }

/* 共通プロファイルへ部分的に書き戻す（既存の項目は保持する） */
function saveProfile(patch) {
  if (!patch) return loadProfile();
  var p = loadProfile();
  Object.keys(patch).forEach(function (k) { p[k] = patch[k]; });
  write(PROFILE_KEY, p);
  return p;
}

/* ツールごとの前回入力 */
function loadTool(toolId) { return read(TOOL_PREFIX + toolId + TOOL_SUFFIX); }
function saveTool(toolId, obj) { return write(TOOL_PREFIX + toolId + TOOL_SUFFIX, obj); }

/* 共通プロファイルと全ツールの保存キーを削除する（「保存した入力を消す」ボタン用） */
function clearAll() {
  var s = storage();
  if (!s) return;
  try {
    var keys = [];
    for (var i = 0; i < s.length; i++) {
      var k = s.key(i);
      if (k && (k === PROFILE_KEY || k.indexOf(TOOL_PREFIX) === 0)) keys.push(k);
    }
    keys.forEach(function (k) { s.removeItem(k); });
  } catch (e) { /* 消去できない環境では何もしない */ }
}

var api = {
  PROFILE_KEY: PROFILE_KEY,
  TOOL_PREFIX: TOOL_PREFIX,
  TOOL_SUFFIX: TOOL_SUFFIX,
  loadProfile: loadProfile,
  saveProfile: saveProfile,
  loadTool: loadTool,
  saveTool: saveTool,
  clearAll: clearAll
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.ZnProfile = api;
})(typeof window !== 'undefined' ? window : globalThis);
