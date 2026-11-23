/* 住民税（個人市県民税）計算エンジン 令和8年度
   ルールは data/juminzei/rules.json、市別パラメータは data/juminzei/cities.json
   （いずれも総務省・自治体公式の一次ソースで確認済み）。 */
(function (global) {
  'use strict';

  function floor1000(n) { return Math.floor(n / 1000) * 1000; }
  function floor100(n) { return Math.floor(n / 100) * 100; }

  function basicDeduction(rules, totalIncome) {
    var rows = rules.income_deductions.basic.by_total_income;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].total_income_max_yen === null || totalIncome <= rows[i].total_income_max_yen) return rows[i].deduction_yen;
    }
    return 0;
  }

  function spouseDeduction(rules, totalIncome, spouse) {
    if (!spouse || totalIncome > 10000000) return 0;
    if (spouse.income > 580000) return 0;
    var rows = rules.income_deductions.spouse.by_taxpayer_total_income;
    for (var i = 0; i < rows.length; i++) {
      if (totalIncome <= rows[i].taxpayer_income_max_yen) return spouse.elderly ? rows[i].elderly_yen : rows[i].general_yen;
    }
    return 0;
  }

  function spouseSpecialDeduction(rules, totalIncome, spouse) {
    if (!spouse || totalIncome > 10000000) return 0;
    if (spouse.income <= 580000 || spouse.income > 1330000) return 0;
    var key = totalIncome <= 9000000 ? 'taxpayer_le_900man' : (totalIncome <= 9500000 ? 'taxpayer_le_950man' : 'taxpayer_le_1000man');
    var rows = rules.income_deductions.spouse_special.table;
    for (var i = 0; i < rows.length; i++) {
      if (spouse.income <= rows[i].spouse_income_max_yen) return rows[i][key];
    }
    return 0;
  }

  function spouseDifference(rules, totalIncome, spouse) {
    if (!spouse || totalIncome > 10000000 || spouse.income > 580000) return 0;
    var rows = rules.adjustment_deduction.personal_deduction_differences_yen.spouse_by_taxpayer_income;
    for (var i = 0; i < rows.length; i++) {
      if (totalIncome <= rows[i].taxpayer_income_max_yen) return spouse.elderly ? rows[i].elderly_yen : rows[i].general_yen;
    }
    return 0;
  }

  var SELF_DEDUCTION = {
    none: 0,
    disability_general: 260000, disability_special: 300000, disability_cohabiting: 530000,
    widow: 260000, single_parent: 300000, working_student: 260000
  };
  var SELF_DIFFERENCE = {
    none: 0,
    disability_general: 10000, disability_special: 100000, disability_cohabiting: 220000,
    widow: 10000, single_parent_mother: 50000, single_parent_father: 10000, working_student: 10000
  };

  /* input: { totalIncome, spouse:{income, elderly}|null, dependents:{general,specific,elderly,cohabiting,young},
              socialInsurance, selfStatus, isMinor, housingCredit } */
  function compute(rules, city, input) {
    var totalIncome = input.totalIncome || 0;
    var dep = input.dependents || {};
    var nDep = (dep.general || 0) + (dep.specific || 0) + (dep.elderly || 0) + (dep.cohabiting || 0) + (dep.young || 0);
    var n = 1 + (input.spouse ? 1 : 0) + nDep;

    /* ---- 非課税判定 ---- */
    var specialStatus = ['disability_general', 'disability_special', 'disability_cohabiting', 'widow', 'single_parent'].indexOf(input.selfStatus) >= 0 || !!input.isMinor;
    var specialExempt = specialStatus && totalIncome <= rules.nontaxable_limits.special_categories.limit_yen;
    var classRow = rules.nontaxable_limits.per_capita_levy.by_tax_class.filter(function (r) { return r.class === city.tax_class.class; })[0];
    var perCapitaLimit = classRow.base_yen * n + 100000 + (n > 1 ? classRow.dependent_addition_yen : 0);
    var incomeLevyLimit = 350000 * n + 100000 + (n > 1 ? 320000 : 0);
    var perCapitaExempt = specialExempt || totalIncome <= perCapitaLimit;
    var incomeLevyExempt = specialExempt || totalIncome <= incomeLevyLimit;

    /* ---- 所得控除 ---- */
    var selfKey = input.selfStatus || 'none';
    var deductions = {
      basic: basicDeduction(rules, totalIncome),
      spouse: spouseDeduction(rules, totalIncome, input.spouse),
      spouseSpecial: spouseSpecialDeduction(rules, totalIncome, input.spouse),
      dependents: (dep.general || 0) * 330000 + (dep.specific || 0) * 450000 + (dep.elderly || 0) * 380000 + (dep.cohabiting || 0) * 450000,
      self: SELF_DEDUCTION[selfKey] || 0,
      socialInsurance: input.socialInsurance || 0
    };
    var deductionTotal = deductions.basic + deductions.spouse + deductions.spouseSpecial + deductions.dependents + deductions.self + deductions.socialInsurance;
    var taxable = Math.max(0, floor1000(totalIncome - deductionTotal));

    /* ---- 所得割 ---- */
    var cityRate = city.income_levy.city_rate_pct / 100;
    var prefRate = city.income_levy.prefecture_rate_pct / 100;
    var cityGross = taxable * cityRate;
    var prefGross = taxable * prefRate;

    /* ---- 調整控除 ---- */
    var diff = rules.adjustment_deduction.personal_deduction_differences_yen;
    var diffTotal = 0;
    if (totalIncome <= 25000000) {
      diffTotal += diff.basic;
      diffTotal += spouseDifference(rules, totalIncome, input.spouse);
      diffTotal += (dep.general || 0) * diff.dependent.general + (dep.specific || 0) * diff.dependent.specific +
        (dep.elderly || 0) * diff.dependent.elderly + (dep.cohabiting || 0) * diff.dependent.cohabiting_elderly_parent;
      var sdKey = selfKey === 'single_parent' ? (input.singleParentMother ? 'single_parent_mother' : 'single_parent_father') : selfKey;
      diffTotal += SELF_DIFFERENCE[sdKey] || 0;
    }
    var adjustment = 0;
    if (totalIncome <= 25000000 && diffTotal > 0 && taxable > 0) {
      if (taxable <= 2000000) adjustment = Math.min(diffTotal, taxable) * 0.05;
      else adjustment = Math.max(Math.max(diffTotal - (taxable - 2000000), 50000) * 0.05, 2500);
    }
    var cityAdj = adjustment * 0.8;
    var prefAdj = adjustment * 0.2;

    /* ---- 住宅ローン控除（住民税分）: 市8:県2で按分し、各所得割を上限とする ---- */
    var credit = input.housingCredit || 0;
    var cityCredit = Math.min(credit * 0.8, Math.max(0, cityGross - cityAdj));
    var prefCredit = Math.min(credit - cityCredit, Math.max(0, prefGross - prefAdj));
    var creditApplied = cityCredit + prefCredit;

    /* ---- 税額の確定（所得割＋均等割を通して100円未満切捨て） ---- */
    var perCapitaCity = perCapitaExempt ? 0 : city.per_capita_levy.city_yen;
    var perCapitaPref = perCapitaExempt ? 0 : city.per_capita_levy.prefecture_yen;
    var cityTax = 0, prefTax = 0;
    if (!incomeLevyExempt) {
      cityTax = floor100(Math.max(0, cityGross - cityAdj - cityCredit) + perCapitaCity);
      prefTax = floor100(Math.max(0, prefGross - prefAdj - prefCredit) + perCapitaPref);
    } else {
      cityTax = perCapitaCity;
      prefTax = perCapitaPref;
    }
    var forestTax = perCapitaExempt ? 0 : (city.per_capita_levy.forest_environment_tax_national_yen || 1000);
    var total = cityTax + prefTax + forestTax;

    return {
      totalIncome: totalIncome, deductions: deductions, deductionTotal: deductionTotal,
      taxable: taxable, cityGross: cityGross, prefGross: prefGross,
      diffTotal: diffTotal, adjustment: adjustment, creditApplied: creditApplied,
      perCapitaExempt: perCapitaExempt, incomeLevyExempt: incomeLevyExempt, specialExempt: specialExempt,
      perCapitaLimit: perCapitaLimit, incomeLevyLimit: incomeLevyLimit, householdSize: n,
      cityTax: cityTax, prefTax: prefTax, forestTax: forestTax, total: total,
      spouseSpecialApplied: deductions.spouseSpecial > 0
    };
  }

  global.JuminzeiEngine = { compute: compute, basicDeduction: basicDeduction };
})(typeof window !== 'undefined' ? window : globalThis);
