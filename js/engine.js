/*
 * 退職金 × iDeCo/DC 受け取り順序シミュレーター — 計算エンジン
 *
 * 仕様: ~/workspace/notes/tax-tools-spec-01-taishoku-dc.md (§2 入力 / §3 計算フロー / §4 出力 / §5 前提)
 * ルールは data/rules.json (data/rules.js) から読み込んだオブジェクトを引数で受け取る。
 * このファイルに税率・控除額などの数値は直書きしない。
 * ブラウザ内計算のみ。サーバー送信は一切しない。
 * Node でも読み込める (module.exports) ため、tests/run.js から直接検算できる。
 */
(function (global) {
  'use strict';

  /* ---------- 期間（年月）のユーティリティ ---------- */

  // "2026-03" -> 月インデックス (年*12 + 月-1)
  function monthIndex(monthStr) {
    var p = String(monthStr).split('-');
    return parseInt(p[0], 10) * 12 + (parseInt(p[1], 10) - 1);
  }

  // 期間群を和集合としてマージする（重なり・隣接を吸収）。各期間は [開始idx, 終了idx]（両端含む）
  function mergeIntervals(intervals) {
    var sorted = intervals.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var merged = [];
    sorted.forEach(function (iv) {
      var last = merged[merged.length - 1];
      if (last && iv[0] <= last[1] + 1) {
        if (iv[1] > last[1]) last[1] = iv[1];
      } else {
        merged.push([iv[0], iv[1]]);
      }
    });
    return merged;
  }

  function intervalsTotalMonths(intervals) {
    return mergeIntervals(intervals).reduce(function (sum, iv) { return sum + (iv[1] - iv[0] + 1); }, 0);
  }

  // 2つの期間群の重複月数（各群は内部で和集合化してから交差を取る）
  function overlapMonths(aIntervals, bIntervals) {
    var a = mergeIntervals(aIntervals);
    var b = mergeIntervals(bIntervals);
    var total = 0;
    a.forEach(function (x) {
      b.forEach(function (y) {
        var s = Math.max(x[0], y[0]);
        var e = Math.min(x[1], y[1]);
        if (e >= s) total += e - s + 1;
      });
    });
    return total;
  }

  // 月数 -> 年数（1年未満切り上げ。§1.2 / §1.4）
  function yearsCeil(months) {
    return Math.ceil(months / 12);
  }

  /* ---------- 控除額 ---------- */

  // D(n): §1.2 の退職所得控除額（最低額つき）
  function deductionForYears(rules, n) {
    var d = rules.deduction;
    if (n <= 0) return d.minimum;
    if (n <= d.thresholdYears) return Math.max(d.perYearUnderThreshold * n, d.minimum);
    return d.baseOverThreshold + d.perYearOverThreshold * (n - d.thresholdYears);
  }

  // 重複相当額: §1.2 の表の式を重複年数に適用する。相当額自体には最低額を適用しない（§1.5(b) / 裏取り#2）
  function equivalentForYears(rules, n) {
    var d = rules.deduction;
    if (n <= 0) return 0;
    if (n <= d.thresholdYears) return d.perYearUnderThreshold * n;
    return d.baseOverThreshold + d.perYearOverThreshold * (n - d.thresholdYears);
  }

  /* ---------- 税額 ---------- */

  // 課税退職所得金額（退職所得の金額）。1,000円未満切り捨て（§1.6 / §1.8）
  function taxableIncome(rules, income, deduction, category) {
    var r = income - deduction;
    if (r <= 0) return 0;
    var t;
    if (category === 'short') {
      var th = rules.shortTerm.halfThreshold;
      t = r <= th ? r / 2 : th / 2 + (r - th);
    } else {
      t = r / 2;
    }
    var unit = rules.rounding.taxableUnit;
    return Math.floor(t / unit) * unit;
  }

  // 所得税額（復興特別所得税込み）。速算表 (§1.8)。1円未満切り捨て
  function incomeTax(rules, taxable) {
    if (taxable <= 0) return 0;
    var brackets = rules.incomeTaxTable.brackets;
    var b = brackets[brackets.length - 1];
    for (var i = 0; i < brackets.length; i++) {
      if (brackets[i].upTo !== null && taxable <= brackets[i].upTo) { b = brackets[i]; break; }
    }
    var tax = (taxable * b.rate - b.deduction) * rules.incomeTaxTable.factor;
    // 浮動小数の誤差で 1 円ずれるのを防ぐための微小な補正をしてから切り捨てる
    return Math.floor(tax + 1e-6);
  }

  // 住民税: 市 6% / 県 4% を各々計算し各々100円未満切り捨て (§1.6)
  function residentTax(rules, taxable) {
    if (taxable <= 0) return { municipal: 0, prefectural: 0, total: 0 };
    var unit = rules.rounding.residentTaxUnit;
    var municipal = Math.floor(taxable * rules.residentTax.municipalRate / unit + 1e-9) * unit;
    var prefectural = Math.floor(taxable * rules.residentTax.prefecturalRate / unit + 1e-9) * unit;
    return { municipal: municipal, prefectural: prefectural, total: municipal + prefectural };
  }

  /* ---------- 単体計算 (§3.2) ---------- */

  // opts: { income, years, category, deductionOverride, deductionBefore, overlapEquivalent, floorApplied }
  function computeReceipt(rules, opts) {
    var deduction;
    var deductionBefore = null;
    var overlapEquivalent = 0;
    var floorApplied = false;
    if (opts.deductionOverride != null) {
      deduction = opts.deductionOverride;
      deductionBefore = opts.deductionBefore;
      overlapEquivalent = opts.overlapEquivalent || 0;
      floorApplied = !!opts.floorApplied;
    } else {
      deduction = deductionForYears(rules, opts.years);
    }
    var taxable = taxableIncome(rules, opts.income, deduction, opts.category);
    var it = incomeTax(rules, taxable);
    var rt = residentTax(rules, taxable);
    return {
      income: opts.income,
      years: opts.years,
      category: opts.category,
      deductionBefore: deductionBefore,
      overlapEquivalent: overlapEquivalent,
      deduction: deduction,
      floorApplied: floorApplied,
      taxable: taxable,
      incomeTax: it,
      residentMunicipal: rt.municipal,
      residentPrefectural: rt.prefectural,
      residentTax: rt.total,
      tax: it + rt.total,
      net: opts.income - it - rt.total
    };
  }

  /* ---------- 入力の正規化と区分判定 (§2 / §3.1) ---------- */

  /*
   * rawInput:
   * {
   *   serviceStart: "YYYY-MM", serviceEnd: "YYYY-MM",   // R1, R2
   *   retirementIncome: 円,                              // R3
   *   officerYears: 年数,                                // R5
   *   retirementYear: 暦年,                              // R6
   *   dcPeriods: [{start:"YYYY-MM", end:"YYYY-MM"}],     // D1/D2
   *   dcIncome: 円                                       // D3
   * }
   */
  function normalize(rules, raw) {
    var serviceInterval = [monthIndex(raw.serviceStart), monthIndex(raw.serviceEnd)];
    var serviceMonths = serviceInterval[1] - serviceInterval[0] + 1;
    var a = yearsCeil(serviceMonths);

    var dcIntervals = (raw.dcPeriods || []).map(function (p) { return [monthIndex(p.start), monthIndex(p.end)]; });
    var dcMonths = intervalsTotalMonths(dcIntervals);
    var b = yearsCeil(dcMonths);

    var officerYears = raw.officerYears || 0;

    // 特定役員退職手当等の判定 (§1.3 / §3.1 手順2 / §5.1-4):
    // 役員等勤続年数が 5 年以下である人が、その期間に対応して支払を受ける場合は v1 対象外。
    var outOfScopeOfficer = officerYears > 0 && officerYears <= rules.shortTerm.serviceYearsMax;

    // 短期勤続年数 (§1.3): 役員等以外の期間で計算した年数。役員等期間がある場合はその期間を含めて計算する。
    // すなわち本仕様の読みでは短期勤続年数 = 勤続年数 A そのものになる（tests.md に解釈として明記）。
    var retirementCategory = a <= rules.shortTerm.serviceYearsMax ? 'short' : 'general';
    var dcCategory = b <= rules.shortTerm.serviceYearsMax ? 'short' : 'general';

    return {
      serviceInterval: serviceInterval,
      serviceMonths: serviceMonths,
      serviceYears: a,
      dcIntervals: dcIntervals,
      dcMonths: dcMonths,
      dcYears: b,
      retirementIncome: raw.retirementIncome,
      retirementYear: raw.retirementYear,
      officerYears: officerYears,
      dcIncome: raw.dcIncome,
      retirementCategory: retirementCategory,
      dcCategory: dcCategory,
      outOfScopeOfficer: outOfScopeOfficer
    };
  }

  /* ---------- 別年パターンの重なり調整 (§3.4) ---------- */

  // prior / later は 'retirement' | 'dc'
  function computeSeparateYear(rules, input, priorKind, dcYear) {
    var retirementYear = input.retirementYear;
    var priorYear = priorKind === 'dc' ? dcYear : retirementYear;
    var laterYear = priorKind === 'dc' ? retirementYear : dcYear;

    function side(kind) {
      return kind === 'retirement'
        ? { income: input.retirementIncome, years: input.serviceYears, category: input.retirementCategory, intervals: [input.serviceInterval], start: input.serviceInterval[0] }
        : { income: input.dcIncome, years: input.dcYears, category: input.dcCategory, intervals: input.dcIntervals, start: input.dcIntervals.length ? Math.min.apply(null, input.dcIntervals.map(function (iv) { return iv[0]; })) : 0 };
    }
    var prior = side(priorKind);
    var later = side(priorKind === 'dc' ? 'retirement' : 'dc');

    // 手順1: 先行側は通常計算
    var priorReceipt = computeReceipt(rules, prior);

    // 手順2: ウィンドウ判定 (§1.5(c))
    var windowYears;
    var windowLabel;
    if (priorKind === 'dc') {
      var w = rules.windows.dcToRetirement;
      var isPostEra = dcYear >= w.eraStartYear;
      windowYears = isPostEra ? w.onOrAfterEra : w.beforeEra;
      windowLabel = 'DC老齢一時金 → 退職手当等（DC受取が' + w.eraStartYear + '年1月1日' + (isPostEra ? '以後' : '前') + ' → 前年以前' + windowYears + '年内）';
    } else {
      windowYears = rules.windows.retirementToDc;
      windowLabel = '退職手当等 → DC老齢一時金（前年以前' + windowYears + '年内）';
    }
    var yearDiff = laterYear - priorYear;
    var fired = yearDiff <= windowYears;

    var explanation = {
      direction: priorKind === 'dc' ? 'dc-first' : 'retirement-first',
      windowYears: windowYears,
      windowLabel: windowLabel,
      yearDiff: yearDiff,
      fired: fired,
      deemed: null,
      overlapMonths: 0,
      overlapYears: 0
    };

    var laterReceipt;
    if (!fired) {
      laterReceipt = computeReceipt(rules, later);
    } else {
      // 手順3: みなし期間の判定 (§1.5(d))
      var priorIntervalsForOverlap = prior.intervals;
      var priorBaseDeduction = deductionForYears(rules, prior.years);
      if (prior.income < priorBaseDeduction) {
        var dp = rules.deemedPeriod;
        var deemedYears = prior.income <= dp.threshold
          ? Math.floor(prior.income / dp.divisorUnderThreshold)
          : Math.floor((prior.income - dp.threshold) / dp.divisorOverThreshold) + dp.baseYears;
        priorIntervalsForOverlap = deemedYears > 0 ? [[prior.start, prior.start + deemedYears * 12 - 1]] : [];
        explanation.deemed = { years: deemedYears, priorIncome: prior.income, priorBaseDeduction: priorBaseDeduction };
      }
      // 手順4: 重複相当額
      var ovMonths = overlapMonths(priorIntervalsForOverlap, later.intervals);
      var ovYears = Math.floor(ovMonths / 12);
      var equiv = equivalentForYears(rules, ovYears);
      explanation.overlapMonths = ovMonths;
      explanation.overlapYears = ovYears;
      // 手順5: 後行側の控除額（フロア適用、§1.5(b)）
      var rawDeduction = deductionForYears(rules, later.years) - equiv;
      var floorApplied = rawDeduction < rules.deduction.minimum;
      var laterDeduction = Math.max(rawDeduction, rules.deduction.minimum);
      // 手順6: 置き換えた控除額で後行側を計算
      laterReceipt = computeReceipt(rules, {
        income: later.income,
        years: later.years,
        category: later.category,
        deductionOverride: laterDeduction,
        deductionBefore: deductionForYears(rules, later.years),
        overlapEquivalent: equiv,
        floorApplied: floorApplied
      });
    }

    var receipts = {};
    receipts[priorKind] = priorReceipt;
    receipts[priorKind === 'dc' ? 'retirement' : 'dc'] = laterReceipt;
    return {
      pattern: priorKind === 'dc' ? 'P1' : 'P2',
      dcYear: dcYear,
      retirementYear: retirementYear,
      reference: false,
      retirement: receipts.retirement,
      dc: receipts.dc,
      combined: null,
      explanation: explanation,
      totalTax: priorReceipt.tax + laterReceipt.tax,
      netTotal: priorReceipt.net + laterReceipt.net
    };
  }

  /* ---------- 同年パターン (§1.5(a) / §3.3 P3) ---------- */

  function computeSameYear(rules, input) {
    var allIntervals = [input.serviceInterval].concat(input.dcIntervals);
    var unionMonths = intervalsTotalMonths(allIntervals);
    var unionYears = yearsCeil(unionMonths);
    var income = input.retirementIncome + input.dcIncome;
    var deduction = deductionForYears(rules, unionYears);
    // v1 の正式計算は一般同士の場合のみ。短期が絡む場合は参考計算（合算・和集合・一般の計算で参考値を出す）+ 警告 (§1.5(a) / §4.5 / §5.1-5)
    var reference = input.retirementCategory !== 'general' || input.dcCategory !== 'general';
    var receipt = computeReceipt(rules, {
      income: income,
      years: unionYears,
      category: 'general',
      deductionOverride: deduction,
      deductionBefore: deductionForYears(rules, unionYears)
    });
    return {
      pattern: 'P3',
      dcYear: input.retirementYear,
      retirementYear: input.retirementYear,
      reference: reference,
      retirement: null,
      dc: null,
      combined: receipt,
      explanation: {
        direction: 'same-year',
        windowYears: null,
        windowLabel: '同年受給（収入金額を合算し、勤続年数は2期間の和集合で控除を1つ計算）',
        yearDiff: 0,
        fired: false,
        deemed: null,
        overlapMonths: 0,
        overlapYears: 0,
        unionMonths: unionMonths,
        unionYears: unionYears
      },
      totalTax: receipt.tax,
      netTotal: receipt.net
    };
  }

  /* ---------- 全体 (§3.3 / §3.5) ---------- */

  function computeAll(rules, rawInput) {
    var input = normalize(rules, rawInput);
    if (input.outOfScopeOfficer) {
      return { outOfScope: true, reason: 'officer', input: input, rows: [], best: null };
    }
    var rows = [];
    var from = input.retirementYear + rules.sweep.fromOffset;
    var to = input.retirementYear + rules.sweep.toOffset;
    for (var y = from; y <= to; y++) {
      if (y < input.retirementYear) rows.push(computeSeparateYear(rules, input, 'dc', y));
      else if (y > input.retirementYear) rows.push(computeSeparateYear(rules, input, 'retirement', y));
      else rows.push(computeSameYear(rules, input));
    }
    var best = null;
    rows.forEach(function (row) {
      if (!best || row.totalTax < best.totalTax) best = row;
    });
    return { outOfScope: false, input: input, rows: rows, best: best };
  }

  var api = {
    monthIndex: monthIndex,
    mergeIntervals: mergeIntervals,
    intervalsTotalMonths: intervalsTotalMonths,
    overlapMonths: overlapMonths,
    yearsCeil: yearsCeil,
    deductionForYears: deductionForYears,
    equivalentForYears: equivalentForYears,
    taxableIncome: taxableIncome,
    incomeTax: incomeTax,
    residentTax: residentTax,
    computeReceipt: computeReceipt,
    normalize: normalize,
    computeSeparateYear: computeSeparateYear,
    computeSameYear: computeSameYear,
    computeAll: computeAll
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.TaxEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
