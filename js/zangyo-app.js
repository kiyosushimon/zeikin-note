(function () {
'use strict';
var E = window.ZangyoEngine;
function $(id) { return document.getElementById(id);}
function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円';}
function num(id) { var v = parseFloat($(id).value); return isNaN(v) || v < 0 ? 0 : v;}
function raw(id) { return $(id).value.trim();}
function hrs(h) { return (Math.round(h * 100) / 100).toLocaleString('ja-JP');}
function toast(msg) {
var t = $('toast'); t.textContent = msg; t.classList.add('show');
setTimeout(function () { t.classList.remove('show');}, 5000);
}

var last = null;

var PAYTYPE_LABEL = { monthly: '月給制', hourly: '時給制' };

function gather() {
return {
payType: $('payType').value,
baseSalary: num('baseSalary'),
includeAllowances: num('includeAllowances'),
excludeAllowances: num('excludeAllowances'),
fixedOvertime: num('fixedOvertime'),
fixedOvertimeHours: raw('fixedOvertimeHours') === '' ? null : num('fixedOvertimeHours'),
avgHours: num('avgHours'),
hourlyWage: num('hourlyWage'),
t1: num('t1'), t2: num('t2'), t3: num('t3'), t4: num('t4'),
t5: num('t5'), t6: num('t6'), t7: num('t7'), t8: num('t8'),
actualPaid: raw('actualPaid') === '' ? null : num('actualPaid')
};
}

function compute() {
var input = gather();
$('monthlyGroup').style.display = input.payType === 'monthly' ? '' : 'none';
$('hourlyGroup').style.display = input.payType === 'hourly' ? '' : 'none';

var r = E.compute(input);
last = { input: input, result: r };

if (r.errors.length) {
$('formError').innerHTML = '<div class="error">入力を確認してください。<ul>' +
r.errors.map(function (e) { return '<li>' + e + '</li>';}).join('') + '</ul></div>';
$('totalBig').textContent = '— 円';
$('resultRows').innerHTML = '';
$('fixedResult').innerHTML = '';
$('diffResult').innerHTML = '';
$('resultNotes').innerHTML = '';
return;
}
$('formError').innerHTML = '';
render(input, r);
}

function render(input, r) {
$('totalBig').textContent = yen(r.total);

var rows = [];
if (input.payType === 'monthly') {
rows.push(['算定基礎の月額（基本給＋算入する手当）', yen(r.baseMonthly)]);
if (r.excludeAllowances > 0) rows.push(['算定基礎から除外した手当', yen(r.excludeAllowances)]);
if (r.fixedOvertime > 0) rows.push(['算定基礎から除外した固定残業代', yen(r.fixedOvertime)]);
}
rows.push(['1時間当たりの賃金', yen(r.hourlyWage)]);
r.categories.forEach(function (c) {
if (c.hours <= 0) return;
rows.push([c.name + '（' + hrs(c.hours) + '時間 × ' + c.rateLabel + '）', yen(c.amount)]);
});
if (r.premiumTotal !== r.total) {
rows.push(['割増賃金の合計', yen(r.premiumTotal)]);
}
rows.push(['本来もらえる残業代の合計', yen(r.total)]);
$('resultRows').innerHTML = rows.map(function (row, i) {
var strong = row[0] === '本来もらえる残業代の合計';
return '<tr' + (strong ? ' class="total-row"' : '') + '><td>' + row[0] + '</td><td>' + row[1] + '</td></tr>';
}).join('');

/* 固定残業代のチェック */
var fixedHtml = '';
if (r.fixedCheck) {
var f = r.fixedCheck;
fixedHtml += '<h3 class="subhead">固定残業代のチェック</h3>';
var frows = [
['法定の計算額（割増賃金）', yen(f.statutory)],
['固定残業代', yen(f.fixed)]
];
if (f.shortfall > 0) frows.push(['不足額（差額）', yen(f.shortfall)]);
fixedHtml += '<div class="table-wrap"><table class="result-table"><tr><th>項目</th><th>金額</th></tr><tbody>' +
frows.map(function (row) {
return '<tr' + (row[0].indexOf('不足額') === 0 ? ' class="total-row"' : '') + '><td>' + row[0] + '</td><td>' + row[1] + '</td></tr>';
}).join('') + '</tbody></table></div>';
if (f.shortfall > 0) {
fixedHtml += '<p>固定残業代が法定の計算額を下回っているため、<strong>差額 ' + yen(f.shortfall) + ' の追加支給が必要な計算です</strong>。</p>';
} else {
fixedHtml += '<p>今月は固定残業代が法定の計算額を上回っている計算です。</p>';
}
fixedHtml += '<p class="note">固定残業代 ' + yen(f.fixed) + ' は、通常の時間外労働（25%割増）の約 ' + (Math.round(f.coveredHours * 10) / 10).toLocaleString('ja-JP') + ' 時間分に相当します。';
if (f.settingHours !== null) {
fixedHtml += '設定時間数（' + hrs(f.settingHours) + '時間）分の金額は ' + yen(f.settingAmount) + ' です。';
}
fixedHtml += '今月の法定時間外労働と法定休日労働の合計は ' + hrs(f.overtimeHours) + ' 時間でした。</p>';
fixedHtml += '<p class="note">このチェックは、入力された額が雇用契約・就業規則で固定残業代として判別できる形で定められていることを前提としています。その手当が固定残業代に当たるかどうか自体は、契約書の記載や勤務の実態による判断になるため、本ツールでは判定していません。</p>';
}
$('fixedResult').innerHTML = fixedHtml;

/* 明細との差額 */
var diffHtml = '';
if (r.diff) {
if (r.diff.diff > 0) {
diffHtml = '<p>給与明細の残業代（' + yen(r.diff.actualPaid) + '）と比べると、<strong>' + yen(r.diff.diff) + ' 不足している計算です</strong>。会社の割増率や端数処理の定めによっては実際の本来額と異なる場合があるため、断定はできません。まず勤務先の給与担当に計算方法を確認してください。</p>';
} else {
diffHtml = '<p>給与明細の残業代（' + yen(r.diff.actualPaid) + '）は、<strong>法定の最低ラインは満たしている計算です</strong>（会社の割増率が法定を上回っている場合は、実支給が本来額を超えることがあります）。</p>';
}
}
$('diffResult').innerHTML = diffHtml;

var notes = [];
r.warnings.forEach(function (w) { notes.push(w);});
notes.push('割増率は労働基準法の最低率（時間外25%・60時間超50%・深夜25%・法定休日35%）で計算しています。就業規則等でこれを上回る率が定められている会社では、本来額はこの結果より大きくなります。');
notes.push('金額の端数処理は、通達で認められる方式（50銭ルール）を採用しています。時間数の月合計の30分丸めは適用していないため、会社がその処理をしている場合は金額が異なることがあります。');
if (input.t3 > 0) notes.push('代替休暇制度を採用している会社では、月60時間超の引上げ分が休暇に代えられている場合があり、その分の金額はこの結果と異なります。');
$('resultNotes').innerHTML = notes.map(function (n) { return '<li>' + n + '</li>';}).join('');
}

function buildPrompt() {
var i = last.input, r = last.result;
var lines = ['残業代計算・未払いチェックの試算結果について相談です。', ''];
lines.push('・給与形態: ' + PAYTYPE_LABEL[i.payType]);
if (i.payType === 'monthly') {
lines.push('・基本給: ' + yen(i.baseSalary) + '／算入する手当: ' + yen(i.includeAllowances) + '／除外できる手当: ' + yen(i.excludeAllowances));
lines.push('・1か月平均所定労働時間数: ' + hrs(i.avgHours) + '時間');
} else {
lines.push('・時間給: ' + yen(i.hourlyWage));
}
if (i.fixedOvertime > 0) lines.push('・固定残業代: ' + yen(i.fixedOvertime) + (i.fixedOvertimeHours !== null ? '（' + hrs(i.fixedOvertimeHours) + '時間分の設定）' : ''));
lines.push('・法定時間外労働: ' + hrs(i.t1) + '時間（うち深夜 ' + hrs(i.t2) + '時間／うち60時間超 ' + hrs(i.t3) + '時間／うち60時間超の深夜 ' + hrs(i.t4) + '時間）');
lines.push('・法定休日労働: ' + hrs(i.t5) + '時間（うち深夜 ' + hrs(i.t6) + '時間）');
lines.push('・深夜のみ: ' + hrs(i.t7) + '時間／法定内残業: ' + hrs(i.t8) + '時間');
lines.push('');
if (r.errors.length) {
lines.push('・入力に矛盾があり計算できていません: ' + r.errors.join('／'));
} else {
lines.push('・1時間当たりの賃金: ' + yen(r.hourlyWage));
r.categories.forEach(function (c) {
if (c.hours > 0) lines.push('・' + c.name + ': ' + hrs(c.hours) + '時間 × ' + c.rateLabel + ' = ' + yen(c.amount));
});
lines.push('・本来もらえる残業代: ' + yen(r.total) + '（うち割増賃金 ' + yen(r.premiumTotal) + '）');
if (r.fixedCheck) lines.push('・固定残業代のチェック: 法定の計算額 ' + yen(r.fixedCheck.statutory) + ' に対して固定残業代 ' + yen(r.fixedCheck.fixed) + '、不足額 ' + yen(r.fixedCheck.shortfall));
if (r.diff) lines.push('・給与明細の残業代: ' + yen(r.diff.actualPaid) + '（差額 ' + yen(r.diff.diff) + '）');
lines.push('');
lines.push('【計算過程】');
if (i.payType === 'monthly') {
lines.push('・1時間当たりの賃金: 算定基礎賃金（基本給 ' + yen(i.baseSalary) + ' ＋ 算入する手当 ' + yen(i.includeAllowances) + ' ＝ ' + yen(r.baseMonthly) + '）÷ 1か月平均所定労働時間 ' + hrs(i.avgHours) + '時間 ＝ ' + yen(r.hourlyWage) + '（端数は50銭ルール: 50銭未満切り捨て・50銭以上切り上げ）');
} else {
lines.push('・1時間当たりの賃金: 時間給 ' + yen(i.hourlyWage) + ' をそのまま使用');
}
lines.push('・区分ごとの金額: 1時間当たりの賃金 × 時間数 × 倍率（時間外1.25倍／月60時間超1.50倍／深夜は+0.25倍／法定休日1.35倍／法定内1.00倍）で計算し、区分ごとに50銭ルールで丸め。上記の内訳がその式の結果です');
lines.push('・合計: 本来もらえる残業代 ' + yen(r.total) + ' は全区分の合計で、うち割増賃金（法定内残業を除く区分の合計）が ' + yen(r.premiumTotal) + '。固定残業代のチェック・給与明細との差額は、この法定の金額との比較です');
}
lines.push('');
lines.push('前提: 割増率は労働基準法の最低率（時間外25%・月60時間超50%・深夜25%・法定休日35%）で計算。1時間当たりの賃金は施行規則第19条の換算方法で、算定基礎から除外できる手当は法第37条第5項・施行規則第21条の7種（実質条件を満たすものだけ）。金額の端数処理は通達（基発第150号）の50銭ルールを採用し、時間数の30分丸めは適用していない。代替休暇を取得した場合の金額調整は対象外。固定残業代のチェックは、契約で固定残業代として判別できる形で定められている前提。');
lines.push('根拠: 労働基準法第37条・同法施行規則第19条・第21条（e-Gov法令検索） https://laws.e-gov.go.jp/law/322AC0000000049、厚生労働省「確かめよう労働条件」 https://www.check-roudou.mhlw.go.jp/top.html、山口労働局「労務管理の基本的ルール」（公式計算例）');
lines.push('');
lines.push('聞きたいこと: ①この試算の前提で見落としはないか ②差額がある場合、会社への確認の進め方と、労働基準監督署・総合労働相談コーナーへの相談の目安 ③固定残業代や手当の扱いで、契約書・就業規則のどこを確認すべきか');
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
var ids = ['payType', 'baseSalary', 'includeAllowances', 'excludeAllowances',
'fixedOvertime', 'fixedOvertimeHours', 'avgHours', 'hourlyWage',
't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 'actualPaid'];
ids.forEach(function (id) { $(id).addEventListener('input', compute); $(id).addEventListener('change', compute);});
$('avgCalcBtn').addEventListener('click', function () {
var v = E.avgMonthlyHours(num('annualHolidays'), num('hoursPerDay'));
if (v > 0) { $('avgHours').value = v; compute(); }
});
$('copyPrompt').addEventListener('click', copyPrompt);
compute();
}
document.addEventListener('DOMContentLoaded', init);
})();
