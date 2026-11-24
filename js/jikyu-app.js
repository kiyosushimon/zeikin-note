(function () {
'use strict';
var E = window.JikyuEngine;
var DATA = null;
function $(id) { return document.getElementById(id);}
function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円';}
function rate1(n) { return n.toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '円';}
function rate2(n) { return n.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '円';}
function hoursFmt(n) { return (Math.round(n * 10) / 10).toLocaleString('ja-JP') + '時間';}
function num(id) { var v = parseFloat($(id).value); return isNaN(v) || v < 0 ? 0 : v;}
function raw(id) { return $(id).value.trim();}
function toast(msg) {
var t = $('toast'); t.textContent = msg; t.classList.add('show');
setTimeout(function () { t.classList.remove('show');}, 5000);
}

var last = null;

function gather() {
return {
mode: $('mode').value,
annualGross: num('annualGross'),
aSocial: raw('aSocial') === '' ? null : num('aSocial'),
aIncomeTax: raw('aIncomeTax') === '' ? null : num('aIncomeTax'),
aResidentTax: raw('aResidentTax') === '' ? null : num('aResidentTax'),
prefecture: $('prefecture').value,
baseSalary: num('baseSalary'),
includeAllowances: num('includeAllowances'),
excludeAllowances: num('excludeAllowances'),
fixedOvertime: num('fixedOvertime'),
variableOvertimeAnnual: num('variableOvertimeAnnual'),
bonusPer: num('bonusPer'),
bonusCount: Math.floor(num('bonusCount')),
ageBand: $('ageBand').value,
industry: $('industry').value,
minWageTarget: raw('minWageTarget') === '' ? null : num('minWageTarget'),
avgHours: num('avgHours'),
overtimeHours: num('overtimeHours'),
holidayHours: num('holidayHours'),
commuteMinutes: raw('commuteMinutes') === '' ? null : num('commuteMinutes'),
commuteDays: Math.floor(num('commuteDays')),
takeHomeHours: num('takeHomeHours')
};
}

function compute() {
var input = gather();
$('modeAGroup').style.display = input.mode === 'a' ? '' : 'none';
$('modeBGroup').style.display = input.mode === 'b' ? '' : 'none';
$('mwDefault').textContent = yen(input.baseSalary + input.includeAllowances);
if (!DATA) return;
var r = E.compute(DATA, input);
last = { input: input, result: r };
render(input, r);
}

function render(input, r) {
if (r.errors.length) {
$('formError').innerHTML = '<div class="error">' + r.errors.join('<br>') + '</div>';
$('totalBig').textContent = '— 円';
$('resultRows').innerHTML = '';
$('minWageResult').innerHTML = '';
$('refResult').innerHTML = '';
$('resultNotes').innerHTML = '';
return;
}
$('formError').innerHTML = '';
$('totalBig').textContent = rate1(r.grossRate);

var rows = [];
rows.push(['年収（総支給・額面）', yen(r.annualIncome)]);
rows.push(['年間総労働時間（所定＋残業＋休日労働）', hoursFmt(r.totalHours)]);
if (r.mode === 'b') {
rows.push(['算定基礎の月額（基本給＋算入する手当）', yen(r.baseMonthly)]);
rows.push(['所定時給（施行規則第19条の換算）', yen(r.prescribedRate)]);
}
rows.push(['実質時給（額面）＝ 年収 ÷ 年間総労働時間', rate1(r.grossRate)]);
if (r.net) {
if (!r.net.fromStatement) {
rows.push(['社会保険料（年額・本人負担）', '− ' + yen(r.net.social.total)]);
rows.push(['所得税（年額）', '− ' + yen(r.net.incomeTax)]);
rows.push(['住民税（年額・目安）', '− ' + yen(r.net.residentTax)]);
} else {
rows.push(['社会保険料（年額・入力値）', '− ' + yen(r.net.social.total)]);
rows.push(['所得税（年額・入力値）', '− ' + yen(r.net.incomeTax)]);
rows.push(['住民税（年額・入力値）', '− ' + yen(r.net.residentTax)]);
}
rows.push(['年間手取り', yen(r.net.net)]);
rows.push(['実質時給（手取り）＝ 年間手取り ÷ 年間総労働時間', rate1(r.netRate)]);
}
$('resultRows').innerHTML = rows.map(function (row) {
var strong = row[0].indexOf('実質時給') === 0 || row[0] === '年間手取り';
return '<tr' + (strong ? ' class="total-row"' : '') + '><td>' + row[0] + '</td><td>' + row[1] + '</td></tr>';
}).join('');

/* 最低賃金チェック */
var mwHtml = '';
if (r.minWage) {
var mw = r.minWage;
mwHtml = '<h3 class="subhead">最低賃金チェック（' + mw.prefecture + '）</h3>';
if (mw.ok) {
mwHtml += '<p>時間額に換算すると <strong>' + rate2(mw.hourly) + '</strong> で、' + mw.prefecture + 'の最低賃金 <strong>' + yen(mw.minWage) + '</strong>（' + mw.minWageFrom + '発効）を<strong>満たしています</strong>。</p>';
} else {
mwHtml += '<p>時間額に換算すると <strong>' + rate2(mw.hourly) + '</strong> で、' + mw.prefecture + 'の最低賃金 <strong>' + yen(mw.minWage) + '</strong>（' + mw.minWageFrom + '発効）を<strong>下回っています</strong>。</p>';
}
mwHtml += '<p class="note">計算: 最低賃金の対象となる賃金 ' + yen(mw.targetMonthly) + ' ÷ 1か月平均所定労働時間 ' + hoursFmt(mw.avgHours) + '。比較は丸め前の値で行い、表示は小数第2位まで切り捨てています（公式の表示方法に合わせています）。</p>';
if (r.minWageUsedDefault) {
mwHtml += '<p class="note">対象となる賃金は未入力のため、算定基礎の月額（基本給＋算入する手当）で計算しています。精皆勤手当は最低賃金の対象から除かれ、住宅手当等は含まれるなど、算定基礎とは組み立てが異なる場合があります。手当の内訳がある場合は「最低賃金の対象となる賃金（月額）」欄で修正してください。</p>';
}
}
$('minWageResult').innerHTML = mwHtml;

/* 参考値（通勤・持ち帰り込み） */
var refHtml = '';
if (r.reference) {
var ref = r.reference;
refHtml = '<h3 class="subhead">参考: 通勤・持ち帰り時間も含めた場合の時給</h3>';
refHtml += '<p>労働時間ではない時間（通勤 月' + hoursFmt(ref.monthlyHours) + '）も分母に含めると、額面は <strong>' + rate1(ref.grossRate) + '</strong>';
if (ref.netRate !== null) refHtml += '、手取りは <strong>' + rate1(ref.netRate) + '</strong>';
refHtml += ' になります。これは生活時間ベースの参考値で、上の実質時給とは別の数字です。</p>';
}
$('refResult').innerHTML = refHtml;

var notes = [];
notes.push('「実質時給（額面・手取り）」は本ツールが定義した計算方法による数字で、法律で定められた金額ではありません。所定時給だけが、労働基準法施行規則第19条の換算方法による数字です。');
if (r.mode === 'b' && r.net) {
notes.push('手取りは単身者・標準ケース（控除は社会保険料と基礎控除のみ）の目安です。配偶者控除・扶養控除・生命保険料控除・iDeCo等がある場合、実際の手取りはこの結果より大きくなります。');
notes.push('社会保険料は、月給の総支給額の目安 ' + yen(r.net.monthlyGross) + ' から当てはめた標準報酬月額（健康保険 ' + yen(r.net.standardHealth) + '／厚生年金 ' + yen(r.net.standardPension) + '）で計算しています。');
notes.push('住民税は本来、前年の所得に対して翌年に課税されます。本ツールは「その年の収入に伴う税負担の目安」として、その年の収入ベースで計算しています。');
}
if (r.mode === 'a') {
notes.push('年収からの簡易計算では、所定時給・最低賃金チェック・手取りの自動計算は行いません。社会保険料・所得税・住民税の年額を入力した場合のみ、手取り時給を表示します。');
}
notes.push('残業時間は、払われていない分も含めて実際に働いた時間を入れる前提です。未払い残業代そのものの計算は「残業代計算・未払いチェック」で確認できます。');
$('resultNotes').innerHTML = notes.map(function (n) { return '<li>' + n + '</li>';}).join('');
}

function buildPrompt() {
var i = last.input, r = last.result;
var lines = ['実質時給チェッカーの試算結果について相談です。', ''];
if (i.mode === 'b') {
lines.push('・勤務地: ' + i.prefecture + '／基本給 ' + yen(i.baseSalary) + '／算入する手当 ' + yen(i.includeAllowances) + '／除外できる手当 ' + yen(i.excludeAllowances) + '／固定残業代 ' + yen(i.fixedOvertime) + '／変動残業代等（年額） ' + yen(i.variableOvertimeAnnual) + '／賞与 ' + yen(i.bonusPer) + ' × 年' + i.bonusCount + '回');
} else {
lines.push('・年間総支給額（直接入力）: ' + yen(i.annualGross));
}
lines.push('・1か月平均所定労働時間: ' + hoursFmt(i.avgHours) + '／月平均残業: ' + hoursFmt(i.overtimeHours) + '／月平均休日労働: ' + hoursFmt(i.holidayHours));
lines.push('');
lines.push('・年収（総支給）: ' + yen(r.annualIncome));
lines.push('・年間総労働時間: ' + hoursFmt(r.totalHours));
if (r.prescribedRate !== null) lines.push('・所定時給（施行規則第19条の換算）: ' + yen(r.prescribedRate));
lines.push('・実質時給（額面）: ' + rate1(r.grossRate));
if (r.net) {
lines.push('・社会保険料（年額）: ' + yen(r.net.social.total) + '／所得税: ' + yen(r.net.incomeTax) + '／住民税: ' + yen(r.net.residentTax) + '／年間手取り: ' + yen(r.net.net));
lines.push('・実質時給（手取り）: ' + rate1(r.netRate));
}
if (r.minWage) {
lines.push('・最低賃金チェック（' + r.minWage.prefecture + '）: 時間額 ' + rate2(r.minWage.hourly) + '、最低賃金 ' + yen(r.minWage.minWage) + ' → ' + (r.minWage.ok ? '満たしている' : '下回っている'));
}
if (r.reference) {
lines.push('・参考（通勤・持ち帰り込み）: 額面 ' + rate1(r.reference.grossRate) + (r.reference.netRate !== null ? '／手取り ' + rate1(r.reference.netRate) : ''));
}
lines.push('');
lines.push('前提: 「実質時給」は本ツールの定義（年収または年間手取り ÷ 年間総労働時間）による試算で、法定の金額ではない。手取りは単身者・標準ケース（控除は社会保険料と基礎控除のみ）の目安で、住民税はその年の収入ベースの目安計算。最低賃金チェックは厚生労働省の公式方法（対象となる賃金 ÷ 1か月平均所定労働時間）による。');
lines.push('根拠: 労働基準法施行規則第19条（1時間当たりの賃金の換算）、厚生労働省 最低賃金特設サイト「あなたの賃金を比較チェック」「地域別最低賃金全国一覧」https://saiteichingin.mhlw.go.jp/table/page_list_nationallist.php');
lines.push('');
lines.push('聞きたいこと: ①この試算の前提で見落としはないか ②実質時給を上げるために効く打ち手（残業の減らし方・昇給交渉など） ③最低賃金を下回っている場合の確認・相談の進め方');
lines.push('');
lines.push('※最終確認は勤務先の給与担当・労働基準監督署・社会保険労務士へお願いします。');
return lines.join('\n');
}

function copyPrompt() {
if (!last) return;
var text = buildPrompt();
function done() { toast('コピーしました。貼る前に、個人が特定できる情報が入っていないか確認してください');}
function fallback() {
var ta = document.createElement('textarea');
ta.value = text; document.body.appendChild(ta); ta.select();
try { document.execCommand('copy'); done();} catch (e) { toast('コピーできませんでした');}
document.body.removeChild(ta);
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(done, fallback);
} else fallback();
}

function init() {
Promise.all([
fetch('../data/nencho/tables-2026.json').then(function (r) { return r.json();}),
fetch('../data/juminzei/rules.json').then(function (r) { return r.json();}),
fetch('../data/kenpo/rates-2026.json').then(function (r) { return r.json();}),
fetch('../data/shaho/params-2026.json').then(function (r) { return r.json();}),
fetch('../data/jikyu/minimum-wage.json').then(function (r) { return r.json();})
]).then(function (ds) {
DATA = { tables: ds[0], rules: ds[1], kenpo: ds[2], shahoParams: ds[3], minwage: ds[4] };
var sel = $('prefecture');
Object.keys(ds[2].prefectures).forEach(function (name) {
var o = document.createElement('option');
o.value = name; o.textContent = name;
if (name === '東京都') o.selected = true;
sel.appendChild(o);
});
var ids = ['mode', 'annualGross', 'aSocial', 'aIncomeTax', 'aResidentTax',
'prefecture', 'baseSalary', 'includeAllowances', 'excludeAllowances', 'fixedOvertime',
'variableOvertimeAnnual', 'bonusPer', 'bonusCount', 'ageBand', 'industry', 'minWageTarget',
'avgHours', 'overtimeHours', 'holidayHours', 'annualHolidays', 'hoursPerDay',
'commuteMinutes', 'commuteDays', 'takeHomeHours'];
ids.forEach(function (id) { $(id).addEventListener('input', compute); $(id).addEventListener('change', compute);});
/* 共通プロファイル連携（js/profile.js）: 初期値の読み書きだけを行い、計算には触らない */
/* 消去時に戻す初期値（保存値の復元前）を控える */
var defaultState = {};
ids.forEach(function (id) { if ($(id)) defaultState[id] = $(id).value; });
if (window.ZnProfile) {
var savedToolJ = ZnProfile.loadTool('jikyu');
if (savedToolJ) {
ids.forEach(function (id) { if (savedToolJ[id] !== undefined && $(id)) $(id).value = savedToolJ[id];});
} else {
var profJ = ZnProfile.loadProfile();
if (profJ.incomeThisYearSalary !== undefined) $('annualGross').value = profJ.incomeThisYearSalary;
if (profJ.prefecture) $('prefecture').value = profJ.prefecture;
if (profJ.ageBand) $('ageBand').value = profJ.ageBand === '65plus' ? '65to69' : profJ.ageBand;
if (profJ.industry) $('industry').value = profJ.industry;
if (profJ.bonusPer !== undefined) $('bonusPer').value = profJ.bonusPer;
if (profJ.bonusCount !== undefined) $('bonusCount').value = profJ.bonusCount;
}
var persistJikyu = function () {
var st = {};
ids.forEach(function (id) { st[id] = $(id).value;});
ZnProfile.saveTool('jikyu', st);
ZnProfile.saveProfile({
prefecture: $('prefecture').value,
ageBand: $('ageBand').value === '65to69' ? '65plus' : $('ageBand').value,
industry: $('industry').value,
bonusPer: num('bonusPer'),
bonusCount: Math.floor(num('bonusCount')),
incomeThisYearSalary: num('annualGross')
});
};
ids.forEach(function (id) { $(id).addEventListener('input', persistJikyu); $(id).addEventListener('change', persistJikyu);});
if ($('clearSaved')) $('clearSaved').addEventListener('click', function () {
if (window.confirm('保存した入力（共通プロファイルと全ツールの前回入力）をすべて消します。よろしいですか？')) {
ZnProfile.clearAll();
/* リロードに頼らず、その場で初期値へ戻して再計算する（リロード時のフォーム値復元で入力値が復活するのを防ぐ） */
ids.forEach(function (id) { if (defaultState[id] !== undefined && $(id)) $(id).value = defaultState[id]; });
compute();
toast('保存した入力を消しました');
}
});
}
$('avgCalcBtn').addEventListener('click', function () {
var v = E.avgMonthlyHours(num('annualHolidays'), num('hoursPerDay'));
if (v > 0) { $('avgHours').value = v; compute();}
});
$('copyPrompt').addEventListener('click', copyPrompt);
compute();
}).catch(function () {
$('formError').innerHTML = '<div class="error">計算データ（data/nencho・data/juminzei・data/kenpo・data/shaho・data/jikyu）を読み込めませんでした。</div>';
});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();

