/* 源泉徴収税額チェッカー エンジン
 * 仕様: ~/workspace/notes/tax-tools-spec-10-gensen.md
 * 根拠: 国税庁「給与所得の源泉徴収税額の求め方」（令和8年分 源泉徴収税額表 19〜22ページ）
 * データ: data/bonus/monthly-table-2026.json（月額表・令和8年分、国税庁Excelから変換。
 *         賞与ツールと正本を共用する）
 * 率の乗算は浮動小数点誤差を避けるため整数演算（率を10万分率の整数化）で行う。
 */
(function (global) {
'use strict';

function yen0(n) { var v = Math.floor(+n || 0); return v < 0 ? 0 : v; }
function count0(n) { var v = Math.floor(+n || 0); return v < 0 ? 0 : v; }
/* 率（小数）→ 10万分率の整数（例: 3.063% = 0.03063 → 3063） */
function rateInt(rate) { return Math.round(rate * 100000); }
/* floor(amount × rate) を整数演算で求める */
function applyRate(amount, rate) {
  return Math.floor(amount * rateInt(rate) / 100000);
}

/* 税額表（月額表）を引く本体（仕様§1.4・§3）。
 * table: monthly-table-2026.json の内容
 * amount: 社会保険料等控除後の給与等の金額 A
 * column: 'kou'（甲欄）| 'otsu'（乙欄）
 * dependents: 扶養親族等の数（甲欄のみ使用。7人超は7人の税額から1人ごとに1,610円控除）
 * 戻り値: { tax, zone: 'under'|'table'|'over', row: {min,max}|null,
 *           segment: {from, baseTax, rate}|null, taxAt7, over7Deduction } */
function tableTax(table, amount, column, dependents) {
  amount = yen0(amount);
  var depRaw = count0(dependents);
  var dep = Math.min(depRaw, 7);
  var limit = table.under_min.limit;
  var tableMax = table.rows[table.rows.length - 1].max;
  var tax, zone, row = null, segment = null;

  if (amount < limit) {
    zone = 'under';
    tax = column === 'kou' ? table.under_min.kou_tax : applyRate(amount, table.under_min.otsu_rate);
  } else if (amount < tableMax) {
    zone = 'table';
    for (var i = 0; i < table.rows.length; i++) {
      if (amount >= table.rows[i].min && amount < table.rows[i].max) { row = table.rows[i]; break; }
    }
    tax = column === 'kou' ? row.kou[dep] : row.otsu;
  } else {
    zone = 'over';
    var segs = column === 'kou' ? table.over.kou_segments : table.over.otsu_segments;
    var seg = segs[0];
    for (var j = 0; j < segs.length; j++) { if (segs[j].from <= amount) seg = segs[j]; }
    var base = column === 'kou' ? seg.base_tax[dep] : seg.base_tax;
    segment = { from: seg.from, baseTax: base, rate: seg.rate };
    tax = base + applyRate(amount - seg.from, seg.rate);
  }

  var taxAt7 = tax, over7Deduction = 0;
  if (column === 'kou' && depRaw > 7) {
    over7Deduction = table.per_dependent_over7 * (depRaw - 7);
    /* 控除の結果がマイナスになる場合は0円（仕様§7.1-3の設計判断） */
    tax = Math.max(0, tax - over7Deduction);
  }
  return {
    tax: tax, zone: zone, row: row, segment: segment,
    taxAt7: taxAt7, over7Deduction: over7Deduction
  };
}

/* input: {
 *   mode: 'direct'（控除後の金額を直接入力）| 'gross'（総支給額から入力）,
 *   afterDirect: 方式(a) の控除後の金額,
 *   gross: G2 総支給額, commute: G3 非課税の通勤手当, insurance: G4 社会保険料等,
 *   column: 'kou'|'otsu', dependents: 扶養親族等の数（甲欄）,
 *   statementTax: G7 明細の源泉徴収税額（任意・null可）
 * } */
function compute(table, input) {
  var mode = input.mode === 'gross' ? 'gross' : 'direct';
  var column = input.column === 'otsu' ? 'otsu' : 'kou';
  var gross = yen0(input.gross);
  var commute = yen0(input.commute);
  var insurance = yen0(input.insurance);
  var salaryAmount = gross - commute; /* 給与等の金額（§1.2） */
  var after = mode === 'gross' ? salaryAmount - insurance : Math.floor(+input.afterDirect || 0);
  /* A が0以下の場合は税額0円（仕様§3-1・§7.1-4の設計判断） */
  var nonPositive = after <= 0;
  var looked = tableTax(table, Math.max(0, after), column, input.dependents);

  var result = {
    mode: mode,
    column: column,
    dependents: count0(input.dependents),
    gross: gross,
    commute: commute,
    insurance: insurance,
    salaryAmount: salaryAmount,
    afterAmount: after,
    nonPositive: nonPositive,
    tax: nonPositive ? 0 : looked.tax,
    zone: looked.zone,
    row: looked.row,
    segment: looked.segment,
    taxAt7: looked.taxAt7,
    over7Deduction: looked.over7Deduction,
    diff: null
  };

  if (input.statementTax !== null && input.statementTax !== undefined && input.statementTax !== '') {
    var st = yen0(input.statementTax);
    result.diff = { statementTax: st, diff: result.tax - st };
  }
  return result;
}

var api = {
  compute: compute,
  tableTax: tableTax,
  applyRate: applyRate
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.GensenEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
