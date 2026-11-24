(function () {
'use strict';
var E = window.GensenEngine;
var TABLE = null;
function $(id) { return document.getElementById(id);}
function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円';}
function num(id) { var v = parseFloat($(id).value); return isNaN(v) || v < 0 ? 0 : v;}
function raw(id) { return $(id).value.trim();}
function toast(msg) {
var t = $('toast'); t.textContent = msg; t.classList.add('show');
setTimeout(function () { t.classList.remove('show');}, 5000);
}

var last = null;

var COLUMN_LABEL = { kou: '甲欄（扶養控除等申告書を提出）', otsu: '乙欄（扶養控除等申告書を提出していない）' };

/* 扶養親族等の数: 合計の直接入力があればそれを優先し、なければ内訳の合計 */
function dependentsTotal() {
if (raw('depTotal') !== '') return num('depTotal');
return ($('spouse').value === '1' ? 1 : 0) + num('relatives') + num('additions');
}

function gather() {
return {
payMonth: parseInt($('payMonth').value, 10),
mode: $('mode').value,
afterDirect: num('afterDirect'),
gross: num('gross'),
commute: num('commute'),
insurance: num('insurance'),
column: $('column').value,
spouse: $('spouse').value === '1' ? 1 : 0,
relatives: num('relatives'),
additions: num('additions'),
depDirect: raw('depTotal') === '' ? null : num('depTotal'),
dependents: dependentsTotal(),
statementTax: raw('statementTax') === '' ? null : num('statementTax')
};
}

function zoneText(r) {
if (r.zone === 'table') {
return '月額表「' + r.row.min.toLocaleString('ja-JP') + '円以上' + r.row.max.toLocaleString('ja-JP') + '円未満」の行';
}
if (r.zone === 'over') {
return '算式（基準税額 ' + yen(r.segment.baseTax) + ' ＋ ' + r.segment.from.toLocaleString('ja-JP') + '円を超える金額 × ' + (Math.round(r.segment.rate * 100000) / 1000).toLocaleString('ja-JP') + '%、1円未満切り捨て）';
}
return r.column === 'kou'
? '105,000円未満（甲欄は税額0円）'
: '105,000円未満（金額 × 3.063%、1円未満切り捨て）';
}

function compute() {
var input = gather();
$('directGroup').style.display = input.mode === 'direct' ? '' : 'none';
$('grossGroup').style.display = input.mode === 'gross' ? '' : 'none';
$('kouGroup').style.display = input.column === 'kou' ? '' : 'none';
var isDec = input.payMonth === 12;
$('decNote').style.display = isDec ? '' : 'none';
$('guideNov').style.display = isDec ? 'none' : '';
$('guideDec').style.display = isDec ? '' : 'none';
$('depTotalDisplay').textContent = input.dependents.toLocaleString('ja-JP');
if (!TABLE) return;

var r = E.compute(TABLE, input);
last = { input: input, result: r };
render(input, r);
}

function render(input, r) {
$('totalBig').textContent = yen(r.tax);

var rows = [];
if (r.mode === 'gross') {
rows.push(['その月の給与の総支給額', yen(r.gross)]);
if (r.commute > 0) rows.push(['非課税の通勤手当', '− ' + yen(r.commute)]);
rows.push(['給与等の金額', yen(r.salaryAmount)]);
rows.push(['社会保険料等', '− ' + yen(r.insurance)]);
}
rows.push(['社会保険料等控除後の給与等の金額', yen(Math.max(0, r.afterAmount))]);
rows.push(['当てはめた区分', zoneText(r)]);
if (r.column === 'kou' && r.dependents > 7) {
rows.push(['扶養親族等の数が7人の場合の税額', yen(r.taxAt7)]);
rows.push(['7人を超える分の控除（1,610円 × ' + (r.dependents - 7) + '人）', '− ' + yen(r.over7Deduction)]);
}
rows.push(['源泉徴収税額（税額表）', yen(r.tax)]);
$('resultRows').innerHTML = rows.map(function (row) {
var strong = row[0] === '源泉徴収税額（税額表）';
return '<tr' + (strong ? ' class="total-row"' : '') + '><td>' + row[0] + '</td><td>' + row[1] + '</td></tr>';
}).join('');

/* 明細との差額 */
var diffHtml = '';
if (r.diff) {
if (r.diff.diff > 0) {
diffHtml = '<p>給与明細の源泉徴収税額（' + yen(r.diff.statementTax) + '）と比べると、<strong>税額表の額の方が ' + yen(r.diff.diff) + ' 多い計算です</strong>。</p>';
} else if (r.diff.diff < 0) {
diffHtml = '<p>給与明細の源泉徴収税額（' + yen(r.diff.statementTax) + '）と比べると、<strong>明細の額の方が ' + yen(-r.diff.diff) + ' 多い計算です</strong>。</p>';
} else {
diffHtml = '<p>給与明細の源泉徴収税額（' + yen(r.diff.statementTax) + '）は、<strong>税額表の額と一致しています</strong>。</p>';
}
diffHtml += '<p class="note">勤務先が「電算機計算の特例」（給与計算ソフトによる算式方式）で計算している場合は、税額表の額と数十円程度異なることがあります（国税庁の公式設例と同じ条件で比べると30円の差でした）。差があることだけで誤りとは断定できません。気になる場合は、まず勤務先の給与担当に計算方法を確認してください。</p>';
}
$('diffResult').innerHTML = diffHtml;

var notes = [];
if (r.nonPositive) notes.push('社会保険料等が給与等の金額以上だったため、税額表に当てはめる金額がなく、税額は0円として表示しています。');
notes.push('税額表の税額には、所得税と復興特別所得税の両方が含まれています。');
notes.push('この額は「その月」の源泉徴収税額です。1年分の所得税額は、年末調整または確定申告で精算されます。');
if (input.payMonth === 12) notes.push('12月に支払われる給与については、通常、その支払いの際に年末調整で1年分の税額との精算が行われます。');
$('resultNotes').innerHTML = notes.map(function (n) { return '<li>' + n + '</li>';}).join('');
}

function buildPrompt() {
var i = last.input, r = last.result;
var lines = ['源泉徴収税額チェッカーの試算結果について相談です。', ''];
lines.push('・給与の支払月: 令和8年' + i.payMonth + '月');
if (i.mode === 'gross') {
lines.push('・その月の給与の総支給額: ' + yen(i.gross) + '／非課税の通勤手当: ' + yen(i.commute) + '／社会保険料等: ' + yen(i.insurance));
} else {
lines.push('・社会保険料等控除後の給与等の金額（直接入力）: ' + yen(i.afterDirect));
}
lines.push('・税額表の欄: ' + COLUMN_LABEL[i.column]);
if (i.column === 'kou') {
if (i.depDirect !== null) {
lines.push('・扶養親族等の数: ' + i.dependents + '人（合計を直接入力）');
} else {
lines.push('・扶養親族等の数: ' + i.dependents + '人（源泉控除対象配偶者 ' + i.spouse + '人＋源泉控除対象親族 ' + i.relatives + '人＋障害者等の加算 ' + i.additions + '人）');
}
}
lines.push('');
lines.push('・社会保険料等控除後の給与等の金額: ' + yen(Math.max(0, r.afterAmount)));
lines.push('・当てはめた区分: ' + zoneText(r));
lines.push('・源泉徴収税額（税額表）: ' + yen(r.tax));
if (r.diff) lines.push('・給与明細の源泉徴収税額: ' + yen(r.diff.statementTax) + '（税額表との差額 ' + yen(r.diff.diff) + '）');
lines.push('');
lines.push('【計算過程】');
if (i.mode === 'gross') lines.push('・控除後の金額: 総支給額 ' + yen(i.gross) + ' − 非課税の通勤手当 ' + yen(i.commute) + ' − 社会保険料等 ' + yen(i.insurance) + ' ＝ ' + yen(Math.max(0, r.afterAmount)));
if (r.zone === 'table') {
lines.push('・月額表の当てはめ: 控除後の金額が入る行（' + r.row.min.toLocaleString('ja-JP') + '円以上' + r.row.max.toLocaleString('ja-JP') + '円未満）・' + COLUMN_LABEL[i.column] + (i.column === 'kou' ? '・扶養親族等の数 ' + i.dependents + '人' : '') + ' の税額 ＝ ' + yen(r.tax));
if (r.over7Deduction > 0) lines.push('・扶養親族等の数が7人を超える分: 7人の場合の税額 ' + yen(r.taxAt7) + ' − 1人につき1,610円の控除 ' + yen(r.over7Deduction) + ' ＝ ' + yen(r.tax));
} else if (r.zone === 'over') {
lines.push('・算式による計算: 基準税額 ' + yen(r.segment.baseTax) + ' ＋（控除後の金額 − ' + yen(r.segment.from) + '）× ' + (Math.round(r.segment.rate * 100000) / 1000) + '% ＝ ' + yen(r.tax) + '（1円未満切り捨て）');
} else {
lines.push(i.column === 'kou' ? '・控除後の金額が105,000円未満のため、甲欄の税額は0円' : '・控除後の金額が105,000円未満のため、乙欄は 控除後の金額 × 3.063% ＝ ' + yen(r.tax) + '（1円未満切り捨て）');
}
lines.push('');
lines.push('前提: 国税庁の源泉徴収税額表（月額表・令和8年分）だけで計算しており、電算機計算の特例（給与計算ソフトの算式方式）による計算は対象外。そのため、会社が特例で計算している場合は明細と数十円程度ずれることがある。扶養親族等の数は扶養控除等申告書に記載された内容に基づく数（障害者等の加算込み）。' + (i.payMonth === 12 ? '12月支払分は、令和8年12月1日以後に支払う給与から適用される改正後の所得要件（扶養親族は所得62万円以下）で数える前提。' : '11月30日以前に支払う給与は、改正前の所得要件（扶養親族は所得58万円以下）で数える前提。'));
lines.push('根拠: 国税庁「給与所得の源泉徴収税額の求め方」（令和8年分 源泉徴収税額表）https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2026/data/19-22.pdf ／国税庁「令和8年度税制改正（所得税の基礎控除の引上げ等関係）Q&A」https://www.nta.go.jp/users/gensen/2026kiso/pdf/0026005-024.pdf');
lines.push('');
lines.push('聞きたいこと: ①この試算の前提で見落としはないか ②明細の税額と差がある場合、会社への確認の進め方 ③扶養親族等の数の数え方で間違えやすい点');
lines.push('');
lines.push('※最終確認は勤務先の給与担当・税務署・税理士へお願いします。');
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
fetch('../data/bonus/monthly-table-2026.json').then(function (r) { return r.json();}).then(function (t) {
TABLE = t;
var ids = ['payMonth', 'mode', 'afterDirect', 'gross', 'commute', 'insurance',
'column', 'spouse', 'relatives', 'additions', 'depTotal', 'statementTax'];
ids.forEach(function (id) { $(id).addEventListener('input', compute); $(id).addEventListener('change', compute);});
$('copyPrompt').addEventListener('click', copyPrompt);
compute();
}).catch(function () {
$('formError').innerHTML = '<div class="error">税額表データ（data/bonus/monthly-table-2026.json）を読み込めませんでした。</div>';
});
}
document.addEventListener('DOMContentLoaded', init);
})();
