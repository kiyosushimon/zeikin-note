/*
 * 退職金 × iDeCo/DC 受け取り順序シミュレーター — 画面側
 * ルールは data/rules.js (window.TAX_RULES) から読み、無ければ data/rules.json を fetch する。
 * 計算は js/engine.js (TaxEngine) がブラウザ内で行う。入力値はサーバーへ送信しない。
 */
(function () {
  'use strict';

  var SOURCES = {
    no1420: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1420.htm',
    no2732: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2732.htm',
    no2741: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2741.htm',
    besshi: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2732_besshi.htm'
  };

  var rules = null;
  var lastResult = null;
  var selectedYear = null;

  function yen(n) {
    return n.toLocaleString('ja-JP') + '円';
  }
  function el(id) { return document.getElementById(id); }

  /* カウントアップ: 結果の金額が0から増えていく（辞書624「カウントアップ」） */
  function animateCounts(root) {
    /* 金額は即時表示する（カウントアップ演出は廃止。data-valueの最終値をそのまま出す） */
    var nodes = root.querySelectorAll('.count-up');
    for (var i = 0; i < nodes.length; i++) {
      var target = parseInt(nodes[i].getAttribute('data-value'), 10);
      if (isFinite(target)) nodes[i].textContent = yen(target);
    }
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- DC加入者期間の入力行 ---------- */

  function addDcPeriodRow(start, end, kind) {
    var wrap = el('dc-periods');
    var row = document.createElement('div');
    row.className = 'dc-period';
    row.innerHTML =
      '<div class="field"><label>開始年月</label><input type="month" class="dc-start" value="' + esc(start || '') + '"></div>' +
      '<div class="field"><label>終了年月</label><input type="month" class="dc-end" value="' + esc(end || '') + '"></div>' +
      '<div class="field"><label>種類</label><select class="dc-kind">' +
      ['企業型', '個人型', '移換算入'].map(function (k) {
        return '<option' + (k === kind ? ' selected' : '') + '>' + k + '</option>';
      }).join('') +
      '</select></div>' +
      '<button type="button" class="danger dc-remove">この期間を削除</button>';
    row.querySelector('.dc-remove').addEventListener('click', function () {
      row.remove();
    });
    wrap.appendChild(row);
  }

  /* ---------- 入力の収集と検証 ---------- */

  function collectInput() {
    var periods = [];
    var rows = document.querySelectorAll('.dc-period');
    for (var i = 0; i < rows.length; i++) {
      var s = rows[i].querySelector('.dc-start').value;
      var e = rows[i].querySelector('.dc-end').value;
      if (s && e) periods.push({ start: s, end: e });
    }
    return {
      serviceStart: el('r-start').value,
      serviceEnd: el('r-end').value,
      retirementIncome: parseInt(el('r-income').value, 10) || 0,
      officerYears: parseFloat(el('r-officer').value) || 0,
      retirementYear: parseInt(el('r-year').value, 10) || 0,
      dcPeriods: periods,
      dcIncome: parseInt(el('d-income').value, 10) || 0
    };
  }

  function validate(raw) {
    var errors = [];
    if (!raw.serviceStart || !raw.serviceEnd) errors.push('勤務開始年月と退職年月を入力してください。');
    if (raw.serviceStart && raw.serviceEnd && raw.serviceEnd < raw.serviceStart) errors.push('退職年月が勤務開始年月より前になっています。');
    if (!raw.retirementYear) errors.push('退職金の受取予定年を入力してください。');
    if (raw.dcPeriods.length === 0) errors.push('DC加入者期間を少なくとも1つ入力してください。');
    raw.dcPeriods.forEach(function (p) {
      if (p.end < p.start) errors.push('DC加入者期間の終了年月が開始年月より前になっています。');
    });
    return errors;
  }

  /* ---------- 結果の描画 ---------- */

  function patternLabel(row) {
    if (row.pattern === 'P1') return 'DC先行';
    if (row.pattern === 'P2') return '退職金先行';
    return '同年受給';
  }

  function renderSummary(result) {
    var best = result.best;
    var sameYear = result.rows.filter(function (r) { return r.pattern === 'P3'; })[0];
    var nearFirst = result.rows.filter(function (r) { return r.pattern === 'P1'; }).pop(); // 退職金受取年の1年前
    var nearAfter = result.rows.filter(function (r) { return r.pattern === 'P2'; })[0]; // 退職金受取年の1年後
    var html = '<h2>結果</h2><div class="summary">';
    html += '<p>最も税額が小さい受け取り方: <span class="big">DCを ' + best.dcYear + ' 年に受け取る（' + patternLabel(best) + '）</span></p>';
    html += '<p>合計税額 <span class="count-up" data-value="' + best.totalTax + '">' + yen(best.totalTax) + '</span> ／ 手取り合計 <span class="count-up" data-value="' + best.netTotal + '">' + yen(best.netTotal) + '</span></p>';
    html += '<ul class="compact">';
    if (sameYear && sameYear !== best) {
      html += '<li>同年受給（' + sameYear.dcYear + '年）と比べて、税額が ' + yen(sameYear.totalTax - best.totalTax) + ' 小さくなります。</li>';
    }
    if (nearFirst && nearFirst !== best) {
      html += '<li>退職金の前年（' + nearFirst.dcYear + '年）にDCを受け取る場合と比べて、税額が ' + yen(nearFirst.totalTax - best.totalTax) + ' 小さくなります。</li>';
    }
    if (nearAfter && nearAfter !== best) {
      html += '<li>退職金の翌年（' + nearAfter.dcYear + '年）にDCを受け取る場合と比べて、税額が ' + yen(nearAfter.totalTax - best.totalTax) + ' 小さくなります。</li>';
    }
    html += '</ul>';
    html += '<p class="small">提示は税額の比較に限定したものです。受け取る時期の資金繰りや運用など、税額以外の要素はこのツールの判定対象外です。</p>';
    html += '</div>';
    return html;
  }

  function renderTable(result) {
    var html = '<h3>DC受取年ごとの比較（退職金受取年 ' + result.input.retirementYear + ' 年を基準に前後）</h3>';
    html += '<div class="table-wrap"><table><thead><tr>' +
      '<th>DC受取年</th><th>パターン</th><th>退職金側の税額</th><th>DC側の税額</th><th>合計税額</th><th>手取り合計</th>' +
      '</tr></thead><tbody>';
    result.rows.forEach(function (row) {
      var cls = [];
      if (row === result.best) cls.push('best');
      if (row.dcYear === selectedYear) cls.push('selected');
      html += '<tr data-year="' + row.dcYear + '"' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>';
      html += '<td>' + row.dcYear + '年' +
        (row === result.best ? '<span class="badge best-badge">最小</span>' : '') +
        (row.reference ? '<span class="badge">参考計算</span>' : '') + '</td>';
      html += '<td>' + patternLabel(row) + '</td>';
      if (row.combined) {
        html += '<td colspan="2">合算して計算</td>';
      } else {
        html += '<td>' + yen(row.retirement.tax) + '</td><td>' + yen(row.dc.tax) + '</td>';
      }
      html += '<td>' + yen(row.totalTax) + '</td><td>' + yen(row.netTotal) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<p class="small">行を選ぶと、その受け取り方の内訳と調整の説明を表示します。</p>';
    return html;
  }

  function receiptRows(title, receipt, yearsLabel) {
    var html = '<div class="detail-card"><h3>' + esc(title) + '</h3><table>';
    html += '<tr><td>収入金額</td><td>' + yen(receipt.income) + '</td></tr>';
    html += '<tr><td>' + esc(yearsLabel) + '</td><td>' + receipt.years + '年</td></tr>';
    if (receipt.deductionBefore !== null && receipt.deductionBefore !== undefined) {
      html += '<tr><td>控除額（調整前）</td><td>' + yen(receipt.deductionBefore) + '</td></tr>';
      html += '<tr><td>重複相当額（差し引く額）</td><td>−' + yen(receipt.overlapEquivalent) + '</td></tr>';
    }
    html += '<tr><td>退職所得控除額' +
      (receipt.floorApplied ? '（80万円の最低額を適用）' : '') +
      '</td><td>' + yen(receipt.deduction) + '</td></tr>';
    html += '<tr><td>課税退職所得金額</td><td>' + yen(receipt.taxable) + '</td></tr>';
    html += '<tr><td>所得税額（復興特別所得税込み）</td><td>' + yen(receipt.incomeTax) + '</td></tr>';
    html += '<tr><td>住民税額（市町村民税 ' + yen(receipt.residentMunicipal) + ' ＋ 道府県民税 ' + yen(receipt.residentPrefectural) + '）</td><td>' + yen(receipt.residentTax) + '</td></tr>';
    html += '<tr><td>税額合計</td><td>' + yen(receipt.tax) + '</td></tr>';
    html += '<tr><td>手取り額</td><td>' + yen(receipt.net) + '</td></tr>';
    html += '</table></div>';
    return html;
  }

  function renderDetail(result, row) {
    var html = '<h3>内訳: DC受取年 ' + row.dcYear + ' 年（' + patternLabel(row) + '）</h3>';
    if (row.reference) {
      html += '<div class="disclaimer">この受け取り方は<strong>参考計算</strong>です。同年に短期退職手当等が絡む場合の正確な計算は、国税庁タックスアンサー No.2741 の区分ごとの算式によります。また、収入金額が控除額に満たない場合に必要となる調整計算（所得税法施行令71条の2）の算式は一次ソースで確定できていないため、この参考値と実際の税額が異なる場合があります。</div>';
    }
    var ex = row.explanation;
    html += '<div class="detail-card"><h3>重なり調整の判定</h3><ul class="compact">';
    if (row.pattern === 'P3') {
      html += '<li>同年受給のため、収入金額を合算し、勤続年数は2期間の和集合（' + ex.unionYears + '年）で退職所得控除を1つだけ計算しています。</li>';
    } else if (!ex.fired) {
      html += '<li>重なり調整なし。受け取った年の差が ' + ex.yearDiff + ' 年で、適用される期間（' + esc(ex.windowLabel) + '）の範囲外です。</li>';
    } else {
      html += '<li>重なり調整が発動しました: ' + esc(ex.windowLabel) + '。受け取った年の差は ' + ex.yearDiff + ' 年です。</li>';
      if (ex.deemed) {
        html += '<li>先に受け取った額（' + yen(ex.deemed.priorIncome) + '）が、その控除額（' + yen(ex.deemed.priorBaseDeduction) + '）に満たないため、先の期間は ' + ex.deemed.years + ' 年だったものとして（みなし期間）重なりを計算しています。</li>';
      }
      html += '<li>重複期間は ' + ex.overlapYears + ' 年（' + ex.overlapMonths + ' か月）です。この年数分の控除相当額を、後に受け取る分の控除額から差し引いています。</li>';
    }
    html += '</ul><p class="small">根拠: <a href="' + SOURCES.no2732 + '" target="_blank" rel="noopener">国税庁タックスアンサー No.2732</a>／<a href="' + SOURCES.no1420 + '" target="_blank" rel="noopener">No.1420</a>／<a href="' + SOURCES.besshi + '" target="_blank" rel="noopener">退職所得の源泉徴収税額の速算表</a></p></div>';

    if (row.combined) {
      html += receiptRows('同年受給（合算）', row.combined, '勤続年数（2期間の和集合）');
    } else {
      html += receiptRows('退職金（' + row.retirementYear + '年受取）', row.retirement, '勤続年数');
      html += receiptRows('DC老齢一時金（' + row.dcYear + '年受取）', row.dc, '加入者年数');
    }
    return html;
  }

  function render(result) {
    lastResult = result;
    var out = el('result');
    if (result.outOfScope) {
      out.innerHTML = '<div class="error"><strong>このツールでは計算できません。</strong><br>' +
        '役員等として勤務した期間が5年以下で、その期間に対応する退職手当等（特定役員退職手当等）を含む場合は、v1 の対象外です。' +
        '特定役員退職手当等は1/2課税の適用がないなど計算方法が異なるため、税理士等の専門家または所轄の税務署にご確認ください。</div>';
      return;
    }
    if (!result.rows.some(function (r) { return r.dcYear === selectedYear; })) {
      selectedYear = result.best.dcYear;
    }
    var detailRow = result.rows.filter(function (r) { return r.dcYear === selectedYear; })[0];
    out.innerHTML = renderSummary(result) + renderTable(result) + '<div id="detail">' + renderDetail(result, detailRow) + '</div>' +
      '<div class="consult"><button type="button" id="copy-prompt" class="consult-btn"><span class="in-flex"><svg class="icon" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>AIに相談する用の文をコピー</span></button>' +
      '<p class="small">この計算結果をまとめた文をコピーします。ChatGPTやClaudeなど、自分のAIに貼ると、結果の意味や注意点を相談できます。貼る前に、個人が特定できる情報が含まれていないか確認してください。</p></div>';
    animateCounts(out);
    el('copy-prompt').addEventListener('click', function () {
      copyText(buildPrompt(result));
    });
    var trs = out.querySelectorAll('tbody tr');
    for (var i = 0; i < trs.length; i++) {
      trs[i].addEventListener('click', function () {
        selectedYear = parseInt(this.getAttribute('data-year'), 10);
        render(lastResult);
      });
    }
  }

  /* AI相談用プロンプト: 結果を自分のAIに渡して相談するための文を組み立てる */
  function buildPrompt(result) {
    var inp = result.input;
    var best = result.best;
    var lines = [];
    lines.push('あなたは税金の仕組みに詳しい相談相手です。以下は、税金計算サイト「ぜいきんノート」の「退職金 × iDeCo/DC 受け取り順序シミュレーター」で計算した私の試算結果です。この結果について、意味の解説と注意点を教えてください。');
    lines.push('');
    lines.push('【入力した条件】');
    function monthLabel(idx) { return Math.floor(idx / 12) + '年' + (idx % 12 + 1) + '月'; }
    lines.push('・勤続期間: ' + monthLabel(inp.serviceInterval[0]) + ' 〜 ' + monthLabel(inp.serviceInterval[1]) + '（勤続年数 ' + inp.serviceYears + '年）');
    lines.push('・DC加入者期間: ' + inp.dcYears + '年');
    lines.push('・退職金の額: ' + yen(inp.retirementIncome) + '（' + inp.retirementYear + '年に受け取り予定）');
    lines.push('・iDeCo/DCの見込み額: ' + yen(inp.dcIncome));
    lines.push('');
    lines.push('【計算結果】');
    lines.push('・最も税額が小さい受け取り方: DCを ' + best.dcYear + ' 年に受け取る（' + patternLabel(best) + '）');
    lines.push('・その場合の合計税額: ' + yen(best.totalTax) + ' ／ 手取り合計: ' + yen(best.netTotal));
    if (best.reference) {
      lines.push('・注意: この受け取り方は「参考計算」です。短期退職手当等が絡む場合の正確な計算は、国税庁タックスアンサー No.2741 の区分ごとの算式によります。また、収入金額が控除額に満たない場合に必要となる調整計算（所得税法施行令71条の2）の算式は一次ソースで確定できていないため、実際の税額はこの試算（合計税額・手取り合計）と異なる場合があります。');
    }
    lines.push('');
    lines.push('【計算過程】');
    lines.push('・退職所得控除額の式: 勤続20年以下は40万円×勤続年数（最低80万円）、20年超は800万円＋70万円×（勤続年数−20年）。受け取り間隔が調整期間内の場合は、後に受け取る分の控除額から重複期間の相当額を差し引く。調整期間は、DCを先に受け取った場合はDCの受取が2026年1月1日以後なら9年・同日前なら4年、退職金を先に受け取った場合は19年。');
    function receiptProcess(label, receipt) {
      if (receipt.deductionBefore !== undefined && receipt.deductionBefore !== null) {
        lines.push('・' + label + ': 控除額は調整前 ' + yen(receipt.deductionBefore) + ' − 重複相当額 ' + yen(receipt.overlapEquivalent) + ' ＝ ' + yen(receipt.deduction) + (receipt.floorApplied ? '（80万円の最低額を適用）' : ''));
      } else {
        lines.push('・' + label + ': 控除額 ' + yen(receipt.deduction) + (receipt.floorApplied ? '（80万円の最低額を適用）' : ''));
      }
      if (receipt.category === 'short') {
        lines.push('　課税退職所得金額: 短期退職手当等として、（' + yen(receipt.income) + ' − ' + yen(receipt.deduction) + '）のうち300万円以下の部分にのみ1/2課税を適用し、300万円を超える部分は全額を課税対象にして ＝ ' + yen(receipt.taxable) + '（1,000円未満切り捨て）');
      } else {
        lines.push('　課税退職所得金額: （' + yen(receipt.income) + ' − ' + yen(receipt.deduction) + '）に1/2課税を適用 ＝ ' + yen(receipt.taxable) + '（1,000円未満切り捨て）');
      }
      lines.push('　所得税額: 課税退職所得金額に退職所得の源泉徴収税額の速算表（税率・控除額）を適用し、×1.021（復興特別所得税）＝ ' + yen(receipt.incomeTax));
      lines.push('　住民税額: ' + yen(receipt.taxable) + ' × 6% ＝ ' + yen(receipt.residentMunicipal) + '（市町村民税）／ × 4% ＝ ' + yen(receipt.residentPrefectural) + '（道府県民税）。各々100円未満切り捨て');
    }
    if (best.combined) {
      receiptProcess('同年に受け取る場合（合算）', best.combined);
    } else {
      receiptProcess('退職金', best.retirement);
      receiptProcess('DC老齢一時金', best.dc);
    }
    lines.push('');
    lines.push('【計算の前提】');
    lines.push('・退職所得控除は勤続年数で計算し、退職金とDCの受け取り間隔によって重なり調整がかかります。調整期間は、DCを先に受け取った場合はDCの受取が2026年1月1日以後なら9年・同日前なら4年、退職金を先に受け取った場合は19年です。');
    lines.push('・根拠: 国税庁タックスアンサー No.1420（退職金を受け取ったとき）' + SOURCES.no1420 + '、No.2732（確定拠出年金と退職手当等の重なり調整）' + SOURCES.no2732 + '、退職所得の源泉徴収税額の速算表 ' + SOURCES.besshi);
    lines.push('');
    lines.push('【聞きたいこと】');
    lines.push('1. この受け取り方が有利になる仕組みを、かみくだいて説明してください。');
    lines.push('2. この試算で見落としやすい注意点（税金以外の要素も含めて）を教えてください。');
    lines.push('3. 私の状況で他に検討すべき選択肢があれば挙げてください。');
    lines.push('');
    lines.push('※これは一般的な仕組みの解説を求めるものです。最終的な判断は税理士等の専門家または所轄の税務署に確認するよう、その旨も添えてください。');
    return lines.join('\n');
  }

  function copyText(text) {
    function done() { showToast('コピーしました。貼る前に、個人が特定できる情報が入っていないか確認してください'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else {
      fallback();
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { showToast('コピーできませんでした'); }
      document.body.removeChild(ta);
    }
  }

  /* トースト: 下にふっと出て消える知らせ（辞書624「トースト」） */
  function showToast(msg) {
    var t = el('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function calculate() {
    var raw = collectInput();
    var errors = validate(raw);
    var errBox = el('form-error');
    if (errors.length) {
      errBox.innerHTML = '<div class="error">' + errors.map(esc).join('<br>') + '</div>';
      return;
    }
    errBox.innerHTML = '';
    var focus = parseInt(el('d-focus-year').value, 10);
    if (focus) selectedYear = focus;
    render(window.TaxEngine.computeAll(rules, raw));
  }

  /* ---------- 初期化 ---------- */

  function init() {
    el('add-period').addEventListener('click', function () { addDcPeriodRow('', '', '企業型'); });
    el('calc').addEventListener('click', calculate);
    calculate();
  }

  if (window.TAX_RULES) {
    rules = window.TAX_RULES;
    init();
  } else {
    fetch('data/rules.json')
      .then(function (r) { return r.json(); })
      .then(function (json) { rules = json; init(); })
      .catch(function () {
        el('form-error').innerHTML = '<div class="error">計算ルール（data/rules.json）を読み込めませんでした。</div>';
      });
  }
})();
