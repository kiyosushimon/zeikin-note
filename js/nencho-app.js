(function () {
'use strict';
var E = window.NenchoEngine;
function $(id) { return document.getElementById(id);}
function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円';}
function num(id) { var v = parseFloat($(id).value); return isNaN(v) || v < 0 ? 0 : v;}
function toast(msg) {
var t = $('toast'); t.textContent = msg; t.classList.add('show');
setTimeout(function () { t.classList.remove('show');}, 5000);
}

var T = null;
var last = null;

/* 配偶者・特定親族の「合計所得金額」: 入力方法が給与収入なら別表第五の換算で求める */
function toIncome(mode, amount) {
return mode === 'salary' ? E.salaryAfterDeduction(T, amount) : amount;
}

function buildSpecRows() {
var n = Math.floor(num('specCount'));
var wrap = $('specRows');
var prev = [];
wrap.querySelectorAll('.spec-row').forEach(function (row) {
prev.push({ mode: row.querySelector('.spec-mode').value, amount: row.querySelector('.spec-amount').value });
});
wrap.innerHTML = '';
for (var i = 0; i < n; i++) {
var p = prev[i] || { mode: 'income', amount: '' };
var div = document.createElement('div');
div.className = 'field spec-row';
div.innerHTML = '<label>特定親族' + (i + 1) + '人目<span class="hint">年齢19歳以上23歳未満の親族です。合計所得金額が62万円超123万円以下の場合に控除があります（給与収入だけなら136万円超197万円以下）</span></label>' +
'<div class="grid2"><select class="spec-mode"><option value="income"' + (p.mode === 'income' ? ' selected' : '') + '>合計所得金額を入力</option><option value="salary"' + (p.mode === 'salary' ? ' selected' : '') + '>給与収入から換算</option></select>' +
'<div class="yen-wrap"><input type="number" class="spec-amount" min="0" step="10000" value="' + p.amount + '"><span class="unit">円</span></div></div>';
wrap.appendChild(div);
}
}

function gather() {
var specRelatives = [];
$('specRows').querySelectorAll('.spec-row').forEach(function (row) {
var mode = row.querySelector('.spec-mode').value;
var amount = parseFloat(row.querySelector('.spec-amount').value);
specRelatives.push(toIncome(mode, isNaN(amount) || amount < 0 ? 0 : amount));
});
var spouseHas = $('spouseHas').value === 'has';
return {
income: num('income'),
socialInsurance: num('social'),
smallBusiness: num('smallBiz'),
withheld: num('withheld'),
life: {
newGeneral: num('lifeNewGeneral'), oldGeneral: num('lifeOldGeneral'),
care: num('lifeCare'), newPension: num('lifeNewPension'), oldPension: num('lifeOldPension')
},
hasYoungDependent: $('youngDep').checked,
quake: num('quake'), oldLongDamage: num('oldLong'),
spouse: {
has: spouseHas,
income: spouseHas ? toIncome($('spouseMode').value, num('spouseAmount')) : 0,
elderly: $('spouseElderly').checked
},
spouseMode: $('spouseMode').value, spouseAmount: num('spouseAmount'),
specificRelatives: specRelatives,
dependents: {
general: Math.floor(num('depGeneral')), specific: Math.floor(num('depSpecific')),
elderlyCohab: Math.floor(num('depElderlyCohab')), elderlyOther: Math.floor(num('depElderlyOther')),
disabledGeneral: Math.floor(num('disGeneral')), disabledSpecial: Math.floor(num('disSpecial')),
disabledCohabSpecial: Math.floor(num('disCohabSpecial')),
selfStatus: $('selfStatus').value
},
adjustmentEligible: $('adjustment').checked,
otherIncome: num('otherIncome'),
housing: num('housing')
};
}

function compute() {
if (!T) return;
var input = gather();
$('spouseWrap').hidden = input.spouse.has === false;
$('specWrap').hidden = input.specificRelatives.length === 0;
var r = E.compute(T, input);
last = { input: input, result: r };

/* 判定（還付／徴収／過不足なし） */
var label, amount;
if (r.balance > 0) { label = '年末調整で戻る額（還付）'; amount = r.balance; }
else if (r.balance < 0) { label = '追加で引かれる額（徴収）'; amount = -r.balance; }
else { label = '過不足額'; amount = 0; }
$('verdictLabel').textContent = label;
$('balance').textContent = yen(amount);

$('rSalaryAfter').textContent = yen(r.salaryAfter);
$('adjRow').hidden = r.adjustment === 0;
$('rAdjustment').textContent = yen(r.adjustment);
$('rSocial').textContent = yen(r.socialInsurance);
$('smallRow').hidden = r.smallBusiness === 0;
$('rSmall').textContent = yen(r.smallBusiness);
$('rLife').textContent = yen(r.life.total);
$('quakeRow').hidden = r.earthquake === 0;
$('rQuake').textContent = yen(r.earthquake);
$('spouseRow').hidden = r.spouse.amount === 0;
$('rSpouse').textContent = yen(r.spouse.amount);
$('rSpouseLabel').textContent = r.spouse.kind || '配偶者控除・配偶者特別控除';
$('specRow').hidden = r.specificTotal === 0;
$('rSpecific').textContent = yen(r.specificTotal);
$('depRow').hidden = r.dependentEtc === 0;
$('rDepEtc').textContent = yen(r.dependentEtc);
$('rBasic').textContent = yen(r.basic);
$('rDedTotal').textContent = yen(r.deductionsTotal);
$('rTaxable').textContent = yen(r.taxable);
$('rTaxCalc').textContent = yen(r.taxCalc);
$('housingRow').hidden = r.housing === 0;
$('rHousing').textContent = yen(r.housing);
$('rAnnualTax').textContent = yen(r.annualTax);
$('rWithheld').textContent = yen(r.withheld);

var ex = '年税額は、源泉徴収簿と同じ手順で計算しました。給与所得控除後の金額 ' + yen(r.salaryAfter) +
(r.adjustment ? ' から所得金額調整控除 ' + yen(r.adjustment) + ' を差し引き、' : ' から') +
'所得控除の合計 ' + yen(r.deductionsTotal) + ' を差し引いて、課税給与所得金額 ' + yen(r.taxable) +
'（1,000円未満切り捨て）に速算表を適用し、算出所得税額 ' + yen(r.taxCalc) + ' を求めました。' +
(r.housing ? '住宅借入金等特別控除 ' + yen(r.housing) + ' を差し引き、' : '') +
'復興特別所得税（×102.1%）を含めて100円未満を切り捨てた年調年税額は ' + yen(r.annualTax) + ' です。' +
'源泉徴収税額の年間合計 ' + yen(r.withheld) + ' との差額が過不足額になります。';
$('taxExplain').textContent = ex;

var notes = [];
notes.push('基礎控除は、合計所得金額 ' + yen(r.totalIncome) + ' の区分により ' + yen(r.basic) + ' を適用しました（令和8年分は合計所得金額489万円以下で104万円）。');
if (r.spouse.kind) {
var tierText = ['900万円以下', '900万円超950万円以下', '950万円超1,000万円以下'][r.spouse.tier];
notes.push(r.spouse.kind + ' は、本人の合計所得金額の区分（' + tierText + '）と配偶者の合計所得金額 ' + yen(r.spouse.income) + ' により ' + yen(r.spouse.amount) + ' を適用しました。');
}
if (input.spouse.has && !r.spouse.kind) notes.push('配偶者控除・配偶者特別控除は適用されませんでした（本人の合計所得金額が1,000万円を超える場合、または配偶者の合計所得金額が133万円を超える場合は受けられません）。');
if (r.life.total >= 120000) notes.push('生命保険料控除は、3区分の合計の上限12万円で計算しています。');
if (input.hasYoungDependent) notes.push('年齢23歳未満の扶養親族がいるため、一般の生命保険料控除（新契約）に令和8・9年分の特例（上限6万円）を適用しています。');
notes.push('令和8年分は、11月までの源泉徴収が改正前（基礎控除48万円など）の税額表で行われているため、年末調整で精算する還付が例年より大きくなりやすい年です。');
if (input.otherIncome > 0) notes.push('給与以外の所得 ' + yen(input.otherIncome) + ' は、基礎控除・配偶者控除などの判定（合計所得金額）にだけ反映しています。その所得にかかる税金は年末調整では精算されず、確定申告で精算されます。');
notes.push('転職した方は、前職分の給与・社会保険料・源泉徴収税額を合算して入力してください。合算が漏れると過不足額が実際とずれます。');
notes.push('生命保険料控除・地震保険料控除の計算で生じる1円未満の端数は、切り上げて計算しています（勤務先の計算と1円程度異なる場合があります）。');
if (r.overIncomeLimit) notes.push('給与収入が2,000万円を超える方は年末調整の対象とならないため、この試算は適用されません。確定申告が必要です。');
$('detailNotes').innerHTML = notes.map(function (n) { return '<li>' + n + '</li>';}).join('');
}

function buildPrompt() {
var i = last.input, r = last.result;
var lines = ['年末調整の還付・徴収額の試算結果について相談です。', ''];
lines.push('・年間給与収入: ' + yen(i.income));
lines.push('・社会保険料等の年間合計: ' + yen(i.socialInsurance) + '／小規模企業共済等掛金: ' + yen(i.smallBusiness));
lines.push('・源泉徴収税額の年間合計（年末調整前）: ' + yen(i.withheld));
lines.push('・生命保険料（年間支払額）: 新一般 ' + yen(i.life.newGeneral) + '／旧一般 ' + yen(i.life.oldGeneral) + '／介護医療 ' + yen(i.life.care) + '／新個人年金 ' + yen(i.life.newPension) + '／旧個人年金 ' + yen(i.life.oldPension));
lines.push('・地震保険料: ' + yen(i.quake) + '／旧長期損害保険料: ' + yen(i.oldLongDamage));
if (i.spouse.has) lines.push('・配偶者: あり（合計所得金額 ' + yen(i.spouse.income) + (i.spouse.elderly ? '・70歳以上' : '') + '）');
else lines.push('・配偶者: なし');
if (i.specificRelatives.length) lines.push('・特定親族（19歳以上23歳未満）の合計所得金額: ' + i.specificRelatives.map(yen).join('、'));
lines.push('・扶養親族: 一般 ' + i.dependents.general + '人／特定扶養 ' + i.dependents.specific + '人／老人（同居老親等） ' + i.dependents.elderlyCohab + '人／老人（その他） ' + i.dependents.elderlyOther + '人');
lines.push('・障害者: 一般 ' + i.dependents.disabledGeneral + '人／特別 ' + i.dependents.disabledSpecial + '人／同居特別 ' + i.dependents.disabledCohabSpecial + '人');
lines.push('・本人の区分: ' + ({ none: 'なし', widow: '寡婦', singleParent: 'ひとり親', workingStudent: '勤労学生' })[i.dependents.selfStatus]);
lines.push('・住宅借入金等特別控除額: ' + yen(i.housing));
lines.push('');
lines.push('・給与所得控除後の金額: ' + yen(r.salaryAfter) + (r.adjustment ? '（所得金額調整控除 ' + yen(r.adjustment) + '）' : ''));
lines.push('・所得控除の合計: ' + yen(r.deductionsTotal) + '（うち基礎控除 ' + yen(r.basic) + '）');
lines.push('・課税給与所得金額: ' + yen(r.taxable));
lines.push('・年調年税額（復興特別所得税込み）: ' + yen(r.annualTax));
lines.push('・結果: ' + (r.balance > 0 ? '還付 ' + yen(r.balance) : r.balance < 0 ? '徴収（不足） ' + yen(-r.balance) : '過不足なし'));
lines.push('');
lines.push('【計算過程】');
lines.push('・給与所得控除: 年間給与収入 ' + yen(i.income) + ' − 給与所得控除 ' + yen(i.income - r.salaryAfter) + ' ＝ 給与所得控除後の金額 ' + yen(r.salaryAfter) + (r.adjustment ? '（所得金額調整控除 ' + yen(r.adjustment) + ' を差し引いて ' + yen(r.salaryAfterAdj) + '）' : ''));
lines.push('・所得控除の内訳: 社会保険料 ' + yen(r.socialInsurance) + '＋小規模企業共済等 ' + yen(r.smallBusiness) + '＋生命保険料 ' + yen(r.life.total) + '（一般 ' + yen(r.life.general.amount) + '・介護医療 ' + yen(r.life.care) + '・個人年金 ' + yen(r.life.pension.amount) + '）＋地震保険料 ' + yen(r.earthquake) + '＋配偶者 ' + yen(r.spouse.amount) + '＋特定親族特別 ' + yen(r.specificTotal) + '＋扶養・障害者・本人区分等 ' + yen(r.dependentEtc) + '＋基礎 ' + yen(r.basic) + ' ＝ ' + yen(r.deductionsTotal));
lines.push('・課税給与所得金額: ' + yen(r.salaryAfterAdj) + ' − ' + yen(r.deductionsTotal) + ' ＝ ' + yen(r.taxable) + '（1,000円未満切り捨て）');
lines.push('・算出税額: 課税給与所得金額に所得税の速算表（税率・控除額）を適用 ＝ ' + yen(r.taxCalc) + '（速算表の税率・控除額そのものは結果データに含まれないため、この段は式の一般形＋実額で示します）');
if (i.housing > 0) lines.push('・住宅借入金等特別控除: 算出税額 ' + yen(r.taxCalc) + ' − ' + yen(r.housing) + ' ＝ ' + yen(r.afterHousing));
lines.push('・年調年税額: ' + yen(r.afterHousing) + ' × 1.021（復興特別所得税）→ 100円未満切り捨て ＝ ' + yen(r.annualTax));
lines.push('・過不足額: 源泉徴収税額 ' + yen(i.withheld) + ' − 年調年税額 ' + yen(r.annualTax) + ' ＝ ' + (r.balance >= 0 ? '還付 ' + yen(r.balance) : '徴収 ' + yen(-r.balance)));
lines.push('');
lines.push('前提: 令和8年分（2026年分）の年末調整。主たる給与（扶養控除等申告書を提出した勤務先）が対象。入力は見積額・申告内容に基づく試算で、実際の年末調整は勤務先が確定値で行います。医療費控除・寄附金控除は年末調整では扱えず確定申告が必要です。');
lines.push('根拠: 国税庁「令和8年分 年末調整のしかた」（手順・金額の表・速算表） https://www.nta.go.jp/users/gensen/nencho/index/shikata.htm、国税庁タックスアンサー No.1199（基礎控除） https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm・No.1191（配偶者控除） https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1191.htm・No.1195（配偶者特別控除） https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1195.htm・No.1140（生命保険料控除） https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1140.htm・No.1145（地震保険料控除） https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1145.htm');
lines.push('');
lines.push('聞きたいこと: ①この試算の前提で見落としはないか ②実際の年末調整の結果と金額が違った場合に考えられる理由 ③私の状況で注意すべき点');
lines.push('');
lines.push('※最終確認は勤務先の給与担当・税理士・税務署へお願いします。');
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
fetch('../data/nencho/tables-2026.json').then(function (r) { return r.json();}).then(function (t) {
T = t;
buildSpecRows();
var ids = ['income', 'social', 'smallBiz', 'withheld',
'lifeNewGeneral', 'lifeOldGeneral', 'lifeCare', 'lifeNewPension', 'lifeOldPension', 'youngDep',
'quake', 'oldLong', 'spouseHas', 'spouseMode', 'spouseAmount', 'spouseElderly', 'specCount',
'depGeneral', 'depSpecific', 'depElderlyCohab', 'depElderlyOther',
'disGeneral', 'disSpecial', 'disCohabSpecial', 'selfStatus',
'adjustment', 'otherIncome', 'housing'];
ids.forEach(function (id) { $(id).addEventListener('input', compute); $(id).addEventListener('change', compute);});
$('specCount').addEventListener('change', function () { buildSpecRows(); compute();});
$('specRows').addEventListener('input', compute);
$('specRows').addEventListener('change', compute);
$('copyPrompt').addEventListener('click', copyPrompt);
compute();
}).catch(function () {
$('formError').innerHTML = '<div class="error">計算表データ（data/nencho）を読み込めませんでした。</div>';
});
}
document.addEventListener('DOMContentLoaded', init);
})();
