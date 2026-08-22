// 백오피스 링크 정본 — ★목록이 «한 곳»에 있어야 런처와 「홈으로」 버튼이 갈라지지 않는다.
//   (같은 목록을 두 벌 두면 화면 하나가 추가될 때 한쪽만 낡는다 — 이 도메인에서 반복된 함정이다.)
const B = () => (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.BASE_URL : '/')

export const HOME_HREF = `${B()}?role=home`

// ★`desc` 는 «직원이 무엇을 하는 화면인지»만 적는다 — 손님이 봐도 새로 알게 되는 값이 없어야 한다.
export const BACKOFFICE_LINKS = [
  { role: 'staff', name: '회원 조회', desc: '번호로 찾고 참여권을 발권합니다', href: `${B()}?role=staff` },
  { role: 'scan', name: '참여권 회수', desc: '바코드를 스캔해 회수·인쇄합니다', href: `${B()}?role=scan` },
  { role: 'editor', name: '영수증 편집', desc: '인쇄 서식과 기기 설정을 봅니다', href: `${B()}?role=editor` },
  { role: 'display', name: '응원 화면', desc: '손님에게 보여 주는 축하 화면입니다', href: `${B()}?role=display` },
  { role: 'printer', name: '인쇄 브리지', desc: '발권을 받아 자동으로 인쇄합니다', href: `${B()}?role=printer` },
]
