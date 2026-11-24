/* 来年の負担まるごとシミュレーター（複合版）— DOMハーネス
 * 実ページの HTML をパースして要素スタブを組み、実サイトと同じ順序で
 * スクリプトを読み込み、ブラウザでの初期表示・保存・消去の挙動を再現する。
 * 実行: node tests/composite-dom-run.js
 *
 * 検証する事象:
 *  1. 初回訪問（localStorage空）で、データ読み込み完了後に初期計算が走り結果が出ること。
 *     データ取得が遅い場合・スクリプト実行時点で DOMContentLoaded 発火済みの場合も含む
 *  2. 「保存した入力を消す」で zn.profile.v1 と zn.tool.<id>.v1 が完全に消え、
 *     表示もその場で初期値に戻ること（リロード時のブラウザのフォーム値復元に頼ると、
 *     入力した値が復元されて表示が残るため、アプリ側で初期値へ戻すことを要求する）。
 *     世帯・実質時給・副業も同じ消去フローで検証する
 *  3. NEW-01: 旧年齢区分 '40to64' の保存値（ツール保存・共通プロファイルのどちら経由でも）を
 *     復元したら、決め打ちで読み替えず再選択を求め、金額を出さないこと。
 *     選び直すと新しい区分で計算され、保存も新しい区分値になること
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function eq(name, actual, expected) {
  if (actual === expected) { pass++; }
  else { fail++; console.log(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ': ' + extra : ''}`); }
}
function section(t) { console.log('— ' + t); }

/* ---------- 最小DOMスタブ ---------- */
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.id = '';
    this.children = [];
    this.options = [];
    this.style = {};
    this.textContent = '';
    this.disabled = false;
    this.selected = false;
    this._value = '';
    this._innerHTML = '';
    this._listeners = {};
    const s = new Set();
    this.classList = { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c) };
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) { this._innerHTML = String(v); }
  get value() {
    if (this.tagName === 'SELECT') {
      const sel = this.options.filter((o) => o.selected);
      if (sel.length) return sel[sel.length - 1]._value;
      if (this.options.some((o) => o._value === this._value)) return this._value;
      return this.options.length ? this.options[0]._value : '';
    }
    return this._value;
  }
  set value(v) {
    v = String(v);
    this._value = v;
    if (this.tagName === 'SELECT') this.options.forEach((o) => { o.selected = (o._value === v); });
  }
  appendChild(c) {
    this.children.push(c);
    if (this.tagName === 'SELECT') this.options.push(c);
    return c;
  }
  removeChild(c) {
    this.children = this.children.filter((x) => x !== c);
    return c;
  }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  dispatch(type) {
    (this._listeners[type] || []).slice().forEach((f) => f.call(this, { type, target: this }));
  }
  select() {}
}

/* HTMLから id つき要素（select の option と input の初期値を含む）を組み立てる */
function buildDocument(html, readyState) {
  const byId = {};
  const reg = (el) => { if (el.id) byId[el.id] = el; return el; };
  let m;
  const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/g;
  while ((m = selectRe.exec(html))) {
    const idM = /id="([^"]+)"/.exec(m[1]);
    if (!idM) continue;
    const sel = new El('select'); sel.id = idM[1]; reg(sel);
    const optRe = /<option\b([^>]*)>/g;
    let om;
    while ((om = optRe.exec(m[2]))) {
      const o = new El('option');
      const vM = /value="([^"]*)"/.exec(om[1]);
      o._value = vM ? vM[1] : '';
      o.selected = /\bselected\b/.test(om[1]);
      sel.appendChild(o);
    }
    if (sel.options.length && !sel.options.some((o) => o.selected)) sel.options[0].selected = true;
  }
  const tagRe = /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/g;
  while ((m = tagRe.exec(html))) {
    if (byId[m[2]]) continue;
    const el = new El(m[1]); el.id = m[2];
    if (m[1] === 'input') {
      const vM = /\bvalue="([^"]*)"/.exec(m[0]);
      el._value = vM ? vM[1] : '';
    }
    reg(el);
  }
  const docListeners = {};
  const document = {
    readyState: readyState || 'loading',
    getElementById: (id) => byId[id] || null,
    createElement: (tag) => new El(tag),
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
    body: new El('body'),
    _fire: (type) => (docListeners[type] || []).slice().forEach((f) => f({ type }))
  };
  return document;
}

function makeStorage() {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length; },
    _store: store
  };
}

function pageScripts(html) {
  const out = [];
  const re = /<script[^>]*\bsrc="\.\.\/js\/([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

/* 1回の「訪問」を再現する。
 * opts: { readyState, fireDCLBeforeScripts, fetchDelayMs, preset: {id: value} } */
async function visit(pageDir, storage, opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(ROOT, pageDir, 'index.html'), 'utf8');
  const document = buildDocument(html, opts.readyState);
  if (opts.preset) {
    Object.keys(opts.preset).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el._value = String(opts.preset[id]);
    });
  }
  const state = { reloads: 0, confirms: 0 };
  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Math, Date, isNaN, parseFloat, parseInt,
    document,
    localStorage: storage,
    navigator: {},
    location: { reload: () => { state.reloads++; } },
    confirm: () => { state.confirms++; return true; },
    fetch: (url) => {
      const rel = url.replace(/^\.\.\//, '');
      const file = path.join(ROOT, rel);
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const p = Promise.resolve({ json: () => Promise.resolve(data) });
      if (opts.fetchDelayMs) {
        return new Promise((res) => setTimeout(() => res({ json: () => Promise.resolve(data) }), opts.fetchDelayMs));
      }
      return p;
    }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  if (opts.fireDCLBeforeScripts) document._fire('DOMContentLoaded');
  for (const s of pageScripts(html)) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', s), 'utf8'), ctx, { filename: s });
  }
  if (!opts.fireDCLBeforeScripts) document._fire('DOMContentLoaded');
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 20));
  return { document, state, $: (id) => document.getElementById(id) };
}

(async () => {
  /* ============ 事象1: 初回訪問で結果が空にならないか ============ */
  section('事象1 初回訪問（localStorage空）で初期計算が走ること');
  const storage1 = makeStorage();
  const v1 = await visit('composite', storage1);
  eq('総負担が「— 円」のままではない', v1.$('totalBig').textContent === '— 円', false);
  ok('内訳表に描画されている', v1.$('resultRows').innerHTML.length > 0, 'resultRows が空');
  ok('総合の見解が描画されている', v1.$('assessBox').innerHTML.length > 0, 'assessBox が空');
  ok('ガントが描画されている', v1.$('ganttArea').innerHTML.length > 0, 'ganttArea が空');
  const firstTotal = v1.$('totalBig').textContent;
  console.log('  初回訪問の総負担: ' + firstTotal);

  section('事象1b 2回目の訪問でも同じ初期条件で同じ結果になること');
  v1.$('incThisYear').dispatch('input');
  ok('入力でプロファイルが保存される', !!storage1.getItem('zn.profile.v1'));
  const v2 = await visit('composite', storage1);
  eq('2回目の総負担が初回と一致', v2.$('totalBig').textContent, firstTotal);

  section('事象1c データ取得が遅くても、完了後に初期計算が必ず走ること');
  const v3 = await visit('composite', makeStorage(), { fetchDelayMs: 150 });
  eq('遅延読み込み後の総負担', v3.$('totalBig').textContent, firstTotal);
  ok('遅延読み込み後の見解が描画されている', v3.$('assessBox').innerHTML.length > 0, 'assessBox が空');

  section('事象1d スクリプト実行時点で DOMContentLoaded 発火済みでも初期計算が走ること');
  const v4 = await visit('composite', makeStorage(), { readyState: 'complete', fireDCLBeforeScripts: true });
  eq('発火済みの場合の総負担', v4.$('totalBig').textContent, firstTotal);
  ok('発火済みの場合の内訳が描画されている', v4.$('resultRows').innerHTML.length > 0, 'resultRows が空');

  /* ============ 事象2: 「保存した入力を消す」が効くこと ============ */
  section('事象2 消去で保存が消え、表示もその場で初期値に戻ること');
  const storage2 = makeStorage();
  const w1 = await visit('composite', storage2);
  w1.$('incNextYear').value = '7000000';
  w1.$('incNextYear').dispatch('input');
  w1.$('incNextYear').dispatch('change');
  const savedProfile = JSON.parse(storage2.getItem('zn.profile.v1') || '{}');
  eq('変更がプロファイルに保存される', savedProfile.incomeNextYearSalary, 7000000);
  ok('ツール固有の保存もある', !!storage2.getItem('zn.tool.composite.v1'));
  w1.$('clearSaved').dispatch('click');
  eq('消去で zn.profile.v1 が消える', storage2.getItem('zn.profile.v1'), null);
  eq('消去で zn.tool.composite.v1 が消える', storage2.getItem('zn.tool.composite.v1'), null);
  /* リロード時のフォーム値復元で入力値が戻ってしまうブラウザでも残らないよう、
   * 消去したその場で表示が初期値に戻っていることを要求する */
  eq('消去直後に来年の年収の表示が初期値500万円に戻る', w1.$('incNextYear').value, '5000000');
  eq('消去直後に総負担が初期条件の値に戻る', w1.$('totalBig').textContent, firstTotal);
  const w2 = await visit('composite', storage2);
  eq('再読み込み後の来年の年収は初期値500万円', w2.$('incNextYear').value, '5000000');
  eq('再読み込み後の総負担は初期条件の値', w2.$('totalBig').textContent, firstTotal);
  eq('再読み込み後に勝手に書き戻されない', storage2.getItem('zn.profile.v1'), null);
  eq('再読み込み後にツール保存も書き戻されない', storage2.getItem('zn.tool.composite.v1'), null);

  /* ============ 他ツール（世帯・実質時給・副業）の消去フロー ============ */
  const others = [
    { dir: 'setai', field: 'selfIncome', value: '9000000', toolKey: 'zn.tool.setai.v1' },
    { dir: 'jikyu', field: 'annualGross', value: '9000000', toolKey: 'zn.tool.jikyu.v1' },
    { dir: 'fukugyo', field: 'mainIncome', value: '9000000', toolKey: 'zn.tool.fukugyo.v1' }
  ];
  for (const t of others) {
    section('事象2（' + t.dir + '）消去で表示が初期値に戻ること');
    const st = makeStorage();
    const a = await visit(t.dir, st);
    const defVal = a.$(t.field).value;
    a.$(t.field).value = t.value;
    a.$(t.field).dispatch('input');
    a.$(t.field).dispatch('change');
    ok(t.dir + ': 変更が保存される', !!st.getItem(t.toolKey));
    a.$('clearSaved').dispatch('click');
    eq(t.dir + ': 消去で zn.profile.v1 が消える', st.getItem('zn.profile.v1'), null);
    eq(t.dir + ': 消去で ' + t.toolKey + ' が消える', st.getItem(t.toolKey), null);
    eq(t.dir + ': 消去直後に表示が初期値に戻る', a.$(t.field).value, defVal);
    const b = await visit(t.dir, st);
    eq(t.dir + ': 再読み込み後も初期値のまま', b.$(t.field).value, defVal);
    eq(t.dir + ': 再読み込み後に書き戻されない', st.getItem('zn.profile.v1'), null);
  }

  /* ============ 事象3: NEW-01 旧年齢区分の保存値では再選択を求める ============ */
  section('事象3 NEW-01 旧年齢区分（40to64）の復元では金額を出さず、再選択を求めること');
  const storage3 = makeStorage();
  storage3.setItem('zn.tool.composite.v1', JSON.stringify({
    course: 'self', cityKey: 'nagoya', ageBand: '40to64'
  }));
  const u1 = await visit('composite', storage3);
  eq('年齢区分が再選択待ちになる', u1.$('ageBand').value, 'reselect');
  eq('総負担は金額を出さない（— 円）', u1.$('totalBig').textContent, '— 円');
  eq('内訳表は空', u1.$('resultRows').innerHTML, '');
  eq('ガントは空', u1.$('ganttArea').innerHTML, '');
  ok('結果エリアに再選択の案内が出る', u1.$('assessBox').innerHTML.indexOf('選び直してください') >= 0, 'assessBox: ' + u1.$('assessBox').innerHTML);
  ok('入力側にも案内が出る', u1.$('formError').innerHTML.indexOf('選び直してください') >= 0, 'formError が空');

  section('事象3b NEW-01 共通プロファイル経由の旧年齢区分でも再選択を求めること');
  const storage3b = makeStorage();
  storage3b.setItem('zn.profile.v1', JSON.stringify({
    workStyle: 'self', kokuhoCityKey: 'nagoya', ageBand: '40to64'
  }));
  const u2 = await visit('composite', storage3b);
  eq('プロファイル経由でも再選択待ちになる', u2.$('ageBand').value, 'reselect');
  eq('プロファイル経由でも金額を出さない', u2.$('totalBig').textContent, '— 円');
  eq('プロファイルの年齢区分は書き換えられない', JSON.parse(storage3b.getItem('zn.profile.v1')).ageBand, '40to64');

  section('事象3c NEW-01 選び直すと新しい区分で計算され、保存されること');
  u1.$('ageBand').value = '60to64';
  u1.$('ageBand').dispatch('change');
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 20));
  eq('60〜64歳を選び直すと総負担が出る（名古屋・自営業・所得300万円）', u1.$('totalBig').textContent, '730,600円');
  ok('国民年金保険料0円の行が出る', u1.$('resultRows').innerHTML.indexOf('国民年金保険料') >= 0 && u1.$('resultRows').innerHTML.indexOf('0円') >= 0, 'resultRows: ' + u1.$('resultRows').innerHTML.slice(0, 200));
  eq('案内が消える', u1.$('formError').innerHTML, '');
  const savedTool3 = JSON.parse(storage3.getItem('zn.tool.composite.v1') || '{}');
  eq('選び直した区分がツール保存される', savedTool3.ageBand, '60to64');
  const u3 = await visit('composite', storage3);
  eq('再訪問では再選択待ちにならない', u3.$('ageBand').value, '60to64');
  eq('再訪問でも同じ総負担', u3.$('totalBig').textContent, '730,600円');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
