/*
 * 国民健康保険料シミュレーター — 計算エンジン（部品A）
 *
 * 仕様: ~/workspace/notes/tax-tools-spec-02-kokuho-cluster.md §1
 * 料率は data/kokuho/<city>.json（自治体公式ソースで確認・照合したデータ層）から受け取る。
 * このファイルに料率の数値は直書きしない（端数単位などの正規化パラメータは呼び出し側が渡す）。
 * 計算順序は名古屋市パイロット（公式計算例10件・全件一致）で実証した骨格を正とする:
 *   所得割（個人ごと・基礎控除逓減）→ 独自控除（income_levy_credit、個人の所得割額が上限）
 *   均等割 → 法定軽減（1人当たり減額額は円未満切上げ）→ 未就学児5割減額
 *   → 子ども分18歳未満の全額減額／自治体独自の均等割全額減免 → 平等割（法定軽減の対象は自治体データに従う）
 *   → 均等割独自控除（per_capita_credit）→ 賦課限度額 → 区分ごとに端数処理して合算
 * ブラウザ内計算のみ。Node でも読み込める（module.exports）。
 */
(function (global) {
  'use strict';

  var COMPONENTS = ['medical', 'support', 'care', 'child'];

  /* 床関数は浮動小数点誤差で整数ちょうどの積（例: 570,000×0.0029=1,653）が 1652.9999… になる
     ケースを救うため、商に 1e-9 の補正を加える。料率は小数4桁まで・基礎額は整数のため、
     正規の積が整数未満に 1e-9 以内まで近づくことはない（最小の刻みは 0.0001 円）。 */
  function floorTo(x, unit) { return Math.floor(x / unit + 1e-9) * unit; }
  function ceilTo(x, unit) { return Math.ceil(x / unit - 1e-9) * unit; }
  function ceilYen(x) { return Math.ceil(x - 1e-9); }
  function halfUp(x) { return Math.floor(x + 0.5); }

  /* 基礎控除（合計所得金額で逓減） */
  function baseDeduction(rateRecord, totalIncome) {
    var tiers = rateRecord.base_deduction.tiers;
    for (var i = 0; i < tiers.length; i++) {
      if (tiers[i].max_total_income === null || totalIncome <= tiers[i].max_total_income) {
        return tiers[i].deduction;
      }
    }
    return 0;
  }

  /* 法定軽減（所得基準による減額）の判定: 全国共通式
   * 7割: 43万 + 調整額 / 5割: +31万×被保険者数 / 2割: +57万×被保険者数
   * 調整額 = (給与所得者等の数 - 1) × 10万円（0未満は0） */
  function statutoryReductionRate(judgementIncome, nMembers, nEarners) {
    var adj = Math.max(0, nEarners - 1) * 100000;
    if (judgementIncome <= 430000 + adj) return 0.7;
    if (judgementIncome <= 430000 + adj + 310000 * nMembers) return 0.5;
    if (judgementIncome <= 430000 + adj + 570000 * nMembers) return 0.2;
    return 0;
  }

  /*
   * cityData: data/kokuho/<city>.json の内容
   * options: { roundingUnit: 10|100 } 端数の正規化パラメータ（データ側の rounding 記述から呼び出し側が決める）
   * input: {
   *   members: [{ age, income(総所得金額等), judgementIncome(減額判定用所得), earner(bool),
   *               depNd(障害対象でない扶養家族数), depD(障害対象の扶養家族数), selfCredit(bool) }],
   *   householdType: 'normal' | 'tokutei' | 'tokutei_keizoku'  （仙台の特定世帯・特定継続世帯）
   * }
   */
  function compute(cityData, options, input) {
    var rr = cityData.rate_record;
    var comp = rr.components;
    var roundingUnit = (options && options.roundingUnit) || 10;
    var members = input.members;
    var n = members.length;

    var jIncome = members.reduce(function (s, m) { return s + (m.judgementIncome || 0); }, 0);
    var nEarners = members.filter(function (m) { return m.earner; }).length;
    var red = statutoryReductionRate(jIncome, n, nEarners);

    var rules = cityData.common_rules_applied || {};
    var statutoryAppliesToHousehold = false;
    if (rules.statutory_reduction && typeof rules.statutory_reduction.applies_to === 'string') {
      statutoryAppliesToHousehold = rules.statutory_reduction.applies_to.indexOf('平等割') >= 0;
    }
    var preschoolAppliesTo = (rules.preschool_child_reduction && rules.preschool_child_reduction.applies_to) || ['medical', 'support', 'child'];

    var exceptions = cityData.exceptions || [];
    function exceptionsOf(type) {
      return exceptions.filter(function (e) { return e.type === type; });
    }
    var levyCredits = exceptionsOf('income_levy_credit');
  var baseExtras = exceptionsOf('base_deduction_extra');
  /* 自治体独自の賦課基準額控除（川崎市）: 年齢帯ごとの定額を、算定基礎が最も高い加入者の基礎から控除する。
     障害者控除相当額の部分は入力で金額を特定できないため未対応（例外データ側に明記）。 */
  var extraDeductionTotal = 0;
  baseExtras.forEach(function (e) {
    (e.conditions && e.conditions.rules || []).forEach(function (r) {
      if (!r.amount_per_person) return;
      var cnt = members.filter(function (m) {
        if (r.age_max !== undefined && r.age_max !== null && m.age > r.age_max) return false;
        if (r.age_min !== undefined && r.age_min !== null && m.age < r.age_min) return false;
        return (m.income || 0) <= 580000;
      }).length;
      extraDeductionTotal += cnt * r.amount_per_person;
    });
  });
  var householdAggregate = rr.levy_aggregation === 'household';
  var headCredit = exceptionsOf('household_head_credit')[0] || null;
  /* 世帯主の所得割算定基礎からの子ども世帯控除（横浜市）: 対象は合計所得58万円以下の19歳未満の世帯員 */
  var headChildDeduction = 0;
  if (headCredit && headCredit.formula && headCredit.formula.amounts) {
    var fa = headCredit.formula.amounts;
    var nU16 = members.filter(function (m) { return m.age < 16 && (m.income || 0) <= 580000; }).length;
    var n1618 = members.filter(function (m) { return m.age >= 16 && m.age < 19 && (m.income || 0) <= 580000; }).length;
    headChildDeduction = nU16 * (fa.under16_per_person || 0) + n1618 * (fa.age16_18_per_person || 0);
  }
    var perCapitaCredits = exceptionsOf('per_capita_credit');
    var perCapitaExemptions = exceptionsOf('per_capita_exemption');
    var singleHousehold = exceptionsOf('single_member_household')[0] || null;

    function eligible(key, m) {
      var band = comp[key].age_band;
      if (band) return m.age >= band[0] && m.age <= band[1];
      return true;
    }
    function isUnder18(m) { return m.age < 18; }
    function isPreschool(m) { return m.preschool !== undefined ? !!m.preschool : m.age < 6; } // 未就学児（指定が無ければ年齢から近似）

    var detail = {};
    var total = 0;

    COMPONENTS.forEach(function (key) {
      var c = comp[key];
      if (!c) { detail[key] = 0; return; }
      var elig = members.filter(function (m) { return eligible(key, m); });
      if (!elig.length) { detail[key] = 0; return; }

      /* 所得割＋独自控除。世帯合算方式の自治体（川崎市）は基礎を合算してから料率を掛ける */
      var incomeLevy = 0;
      var creditTotal = 0;
      var bases = elig.map(function (m) {
        var base = Math.max(0, m.income - baseDeduction(rr, m.income));
        if (rr.base_floor_unit) base = floorTo(base, rr.base_floor_unit);
        if (headChildDeduction && m === members[0] && headCredit.formula.applies_to && headCredit.formula.applies_to.indexOf(key) >= 0) {
          base = Math.max(0, base - headChildDeduction);
        }
        return base;
      });
      if (householdAggregate) {
        if (extraDeductionTotal > 0 && bases.length) {
          var maxIdx = 0;
          bases.forEach(function (b, i) { if (b > bases[maxIdx]) maxIdx = i; });
          bases[maxIdx] = Math.max(0, bases[maxIdx] - extraDeductionTotal);
        }
        var baseSum = bases.reduce(function (s, b) { return s + b; }, 0);
        incomeLevy = Math.floor(baseSum * c.income_rate);
      } else {
        elig.forEach(function (m, mi) {
          var levyUnit = (rr.levy_floor_unit_by_component && rr.levy_floor_unit_by_component[key]) || rr.levy_floor_unit || 1;
          var levyP = floorTo(bases[mi] * c.income_rate, levyUnit);
          incomeLevy += levyP;
          var creditBase = 0;
          levyCredits.forEach(function (e) {
            if (e.applies_to && e.applies_to.indexOf(key) < 0) return;
            var cond = e.conditions || {};
            if (cond.dependent && cond.dependent_disabled === false) creditBase += e.amount_per_person * (m.depNd || 0);
            if (cond.dependent && cond.dependent_disabled === true) creditBase += e.amount_per_person * (m.depD || 0);
            if (cond.self_disabled_or_widow_or_single_parent && m.selfCredit) creditBase += e.amount_per_person;
          });
          if (creditBase > 0) {
            var cred = Math.floor(creditBase * c.income_rate);
            creditTotal += Math.min(levyP, cred);
          }
        });
      }

      /* 均等割 */
      var pc = c.per_capita || 0;
      var perCapitaTotal = pc * elig.length;
      var addon = c.per_capita_adult_addon || 0;
      var adults = elig.filter(function (m) { return m.age >= 18; });
      var addonTotal = addon * adults.length;

      /* 法定軽減（1人当たり減額額は端数切上げ。単位は市による: 静岡市は10円未満切上げ） */
      var redUnit = rr.reduction_ceil_unit || 1;
      var redPp = red ? ceilTo(pc * red, redUnit) : 0;
      var statRed = redPp * elig.length;
      var addonRed = (addon && red) ? ceilTo(addon * red, redUnit) * adults.length : 0;

      /* 未就学児5割減額（軽減後の均等割に対して。神戸市は減額額を10円未満切上げ） */
      var preschoolHalf = function (x) { return rr.preschool_ceil_unit ? ceilTo(x * 0.5, rr.preschool_ceil_unit) : halfUp(x * 0.5); };
      var preschoolRed = 0;
      if (preschoolAppliesTo.indexOf(key) >= 0) {
        elig.forEach(function (m) {
          if (isPreschool(m)) preschoolRed += preschoolHalf(pc - redPp);
        });
      }

      /* 子ども分: 18歳未満の均等割は残額を全額減額 */
      var under18Red = 0;
      if (key === 'child') {
        elig.forEach(function (m) {
          if (isUnder18(m)) {
            var pre = isPreschool(m) && preschoolAppliesTo.indexOf(key) >= 0 ? preschoolHalf(pc - redPp) : 0;
            under18Red += (pc - redPp - pre);
          }
        });
      }

      /* 自治体独自の均等割全額減免（仙台の子育て世帯減免: 18歳未満・全区分） */
      var exemptionRed = 0;
      perCapitaExemptions.forEach(function (e) {
        var maxAge = e.conditions && e.conditions.member_age_max;
        if (maxAge === null || maxAge === undefined) return;
        elig.forEach(function (m) {
          if (m.age <= maxAge) {
            var pre2 = isPreschool(m) && preschoolAppliesTo.indexOf(key) >= 0 ? preschoolHalf(pc - redPp) : 0;
            var childRed = key === 'child' && isUnder18(m) ? (pc - redPp - pre2) : 0;
            exemptionRed += (pc - redPp - pre2 - childRed);
          }
        });
      });

      /* 平等割（世帯あたり） */
      var household = c.per_household || 0;
      if (household && input.householdType && input.householdType !== 'normal') {
        var fixedKey = input.householdType === 'tokutei' ? 'tokutei' : 'keizoku';
        var fixed = c.per_household_fixed && c.per_household_fixed[fixedKey];
        if (fixed) household = fixed;
        else if (singleHousehold) household = household * (input.householdType === 'tokutei' ? 0.5 : 0.75);
      }
      var householdNet = household;
      if (household && red && statutoryAppliesToHousehold) {
        householdNet = household - ceilTo(household * red, redUnit);
      }

      /* 所得割の定額控除（神戸市の経過措置の特例計算などで使用） */
      var flatDed = 0;
      exceptionsOf('levy_flat_deduction').forEach(function (e) {
        if (e.applies_to && e.applies_to.indexOf(key) < 0) return;
        flatDed += e.amount || 0;
      });
      var levyNet = Math.max(0, incomeLevy - creditTotal - flatDed);

      var subtotal = levyNet
        + perCapitaTotal + addonTotal
        - statRed - addonRed - preschoolRed - under18Red - exemptionRed
        + householdNet;

      /* 均等割独自控除（per_capita_credit: 名古屋の2,000円/人・医療分・軽減適用世帯） */
      perCapitaCredits.forEach(function (e) {
        if (e.applies_to && e.applies_to.indexOf(key) < 0) return;
        if (e.conditions && e.conditions.household_reduction_applied && !red) return;
        subtotal -= e.amount_per_person * n;
      });

      subtotal = Math.max(0, Math.min(subtotal, c.cap));
      detail[key] = floorTo(subtotal, roundingUnit);
      total += detail[key];
    });

    /* 経過措置の調整額（神戸市）: 旧独自控除を適用した特例計算との差額×調整割合を控除する。
       特例側は (a) 障害者扶養1人26万円・本人該当26万円を所得から差し引いた複製メンバーと、
       (b) 18歳以下の加入者1人につき33万円×料率の所得割定額控除で再計算する。
       住民税非課税の障害者・寡婦・ひとり親の92万円控除分は入力から判定できないため未対応。 */
    var adjustment = 0;
    var tr = rr.transitional;
    if (tr && !(options && options._special)) {
      var under19 = members.filter(function (m) { return m.age <= 18; }).length;
      var hasBase = members.some(function (m) { return (m.depD || 0) > 0 || m.selfCredit; });
      if (under19 > 0 || hasBase) {
        var clone = JSON.parse(JSON.stringify(cityData));
        delete clone.rate_record.transitional;
        clone.exceptions = clone.exceptions || [];
        (tr.components || []).forEach(function (ck) {
          var comp = clone.rate_record.components[ck];
          if (!comp) return;
          var amt = Math.floor((tr.under19_base || 330000) * comp.income_rate) * under19;
          if (amt > 0) clone.exceptions.push({ type: 'levy_flat_deduction', applies_to: [ck], amount: amt });
        });
        var specialMembers = members.map(function (m) {
          var mm = {}; for (var k in m) mm[k] = m[k];
          var redAmt = (m.depD || 0) * (tr.base_per_disabled_dependent || 0) + (m.selfCredit ? (tr.base_self || 0) : 0);
          if (redAmt > 0) mm.income = Math.max(0, (m.income || 0) - redAmt);
          return mm;
        });
        var special = compute(clone, { roundingUnit: 1, _special: true }, { members: specialMembers, householdType: input.householdType });
        var adjs = {}, adjSum = 0;
        (tr.components || []).forEach(function (ck) {
          var diff = Math.max(0, (detail[ck] || 0) - (special.components[ck] || 0));
          adjs[ck] = floorTo(diff * tr.ratio, 10);
          adjSum += adjs[ck];
        });
        if (adjSum >= 100) {
          (tr.components || []).forEach(function (ck) {
            if (adjs[ck] > 0) { detail[ck] = Math.max(0, detail[ck] - adjs[ck]); adjustment += adjs[ck]; }
          });
          total = Object.keys(detail).reduce(function (s, k) { return s + detail[k]; }, 0);
        }
      }
    }

    return {
      total: total,
      components: detail,
      reductionRate: red,
      judgementIncome: jIncome,
      adjustment: adjustment
    };
  }

  /* ---------- 収入→所得の換算（法定の控除表） ---------- */

  /* 給与所得: 給与所得控除を差し引く。年度で表を切り替える。
   * 国保・住民税は「前年の所得」に課されるため、令和8年度の料率・課税に対応する
   * 収入は令和7年分であり、既定は令和7年分の表（給与所得控除の最低保障65万円。
   * 所得税法別表第五・令和7年分改正）を使う。
   * 令和8年分の収入を扱う経路（住民税ツールの来年予測など）は 'r8' を渡す
   * （最低保障74万円。ふるさと納税ツールの salaryIncomeOf と同じ表）。
   * 別表第五の4,000円区間の平坦部は再現しない（従来どおりの簡易式）。 */
  function salaryIncome(revenue, year) {
    var d;
    if (year === 'r8') {
      if (revenue <= 2200000) d = 740000;
      else if (revenue <= 3600000) d = revenue * 0.3 + 80000;
      else if (revenue <= 6600000) d = revenue * 0.2 + 440000;
      else if (revenue <= 8500000) d = revenue * 0.1 + 1100000;
      else d = 1950000;
    } else {
      if (revenue <= 1900000) d = 650000;
      else if (revenue <= 3600000) d = revenue * 0.3 + 80000;
      else if (revenue <= 6600000) d = revenue * 0.2 + 440000;
      else if (revenue <= 8500000) d = revenue * 0.1 + 1100000;
      else d = 1950000;
    }
    return Math.max(0, Math.floor(revenue - d));
  }

  /* 公的年金等の雑所得: 公的年金等控除（合計所得1,000万円以下）を差し引く */
  function pensionIncome(revenue, age) {
    var d;
    if (age >= 65) {
      if (revenue <= 3300000) d = 1100000;
      else if (revenue <= 4100000) d = revenue * 0.25 + 275000;
      else if (revenue <= 7700000) d = revenue * 0.15 + 685000;
      else if (revenue <= 10000000) d = revenue * 0.05 + 1455000;
      else d = 1955000;
    } else {
      if (revenue <= 1300000) d = 600000;
      else if (revenue <= 4100000) d = revenue * 0.25 + 275000;
      else if (revenue <= 7700000) d = revenue * 0.15 + 685000;
      else if (revenue <= 10000000) d = revenue * 0.05 + 1455000;
      else d = 1955000;
    }
    return Math.max(0, Math.floor(revenue - d));
  }

  var api = {
    compute: compute,
    statutoryReductionRate: statutoryReductionRate,
    salaryIncome: salaryIncome,
    pensionIncome: pensionIncome
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KokuhoEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
