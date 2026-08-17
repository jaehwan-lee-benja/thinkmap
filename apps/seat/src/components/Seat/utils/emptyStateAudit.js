// 빈 상태 문구 감사기 — ★「빈 자리 문구는 **전부** emptyText 를 거친다」는 주장에 기계를 붙인다.
//
// 왜(2026-08-18 D 트랙 «문서만 닫힌 것» 적발): 단일점 ② 를 고치면서 SEAT-SPEC 에
//   「빈 자리 문구는 전부 이걸 거친다」고 적었다. **그 문장이 거짓이었다** — 현황 모달(StatusOverview)의
//   「— 대기/올림/완료 없음 —」 셋이 그대로 남아 있었다. 읽기 실패 때 그 화면은 여전히
//   «고장을 정상 얼굴로» 착지시키고 있었다.
//   ★고친 것보다 무서운 건 **내가 「전부」라고 적어 놓고 다음 사람이 그걸 믿게 만든 것**이다.
//   문서의 «전부»는 기계가 없으면 «내가 그때 본 것 전부»라는 뜻일 뿐이다.
//
// 무엇을 재나: JSX 안의 **빈 상태 문구 꼴** 문자열이 `emptyText(` 안에 들어 있는가.
//   판별이 확실한 꼴만 본다 — `— … 없음 —`(줄표로 감싼 자리표시). 이건 이 앱에서 빈 자리에만 쓴다.
//   ※`…없습니다` 류는 안내문·오류문과 섞여 기계로 못 가른다 ⇒ **일부러 안 본다.**
//     기계가 못 보는 것을 본다고 적으면 그게 거짓 초록이다(사람 칸 = SPEC 체크리스트).

// ★주석을 지우고 본다 — 안 지우면 **내가 방금 쓴 주석이 위반으로 잡힌다**(2026-08-18 실제로 잡혔다).
//   오늘 받은 규율 그대로다: 「내가 고치는 파일에서는 내가 쓴 문구가 대조군이 될 수 있다.」
//   그리고 이건 «반대 방향 오탐»이라 더 고약하다 — 고칠 게 없는데 빨간불이 켜져,
//   다음 사람이 멀쩡한 코드를 «고치러» 들어온다. (길이는 보존한다 — 인덱스로 앞줄을 보기 때문이다.)
const blank = (m) => m.replace(/[^\n]/g, ' ')
export const maskComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank)

/** 문자열 리터럴 안의 빈 자리 문구 꼴. 예: '— 올림 없음 —' */
export const EMPTY_LITERAL = /['"`](—[^'"`]*없음\s*—)['"`]/g

/**
 * @param {{path: string, src: string}[]} files
 * @returns {string[]} 위반(빈 배열 = 통과)
 */
export function emptyStateViolations(files) {
  const warn = []
  for (const { path, src } of files) {
    const code = maskComments(src)   // ★주석 제외(길이 보존 → 아래 인덱스가 원문과 같다)
    for (const m of code.matchAll(EMPTY_LITERAL)) {
      // 그 리터럴 **앞쪽**에 열려 있는 `emptyText(` 가 있는가 — 같은 줄 안에서 본다.
      //   (호출이 한 줄에 담기는 게 이 코드베이스의 형태다. 여러 줄로 쓰면 여기가 잡고,
      //    그때는 이 검사를 고치는 게 맞다 — 조용히 통과시키는 것보다 낫다.)
      const lineStart = code.lastIndexOf('\n', m.index) + 1
      const before = code.slice(lineStart, m.index)
      if (!/emptyText\s*\([^)]*$/.test(before)) {
        warn.push(`${path}: 빈 자리 문구가 emptyText 를 안 거친다 — ${m[1]}`)
      }
    }
  }
  return warn
}
