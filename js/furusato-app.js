(function () {
'use strict';
var E = window.FurusatoEngine;
function $(id) { return document.getElementById(id);}
function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円';}
function num(id) { var v = parseFloat($(id).value); return isNaN(v) || v < 0? 0: v;}
function toast(msg) {
var t = $('toast'); t.textContent = msg; t.classList.add('show');
setTimeout(function () { t.classList.remove('show');}, 5000);
}

var lastSimple = null, lastBreak = null, lastDetail = null;

function computeSimple() {
var socialMode = $('socialMode').value;
var input = {
revenue: num('revenue'),
hasSpouse: $('hasSpouse').value === 'yes',
depGeneral: num('depGeneral'),
depSpecific: num('depSpecific'),
socialInsurance: socialMode === 'actual'? num('socialActual'): null,
medicalDeduction: num('medical'),
housingCreditAmount: num('housingAmount'),
housingEra: $('housingEra').value || null,
otherDonations: num('otherDonations')
};
$('socialActualWrap').hidden = socialMode!== 'actual';
var r = E.computeSimple(input);
lastSimple = { input: input, result: r};

$('limit').textContent = yen(r.limit);
$('levy').textContent = yen(r.residentLevy);
$('rate').textContent = (r.rateForTokurei * 100).toFixed(0) + '％';
$('formula').textContent = '上限 ＝ 所得割額 ' + yen(r.residentLevy) + ' × 20％ ÷（90％ − ' + (r.rateForTokurei * 100).toFixed(0) + '％ × 1.021）＋ 2,000円';

var notes = [];
if (input.socialInsurance == null) notes.push('社会保険料は給与収入の15％と仮定しています（総務省の目安表と同じ前提）。');
if (r.aboveVerified) notes.push('この収入帯では、総務省の目安表の値が本ツールの簡易計算と一致しないことが照合で分かっています（目安表の方が高い側に出ます）。目安表の値も併せてご確認ください。');
else if (!r.verifiedRange) notes.push('総務省の目安表と照合済みの範囲は給与収入300万〜700万円です。この範囲外では目安としてご利用ください。');
if (input.medicalDeduction > 0) {
var noMed = E.computeSimple(Object.assign({}, input, { medicalDeduction: 0}));
notes.push('医療費控除により、上限は控除なしの場合（' + yen(noMed.limit) + '）から ' + yen(noMed.limit - r.limit) + ' 下がっています。');
if ($('method').value === 'onestop') notes.push('注意: 医療費控除を受けるには確定申告が必要です。確定申告をすると、ワンストップ特例の申請は無効になり、寄附金控除も確定申告で申告し直す必要があります。');
}
if (r.housing) {
notes.push('住宅ローン控除: 所得税から ' + yen(r.housing.usedInIncomeTax) + ' を控除し、住民税へ ' + yen(r.housing.carryToResident) + ' が繰り越されます。上限額そのものは住宅ローン控除の影響を受けません。');
}
$('simpleNotes').innerHTML = notes.map(function (n) { return '<li>' + n + '</li>';}).join('');

computeBreakdown();
}

function computeBreakdown() {
if (!lastSimple) return;
var P = num('donation');
var wrap = $('breakWrap');
if (P <= 2000) { wrap.hidden = true; lastBreak = null; return;}
var onestop = $('method').value === 'onestop';
var b = E.computeBreakdown(lastSimple.result, P, onestop);
lastBreak = b;
wrap.hidden = false;
$('bdIncomeTaxRow').hidden = onestop;
$('bdShinseiRow').hidden =!onestop;
$('bdIncomeTax').textContent = yen(b.incomeTaxCut);
$('bdBasic').textContent = yen(b.basicCut);
$('bdTokurei').textContent = yen(b.tokureiCut);
$('bdShinsei').textContent = yen(b.shinseiCut);
$('bdSelfPay').textContent = yen(b.selfPay);
var warn = $('bdWarn');
var warns = [];
if (b.overflow > 0) {
warns.push('住宅ローン控除などの影響で、住民税から ' + yen(b.overflow) + ' が控除しきれません。その分、実質自己負担が増えます。');
}
var other = num('otherDonations');
var frameRT = Math.floor(lastSimple.result.salaryIncome * 0.30);
if (other > 0 && P + other > frameRT) {
warns.push('ふるさと納税以外の寄附と合わせると、住民税の寄附金控除の対象枠（総所得金額等の30％＝約 ' + yen(frameRT) + '）を超えています。超えた分は控除の対象になりません。');
}
if (warns.length) { warn.hidden = false; warn.textContent = warns.join(' '); }
else warn.hidden = true;
}

function computeDetail() {
var levy = num('dLevy');
var rateSel = parseFloat($('dRate').value);
var d = E.computeDetail({ residentLevy: levy, marginalRate: rateSel, housingResidentCredit: num('dHousing')});
lastDetail = d;
$('dLimit').textContent = levy > 0? yen(d.limit): '— 円';
}

function buildPrompt() {
var lines = ['ふるさと納税の上限額の試算結果について相談です。', ''];
if (lastDetail && num('dLevy') > 0 && document.querySelector('details.detail-mode').open) {
lines.push('');
lines.push('・住民税所得割額（調整控除後）: ' + yen(num('dLevy')));
lines.push('・所得税の限界税率: ' + ($('dRate').value * 100) + '％');
lines.push('・上限額の目安: ' + yen(lastDetail.limit));
} else if (lastSimple) {
var i = lastSimple.input, r = lastSimple.result;
lines.push('');
lines.push('・給与収入: ' + yen(i.revenue));
lines.push('・配偶者: ' + (i.hasSpouse? 'あり（控除対象）': 'なし'));
lines.push('・扶養親族: 一般 ' + i.depGeneral + '人／特定（19〜22歳） ' + i.depSpecific + '人');
lines.push('・社会保険料: ' + (i.socialInsurance == null? '収入の15％と仮定': yen(i.socialInsurance)));
if (i.medicalDeduction > 0) lines.push('・医療費控除額: ' + yen(i.medicalDeduction));
if (i.housingCreditAmount > 0) lines.push('・住宅ローン控除可能額: ' + yen(i.housingCreditAmount));
lines.push('・住民税所得割額（調整控除後・推定）: ' + yen(r.residentLevy));
lines.push('・上限額の目安（自己負担2,000円で収まる寄附額）: ' + yen(r.limit));
if (lastBreak) {
lines.push('・寄附予定額 ' + yen(lastBreak.donation) + ' の場合の実質自己負担: ' + yen(lastBreak.selfPay));
}
}
lines.push('');
lines.push('簡易モデルは総務省の目安表と同じ前提（社会保険料＝収入の15％仮定など）で、目安表と照合済みの範囲は給与収入300万〜700万円です。上限額は翌年度の住民税に基づく目安で、確定額ではありません。');
lines.push('総務省ふるさと納税ポータル「税金の控除について」、国税庁タックスアンサー No.1155（寄附金控除）、No.1120（医療費控除）');
lines.push('');
lines.push('聞きたいこと: ①この試算の前提で見落としはないか ②上限額を超えて寄附した場合の自己負担の増え方 ③私の状況で注意すべき点');
lines.push('');
lines.push('※最終確認は税理士・お住まいの市区町村の住民税担当窓口へお願いします。');
return lines.join('\n');
}

function copyPrompt() {
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
var ids = ['revenue', 'hasSpouse', 'depGeneral', 'depSpecific', 'socialMode', 'socialActual', 'medical', 'housingAmount', 'housingEra', 'otherDonations', 'method', 'donation'];
ids.forEach(function (id) { $(id).addEventListener('input', computeSimple); $(id).addEventListener('change', computeSimple);});
['dLevy', 'dRate', 'dHousing'].forEach(function (id) { $(id).addEventListener('input', computeDetail); $(id).addEventListener('change', computeDetail);});
$('copyPrompt').addEventListener('click', copyPrompt);
computeSimple();
computeDetail();
}
document.addEventListener('DOMContentLoaded', init);
})();
