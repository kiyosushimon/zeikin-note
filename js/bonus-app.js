(function () {
'use strict';
var E = window.BonusEngine;
function $(id) { return document.getElementById(id);}
function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円';}
function num(id) { var v = parseFloat($(id).value); return isNaN(v) || v < 0 ? 0 : v;}
function pct(r) { return String(r).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') + '％';}
function toast(msg) {
var t = $('toast'); t.textContent = msg; t.classList.add('show');
setTimeout(function () { t.classList.remove('show');}, 5000);
}

var DATA = null;
var last = null;

function gather() {
return {
gross: num('gross'),
prefecture: $('prefecture').value,
ageBand: $('ageBand').value,
industry: $('industry').value,
employmentInsured: $('employmentInsured').checked,
column: $('column').value,
dependents: Math.floor(num('dependents')),
prevMode: $('prevMode').value,
prevAfter: num('prevAfter'),
prevGross: $('prevMode').value === 'grossOnly' ? num('prevGrossOnly') : num('prevGross'),
prevInsurance: num('prevInsurance'),
periodOver6: $('period').value === 'over6',
cumulativeBonus: num('cumulative')
};
}

function compute() {
if (!DATA) return;
var input = gather();
$('prevAfterWrap').hidden = input.prevMode !== 'after';
$('prevGrossInsWrap').hidden = input.prevMode !== 'grossAndInsurance';
$('prevGrossOnlyWrap').hidden = input.prevMode !== 'grossOnly';
$('depWrap').hidden = input.column === 'otsu';
var r = E.compute(DATA, input);
last = { input: input, result: r };

$('net').textContent = yen(r.net);
$('dGross').textContent = yen(r.gross);
$('dHealth').textContent = yen(r.health);
$('careRow').hidden = input.ageBand !== '40to64';
$('dCare').textContent = yen(r.care);
$('dChild').textContent = yen(r.child);
$('dPension').textContent = yen(r.pension);
$('dEmployment').textContent = yen(r.employment);
$('dSocial').textContent = yen(r.socialTotal);
$('dTax').textContent = yen(r.incomeTax);

// 所得税の計算過程の説明
var ex = '';
if (r.taxMethod === 'rate') {
var ri = r.rateInfo;
var band = ri.upperYen ? yen(ri.lowerYen) + '以上' + yen(ri.upperYen) + '未満' : yen(ri.lowerYen) + '以上';
var colLabel = input.column === 'kou' ? '扶養親族等' + input.dependents + '人の列' : '乙欄';
ex = '所得税は「賞与に対する源泉徴収税額の算出率の表」で計算しました。前月の社会保険料等控除後の給与 ' + yen(r.prevAfter) +
' は、' + colLabel + 'の「' + band + '」に当たるため、率は ' + pct(ri.ratePct) + ' です。' +
'（賞与 − 社会保険料等）' + yen(r.bonusAfter) + ' × ' + pct(ri.ratePct) + ' ＝ ' + yen(r.incomeTax) + '（1円未満切り捨て）。';
} else if (r.taxMethod === 'monthly-over10') {
var m = r.monthly;
ex = '賞与（社会保険料等控除後）が前月の給与の10倍を超えるため、月額表で計算しました。' +
yen(r.bonusAfter) + ' ÷ ' + r.divisor + ' ＝ ' + yen(m.divided) + '、これに前月の給与 ' + yen(r.prevAfter) + ' を加えた ' + yen(m.combined) +
' の月額表の税額 ' + yen(m.combinedTax) + ' から、前月の給与の税額 ' + yen(m.prevTax) + ' を引いて ' + r.divisor + ' 倍した ' + yen(r.incomeTax) + ' が源泉徴収税額です。';
} else {
var m2 = r.monthly;
var reason = input.prevMode === 'none' ? '前月に給与の支払がないため' : '前月の給与が社会保険料等以下になるため';
ex = reason + '、月額表で計算しました。（賞与 − 社会保険料等）' + yen(r.bonusAfter) + ' ÷ ' + r.divisor + ' ＝ ' + yen(m2.divided) +
' を月額表に当てはめた税額 ' + yen(m2.dividedTax) + ' × ' + r.divisor + ' ＝ ' + yen(r.incomeTax) + ' が源泉徴収税額です。';
}
$('taxExplain').textContent = ex;

var notes = [];
notes.push('標準賞与額: 健康保険 ' + yen(r.standardHealth) + '／厚生年金 ' + yen(r.standardPension) + '（賞与総支給額から1,000円未満を切り捨てて計算）');
if (r.healthCapped) notes.push('健康保険の標準賞与額は、年度（4月〜翌年3月）の累計上限573万円に達するため調整されています。');
if (r.pensionCapped) notes.push('厚生年金の標準賞与額は、上限の150万円で計算しています。');
if (input.prevMode === 'grossOnly' && r.prevComputed) {
notes.push('前月の社会保険料等は、標準報酬月額 ' + yen(r.prevComputed.standard) + '（等級表 第' + r.prevComputed.grade + '級）から計算した ' + yen(r.prevComputed.total) + ' を使っています（協会けんぽ加入・前月の標準報酬月額が等級表どおり・前月に賞与の支給がないことが前提です）。');
}
if (input.ageBand !== 'under40') notes.push('介護保険料がかかるかどうかは誕生月で前後する場合があります。40歳・65歳の誕生月に当たる場合は、勤務先の計算とずれることがあります。');
if (!input.employmentInsured) notes.push('雇用保険の被保険者ではないため、雇用保険料は0円として計算しています。');
notes.push('住民税は賞与からは天引きされません（住民税の特別徴収は、6月〜翌年5月の毎月の給与から年税額の12分の1ずつを徴収する仕組みです）。賞与を含む年収全体への課税は、翌年度の住民税に反映されます。');
notes.push('所得税は源泉徴収額です。最終的な税額は年末調整・確定申告で精算されます。');
$('detailNotes').innerHTML = notes.map(function (n) { return '<li>' + n + '</li>';}).join('');
}

function buildPrompt() {
var i = last.input, r = last.result;
var lines = ['賞与の手取り計算の試算結果について相談です。', ''];
lines.push('・賞与の総支給額: ' + yen(i.gross));
lines.push('・勤務先の都道府県: ' + i.prefecture + '（協会けんぽ）');
lines.push('・年齢区分: ' + (i.ageBand === 'under40' ? '40歳未満' : i.ageBand === '40to64' ? '40〜64歳（介護保険料あり）' : '65歳以上'));
lines.push('・雇用保険: ' + (i.employmentInsured ? '被保険者（' + (i.industry === 'general' ? '一般の事業' : i.industry === 'nourin' ? '農林水産・清酒製造の事業' : '建設の事業') + '）' : '被保険者ではない'));
lines.push('・扶養控除等申告書: ' + (i.column === 'kou' ? '提出している（甲欄）・扶養親族等 ' + i.dependents + '人' : '提出していない（乙欄）'));
if (i.prevMode === 'none') lines.push('・前月の給与: 支払なし');
else lines.push('・前月の社会保険料等控除後の給与: ' + yen(r.prevAfter) + (i.prevMode === 'grossOnly' ? '（総支給額から等級表で計算した社会保険料等を差し引いて算出）' : ''));
lines.push('・手取り額: ' + yen(r.net));
lines.push('・控除の内訳: 健康保険料 ' + yen(r.health) + (i.ageBand === '40to64' ? '／介護保険料 ' + yen(r.care) : '') + '／子ども・子育て支援金 ' + yen(r.child) + '／厚生年金保険料 ' + yen(r.pension) + '／雇用保険料 ' + yen(r.employment) + '／所得税（源泉徴収） ' + yen(r.incomeTax));
lines.push('・所得税の計算方法: ' + (r.taxMethod === 'rate' ? '算出率の表（率 ' + pct(r.rateInfo.ratePct) + '）' : '月額表による特例計算'));
lines.push('');
lines.push('前提: 令和8年度に支払われる賞与。健康保険は協会けんぽ加入者前提。住民税は賞与からは天引きされません。所得税は源泉徴収額で、最終税額は年末調整・確定申告で精算されます。');
lines.push('根拠: 国税庁タックスアンサー No.2523（賞与に対する源泉徴収）、国税庁「令和8年分 源泉徴収税額表」（算出率の表・月額表）、日本年金機構（標準賞与額と上限）、協会けんぽ（令和8年度の都道府県単位保険料率）、厚生労働省（令和8年度 雇用保険料率）');
lines.push('');
lines.push('聞きたいこと: ①この試算の前提で見落としはないか ②実際の給与明細と金額が違った場合に考えられる理由 ③私の状況で注意すべき点');
lines.push('');
lines.push('※最終確認は勤務先の給与担当・税理士・社会保険労務士へお願いします。');
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
fetch('../data/kenpo/rates-2026.json').then(function (r) { return r.json();}),
fetch('../data/bonus/bonus-rate-table-2026.json').then(function (r) { return r.json();}),
fetch('../data/bonus/monthly-table-2026.json').then(function (r) { return r.json();})
]).then(function (ds) {
DATA = { kenpo: ds[0], rateTable: ds[1], monthlyTable: ds[2] };
var sel = $('prefecture');
Object.keys(ds[0].prefectures).forEach(function (name) {
var o = document.createElement('option');
o.value = name; o.textContent = name;
if (name === '東京都') o.selected = true;
sel.appendChild(o);
});
var ids = ['gross', 'prefecture', 'ageBand', 'industry', 'employmentInsured', 'column', 'dependents', 'prevMode', 'prevAfter', 'prevGross', 'prevInsurance', 'prevGrossOnly', 'period', 'cumulative'];
ids.forEach(function (id) { $(id).addEventListener('input', compute); $(id).addEventListener('change', compute);});
$('copyPrompt').addEventListener('click', copyPrompt);
compute();
}).catch(function () {
$('formError').innerHTML = '<div class="error">料率データ（data/kenpo・data/bonus）を読み込めませんでした。</div>';
});
}
document.addEventListener('DOMContentLoaded', init);
})();
