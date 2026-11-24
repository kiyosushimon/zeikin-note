/* 手取り複合版（来年の負担まるごとシミュレーター）の合奏エンジン
 * 仕様: ~/workspace/notes/tax-tools-spec-13-composite.md
 * 新規の税計算ロジックは作らない。既存エンジン（ShahoEngine / NenchoEngine /
 * JuminzeiEngine / KokuhoEngine / SetaiEngine.residentSalaryIncome）の合奏のみ。
 * 年の前提は固定: 今年=令和8年(2026) / 来年=令和9年(2027) / 再来年=令和10年(2028)。
 * 「来年の総負担」は帰属ベース（支払月が再来年にまたがる分も全額含める）。
 */
(function (global) {
'use strict';

if (typeof require !== 'undefined') {
  try {
    require('./shaho-engine.js');
    require('./nencho-engine.js');
    require('./juminzei-engine.js');
    require('./kokuho-engine.js');
    require('./setai-engine.js');
  } catch (e) { /* ブラウザでは script タグで読み込み済み */ }
}
var ShahoEngine = global.ShahoEngine;
var NenchoEngine = global.NenchoEngine;
var JuminzeiEngine = global.JuminzeiEngine;
var KokuhoEngine = global.KokuhoEngine;
var SetaiEngine = global.SetaiEngine;

/* 国民年金保険料（1人分・月額）。令和8年度=17,920円（日本年金機構）、
 * 令和9年度=18,290円（市区町村の公式案内で確認。仕様書 §1.4・§7.1） */
var PENSION_R8_MONTHLY = 17920;
var PENSION_R9_MONTHLY = 18290;
/* 来年（令和9年）1年分: 1〜3月は令和8年度額、4〜12月は令和9年度額 */
var PENSION_ANNUAL_NEXT = PENSION_R8_MONTHLY * 3 + PENSION_R9_MONTHLY * 9; // 218,370

/* 複合版の住民税は令和9年度課税（根拠は今年=令和8年分の所得）のため、
 * 給与所得換算の最低保障は令和8年分の74万円を使う（SetaiEngine の既定65万円は
 * 令和8年度住民税=令和7年分所得ベースの世帯・住民税ツール用） */
var RESIDENT_SALARY_MIN_R8 = 740000;

/* ガント表示期間: 来年1月（令和9年1月）〜再来年5月（令和10年5月）の17か月 */
var GANTT_MONTHS = [];
for (var gi = 0; gi < 17; gi++) {
  var gy = 2027 + Math.floor(gi / 12);
  var gm = (gi % 12) + 1;
  GANTT_MONTHS.push({
    index: gi, year: gy, month: gm,
    label: '令和' + (gy - 2018) + '年' + gm + '月',
    short: gm + '月',
    yearStart: gm === 1
  });
}

/* 住民税の標準合成レコード（仕様 §4.1）。対応6市以外はこの標準税率で計算し、
 * 結果は「目安」と明示する。組み立てたレコードを同じ JuminzeiEngine.compute に渡す。 */
function standardCity() {
  return {
    city: '（標準税率）',
    income_levy: { city_rate_pct: 6, prefecture_rate_pct: 4 },
    per_capita_levy: { city_yen: 3000, prefecture_yen: 1000, forest_environment_tax_national_yen: 1000 },
    tax_class: { class: 1 }
  };
}
function findJuminzeiCity(citiesJson, name) {
  if (!citiesJson || !citiesJson.cities) return null;
  for (var i = 0; i < citiesJson.cities.length; i++) {
    if (citiesJson.cities[i].city === name) return citiesJson.cities[i];
  }
  return null;
}

/* 年齢区分 → 国保計算用の代表年齢（仕様 §1.4: 子供は 16歳未満=10歳 /
 * 16〜18歳=17歳 / 19歳以上=20歳。本人・配偶者は区分の代表値） */
function repAge(ageBand) {
  if (ageBand === '40to64') return 50;
  if (ageBand === '65plus') return 70;
  return 35;
}
/* 年齢区分 → ShahoEngine の区分（介護保険料は 40to64 のみ発生） */
function shahoAgeBand(ageBand) {
  if (ageBand === '40to64') return '40to64';
  if (ageBand === '65plus') return '65to69';
  return 'under40';
}

/* 扶養の写像（仕様 §3-2） */
function mapDependents(d) {
  var general = (d.age16to18 || 0) + (d.age23plus || 0);
  var specific = d.age19to22 || 0;
  var young = d.under16 || 0;
  return {
    general: general, specific: specific, young: young,
    childCount: young + general + specific,
    nencho: {
      general: general, specific: specific, elderlyCohab: 0, elderlyOther: 0,
      disabledGeneral: 0, disabledSpecial: 0, disabledCohabSpecial: 0, selfStatus: 'none'
    },
    juminzei: { general: general, specific: specific, elderly: 0, cohabiting: 0, young: young }
  };
}

/* 社会保険料（会社員）: 世帯ツールと同じ導出（月額基礎 = (年収 − 賞与年額) ÷ 12） */
function shahoCalc(data, income, bonusPer, bonusCount, prefecture, ageBand, industry) {
  var bonusTotal = bonusPer * bonusCount;
  var monthlyGross = Math.max(0, Math.floor((income - bonusTotal) / 12));
  var r = ShahoEngine.compute(
    { kenpo: data.kenpo, params: data.shahoParams },
    {
      prefecture: prefecture, ageBand: shahoAgeBand(ageBand), salaryMode: 'gross',
      gross: monthlyGross, bonusGross: bonusPer, bonusCount: bonusCount,
      industry: industry, employmentInsured: true, cumulativeBonus: 0
    }
  );
  var kenpoRec = (data.kenpo.prefectures || {})[prefecture] || {};
  var empRates = (data.shahoParams.employment_rates || {})[industry] || {};
  return {
    monthlyGross: monthlyGross,
    standardHealth: r.monthly.standardHealth,
    standardPension: r.monthly.standardPension,
    bonusCountApplied: r.bonusCount,
    monthly: r.monthly.totals.insured,
    bonusPerPayment: r.bonus.totals.insured,
    total: r.annual.totals.insured,
    items: {
      health: r.annual.items.health.insured, care: r.annual.items.care.insured,
      child: r.annual.items.child.insured, pension: r.annual.items.pension.insured,
      employment: r.annual.items.employment.insured
    },
    monthlyItems: {
      health: r.monthly.items.health.insured, care: r.monthly.items.care.insured,
      child: r.monthly.items.child.insured, pension: r.monthly.items.pension.insured,
      employment: r.monthly.items.employment.insured
    },
    rates: {
      health: kenpoRec.health_rate, care: kenpoRec.care_rate, child: kenpoRec.child_rate,
      pension: data.shahoParams.pension_rate, employmentWorker: empRates.worker_rate
    }
  };
}

/* 住民税（JuminzeiEngine 経路に統一）
 * 複合版の住民税は「来年の住民税」= 令和9年度課税で、根拠は今年（令和8年分）の所得。
 * そのため同一生計配偶者の所得要件は令和9年度の62万円を渡す
 * （住民税ツール本体・令和8年度はエンジン既定の58万円）。 */
function residentCalc(data, cityRec, totalIncome, socialInsurance, spouseJuminzei, deps) {
  var r = JuminzeiEngine.compute(data.juminzeiRules, cityRec, {
    totalIncome: totalIncome,
    spouse: spouseJuminzei,
    dependents: deps.juminzei,
    socialInsurance: socialInsurance,
    selfStatus: 'none', isMinor: false, housingCredit: 0,
    spouseIncomeLimit: 620000
  });
  r.cityRatePct = cityRec.income_levy.city_rate_pct;
  r.prefRatePct = cityRec.income_levy.prefecture_rate_pct;
  r.perCapitaCity = cityRec.per_capita_levy.city_yen;
  r.perCapitaPref = cityRec.per_capita_levy.prefecture_yen;
  return r;
}

/* 所得税の速算表の行（計算式の表示・コピー文用） */
function taxRowOf(tables, taxable) {
  var rows = tables.tax_table.rows;
  for (var i = 0; i < rows.length; i++) {
    if (taxable <= rows[i].max) return rows[i];
  }
  return rows[rows.length - 1];
}

/* 国保の世帯員を組む（仕様 §1.4-1）。世帯類型は normal 固定、
 * 未就学児の5割減額は v1 では適用しない（高めに出る近似） */
function kokuhoMembers(input, bizIncome) {
  var members = [{
    age: repAge(input.ageBand), income: bizIncome, judgementIncome: bizIncome,
    earner: false, preschool: false, role: '本人'
  }];
  if (input.spouse.has && input.spouse.inKokuho) {
    members.push({
      age: repAge(input.spouse.ageBand), income: input.spouse.income,
      judgementIncome: input.spouse.income, earner: false, preschool: false, role: '配偶者'
    });
  }
  var d = input.dependents;
  var i;
  for (i = 0; i < (d.under16 || 0); i++) members.push({ age: 10, income: 0, judgementIncome: 0, earner: false, preschool: false, role: '子（16歳未満）' });
  for (i = 0; i < (d.age16to18 || 0); i++) members.push({ age: 17, income: 0, judgementIncome: 0, earner: false, preschool: false, role: '子（16〜18歳）' });
  for (i = 0; i < ((d.age19to22 || 0) + (d.age23plus || 0)); i++) members.push({ age: 20, income: 0, judgementIncome: 0, earner: false, preschool: false, role: '子（19歳以上）' });
  return members;
}
function kokuhoCalc(data, input, bizIncome) {
  var members = kokuhoMembers(input, bizIncome);
  var r = KokuhoEngine.compute(input.kokuhoData, { roundingUnit: input.kokuhoRoundingUnit }, {
    members: members, householdType: 'normal'
  });
  r.members = members;
  r.judgementIncome = members.reduce(function (s, m) { return s + m.judgementIncome; }, 0);
  return r;
}

/* 分割: 初回（第1期）に端数を寄せる */
function splitFirstGetsRemainder(annual, n) {
  var base = Math.floor(annual / n);
  return { first: annual - base * (n - 1), rest: base };
}
/* 分割: 最終月に端数を寄せる（所得税の均し） */
function splitLastGetsRemainder(annual, n) {
  var base = Math.floor(annual / n);
  return { rest: base, last: annual - base * (n - 1) };
}

/* ガントの帯データ（仕様 §1.6）。cells は17か月分（0=来年1月 … 16=再来年5月） */
function buildGantt(course, r, input) {
  var rows = [];
  function newRow(key, label, kind, annual, note) {
    var cells = [];
    for (var i = 0; i < 17; i++) cells.push(null);
    return { key: key, label: label, kind: kind, annual: annual, cells: cells, note: note || '' };
  }
  var i, s;

  /* 所得税: 来年1〜12月、年額÷12の均し（端数は12月へ）。実際は源泉徴収・確定申告 */
  var itRow = newRow('incomeTax', '所得税', '現年型', r.incomeTax.annualTax,
    '年額を12で割った均し表示です（実際は毎月の源泉徴収と年末調整・確定申告で精算されます）');
  s = splitLastGetsRemainder(r.incomeTax.annualTax, 12);
  for (i = 0; i < 11; i++) itRow.cells[i] = s.rest;
  itRow.cells[11] = s.last;
  rows.push(itRow);

  if (course === 'employee') {
    var shRow = newRow('social', '社会保険料', '現年型', r.socialNext.total,
      '毎月の給与から天引き。賞与分は支給月に上乗せしています（支給月は回数から機械的に割り当てています: 年1回は12月、年2回は6月・12月、年3回は6月・7月・12月。実際の支給月とは異なる場合があります）');
    var bonusMonths = { 1: [11], 2: [5, 11], 3: [5, 6, 11] };
    var bm = bonusMonths[r.socialNext.bonusCountApplied] || [];
    for (i = 0; i < 12; i++) {
      shRow.cells[i] = r.socialNext.monthly + (bm.indexOf(i) >= 0 ? r.socialNext.bonusPerPayment : 0);
    }
    rows.push(shRow);
  } else {
    var khRow = newRow('kokuho', '国民健康保険料', 'ツケ型', r.kokuho.total,
      '年10回・6月開始の標準パターンで表示しています（自治体により異なります）');
    s = splitFirstGetsRemainder(r.kokuho.total, 10);
    khRow.cells[5] = s.first;
    for (i = 6; i <= 14; i++) khRow.cells[i] = s.rest;
    rows.push(khRow);

    var pnAnnual = (r.pensionAnnual != null ? r.pensionAnnual : PENSION_ANNUAL_NEXT);
    var pnRow = newRow('pension', '国民年金保険料', '現年型', pnAnnual,
      pnAnnual > 0
        ? '納付期限は翌月末です。1〜3月は令和8年度額、4月から令和9年度額'
        : '60歳以上のため計上していません（国民年金の強制加入は20歳以上60歳未満。任意加入は対象外）');
    for (i = 0; i < 12; i++) pnRow.cells[i] = pnAnnual > 0 ? (i < 3 ? PENSION_R8_MONTHLY : PENSION_R9_MONTHLY) : 0;
    rows.push(pnRow);
  }

  /* 住民税: 特別徴収=来年6月〜再来年5月の12回（端数は初月）、
   * 普通徴収=年4回（来年6月・8月・10月・再来年1月、端数は第1期） */
  var rtRow = newRow('resident', '住民税', 'ツケ型', r.resident.total,
    input.residentCollection === 'special'
      ? '特別徴収: 来年6月〜再来年5月の給与から天引き'
      : '普通徴収: 年4回（6月・8月・10月・翌年1月）の納付書払い');
  if (input.residentCollection === 'special') {
    s = splitFirstGetsRemainder(r.resident.total, 12);
    rtRow.cells[5] = s.first;
    for (i = 6; i <= 16; i++) rtRow.cells[i] = s.rest;
  } else {
    s = splitFirstGetsRemainder(r.resident.total, 4);
    rtRow.cells[5] = s.first;
    rtRow.cells[7] = s.rest;
    rtRow.cells[9] = s.rest;
    rtRow.cells[12] = s.rest;
  }
  rows.push(rtRow);

  var monthTotals = [];
  for (i = 0; i < 17; i++) {
    var sum = 0;
    rows.forEach(function (row) { if (row.cells[i] != null) sum += row.cells[i]; });
    monthTotals.push(sum);
  }
  return { months: GANTT_MONTHS, rows: rows, monthTotals: monthTotals };
}

function computeComposite(data, input) {
  var errors = [];
  var deps = mapDependents(input.dependents);
  var cityRec = input.juminzeiCity || standardCity();
  var r = {
    course: input.course,
    residentPrecise: !!input.residentPrecise,
    errors: errors,
    pension: {
      monthlyR8: PENSION_R8_MONTHLY, monthlyR9: PENSION_R9_MONTHLY, annualNext: PENSION_ANNUAL_NEXT,
      annualApplied: PENSION_ANNUAL_NEXT
    }
  };

  if (input.course === 'employee') {
    /* (1) 今年の社会保険料 → 住民税の社保控除にも使う */
    r.socialThis = shahoCalc(data, input.incomeThisYear, input.bonusPer, input.bonusCount,
      input.prefecture, input.ageBand, input.industry);
    /* (2) 住民税: 今年の所得 × 今年の社保控除 */
    var spouseResidentIncomeThis = input.spouse.has
      ? SetaiEngine.residentSalaryIncome(input.spouse.income, RESIDENT_SALARY_MIN_R8) : 0;
    r.resident = residentCalc(data, cityRec,
      SetaiEngine.residentSalaryIncome(input.incomeThisYear, RESIDENT_SALARY_MIN_R8), r.socialThis.total,
      input.spouse.has ? { income: spouseResidentIncomeThis, elderly: false } : null, deps);
    /* (3) 来年の社会保険料 */
    r.socialNext = shahoCalc(data, input.incomeNextYear, input.bonusPer, input.bonusCount,
      input.prefecture, input.ageBand, input.industry);
    /* (4) 所得税: 来年の年収 × 来年の社保。世帯ツールと同じ配偶者の渡し方 */
    var spouseTaxIncome = input.spouse.has
      ? NenchoEngine.salaryAfterDeduction(data.tables, input.spouse.income)
        - NenchoEngine.adjustmentDeduction(data.tables, input.spouse.income, false)
      : 0;
    function incomeTaxOf(income, social) {
      var full = NenchoEngine.compute(data.tables, {
        income: income, socialInsurance: social, smallBusiness: 0, withheld: 0,
        housing: 0, otherIncome: 0,
        life: { general: 0, care: 0, pension: 0, newGeneral: 0, newCare: 0, newPension: 0 },
        hasYoungDependent: false, quake: 0, oldLongDamage: 0,
        spouse: input.spouse.has
          ? { has: true, income: spouseTaxIncome, elderly: false }
          : { has: false, income: 0, elderly: false },
        specificRelatives: [],
        dependents: deps.nencho,
        adjustmentEligible: deps.childCount > 0
      });
      full.taxRow = taxRowOf(data.tables, full.taxable);
      return full;
    }
    r.incomeTax = incomeTaxOf(input.incomeNextYear, r.socialNext.total);
    var incomeTaxThis = incomeTaxOf(input.incomeThisYear, r.socialThis.total);
    /* (5) 合計（帰属ベース） */
    r.totalNext = r.resident.total + r.incomeTax.annualTax + r.socialNext.total;
    r.netNext = input.incomeNextYear - r.totalNext;
    r.thisYear = {
      total: r.resident.total + incomeTaxThis.annualTax + r.socialThis.total,
      net: input.incomeThisYear - (r.resident.total + incomeTaxThis.annualTax + r.socialThis.total),
      incomeTax: incomeTaxThis
    };
    r.tsukeTotal = r.resident.total;
    r.currentTotal = r.incomeTax.annualTax + r.socialNext.total;
    /* 対照値: もし住民税が来年の所得で決まるなら（ツケのズレの可視化） */
    var residentIfNext = residentCalc(data, cityRec,
      SetaiEngine.residentSalaryIncome(input.incomeNextYear, RESIDENT_SALARY_MIN_R8), r.socialNext.total,
      input.spouse.has ? { income: spouseResidentIncomeThis, elderly: false } : null, deps);
    r.counterfactual = {
      resident: residentIfNext.total,
      tsukeTotal: residentIfNext.total,
      diff: residentIfNext.total - r.resident.total
    };
  } else {
    /* 自営業コース */
    if (!input.kokuhoData) {
      errors.push('kokuho-unavailable');
      r.errors = errors;
      return r;
    }
    /* (1) 国保: 今年の所得ベース */
    r.kokuho = kokuhoCalc(data, input, input.bizThisYear);
    /* (2) 国民年金: 強制加入は20歳以上60歳未満。年齢区分が65歳以上の場合は
     * 加算しない（任意加入は対象外として注記に倒す）。
     * 社会保険料控除の近似にも含めないため、住民税・所得税も連動して変わる */
    var pensionApplies = input.ageBand !== '65plus';
    var pensionAnnual = pensionApplies ? PENSION_ANNUAL_NEXT : 0;
    r.pensionApplies = pensionApplies;
    r.pensionAnnual = pensionAnnual;
    r.pension.annualApplied = pensionAnnual;
    /* (3) 社保控除の近似 = 国保料 + 国民年金（来年1年分） */
    r.socialDeductionApprox = r.kokuho.total + pensionAnnual;
    /* (4) 住民税: 今年の所得 × 近似の社保控除 */
    r.resident = residentCalc(data, cityRec, input.bizThisYear, r.socialDeductionApprox,
      input.spouse.has ? { income: input.spouse.income, elderly: false } : null, deps);
    /* (5) 所得税: 来年の所得 − 近似の社保控除 − 基礎控除（仕様 §1.4-5 の式どおり。
     * 配偶者・扶養控除はこの式には含めない） */
    function selfIncomeTaxOf(bizIncome, socialDed) {
      var basic = NenchoEngine.basicDeduction(data.tables, bizIncome);
      var taxable = Math.floor(Math.max(0, bizIncome - socialDed - basic) / 1000) * 1000;
      var taxCalc = NenchoEngine.taxFromTable(data.tables, taxable);
      var annualTax = Math.floor(taxCalc * data.tables.tax_table.reconstruction_rate_per_mille / 100000) * 100;
      return {
        basic: basic, taxable: taxable, taxCalc: taxCalc, annualTax: annualTax,
        taxRow: taxRowOf(data.tables, taxable), socialDeduction: socialDed
      };
    }
    r.incomeTaxSelf = selfIncomeTaxOf(input.bizNextYear, r.socialDeductionApprox);
    r.incomeTax = { annualTax: r.incomeTaxSelf.annualTax, taxable: r.incomeTaxSelf.taxable };
    var incomeTaxThisSelf = selfIncomeTaxOf(input.bizThisYear, r.socialDeductionApprox);
    /* (6) 合計（帰属ベース）。手取りは所得ベース */
    r.totalNext = r.resident.total + r.kokuho.total + pensionAnnual + r.incomeTax.annualTax;
    r.netNext = input.bizNextYear - r.totalNext;
    var totalThis = r.resident.total + r.kokuho.total + pensionAnnual + incomeTaxThisSelf.annualTax;
    r.thisYear = { total: totalThis, net: input.bizThisYear - totalThis, incomeTax: { annualTax: incomeTaxThisSelf.annualTax } };
    r.tsukeTotal = r.resident.total + r.kokuho.total;
    r.currentTotal = pensionAnnual + r.incomeTax.annualTax;
    /* 対照値: 来年の所得で国保・住民税が決まるなら */
    var kokuhoIfNext = kokuhoCalc(data, input, input.bizNextYear);
    var approxIfNext = kokuhoIfNext.total + pensionAnnual;
    var residentIfNextSelf = residentCalc(data, cityRec, input.bizNextYear, approxIfNext,
      input.spouse.has ? { income: input.spouse.income, elderly: false } : null, deps);
    r.counterfactual = {
      resident: residentIfNextSelf.total,
      kokuho: kokuhoIfNext.total,
      tsukeTotal: residentIfNextSelf.total + kokuhoIfNext.total,
      diff: (residentIfNextSelf.total + kokuhoIfNext.total) - (r.resident.total + r.kokuho.total)
    };
  }

  r.monthlyAvg = Math.round(r.totalNext / 12);
  r.gantt = buildGantt(input.course, r, input);
  r.errors = errors;
  return r;
}

var api = {
  compute: computeComposite,
  standardCity: standardCity,
  findJuminzeiCity: findJuminzeiCity,
  GANTT_MONTHS: GANTT_MONTHS,
  PENSION_R8_MONTHLY: PENSION_R8_MONTHLY,
  PENSION_R9_MONTHLY: PENSION_R9_MONTHLY,
  PENSION_ANNUAL_NEXT: PENSION_ANNUAL_NEXT,
  mapDependents: mapDependents
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.CompositeEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
