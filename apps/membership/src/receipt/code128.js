/* CODE128 인코더·렌더러 — ★game 검증본(`saruru-game/js/code128.js`) 이식.
 *
 * 왜 이식인가: 멤버십의 기존 바코드는 **의사 바코드(FakeBarcode·프리뷰 전용)**라 스캔되지 않는다.
 *   손님 폰 화면을 카운터 스캐너로 읽히려면 **실제 CODE128**이어야 한다(그려지는 것 ≠ 읽히는 것).
 *   game 쪽은 정확히 "모바일 화면 바코드를 카운터가 스캔"하는 용도로 검증된 구현이라 그대로 가져온다.
 *   ★알고리즘(PATTERNS·체크값·폭 산출)은 **한 글자도 바꾸지 않았다** — 바꾸면 판독이 깨진다.
 *   동형성은 game 셀프테스트(tools/code128-selftest.js)와 동일 입력으로 대조 검증했다.
 *
 * 변경점: 전역(window.Code128) IIFE → ES 모듈 export (Vite 번들용). 렌더러는 캔버스 그대로.
 */


  "use strict";

  // 값 0~106의 모듈폭 패턴(바-공백-바-공백-바-공백). 103=StartA, 104=StartB, 105=StartC, 106=Stop.
  // 각 항목 합 = 11 모듈(Stop만 13). 셀프테스트(tools/code128-selftest.js)가 이 불변식을 검증한다.
  var PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
  ];

  var START_B = 104, STOP = 106;

  // Code Set B: 값 v ↔ ASCII (v + 32). 32(공백)~126(~) 표현.
  function charValue(ch) {
    var c = ch.charCodeAt(0) - 32;
    if (c < 0 || c > 94) return -1;
    return c;
  }

  // 심볼값 배열 = [StartB, 데이터…, 체크값, Stop]
  //   체크값 = (StartB + Σ 값ᵢ × 위치ᵢ) mod 103   (위치는 1부터)
  function values(data) {
    var s = String(data == null ? "" : data);
    var out = [START_B], i, v, sum = START_B;
    for (i = 0; i < s.length; i++) {
      v = charValue(s.charAt(i));
      if (v < 0) throw new Error("code128: Code Set B로 표현할 수 없는 문자 (index " + i + ")");
      out.push(v);
      sum += v * (i + 1);
    }
    out.push(sum % 103);
    out.push(STOP);
    return out;
  }

  // 폭 배열(첫 원소 = 바, 이후 공백/바 교대)
  function widths(data) {
    var vals = values(data), out = [], i, j, p;
    for (i = 0; i < vals.length; i++) {
      p = PATTERNS[vals[i]];
      for (j = 0; j < p.length; j++) out.push(parseInt(p.charAt(j), 10));
    }
    return out;
  }

  // 캔버스 렌더 — 정수 픽셀 격자에만 그린다(스캐너 판독 정확도 우선).
  //   opts: {module: 모듈 1칸 px, height: 바 높이 px, quiet: 좌우 여백 모듈수(기본 10), bg, fg}
  function render(canvas, data, opts) {
    opts = opts || {};
    var module = Math.max(1, Math.round(opts.module || 2));
    var height = Math.max(20, Math.round(opts.height || 72));
    var quiet = opts.quiet == null ? 10 : opts.quiet;   // SPEC: 충분한 quiet zone
    var bg = opts.bg || "#FFFFFF";
    var fg = opts.fg || "#000000";                       // 고대비 흑백 고정(브랜드색 금지 — 판독 우선)

    var w = widths(data), total = 0, i;
    for (i = 0; i < w.length; i++) total += w[i];

    var cssW = (total + quiet * 2) * module;
    var cssH = height;
    // devicePixelRatio를 정수배로만 반영 → 서브픽셀 번짐 없이 선명하게.
    var dpr = Math.max(1, Math.floor((globalThis.devicePixelRatio || 1)));
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";

    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = fg;

    var x = quiet * module * dpr, bar = true, px;
    for (i = 0; i < w.length; i++) {
      px = w[i] * module * dpr;
      if (bar) ctx.fillRect(x, 0, px, canvas.height);
      x += px;
      bar = !bar;
    }
    return { cssWidth: cssW, cssHeight: cssH, modules: total };
  }

export { values, widths, render }
export default { PATTERNS, values, widths, render }
