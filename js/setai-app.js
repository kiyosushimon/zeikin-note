(function () {
'use strict';
var E = window.SetaiEngine;
function $(id) { return document.getElementById(id);}
function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円';}
function signed(n) { return (n > 0 ? '＋' : n < 0 ? '−' : '±') + yen(Math.abs(n)).replace('円', '') + '円';}
function num(id) { var v = parseFloat($(id).value); return isNaN(v) || v < 0 ? 0 : v;}
function toast(msg) {
var t = $('toast'); t.textContent = msg; t.classList.add('show');
setTimeout(function () { t.classList.remove('show');}, 5000);
}

var DATA = null;
var last = null;

var AGE_LABEL = { under40: '40歳未満', '40to64': '40〜64歳（介護保険料あり）', '65to69': '65〜69歳' };
var SOCIAL_LABEL = { auto: '自動（年収130万円未満なら被扶養者）', join: '加入', dependent: '扶養（被扶養者）' };

function personInput(prefix) {
return {
income: num(prefix + 'Income'),
ageBand: $(prefix + 'Age').value,
bonusPer: num(prefix + 'BonusPer'),
bonusCount: Math.floor(num(prefix + 'BonusCount'))
};
}

function gather() {
return {
self: personInput('self'),
spouse: personInput('spouse'),
prefecture: $('prefecture').value,
industry: $('industry').value,
spouseSocial: $('spouseSocial').value,
children: {
under16: Math.floor(num('childUnder16')),
general: Math.floor(num('childGeneral')),
specific: Math.floor(num('childSpecific')),
parent: $('childParent').value
}
};
}

function personRows(p, isSpouse) {
var rows = [];
rows.push(['年収（給与収入・総支給額）', yen(p.income)]);
rows.push(['給与所得（所得税の計算用）', yen(p.salaryTax)]);
rows.push(['給与所得（住民税の計算用）', yen(p.salaryResident)]);
if (p.social.dependent) {
rows.push(['社会保険料（年額）', '0円（被扶養者）']);
} else {
rows.push(['健康保険料（年額）', yen(p.social.health)]);
if (p.social.care > 0) rows.push(['介護保険料（年額）', yen(p.social.care)]);
rows.push(['子ども・子育て支援金（年額）', yen(p.social.child)]);
rows.push(['厚生年金保険料（年額）', yen(p.social.pension)]);
rows.push(['雇用保険料（年額）', yen(p.social.employment)]);
rows.push(['社会保険料 合計（年額）', yen(p.social.total)]);
}
rows.push(['所得税（年税額）', yen(p.incomeTax.tax)]);
rows.push(['住民税（年額・目安）', yen(p.residentTax.tax)]);
rows.push(['手取り', yen(p.net)]);
return rows.map(function (r) {
var strong = r[0].indexOf('手取り') === 0 || r[0].indexOf('社会保険料 合計') === 0;
return '<tr' + (strong ? ' class="total-row"' : '') + '><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>';
}).join('');
}

function personNote(p, label) {
var notes = [];
if (p.social.dependent) {
notes.push(label + 'は被扶養者として扱い、社会保険料は0円です（国民年金の第3号被保険者となり、国民年金保険料の個人負担もありません）。');
} else if (p.income > 0) {
notes.push(label + 'の社会保険料は、月給の総支給額（目安）' + yen(p.social.monthlyGross) + 'から当てはめた標準報酬月額（健康保険 ' + yen(p.social.standardHealth) + '／厚生年金 ' + yen(p.social.standardPension) + '）で計算しています。');
}
var itd = [];
if (p.incomeTax.spouseAmount > 0) itd.push(p.incomeTax.spouseKind + ' ' + yen(p.incomeTax.spouseAmount));
if (p.incomeTax.dependentAmount > 0) itd.push('扶養控除 ' + yen(p.incomeTax.dependentAmount));
if (p.adjustment > 0) itd.push('所得金額調整控除 ' + yen(p.adjustment));
itd.push('基礎控除 ' + yen(p.incomeTax.basic));
notes.push(label + 'の所得税の所得控除: 社会保険料控除 ' + yen(p.incomeTax.social) + '＋' + itd.join('＋') + '。課税所得 ' + yen(p.incomeTax.taxable) + '。');
if (p.residentTax.tax === 0 && p.income > 0) notes.push(label + 'の住民税は非課税のため0円です。');
return notes;
}

function compute() {
if (!DATA) return;
var input = gather();
var errs = [];
['self', 'spouse'].forEach(function (k) {
var p = input[k];
if (p.bonusPer * p.bonusCount > p.income) {
errs.push((k === 'self' ? '本人' : '配偶者') + 'の賞与（1回あたりの額 × 回数）が年収を超えています。月給分は0円として計算しています。');
}
});
$('formError').innerHTML = errs.length ? '<div class="error">' + errs.join('<br>') + '</div>' : '';

var r = E.compute(DATA, input);
last = { input: input, result: r };
var m = r.main, h = m.household;

$('netHousehold').textContent = yen(h.net);
$('dHouseholdIncome').textContent = yen(h.income);
$('dHouseholdSocial').textContent = yen(h.social);
$('dHouseholdIncomeTax').textContent = yen(h.incomeTax);
$('dHouseholdResidentTax').textContent = yen(h.residentTax);
$('singleNet').textContent = yen(r.single.household.net);
$('diffNet').textContent = signed(r.diff.net);
$('diffIncomeTax').textContent = signed(-r.diff.incomeTax);
$('diffResidentTax').textContent = signed(-r.diff.residentTax);
$('diffSocial').textContent = signed(-r.diff.social);
$('diffExplain').textContent = r.diff.net > 0
? 'いまの配分のほうが、1人で全額稼ぐ場合より手取りが ' + yen(r.diff.net) + ' 多くなります。所得税・住民税は、基礎控除と給与所得控除が2人分使えることと、累進税率の高い帯を1人で使わないことで下がります。一方、社会保険料は2人分かかるため増えます。'
: r.diff.net < 0
? 'いまの配分より、1人で全額稼ぐ場合のほうが手取りが ' + yen(-r.diff.net) + ' 多くなります。社会保険料が2人分かかる影響が、税金の減少分を上回っています。'
: 'いまの配分と、1人で全額稼ぐ場合で、手取りは同じです。';

$('selfRows').innerHTML = personRows(m.self, false);
$('spouseRows').innerHTML = personRows(m.spouse, true);
$('spouseTitle').textContent = m.spouseDependent ? '配偶者の内訳（被扶養者）' : '配偶者の内訳';
var notes = personNote(m.self, '本人').concat(personNote(m.spouse, '配偶者'));
if (input.spouseSocial === 'auto') {
notes.push('配偶者の社会保険は自動判定です（年収130万円未満 → 被扶養者）。この130万円は被扶養者認定の線で、社会保険の加入義務を決める線（106万円の壁など）とは別です。');
}
if (m.spouseDependent && input.spouse.income >= input.self.income / 2 && input.spouse.income > 0) {
notes.push('配偶者の年収が本人の年収の半分以上ある場合、被扶養者として認定されるかどうかは世帯の生計状況により、勤務先・保険者の判断になります。');
}
notes.push('配偶者控除の判定（合計所得金額）と、社会保険の被扶養者の判定（年間収入の見込み）は別の制度で、連動しません。');
$('detailNotes').innerHTML = notes.map(function (n) { return '<li>' + n + '</li>';}).join('');

$('presetRows').innerHTML = r.presets.map(function (p) {
return '<tr><td>' + p.label + '（' + yen(p.selfIncome) + ' ＋ ' + yen(p.spouseIncome) + '）</td>' +
'<td>' + yen(p.household.incomeTax) + '</td><td>' + yen(p.household.residentTax) + '</td>' +
'<td>' + yen(p.household.social) + '</td><td><strong>' + yen(p.household.net) + '</strong></td></tr>';
}).join('');
}

function buildPrompt() {
var i = last.input, r = last.result, m = r.main, h = m.household;
function personLine(label, p) {
return '・' + label + ': 年収 ' + yen(p.income) + '／社会保険料 ' + yen(p.social.total) + '／所得税 ' + yen(p.incomeTax.tax) + '／住民税 ' + yen(p.residentTax.tax) + '／手取り ' + yen(p.net);
}
var lines = ['世帯年収の手取りシミュレーションの試算結果について相談です。', ''];
lines.push(personLine('本人', m.self));
lines.push(personLine('配偶者', m.spouse));
lines.push('・世帯年収: ' + yen(h.income));
lines.push('・世帯手取り: ' + yen(h.net) + '（社会保険料 ' + yen(h.social) + '／所得税 ' + yen(h.incomeTax) + '／住民税 ' + yen(h.residentTax) + '）');
lines.push('・同じ世帯年収を1人で稼いだ場合の手取り: ' + yen(r.single.household.net) + '（差 ' + signed(r.diff.net) + '）');
lines.push('・配分プリセット: ' + r.presets.map(function (p) { return p.label + ' → ' + yen(p.household.net); }).join('／'));
lines.push('・勤務先の都道府県: ' + i.prefecture + '（協会けんぽ。夫婦とも同じ料率で計算）');
lines.push('・年齢区分: 本人 ' + AGE_LABEL[i.self.ageBand] + '／配偶者 ' + AGE_LABEL[i.spouse.ageBand]);
lines.push('・配偶者の社会保険: ' + SOCIAL_LABEL[i.spouseSocial] + (m.spouseDependent ? '（結果: 被扶養者）' : '（結果: 加入）'));
var kids = [];
if (i.children.under16 > 0) kids.push('16歳未満 ' + i.children.under16 + '人');
if (i.children.general > 0) kids.push('16〜18歳・23歳以上 ' + i.children.general + '人');
if (i.children.specific > 0) kids.push('19〜22歳 ' + i.children.specific + '人');
lines.push('・子供: ' + (kids.length ? kids.join('、') + '（扶養は' + (i.children.parent === 'self' ? '本人' : '配偶者') + 'に付けて計算）' : 'なし'));
lines.push('');
lines.push('【計算過程】');
function personProcess(label, p) {
lines.push('■ ' + label);
lines.push('・給与所得: 年収 ' + yen(p.income) + ' − 給与所得控除 ＝ 所得税用 ' + yen(p.salaryTax) + '（住民税用は住民税の速算表で換算）');
if (p.social.total > 0) {
lines.push('・社会保険料: ' + yen(p.social.total) + '（年収から月給の目安 ' + yen(p.social.monthlyGross || 0) + ' を出し、標準報酬月額（健保 ' + yen(p.social.standardHealth || 0) + '／厚年 ' + yen(p.social.standardPension || 0) + '）に料率を掛けた試算。内訳: 健康 ' + yen(p.social.health) + '・介護 ' + yen(p.social.care) + '・子ども ' + yen(p.social.child) + '・厚生年金 ' + yen(p.social.pension) + '・雇用 ' + yen(p.social.employment) + '）');
} else {
lines.push('・社会保険料: 0円（被扶養者、または収入なし）');
}
var it = p.incomeTax;
lines.push('・所得税: 控除（社会保険料 ' + yen(it.social) + '＋配偶者 ' + yen(it.spouseAmount) + '＋扶養 ' + yen(it.dependentAmount) + '＋基礎 ' + yen(it.basic) + '）＝ ' + yen(it.deductionsTotal) + '、課税所得 ' + yen(it.taxable) + '（1,000円未満切り捨て）に速算表を適用し ×1.021（復興特別所得税）＝ ' + yen(it.tax));
var rt = p.residentTax;
lines.push('・住民税: 課税所得 ' + yen(rt.taxable) + ' × 10% − 調整控除 ' + yen(rt.adjustment) + ' ＝ 所得割 ' + yen(rt.incomeLevy) + '、＋ 均等割 ' + yen(rt.perCapita) + ' ＋ 森林環境税 ' + yen(rt.forest) + ' ＝ ' + yen(rt.tax) + '（100円未満切り捨て）');
}
personProcess('本人', m.self);
personProcess('配偶者', m.spouse);
lines.push('');
lines.push('前提: 所得税は令和8年分の年税額（年末調整の方式）。住民税は令和8年度の標準税率による年額の目安で、実際は翌年度に課税されます。社会保険料は年収から導出した月給（目安）で標準報酬月額を当てはめた試算です。控除は社会保険料・配偶者・扶養・基礎のみで、生命保険料控除・iDeCo・住宅ローン控除などは入れていません。');
lines.push('根拠: 国税庁タックスアンサー No.1199（基礎控除） https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm・No.1191（配偶者控除） https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1191.htm・No.1195（配偶者特別控除） https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1195.htm、国税庁「令和8年分 年末調整のしかた」 https://www.nta.go.jp/users/gensen/nencho/index/shikata.htm、総務省「個人住民税」 https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_14.html、協会けんぽ「令和8年度の都道府県単位保険料率」 https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html、日本年金機構（被扶養者の収入要件） https://www.nenkin.go.jp/service/kounen/tekiyo/hihokensha1/20141202.html、厚生労働省「令和8（2026）年度 雇用保険料率のご案内」 https://jsite.mhlw.go.jp/gunma-roudoukyoku/content/contents/002597764.pdf');
lines.push('');
lines.push('聞きたいこと: ①この試算の前提で見落としはないか ②夫婦の働き方・年収配分を変える場合に注意すべき点 ③私の状況で確認すべき制度や手続き');
lines.push('');
lines.push('※最終確認は勤務先の給与担当・税理士・税務署・自治体窓口へお願いします。');
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
var ids = ['selfIncome', 'selfAge', 'selfBonusPer', 'selfBonusCount',
'spouseIncome', 'spouseAge', 'spouseBonusPer', 'spouseBonusCount', 'spouseSocial',
'prefecture', 'industry', 'childUnder16', 'childGeneral', 'childSpecific', 'childParent'];
ids.forEach(function (id) { $(id).addEventListener('input', compute); $(id).addEventListener('change', compute);});
/* 共通プロファイル連携（js/profile.js）: 初期値の読み書きだけを行い、計算には触らない */
/* 消去時に戻す初期値（保存値の復元前）を控える */
var defaultState = {};
ids.forEach(function (id) { if ($(id)) defaultState[id] = $(id).value; });
if (window.ZnProfile) {
var savedTool = ZnProfile.loadTool('setai');
if (savedTool) {
ids.forEach(function (id) { if (savedTool[id] !== undefined && $(id)) $(id).value = savedTool[id];});
} else {
var prof = ZnProfile.loadProfile();
if (prof.incomeThisYearSalary !== undefined) $('selfIncome').value = prof.incomeThisYearSalary;
if (prof.spouse && prof.spouse.income !== undefined) $('spouseIncome').value = prof.spouse.income;
if (prof.prefecture) $('prefecture').value = prof.prefecture;
if (prof.industry) $('industry').value = prof.industry;
if (prof.ageBand) $('selfAge').value = prof.ageBand === '65plus' ? '65to69' : prof.ageBand;
if (prof.spouseAgeBand) $('spouseAge').value = prof.spouseAgeBand === '65plus' ? '65to69' : prof.spouseAgeBand;
if (prof.bonusPer !== undefined) $('selfBonusPer').value = prof.bonusPer;
if (prof.bonusCount !== undefined) $('selfBonusCount').value = prof.bonusCount;
if (prof.dependents) {
if (prof.dependents.under16 !== undefined) $('childUnder16').value = prof.dependents.under16;
if (prof.dependents.age19to22 !== undefined) $('childSpecific').value = prof.dependents.age19to22;
if (prof.dependents.age16to18 !== undefined || prof.dependents.age23plus !== undefined) {
$('childGeneral').value = (prof.dependents.age16to18 || 0) + (prof.dependents.age23plus || 0);
}
}
}
var persistSetai = function () {
var st = {};
ids.forEach(function (id) { st[id] = $(id).value;});
ZnProfile.saveTool('setai', st);
var depsPrev = ZnProfile.loadProfile().dependents || {};
ZnProfile.saveProfile({
incomeThisYearSalary: num('selfIncome'),
spouse: { has: true, income: num('spouseIncome'), inKokuho: false },
prefecture: $('prefecture').value,
industry: $('industry').value,
ageBand: $('selfAge').value === '65to69' ? '65plus' : $('selfAge').value,
spouseAgeBand: $('spouseAge').value === '65to69' ? '65plus' : $('spouseAge').value,
bonusPer: num('selfBonusPer'),
bonusCount: Math.floor(num('selfBonusCount')),
/* 世帯ツールの「一般」は16〜18歳と23歳以上を一括する。書き戻しは16〜18歳側へ寄せ、23歳以上は既存値を保持する */
dependents: {
under16: Math.floor(num('childUnder16')),
age16to18: Math.floor(num('childGeneral')),
age19to22: Math.floor(num('childSpecific')),
age23plus: depsPrev.age23plus || 0
}
});
};
ids.forEach(function (id) { $(id).addEventListener('input', persistSetai); $(id).addEventListener('change', persistSetai);});
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
