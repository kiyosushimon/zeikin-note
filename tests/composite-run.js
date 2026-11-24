/* 手取り複合版（来年の負担まるごとシミュレーター）の合奏テスト
 * 仕様: ~/workspace/notes/tax-tools-spec-13-composite.md §6（検算ケース3件）
 * 実行: node tests/composite-run.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const read = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', p), 'utf8'));

/* プロファイル部品のテスト用に localStorage スタブを先に置く */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  key: (i) => Object.keys(store)[i] || null,
  get length() { return Object.keys(store).length; }
};

const E = require('../js/composite-engine.js');
const ZnProfile = require('../js/profile.js');

const DATA = {
  tables: read('data/nencho/tables-2026.json'),
  juminzeiRules: read('data/juminzei/rules.json'),
  juminzeiCities: read('data/juminzei/cities.json'),
  kenpo: read('data/kenpo/rates-2026.json'),
  shahoParams: read('data/shaho/params-2026.json')
};
const NAGOYA_KOKUHO = read('data/kokuho/nagoya.json');

let pass = 0, fail = 0;
function eq(name, actual, expected) {
  if (actual === expected) { pass++; }
  else { fail++; console.log(`FAIL ${name}: expected ${expected}, got ${actual}`); }
}
function section(t) { console.log('— ' + t); }

const NO_DEPS = { under16: 0, age16to18: 0, age19to22: 0, age23plus: 0 };

/* ============ ケース1: 基準（会社員・年収1,000万円・配偶者あり年収0円・東京） ============ */
section('ケース1 会社員 年収10,000,000 配偶者あり(0円) 東京・標準経路');
{
  const r = E.compute(DATA, {
    course: 'employee',
    juminzeiCity: null, residentPrecise: false,
    ageBand: 'under40',
    spouse: { has: true, income: 0, ageBand: 'under40', inKokuho: false },
    dependents: NO_DEPS, residentCollection: 'special',
    prefecture: '東京都', industry: 'general',
    incomeThisYear: 10000000, incomeNextYear: 10000000, bonusPer: 0, bonusCount: 0
  });
  eq('社保(今年)本人負担', r.socialThis.total, 1265676);
  eq('社保 健康保険', r.socialThis.items.health, 490524);
  eq('社保 子ども支援金', r.socialThis.items.child, 11448);
  eq('社保 厚生年金', r.socialThis.items.pension, 713700);
  eq('社保 雇用保険', r.socialThis.items.employment, 50004);
  eq('社保(来年)本人負担', r.socialNext.total, 1265676);
  eq('住民税 合計所得金額', r.resident.totalIncome, 8050000);
  eq('住民税 課税所得', r.resident.taxable, 6024000);
  eq('住民税 調整控除', r.resident.adjustment, 2500);
  eq('住民税 税額', r.resident.total, 604800);
  eq('住民税 市分', r.resident.cityTax, 362400);
  eq('住民税 県分', r.resident.prefTax, 241400);
  eq('住民税 森林環境税', r.resident.forestTax, 1000);
  eq('所得税 課税所得', r.incomeTax.taxable, 5784000);
  eq('所得税 年税額', r.incomeTax.annualTax, 744600);
  eq('総負担', r.totalNext, 2615076);
  eq('手取り', r.netNext, 7384924);
  eq('月平均', r.monthlyAvg, 217923);
  /* ガント */
  const rows = Object.fromEntries(r.gantt.rows.map((x) => [x.key, x]));
  eq('ガント 住民税 月額', rows.resident.cells[6], 50400);
  eq('ガント 住民税 初月(端数寄せ)', rows.resident.cells[5], 50400);
  eq('ガント 住民税 来年1月は空', rows.resident.cells[0], null);
  eq('ガント 所得税 月額', rows.incomeTax.cells[0], 62050);
  eq('ガント 社保 月額', rows.social.cells[0], 105473);
  eq('ガント 月合計(6月)', r.gantt.monthTotals[5], 217923);
  eq('ガント 月合計の総和=総負担', r.gantt.monthTotals.reduce((a, b) => a + b, 0), 2615076);
  eq('ガント 月数', r.gantt.months.length, 17);
  eq('ガント 先頭ラベル', r.gantt.months[0].label, '令和9年1月');
  eq('ガント 末尾ラベル', r.gantt.months[16].label, '令和10年5月');
}

/* ============ ケース2: 自営業・名古屋市・所得300万円・単身 ============ */
section('ケース2 自営業 所得3,000,000 単身 名古屋市');
{
  const r = E.compute(DATA, {
    course: 'self',
    juminzeiCity: E.findJuminzeiCity(DATA.juminzeiCities, '名古屋市'), residentPrecise: true,
    ageBand: 'under40',
    spouse: { has: false, income: 0, ageBand: 'under40', inKokuho: false },
    dependents: NO_DEPS, residentCollection: 'ordinary',
    bizThisYear: 3000000, bizNextYear: 3000000,
    kokuhoData: NAGOYA_KOKUHO, kokuhoRoundingUnit: 10
  });
  eq('国保 合計', r.kokuho.total, 368150);
  eq('国保 医療分', r.kokuho.components.medical, 277520);
  eq('国保 支援金分', r.kokuho.components.support, 82090);
  eq('国保 介護分', r.kokuho.components.care, 0);
  eq('国保 子ども分', r.kokuho.components.child, 8540);
  eq('国民年金(来年1年分)', r.pension.annualNext, 218370);
  eq('社保控除の近似', r.socialDeductionApprox, 586520);
  eq('住民税 控除合計', r.resident.deductionTotal, 1016520);
  eq('住民税 課税所得', r.resident.taxable, 1983000);
  eq('住民税 調整控除', r.resident.adjustment, 2500);
  eq('住民税 税額', r.resident.total, 195000);
  eq('所得税 基礎控除', r.incomeTaxSelf.basic, 1040000);
  eq('所得税 課税所得', r.incomeTaxSelf.taxable, 1373000);
  eq('所得税 速算表', r.incomeTaxSelf.taxCalc, 68650);
  eq('所得税 年税額', r.incomeTaxSelf.annualTax, 70000);
  eq('総負担', r.totalNext, 851520);
  eq('手取り(所得ベース)', r.netNext, 2148480);
  eq('月平均', r.monthlyAvg, 70960);
  /* ガント */
  const rows = Object.fromEntries(r.gantt.rows.map((x) => [x.key, x]));
  eq('ガント 住民税 第1期', rows.resident.cells[5], 48750);
  eq('ガント 住民税 第2期(8月)', rows.resident.cells[7], 48750);
  eq('ガント 住民税 第3期(10月)', rows.resident.cells[9], 48750);
  eq('ガント 住民税 第4期(翌1月)', rows.resident.cells[12], 48750);
  eq('ガント 国保 1回分', rows.kokuho.cells[6], 36815);
  eq('ガント 国保 第1期(端数寄せ)', rows.kokuho.cells[5], 36815);
  eq('ガント 国保 最終(翌3月)', rows.kokuho.cells[14], 36815);
  eq('ガント 国民年金 1月', rows.pension.cells[0], 17920);
  eq('ガント 国民年金 3月', rows.pension.cells[2], 17920);
  eq('ガント 国民年金 4月', rows.pension.cells[3], 18290);
  eq('ガント 月合計の総和=総負担', r.gantt.monthTotals.reduce((a, b) => a + b, 0), 851520);
}

/* ============ ケース3: 年収変動（500万→700万）・ツケのズレ ============ */
section('ケース3 会社員 単身 東京 今年5,000,000→来年7,000,000');
{
  const r = E.compute(DATA, {
    course: 'employee',
    juminzeiCity: null, residentPrecise: false,
    ageBand: 'under40',
    spouse: { has: false, income: 0, ageBand: 'under40', inKokuho: false },
    dependents: NO_DEPS, residentCollection: 'special',
    prefecture: '東京都', industry: 'general',
    incomeThisYear: 5000000, incomeNextYear: 7000000, bonusPer: 0, bonusCount: 0
  });
  eq('社保(今年)', r.socialThis.total, 723132);
  eq('社保(来年)', r.socialNext.total, 1039644);
  eq('住民税 合計所得金額', r.resident.totalIncome, 3560000);
  eq('住民税 課税所得', r.resident.taxable, 2406000);
  eq('住民税 税額', r.resident.total, 243000);
  eq('対照値(来年の所得で決まるなら)', r.counterfactual.resident, 375500);
  eq('ツケのズレ', r.counterfactual.diff, 132500);
  eq('所得税(来年) 課税所得', r.incomeTax.taxable, 3490000);
  eq('所得税(来年) 基礎控除', r.incomeTax.basic, 670000);
  eq('所得税(来年)', r.incomeTax.annualTax, 276100);
  eq('総負担', r.totalNext, 1558744);
  eq('手取り', r.netNext, 5441256);
  eq('月平均', r.monthlyAvg, 129895);
  eq('今年の総負担(帰属ベース)', r.thisYear.total, 1057732);
  eq('今年の所得税', r.thisYear.incomeTax.annualTax, 91600);
  eq('今年の手取り(帰属ベース)', r.thisYear.net, 3942268);
  /* ガント */
  const rows = Object.fromEntries(r.gantt.rows.map((x) => [x.key, x]));
  eq('ガント 住民税 月額', rows.resident.cells[8], 20250);
  eq('ガント 所得税 1〜11月', rows.incomeTax.cells[0], 23008);
  eq('ガント 所得税 12月(端数寄せ)', rows.incomeTax.cells[11], 23012);
  eq('ガント 月合計の総和=総負担', r.gantt.monthTotals.reduce((a, b) => a + b, 0), 1558744);
}

/* ============ 自営業コース: 国保データなしは対象外エラー ============ */
section('自営業コース 国保対応外');
{
  const r = E.compute(DATA, {
    course: 'self',
    juminzeiCity: null, residentPrecise: false,
    ageBand: 'under40',
    spouse: { has: false, income: 0, ageBand: 'under40', inKokuho: false },
    dependents: NO_DEPS, residentCollection: 'ordinary',
    bizThisYear: 3000000, bizNextYear: 3000000,
    kokuhoData: null, kokuhoRoundingUnit: 100
  });
  eq('エラーが返る', r.errors.includes('kokuho-unavailable'), true);
}

/* ============ 共通プロファイル（js/profile.js） ============ */
section('共通プロファイル 読み書き');
{
  ZnProfile.clearAll();
  eq('初期は空', Object.keys(ZnProfile.loadProfile()).length, 0);
  ZnProfile.saveProfile({ workStyle: 'employee', incomeThisYearSalary: 5000000 });
  ZnProfile.saveProfile({ prefecture: '東京都' });
  const p = ZnProfile.loadProfile();
  eq('マージ保存: workStyle', p.workStyle, 'employee');
  eq('マージ保存: incomeThisYearSalary', p.incomeThisYearSalary, 5000000);
  eq('マージ保存: prefecture', p.prefecture, '東京都');
  ZnProfile.saveTool('composite', { course: 'self' });
  ZnProfile.saveTool('setai', { selfIncome: 6000000 });
  eq('ツール保存 composite', ZnProfile.loadTool('composite').course, 'self');
  eq('ツール保存 setai', ZnProfile.loadTool('setai').selfIncome, 6000000);
  store['unrelated.key'] = 'keep';
  ZnProfile.clearAll();
  eq('消去後プロファイルは空', Object.keys(ZnProfile.loadProfile()).length, 0);
  eq('消去後ツール保存なし', ZnProfile.loadTool('composite'), null);
  eq('無関係なキーは残る', store['unrelated.key'], 'keep');
}

/* ---------- 監査対応（2026-11-24）: 住民税の換算74万円・配偶者要件62万円（追加A） ---------- */
section('監査対応 追加A 住民税の換算と配偶者要件');
{
  /* 複合版の住民税は令和9年度課税（根拠は令和8年分の所得）。
   * 給与所得換算の最低保障は令和8年分の74万円: 年収150万円 → 所得76万円
   * （世帯・住民税ツールと同じ65万円の床だと所得85万円・住民税22,100円になっていた） */
  const r = E.compute(DATA, {
    course: 'employee',
    juminzeiCity: null, residentPrecise: false,
    ageBand: 'under40',
    spouse: { has: false, income: 0, ageBand: 'under40', inKokuho: false },
    dependents: NO_DEPS, residentCollection: 'special',
    prefecture: '東京都', industry: 'general',
    incomeThisYear: 1500000, incomeNextYear: 1500000, bonusPer: 0, bonusCount: 0
  });
  eq('追加A 住民税の合計所得は74万円の床で換算', r.resident.totalIncome, 760000);
  eq('追加A 住民税', r.resident.total, 13100);
  /* 配偶者の収入136万円 → 住民税の所得62万円ちょうど。
   * 令和9年度の同一生計配偶者の要件（62万円以下）を満たし、配偶者控除と人数カウントが効く
   * （令和8年度の58万円のままだと両方とも外れていた） */
  const r2 = E.compute(DATA, {
    course: 'employee',
    juminzeiCity: null, residentPrecise: false,
    ageBand: 'under40',
    spouse: { has: true, income: 1360000, ageBand: 'under40', inKokuho: false },
    dependents: NO_DEPS, residentCollection: 'special',
    prefecture: '東京都', industry: 'general',
    incomeThisYear: 5000000, incomeNextYear: 5000000, bonusPer: 0, bonusCount: 0
  });
  eq('追加A 配偶者控除（住民税）', r2.resident.deductions.spouse, 330000);
  eq('追加A 非課税判定の世帯人数', r2.resident.householdSize, 2);
}

/* ---------- 監査対応（2026-11-24）: 自営業・60歳以上の国民年金（追加C） ---------- */
section('監査対応 追加C 自営業・65歳の国民年金');
{
  /* 年齢区分65歳以上では国民年金を計上しない（強制加入は20歳以上60歳未満）。
   * 社保控除の近似からも外れるため、住民税・所得税・総負担が連動して変わる
   * （修正前: 年金218,370円・社保控除近似586,520円・住民税195,000円・所得税70,000円・総負担851,520円） */
  const r = E.compute(DATA, {
    course: 'self',
    juminzeiCity: E.findJuminzeiCity(DATA.juminzeiCities, '名古屋市'), residentPrecise: true,
    ageBand: '65plus',
    spouse: { has: false, income: 0, ageBand: 'under40', inKokuho: false },
    dependents: NO_DEPS, residentCollection: 'ordinary',
    bizThisYear: 3000000, bizNextYear: 3000000,
    kokuhoData: NAGOYA_KOKUHO, kokuhoRoundingUnit: 10
  });
  eq('追加C 国民年金は適用されない', r.pensionApplies, false);
  eq('追加C 国民年金 年額0', r.pensionAnnual, 0);
  eq('追加C 国保は不変', r.kokuho.total, 368150);
  eq('追加C 社保控除の近似は国保のみ', r.socialDeductionApprox, 368150);
  eq('追加C 住民税（控除が減り増える）', r.resident.total, 216200);
  eq('追加C 所得税（控除が減り増える）', r.incomeTax.annualTax, 81200);
  eq('追加C 総負担', r.totalNext, 665550);
  const prow = r.gantt.rows.find(function (row) { return row.key === 'pension'; });
  eq('追加C ガントの年金行 年額0', prow.annual, 0);
}

/* ---------- 再判定対応（2026-11-24）: REM-01 年齢区分の分割と60〜64歳の国民年金 ---------- */
section('再判定対応 REM-01 自営業・60〜64歳の国民年金と年齢区分の分割');
{
  /* 年齢区分を「40〜64歳」から「40〜59歳」「60〜64歳」に分割。
   * 60〜64歳は国民年金の強制加入（20歳以上60歳未満）の対象外なので年金を計上しない。
   * 一方で国保の介護分（40〜64歳が対象）と社保の介護保険料は60〜64歳でも発生する */
  const base = {
    course: 'self',
    juminzeiCity: E.findJuminzeiCity(DATA.juminzeiCities, '名古屋市'), residentPrecise: true,
    spouse: { has: false, income: 0, ageBand: 'under40', inKokuho: false },
    dependents: NO_DEPS, residentCollection: 'ordinary',
    bizThisYear: 3000000, bizNextYear: 3000000,
    kokuhoData: NAGOYA_KOKUHO, kokuhoRoundingUnit: 10
  };
  const r = E.compute(DATA, Object.assign({}, base, { ageBand: '60to64' }));
  eq('REM-01 60〜64歳 国民年金は適用されない', r.pensionApplies, false);
  eq('REM-01 60〜64歳 国民年金 年額0', r.pensionAnnual, 0);
  eq('REM-01 60〜64歳 国保の介護分は発生する', r.kokuho.components.care, 76250);
  eq('REM-01 60〜64歳 国保 合計', r.kokuho.total, 444400);
  eq('REM-01 60〜64歳 社保控除の近似は国保のみ', r.socialDeductionApprox, 444400);
  eq('REM-01 60〜64歳 住民税', r.resident.total, 208900);
  eq('REM-01 60〜64歳 所得税', r.incomeTax.annualTax, 77300);
  eq('REM-01 60〜64歳 総負担', r.totalNext, 730600);
  eq('REM-01 60〜64歳 手取り(所得ベース)', r.netNext, 2269400);
  const prow = r.gantt.rows.find(function (row) { return row.key === 'pension'; });
  eq('REM-01 60〜64歳 ガントの年金行 年額0', prow.annual, 0);
  eq('REM-01 60〜64歳 ガント 月合計の総和=総負担', r.gantt.monthTotals.reduce((a, b) => a + b, 0), 730600);

  /* 40〜59歳は従来の「40〜64歳」と同じ扱い（年金あり・介護分あり）。
   * 分割前の区分値 '40to64'（保存済み入力など）も '40to59' と同じ結果になること */
  const r59 = E.compute(DATA, Object.assign({}, base, { ageBand: '40to59' }));
  const rLegacy = E.compute(DATA, Object.assign({}, base, { ageBand: '40to64' }));
  eq('REM-01 40〜59歳 国民年金は適用される', r59.pensionApplies, true);
  eq('REM-01 40〜59歳 国民年金 年額', r59.pensionAnnual, 218370);
  eq('REM-01 40〜59歳 国保の介護分', r59.kokuho.components.care, 76250);
  eq('REM-01 40〜59歳 総負担', r59.totalNext, 916670);
  eq('REM-01 旧区分40to64は40to59と同じ総負担', rLegacy.totalNext, r59.totalNext);
  eq('REM-01 旧区分40to64は40to59と同じ国保', rLegacy.kokuho.total, r59.kokuho.total);

  /* 会社員コース: 60〜64歳でも社保の介護保険料は発生する（写像が壊れていないこと） */
  const e = E.compute(DATA, {
    course: 'employee',
    juminzeiCity: null, residentPrecise: false,
    ageBand: '60to64',
    spouse: { has: false, income: 0, ageBand: 'under40', inKokuho: false },
    dependents: NO_DEPS, residentCollection: 'special',
    prefecture: '東京都', industry: 'general',
    incomeThisYear: 5000000, incomeNextYear: 5000000, bonusPer: 0, bonusCount: 0
  });
  eq('REM-01 会社員60〜64歳 社保の介護保険料が発生', e.socialNext.items.care > 0, true);
  eq('REM-01 会社員60〜64歳 社保は40〜59歳と同額', e.socialNext.total, 762984);
}

console.log(`\ncomposite: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
