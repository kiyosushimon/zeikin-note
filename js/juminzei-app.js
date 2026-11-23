/* 住民税シミュレーター（部品C+D: 計算・非課税判定・来年の合算予測） */
(function () {
'use strict';
var CITY_FILES = [
{ file: 'nagoya', key: '名古屋市', roundingUnit: 10},
{ file: 'fukuoka', key: '福岡市', roundingUnit: 100},
{ file: 'sapporo', key: '札幌市', roundingUnit: 10},
{ file: 'sendai', key: '仙台市', roundingUnit: 10},
{ file: 'saitama', key: 'さいたま市', roundingUnit: 100},
{ file: 'niigata', key: '新潟市', roundingUnit: 100}
];
var juminCities = {}, kokuhoCities = {}, rules = null, state = { result: null, forecast: null};

function $(id) { return document.getElementById(id);}
function fmt(n) { return Math.round(n).toLocaleString('ja-JP');}
function toast(msg) {
var t = $('toast'); t.textContent = msg; t.classList.add('show');
setTimeout(function () { t.classList.remove('show');}, 2600);
}
function animateValue(el, target) {
if (!el) return;
if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(target) + '円'; return;}
var start = null;
function step(ts) {
if (start === null) start = ts;
var p = Math.min((ts - start) / 700, 1);
var eased = 1 - Math.pow(1 - p, 3);
el.textContent = fmt(Math.round(target * eased)) + '円';
if (p < 1) window.requestAnimationFrame(step);
}
window.requestAnimationFrame(step);
}
function toIncome(kind, amount, age) {
if (kind === 'salary') return KokuhoEngine.salaryIncome(amount);
if (kind === 'pension') return KokuhoEngine.pensionIncome(amount, age);
return amount;
}
function familyInput(income) {
var selfStatus = $('selfStatus').value;
var singleParentMother = selfStatus === 'single_parent_mother';
if (singleParentMother || selfStatus === 'single_parent_father') selfStatus = 'single_parent';
return {
totalIncome: income,
spouse: $('hasSpouse').value === 'yes'? { income: parseInt($('spouseIncome').value, 10) || 0, elderly: $('spouseElderly').checked}: null,
dependents: {
general: parseInt($('depGeneral').value, 10) || 0,
specific: parseInt($('depSpecific').value, 10) || 0,
elderly: parseInt($('depElderly').value, 10) || 0,
cohabiting: parseInt($('depCohabiting').value, 10) || 0,
young: parseInt($('depYoung').value, 10) || 0
},
socialInsurance: parseInt($('social').value, 10) || 0,
selfStatus: selfStatus,
singleParentMother: singleParentMother,
isMinor: $('isMinor').checked,
housingCredit: parseInt($('housing').value, 10) || 0
};
}

function calc() {
if (!rules) return;
var meta = CITY_FILES.filter(function (c) { return c.file === $('city').value;})[0];
var city = juminCities[meta.key];
if (!city) return;
var age = parseInt($('age').value, 10) || 0;
var income = toIncome($('incomeKind').value, parseInt($('incomeAmount').value, 10) || 0, age);
var r = JuminzeiEngine.compute(rules, city, familyInput(income));
state.result = { cityLabel: meta.key, income: income, r: r};

$('verdict').textContent = r.total === 0
? '住民税は非課税の見込みです。'
: meta.key + 'の住民税は年額 ' + fmt(r.total) + '円 の見込みです。';
animateValue($('total'), r.total);
$('cityTax').textContent = fmt(r.cityTax) + '円';
$('prefTax').textContent = fmt(r.prefTax) + '円';
$('forestTax').textContent = fmt(r.forestTax) + '円';
$('totalCell').textContent = fmt(r.total) + '円';
$('detail').textContent = '課税所得 ' + fmt(r.taxable) + '円（所得 ' + fmt(r.totalIncome) + '円 − 控除 ' + fmt(r.deductionTotal) + '円）。調整控除 ' + fmt(r.adjustment) + '円' +
(r.creditApplied? '、住宅ローン控除 ' + fmt(r.creditApplied) + '円': '') + ' を差し引いています。';
$('specialNote').hidden =!r.spouseSpecialApplied;

$('pcLimit').textContent = fmt(r.perCapitaLimit) + '円';
$('ilLimit').textContent = fmt(r.incomeLevyLimit) + '円';
$('pcJudge').textContent = r.perCapitaExempt? '非課税': '課税（あと ' + fmt(Math.max(0, r.totalIncome - r.perCapitaLimit)) + '円 所得が少なければ非課税）';
$('ilJudge').textContent = r.incomeLevyExempt? '非課税': '課税（あと ' + fmt(Math.max(0, r.totalIncome - r.incomeLevyLimit)) + '円 所得が少なければ非課税）';
$('ntNote').textContent = r.specialExempt
? '障害者・未成年者・寡婦・ひとり親で前年の合計所得が135万円以下のため、全て非課税です。'
: '判定は前年の合計所得金額と、同一生計配偶者・扶養親族の人数（' + r.householdSize + '人）によります。';

forecast(meta, city, age);
}

function forecast(meta, city, age) {
var kData = kokuhoCities[meta.file];
if (!kData) return;
var nextIncome = toIncome($('nextKind').value, parseInt($('nextAmount').value, 10) || 0, age + 1);
var jr = JuminzeiEngine.compute(rules, city, familyInput(nextIncome));
var fam = familyInput(nextIncome);
var members = [{ age: age + 1, income: nextIncome, judgementIncome: nextIncome, earner: nextIncome > 0, preschool: false}];
if (fam.spouse) members.push({ age: age + 1, income: fam.spouse.income, judgementIncome: fam.spouse.income, earner: fam.spouse.income > 0, preschool: false});
var depAges = [].concat(
Array(fam.dependents.general || 0).fill(30), Array(fam.dependents.specific || 0).fill(20),
Array(fam.dependents.elderly || 0).fill(75), Array(fam.dependents.cohabiting || 0).fill(75),
Array(fam.dependents.young || 0).fill(10));
depAges.forEach(function (a) { members.push({ age: a, income: 0, judgementIncome: 0, earner: false, preschool: false});});
var kr = KokuhoEngine.compute(kData, { roundingUnit: meta.roundingUnit}, { members: members, householdType: 'normal'});
state.forecast = { kokuho: kr.total, jumin: jr.total};
$('fcKokuho').textContent = fmt(kr.total) + '円';
$('fcJumin').textContent = fmt(jr.total) + '円';
$('fcTotal').textContent = fmt(kr.total + jr.total) + '円';
}

function buildPrompt() {
var s = state.result; if (!s) return '';
var r = s.r;
var lines = [
'住民税について相談です。前年の所得から住民税を試算しました。',
'',
'',
'・住まい: ' + s.cityLabel,
'・前年の合計所得金額: ' + fmt(r.totalIncome) + '円',
'・課税所得: ' + fmt(r.taxable) + '円',
'',
'',
'・住民税 合計: ' + fmt(r.total) + '円（市民税 ' + fmt(r.cityTax) + '円＋県民税 ' + fmt(r.prefTax) + '円＋森林環境税 ' + fmt(r.forestTax) + '円）',
'・均等割の非課税ライン: 所得 ' + fmt(r.perCapitaLimit) + '円以下（判定: ' + (r.perCapitaExempt? '非課税': '課税') + '）',
'・所得割の非課税ライン: 所得 ' + fmt(r.incomeLevyLimit) + '円以下（判定: ' + (r.incomeLevyExempt? '非課税': '課税') + '）'
];
if (state.forecast) {
lines.push('・来年の請求予測: 国保 ' + fmt(state.forecast.kokuho) + '円＋住民税 ' + fmt(state.forecast.jumin) + '円＝合計 ' + fmt(state.forecast.kokuho + state.forecast.jumin) + '円');
}
lines.push(
'',
'',
'・令和8年度の税率・控除で計算。生命保険料控除・医療費控除・寄附金税額控除は未反映',
'',
'',
'1. この試算で見落としている控除や前提はありますか？',
'2. 非課税ラインに近い場合、気をつける点は？',
'3. 支払い方法（普通徴収・特別徴収）で注意すべき点は？',
'',
'※最終確認は、お住まいの自治体の税務窓口で行います。'
);
return lines.join('\n');
}

function init() {
var sel = $('city');
CITY_FILES.forEach(function (c) {
var o = document.createElement('option'); o.value = c.file; o.textContent = c.key; sel.appendChild(o);
});
sel.value = 'niigata';
var jobs = [
fetch('/data/juminzei/rules.json').then(function (r) { return r.json();}).then(function (j) { rules = j;}),
fetch('/data/juminzei/cities.json').then(function (r) { return r.json();}).then(function (j) {
j.cities.forEach(function (c) { juminCities[c.city] = c;});
})
];
CITY_FILES.forEach(function (c) {
jobs.push(fetch('/data/kokuho/' + c.file + '.json').then(function (r) { return r.json();}).then(function (j) { kokuhoCities[c.file] = j;}));
});
Promise.all(jobs).then(calc);
document.querySelectorAll('input, select').forEach(function (el) {
el.addEventListener('input', calc); el.addEventListener('change', calc);
});
$('hasSpouse').addEventListener('change', function () {
var yes = $('hasSpouse').value === 'yes';
$('spouseIncomeWrap').style.display = yes? '': 'none';
$('spouseElderlyWrap').style.display = yes? '': 'none';
});
$('copyPrompt').addEventListener('click', function () {
var text = buildPrompt(); if (!text) return;
function done() { toast('コピーしました。お使いのAIに貼ってください');}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(done, function () { fallback();});
} else { fallback();}
function fallback() {
var ta = document.createElement('textarea');
ta.value = text; document.body.appendChild(ta); ta.select();
try { document.execCommand('copy'); done();} catch (e) { toast('コピーできませんでした');}
document.body.removeChild(ta);
}
});
}
document.addEventListener('DOMContentLoaded', init);
})();
