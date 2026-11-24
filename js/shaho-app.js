(function () {
'use strict';
var E = window.ShahoEngine;
function $(id) { return document.getElementById(id);}
function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円';}
function num(id) { var v = parseFloat($(id).value); return isNaN(v) || v < 0? 0: v;}
function toast(msg) {
var t = $('toast'); t.textContent = msg; t.classList.add('show');
setTimeout(function () { t.classList.remove('show');}, 5000);
}

var DATA = null;
var last = null;
var ITEMS = [
['health', '健康保険料'],
['care', '介護保険料'],
['child', '子ども・子育て支援金'],
['pension', '厚生年金保険料'],
['employment', '雇用保険料']
];
var AGE_LABEL = { under40: '40歳未満', '40to64': '40〜64歳（介護保険料あり）', '65to69': '65〜69歳'};
var IND_LABEL = { general: '一般の事業', nourin: '農林水産・清酒製造の事業', kensetsu: '建設の事業'};

function gather() {
return {
prefecture: $('prefecture').value,
ageBand: $('ageBand').value,
salaryMode: $('salaryMode').value,
gross: num('gross'),
directStandard: num('directStandard'),
bonusGross: num('bonusGross'),
bonusCount: parseInt($('bonusCount').value, 10) || 0,
industry: $('industry').value,
employmentInsured: $('employmentInsured').checked,
cumulativeBonus: num('cumulative')
};
}

function rowsHtml(items, totals) {
var html = ITEMS.map(function (it) {
var v = items[it[0]];
return '<tr><td>' + it[1] + '</td><td>' + yen(v.insured) + '</td><td>' + yen(v.employer) + '</td></tr>';
}).join('');
html += '<tr><td><strong>合計</strong></td><td><strong>' + yen(totals.insured) + '</strong></td><td><strong>' + yen(totals.employer) + '</strong></td></tr>';
return html;
}

function compute() {
if (!DATA) return;
var input = gather();
$('directWrap').hidden = input.salaryMode!== 'direct';
var r = E.compute(DATA, input);
last = { input: input, result: r};

$('mRows').innerHTML = rowsHtml(r.monthly.items, r.monthly.totals);
var m = r.monthly;
var gradeText = '標準報酬月額: 健康保険 ' + (m.healthGrade? '第' + m.healthGrade + '級 ': '') + yen(m.standardHealth) +
'／厚生年金 ' + (m.pensionGrade? '第' + m.pensionGrade + '級 ': '') + yen(m.standardPension);
if (input.salaryMode === 'direct' &&!m.healthGrade) gradeText += '（健康保険の等級表にない金額のため、等級は表示していません）';
$('mGrade').textContent = gradeText;

var showBonus = input.bonusGross > 0 && input.bonusCount > 0;
$('bonusSection').hidden =!showBonus;
if (showBonus) {
$('bRows').innerHTML = rowsHtml(r.bonus.items, r.bonus.totals);
$('bGrade').textContent = '標準賞与額: 健康保険 ' + yen(r.bonus.standardHealth) + '／厚生年金 ' + yen(r.bonus.standardPension) + '（賞与の総支給額から1,000円未満を切り捨てて計算）';
}

$('aRows').innerHTML = rowsHtml(r.annual.items, r.annual.totals);
$('annualInsured').textContent = yen(r.annual.totals.insured);
var ratio = r.annual.totals.insured > 0? (r.annual.totals.employer / r.annual.totals.insured): 0;
$('annualSummary').textContent = '年間の社会保険料は、本人負担 ' + yen(r.annual.totals.insured) + '＋会社負担 ' + yen(r.annual.totals.employer) +
'＝労使合計 ' + yen(r.annual.totals.total) + ' です。会社負担は本人負担の約' + ratio.toFixed(2) + '倍です。';

var notes = [];
if (input.salaryMode === 'gross') notes.push('「総支給額から当てはめる」方式は目安計算です。実際の標準報酬月額は、定時決定（4〜6月の報酬の平均で決め直し、9月から適用）・随時改定・資格取得時の決定で決まるため、1か月の総支給額でそのまま決まるわけではありません。正確に計算したい場合は「標準報酬月額を直接入力」を選んでください。');
if (input.salaryMode === 'direct' && m.pensionClamped!== null) notes.push('厚生年金の標準報酬月額は、入力値に対して上限・下限を適用し ' + yen(m.pensionClamped) + ' として計算しています（厚生年金の等級は88,000円〜650,000円です）。');
if (r.bonus.healthCapped) notes.push('健康保険の賞与分は、年度（4月〜翌年3月）の累計上限573万円に達するため、標準賞与額を調整して計算しています。');
if (r.bonus.pensionCapped) notes.push('厚生年金の賞与分は、標準賞与額の上限150万円で計算しています。');
notes.push('介護保険料は、40歳の誕生日の前日が属する月分からかかり、65歳の誕生日の前日が属する月分からかからなくなります。誕生月に当たる場合は、勤務先の計算とずれることがあります。');
notes.push('雇用保険料は、その月の総支給額（残業代などで毎月変動します）に料率を掛けて計算します。年額は同じ総支給額が続く前提の試算です。');
notes.push('年額は、同じ標準報酬月額・同じ月給が12か月続く前提です。実際は定時決定（9月）や随時改定で年度の途中に変わることがあります。');
notes.push('保険料の本人負担分は、項目ごとに端数処理をしています（端数が50銭以下の場合は切り捨て、50銭を超える場合は切り上げ）。会社の給与計算や特約により、1円程度異なる場合があります。会社負担分は「保険料の総額（1円未満切り捨て）−本人負担分」で求めた表示上の内訳です。');
notes.push('このほか、会社は子ども・子育て拠出金（厚生年金の標準報酬月額・標準賞与額 × 0.36％、事業主のみの負担）を別途負担しています。本ツールの計算には含めていません。');
if (!input.employmentInsured) notes.push('雇用保険の被保険者ではないため、雇用保険料は0円として計算しています。');
$('detailNotes').innerHTML = notes.map(function (n) { return '<li>' + n + '</li>';}).join('');
}

function itemLine(label, v) { return label + ' 本人 ' + yen(v.insured) + '／会社 ' + yen(v.employer);}
function buildPrompt() {
var i = last.input, r = last.result;
var lines = ['社会保険料の試算結果について相談です。', ''];
lines.push('・勤務先の都道府県: ' + i.prefecture + '（協会けんぽ）');
lines.push('・年齢区分: ' + AGE_LABEL[i.ageBand]);
lines.push('・月給の入力方式: ' + (i.salaryMode === 'gross'? '総支給額から等級表に当てはめる（目安）': '標準報酬月額を直接入力'));
lines.push('・月給の総支給額: ' + yen(i.gross));
if (i.salaryMode === 'direct') lines.push('・標準報酬月額（入力値）: ' + yen(i.directStandard));
lines.push('・当てはめた標準報酬月額: 健康保険 ' + yen(r.monthly.standardHealth) + '／厚生年金 ' + yen(r.monthly.standardPension));
lines.push('・賞与: 1回 ' + yen(i.bonusGross) + ' × 年' + i.bonusCount + '回');
lines.push('・雇用保険: ' + (i.employmentInsured? '被保険者（' + IND_LABEL[i.industry] + '）': '被保険者ではない'));
lines.push('');
lines.push('' + itemLine('合計', r.monthly.totals));
ITEMS.forEach(function (it) { lines.push('・' + itemLine(it[1], r.monthly.items[it[0]]));});
if (i.bonusGross > 0 && i.bonusCount > 0) {
lines.push('');
lines.push('' + itemLine('合計', r.bonus.totals));
ITEMS.forEach(function (it) { lines.push('・' + itemLine(it[1], r.bonus.items[it[0]]));});
}
lines.push('');
lines.push('' + itemLine('合計', r.annual.totals) + '（労使合計 ' + yen(r.annual.totals.total) + '）');
ITEMS.forEach(function (it) { lines.push('・' + itemLine(it[1], r.annual.items[it[0]]));});
lines.push('');
lines.push('【計算過程】');
var pref = DATA.kenpo.prefectures[i.prefecture];
function rp(x) { return (Math.round(x * 10000) / 100) + '%'; }
lines.push('・料率（' + i.prefecture + '・協会けんぽ、労使合計）: 健康保険 ' + rp(pref.health_rate) + (i.ageBand === '40to64' ? '／介護保険 ' + rp(pref.care_rate) : '') + '／子ども・子育て支援金 ' + rp(pref.child_rate) + '／厚生年金 ' + rp(DATA.params.pension_rate) + '／雇用保険 本人 ' + rp(DATA.params.employment_rates[i.industry].worker_rate) + '・会社 ' + rp(DATA.params.employment_rates[i.industry].employer_rate));
lines.push('・月額の式（本人負担）: 健康保険は標準報酬月額 ' + yen(r.monthly.standardHealth) + ' × ' + rp(pref.health_rate) + ' の折半 ＝ ' + yen(r.monthly.items.health.insured) + '／厚生年金は標準報酬月額 ' + yen(r.monthly.standardPension) + ' × ' + rp(DATA.params.pension_rate) + ' の折半 ＝ ' + yen(r.monthly.items.pension.insured) + '／雇用保険は総支給額 ' + yen(i.gross) + ' × 本人料率 ＝ ' + yen(r.monthly.items.employment.insured) + '。各項目とも端数は50銭ルール（50銭以下切り捨て・50銭超切り上げ）');
if (i.bonusGross > 0 && i.bonusCount > 0) lines.push('・賞与の式（1回分・本人負担）: 標準賞与額（健保 ' + yen(r.bonus.standardHealth) + '／厚年 ' + yen(r.bonus.standardPension) + '。総支給額の1,000円未満切り捨て、健保は年度累計573万円・厚年は1回150万円が上限）に月額と同じ料率を適用。健康保険 ＝ ' + yen(r.bonus.items.health.insured) + '／厚生年金 ＝ ' + yen(r.bonus.items.pension.insured));
lines.push('・年額の組み立て: 月額 × 12 ＋ 賞与分 × ' + i.bonusCount + '回');
lines.push('');
lines.push('前提: 令和8年度の料率。健康保険は協会けんぽ加入者前提。月給分は標準報酬月額、賞与分は標準賞与額に料率を掛けて計算し、本人負担は項目ごとに端数処理（50銭以下切り捨て・50銭超切り上げ）。会社負担は総額（1円未満切り捨て）から本人負担を引いた表示上の内訳。年額は同じ月給が12か月続く前提。');
lines.push('根拠: 協会けんぽ「令和8年度の都道府県単位保険料率」 https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html・「令和8年度保険料額表」（都道府県支部ごとに公表）、日本年金機構「厚生年金保険の保険料」（料率18.3％・等級表・標準賞与額の上限） https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20150515-01.html、厚生労働省「令和8（2026）年度 雇用保険料率のご案内」 https://jsite.mhlw.go.jp/gunma-roudoukyoku/content/contents/002597764.pdf');
lines.push('');
lines.push('聞きたいこと: ①この試算の前提で見落としはないか ②実際の給与明細と金額が違った場合に考えられる理由 ③会社負担分も含めた社会保険料の全体像として注意すべき点');
lines.push('');
lines.push('※最終確認は勤務先の給与担当・社会保険労務士へお願いします。');
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
fetch('../data/shaho/params-2026.json').then(function (r) { return r.json();})
]).then(function (ds) {
DATA = { kenpo: ds[0], params: ds[1]};
var sel = $('prefecture');
Object.keys(ds[0].prefectures).forEach(function (name) {
var o = document.createElement('option');
o.value = name; o.textContent = name;
if (name === '東京都') o.selected = true;
sel.appendChild(o);
});
var ids = ['prefecture', 'ageBand', 'salaryMode', 'gross', 'directStandard', 'bonusGross', 'bonusCount', 'industry', 'employmentInsured', 'cumulative'];
ids.forEach(function (id) { $(id).addEventListener('input', compute); $(id).addEventListener('change', compute);});
$('copyPrompt').addEventListener('click', copyPrompt);
compute();
}).catch(function () {
$('formError').innerHTML = '<div class="error">料率データ（data/kenpo・data/shaho）を読み込めませんでした。</div>';
});
}
document.addEventListener('DOMContentLoaded', init);
})();
