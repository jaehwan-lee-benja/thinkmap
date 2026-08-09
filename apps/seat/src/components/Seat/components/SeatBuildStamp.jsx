// 배포 버전 스탬프 — 아주 연한 회색 소형 텍스트(유저 지시 2026-08-09 「자리후도 버전 기록 페이지마다」).
//   ★표기는 **사람 기준**: `v8.9-3` = 월.일 + 그날의 판 번호. «숫자가 커졌나»만 보면 새로고침 판별이 끝난다.
//   hash 는 괄호로 병기하고 더 연하게 — 사람은 앞을, 배포 검증은 뒤를 쓴다(값 생성은 vite.config 주석 참조).
//   멤버십 키오스크(BuildStamp)와 같은 문법이다. 두 위성의 표기가 다르면 원격에서 판 번호를 대조 못 한다.
//
//   ★자리후는 **헤더 안 인라인**으로 둔다(멤버십은 fixed 오버레이). 자리후 우상단은 [⛶][설정] 버튼이
//     차지하고 있어서 fixed 로 겹쳐 놓으면 글자가 버튼 위에 얹힌다. 헤더는 4역할 탭 전부가 공유하는
//     한 줄이라, 여기 두면 «페이지마다» 요구가 자동으로 충족되고 겹침도 없다.
//     corner = 헤더가 없는 화면(로그인)용 — 화면 우상단에 고정.
export default function SeatBuildStamp({ corner = false }) {
  const v = typeof __SEAT_BUILD__ === 'string' ? __SEAT_BUILD__ : 'dev'
  const sha = typeof __SEAT_SHA__ === 'string' ? __SEAT_SHA__ : ''
  return (
    <div className={`seat-build${corner ? ' is-corner' : ''}`} aria-hidden="true">
      <b>{v}</b>{sha ? <span className="seat-build-sha"> ({sha})</span> : null}
    </div>
  )
}
