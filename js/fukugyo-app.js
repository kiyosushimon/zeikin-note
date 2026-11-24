(function () {
'use strict';
var E = window.FukugyoEngine;
var DATA = null;
function $(id) { return document.getElementById(id);}
function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円';}
function num(id) { var v = parseFloat($(id).value); return isNaN(v) || v < 0 ? 0 : v;}
function raw(id) { return $(id).value.trim();}
function toast(msg) {
var t = $('toast'); t.textContent = msg; t.classList.add('show');
setTimeout(function () { t.classList.remove('show');}, 5000);
}

var last = null;

function gather() {
return {
mainIncome: num('mainIncome'),
prefecture: $('prefecture').value,
ageBand: $('ageBand').value,
industry: $('industry').value,
bonusPer: num('bonusPer'),
bonusCount: Math.floor(num('bonusCount')),
socialOverride: raw('socialOverride') === '' ? null : num('socialOverride'),
sideType: $('sideType').value,
sideRevenue: num('sideRevenue'),
sideExpenses: num('sideExpenses'),
sideCategory: $('sideCategory').value,
sideWithholding: raw('sideWithholding') === '' ? null : num('sideWithholding'),
sideSalaryIncome: num('sideSalaryIncome'),
sideYearEndAdjusted: $('sideYearEndAdjusted').value === 'yes',
willFile: $('willFile').value === 'yes'
};
}

function compute() {
var input = gather();
$('nonsalaryGroup').style.display = input.sideType === 'nonsalary' ? '' : 'none';
$('salaryGroup').style.display = input.sideType === 'salary' ? '' : 'none';
$('categoryGuide').style.display =
(input.sideType === 'nonsalary' && input.sideCategory === 'unknown') ? '' : 'none';
if (!DATA) return;
var r = E.compute(DATA, input);
last = { input: input, result: r };
render(input, r);
}

var FILING_TEXT = {
'over-2000man': ['確定申告が 必要です', '本業の給与収入が2,000万円を超えるためです（年末調整の対象外）。副業の有無にかかわらず確定申告が必要です。'],
'side-over-200k': ['確定申告が 必要です', '副業所得が20万円を超えるためです。20万円ルールは「所得」（収入 − 経費）で判定します。'],
'salary-over-200k': ['確定申告が 必要です', '年末調整されなかった副業先の給与収入金額が20万円を超えるためです（2か所給与）。'],
'will-file': ['確定申告をします（副業所得も含めて申告）', '医療費控除・寄附金控除（ふるさと納税）・住宅ローン控除（初年度）などで確定申告をする場合は、20万円以下の副業所得も含めて申告する必要があります。'],
'side-within-200k': ['確定申告は 不要です', '副業所得が20万円以下のためです（所得税法第121条）。この場合、追加の所得税は課税されません。'],
'salary-within-200k': ['確定申告は 不要です', '年末調整されなかった副業先の給与収入金額が20万円以下のためです。'],
'salary-150-test': ['確定申告は 不要です', '給与収入金額の合計から所得控除（社会保険料控除など。雑損・医療費・寄附金・基礎控除を除く）を差し引いた金額が150万円以下のためです（国税庁の案内の注記による判定）。']
};
var RESIDENT_TEXT = {
'covered-by-filing': ['住民税の申告は 別途不要です', '所得税の確定申告をすると、その申告が住民税の申告を兼ねます（確定申告書が提出された日に住民税の申告書が提出されたものとみなされます）。'],
'salary-report': ['住民税の申告は 不要です', '本業・副業先の勤務先が給与支払報告書を市区町村へ提出するためです（副業先が提出していることが前提です）。'],
'resident-only': ['住民税の申告が 必要です（原則）', '住民税には所得税の20万円以下の申告不要の制度がありません。給与以外の所得がある場合は、金額の多寡にかかわらず申告が必要です。お住まいの市区町村の基準によっては申告が不要になる場合があります。']
};

function render(input, r) {
if (r.errors.length) {
$('formError').innerHTML = '<div class="error">' + r.errors.join('<br>') + '</div>';
$('scopeGuide').innerHTML = '';
$('verdicts').innerHTML = '';
$('totalBig').textContent = '— 円';
$('resultRows').innerHTML = '';
$('settlementResult').innerHTML = '';
$('resultNotes').innerHTML = '';
return;
}
$('formError').innerHTML = '';

if (r.outOfScope) {
$('scopeGuide').innerHTML = '<div class="error">その他の所得（不動産・株・暗号資産など）は、このツールでは判定できません。所得の種類ごとに申告の扱いが異なります。住民税の計算は<a href="../juminzei/">住民税シミュレーター</a>、給与の精算は<a href="../nencho/">年末調整・還付シミュレーター</a>もあわせてご確認ください。</div>';
$('verdicts').innerHTML = '';
$('totalBig').textContent = '— 円';
$('resultRows').innerHTML = '';
$('settlementResult').innerHTML = '';
$('resultNotes').innerHTML = '';
return;
}
$('scopeGuide').innerHTML = '';

var ft = FILING_TEXT[r.filing.code];
var rt = RESIDENT_TEXT[r.residentFiling.code];
$('verdicts').innerHTML =
'<h3 class="subhead">所得税の確定申告</h3><p class="verdict">' + ft[0] + '</p><p class="note">' + ft[1] + '</p>' +
'<h3 class="subhead">住民税の申告</h3><p class="verdict">' + rt[0] + '</p><p class="note">' + rt[1] + '</p>';

var settle = r.incomeTax.meaning === 'settle';
if (settle) {
$('bigLabel').textContent = '副業による追加税額の目安（所得税＋住民税）';
$('totalBig').textContent = yen(r.totalDiff);
} else {
$('bigLabel').textContent = '副業で実際に増える税金（住民税）';
$('totalBig').textContent = yen(r.residentTax.diff);
}

var rows = [];
if (r.sideType === 'nonsalary') {
rows.push(['副業所得（収入 − 必要経費）', yen(r.sideIncome)]);
} else {
rows.push(['副業先の給与収入金額', yen(r.sideSalaryIncome)]);
rows.push(['合算後の給与所得（本業＋副業）', yen(r.incomeTax.with.salaryAfter)]);
}
rows.push(['本業のみの場合の所得税（年額）', yen(r.incomeTax.without.annualTax)]);
rows.push(['副業込みの場合の所得税（年額）', yen(r.incomeTax.with.annualTax)]);
if (settle) {
rows.push(['追加の所得税（確定申告で精算される目安）', yen(r.incomeTax.diff)]);
} else {
rows.push(['追加の所得税（課税されません。申告する場合の参考値）', yen(r.incomeTax.diff)]);
}
rows.push(['本業のみの場合の住民税（年額・目安）', yen(r.residentTax.without.tax)]);
rows.push(['副業込みの場合の住民税（翌年度・目安）', yen(r.residentTax.with.tax)]);
rows.push(['追加の住民税（翌年度に課税される目安）', yen(r.residentTax.diff)]);
if (settle) {
rows.push(['追加税額の合計（目安）', yen(r.totalDiff)]);
}
$('resultRows').innerHTML = rows.map(function (row) {
var strong = row[0].indexOf('追加') === 0;
return '<tr' + (strong ? ' class="total-row"' : '') + '><td>' + row[0] + '</td><td>' + row[1] + '</td></tr>';
}).join('');

var sHtml = '';
if (r.settlement) {
var s = r.settlement;
sHtml = '<h3 class="subhead">確定申告での精算の目安</h3>';
sHtml += '<p>追加の所得税 ' + yen(r.incomeTax.diff) + ' に対して、副業の報酬から源泉徴収済みの額 ' + yen(s.withholding) + ' があるため、確定申告での精算は ';
if (s.isRefund) {
sHtml += '<strong>約 ' + yen(-s.amount) + ' の還付</strong> の目安です。</p>';
} else {
sHtml += '<strong>約 ' + yen(s.amount) + ' の納付</strong> の目安です。</p>';
}
sHtml += '<p class="note">源泉徴収済みの額は、支払者から交付された支払調書の写し・支払明細・請求書などで確認してください。支払調書は税務署へ提出する書類で、受け取る側への交付は法律上の義務ではないため、手元にない場合は支払明細や入金額（源泉徴収前の金額との差）から確認します。報酬・料金等の源泉徴収税率は原則10.21%です（国税庁 No.2792）。</p>';
}
$('settlementResult').innerHTML = sHtml;

var notes = [];
notes.push('所得税の追加分は、確定申告をする場合に翌年2月16日〜3月15日の申告で精算されます。住民税の追加分は翌年度分として課税され、翌年6月以降に納めます（給与天引きの場合は翌年6月〜翌々年5月に上乗せ、自分で納める場合は納付書で年4期）。');
if (r.filing.status !== 'not-required') {
notes.push('ふるさと納税のワンストップ特例を使っている方が確定申告をすると、ワンストップ特例の申請は無効になり、寄附分もすべて確定申告で手続きする必要があります。');
}
notes.push('副業分の住民税は、申告のときに「自分で納付」を選ぶと、給与以外の所得の分を自分で納める方法（普通徴収）が制度上あります。ただし、副業が給与の場合は対象になりません。また、自治体によって取扱いが異なり、近年、変更している自治体もあります。実際にどうなるかは、お住まいの市区町村の案内で確認してください。');
if (!r.social.fromInput && r.social.monthlyGross !== null) {
notes.push('社会保険料は、本業の月給の目安 ' + yen(r.social.monthlyGross) + ' から当てはめた標準報酬月額で自動計算しています。源泉徴収票の「社会保険料等の金額」を入力すると、その額で計算し直します。');
}
if (input.sideWithholding !== null && !r.settlement) {
notes.push('源泉徴収済みの額が入力されていますが、所得税の確定申告が不要なため、精算の目安は表示していません（申告しない場合、追加の所得税は課税されません）。');
}
notes.push('追加税額は、単身者・控除は社会保険料と基礎控除のみの標準ケースの目安です。配偶者控除・扶養控除・生命保険料控除・医療費控除等がある場合、実際の額はこの結果と異なります。住民税は標準税率（所得割10%）・1級地の計算です。精密な住民税額は住民税シミュレーター（対応6市）で確認できます。');
$('resultNotes').innerHTML = notes.map(function (n) { return '<li>' + n + '</li>';}).join('');
}

function buildPrompt() {
var i = last.input, r = last.result;
var lines = ['副業の税金・申告要否チェッカーの試算結果について相談です。', ''];
lines.push('・本業の年収（総支給額）: ' + yen(i.mainIncome) + '／勤務地: ' + i.prefecture);
if (i.sideType === 'nonsalary') {
lines.push('・副業（給与以外）: 収入 ' + yen(i.sideRevenue) + '／必要経費 ' + yen(i.sideExpenses) + ' → 副業所得 ' + yen(r.sideIncome));
} else if (i.sideType === 'salary') {
lines.push('・副業（給与）: 副業先の給与収入金額 ' + yen(i.sideSalaryIncome) + '／副業先の年末調整: ' + (i.sideYearEndAdjusted ? '受けた' : '受けていない'));
}
lines.push('・所得税の確定申告: ' + FILING_TEXT[r.filing.code][0]);
lines.push('・住民税の申告: ' + RESIDENT_TEXT[r.residentFiling.code][0]);
lines.push('・追加の所得税（目安）: ' + yen(r.incomeTax.diff) + (r.incomeTax.meaning === 'reference' ? '（申告しない場合は課税されない参考値）' : ''));
lines.push('・追加の住民税（翌年度・目安）: ' + yen(r.residentTax.diff));
if (r.settlement) {
lines.push('・源泉徴収済みの額: ' + yen(r.settlement.withholding) + '／精算の目安: ' + (r.settlement.isRefund ? '約 ' + yen(-r.settlement.amount) + ' の還付' : '約 ' + yen(r.settlement.amount) + ' の納付'));
}
lines.push('');
lines.push('【計算過程】');
/* 申告要否の行は、エンジンの判定分岐（filing.code）と結論が一致するよう出し分ける */
var filingLine;
if (r.filing.code === 'over-2000man') {
filingLine = '・所得税の申告要否の判定: 本業の給与収入が2,000万円を超えるため、副業の金額にかかわらず確定申告が必要（年末調整の対象外のため）';
} else if (r.filing.code === 'will-file') {
filingLine = '・所得税の申告要否の判定: 医療費控除・寄附金控除などで確定申告をする場合は、20万円以下の副業所得も含めて申告する必要があるため、副業分も含めて申告する';
} else if (i.sideType === 'nonsalary') {
filingLine = '・所得税の申告要否の判定: 副業所得 ' + yen(r.sideIncome) + ' が20万円を' + (r.sideIncome > 200000 ? '超えるため、確定申告が必要' : '超えないため、所得税の確定申告は不要（20万円ルール。住民税の申告は別に必要）');
} else {
filingLine = '・所得税の申告要否の判定: 副業先の給与収入 ' + yen(i.sideSalaryIncome) + '（年末調整を' + (i.sideYearEndAdjusted ? '受けた' : '受けていない') + '）をもとに、国税庁タックスアンサー No.1900の基準（年末調整を受けていない給与の収入金額が20万円を超えるか等）で判定';
}
lines.push(filingLine);
if (i.sideType === 'nonsalary') {
lines.push('・副業所得: 収入 ' + yen(i.sideRevenue) + ' − 必要経費 ' + yen(i.sideExpenses) + ' ＝ ' + yen(r.sideIncome) + '（マイナスの場合は0）');
}
lines.push('・追加の所得税（差分方式）: 副業なしの年税額 ' + yen(r.incomeTax.without.annualTax) + ' → 副業あり ' + yen(r.incomeTax.with.annualTax) + '、差額 ' + yen(r.incomeTax.diff) + '。各ケースとも、給与所得から社会保険料控除と基礎控除（副業なし ' + yen(r.incomeTax.without.basic) + '／副業あり ' + yen(r.incomeTax.with.basic) + '）を引き、課税所得（副業あり ' + yen(r.incomeTax.with.taxable) + '、1,000円未満切り捨て）に速算表を適用し ×1.021（復興特別所得税）で計算');
lines.push('・追加の住民税（差分方式）: 副業なし ' + yen(r.residentTax.without.tax) + ' → 副業あり ' + yen(r.residentTax.with.tax) + '、差額 ' + yen(r.residentTax.diff) + '（所得割10%＋均等割＋森林環境税、100円未満切り捨て）');
if (r.settlement) lines.push('・精算の目安: 追加の所得税 ' + yen(r.incomeTax.diff) + ' − 源泉徴収済み ' + yen(r.settlement.withholding) + ' ＝ ' + (r.settlement.isRefund ? '還付の目安 ' + yen(-r.settlement.amount) : '納付の目安 ' + yen(r.settlement.amount)));
lines.push('');
lines.push('前提: 判定は所得税法第121条と国税庁タックスアンサー No.1900（令和8年分）による。20万円ルールは所得税だけの制度で住民税にはない。追加税額は副業なし／ありの差分方式で、単身者・控除は社会保険料と基礎控除のみの標準ケースの目安。住民税は標準税率（所得割10%）・1級地。所得区分（雑所得か事業所得か）の判定は行っていない。');
lines.push('根拠: 国税庁タックスアンサー No.1900「給与所得者で確定申告が必要な人」https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1900.htm ／ 川崎市・さいたま市等の公式案内（住民税の申告要否）');
lines.push('');
lines.push('聞きたいこと: ①この判定と金額の前提で見落としはないか ②申告の手続きの進め方（期限・必要書類） ③来年以降、副業を続ける場合に気をつけること');
lines.push('');
lines.push('※最終確認は税務署・お住まいの市区町村の税務担当窓口・税理士へお願いします。');
return lines.join('\n');
}

function copyPrompt() {
if (!last || last.result.outOfScope || last.result.errors.length) return;
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
fetch('../data/shaho/params-2026.json').then(function (r) { return r.json();})
]).then(function (ds) {
DATA = { tables: ds[0], rules: ds[1], kenpo: ds[2], shahoParams: ds[3] };
var sel = $('prefecture');
Object.keys(ds[2].prefectures).forEach(function (name) {
var o = document.createElement('option');
o.value = name; o.textContent = name;
if (name === '東京都') o.selected = true;
sel.appendChild(o);
});
var ids = ['mainIncome', 'prefecture', 'ageBand', 'industry', 'bonusPer', 'bonusCount',
'socialOverride', 'sideType', 'sideRevenue', 'sideExpenses', 'sideCategory',
'sideWithholding', 'sideSalaryIncome', 'sideYearEndAdjusted', 'willFile'];
ids.forEach(function (id) { $(id).addEventListener('input', compute); $(id).addEventListener('change', compute);});
/* 共通プロファイル連携（js/profile.js）: 初期値の読み書きだけを行い、計算には触らない */
/* 消去時に戻す初期値（保存値の復元前）を控える */
var defaultState = {};
ids.forEach(function (id) { if ($(id)) defaultState[id] = $(id).value; });
if (window.ZnProfile) {
var savedToolF = ZnProfile.loadTool('fukugyo');
if (savedToolF) {
ids.forEach(function (id) { if (savedToolF[id] !== undefined && $(id)) $(id).value = savedToolF[id];});
} else {
var profF = ZnProfile.loadProfile();
if (profF.incomeThisYearSalary !== undefined) $('mainIncome').value = profF.incomeThisYearSalary;
if (profF.prefecture) $('prefecture').value = profF.prefecture;
if (profF.ageBand) $('ageBand').value = profF.ageBand === '65plus' ? '65to69' : profF.ageBand;
if (profF.industry) $('industry').value = profF.industry;
if (profF.bonusPer !== undefined) $('bonusPer').value = profF.bonusPer;
if (profF.bonusCount !== undefined) $('bonusCount').value = profF.bonusCount;
}
var persistFukugyo = function () {
var st = {};
ids.forEach(function (id) { st[id] = $(id).value;});
ZnProfile.saveTool('fukugyo', st);
ZnProfile.saveProfile({
incomeThisYearSalary: num('mainIncome'),
prefecture: $('prefecture').value,
ageBand: $('ageBand').value === '65to69' ? '65plus' : $('ageBand').value,
industry: $('industry').value,
bonusPer: num('bonusPer'),
bonusCount: Math.floor(num('bonusCount'))
});
};
ids.forEach(function (id) { $(id).addEventListener('input', persistFukugyo); $(id).addEventListener('change', persistFukugyo);});
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
$('copyPrompt').addEventListener('click', copyPrompt);
compute();
}).catch(function () {
$('formError').innerHTML = '<div class="error">計算データ（data/nencho・data/juminzei・data/kenpo・data/shaho）を読み込めませんでした。</div>';
});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
