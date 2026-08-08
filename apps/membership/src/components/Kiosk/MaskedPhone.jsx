// 가린 전화번호 표시.
//
// ★형태(하이픈 위치·시점)는 **`formatPhone` 하나가 정한다**(2026-08-08 정정).
//   종전엔 마스킹용 그룹 계산을 따로 뒀다가 「010 뒤 하이픈이 처음부터 붙어 있어야」를 어겼다 —
//   `formatPhone` 은 이미 그 규칙(그룹 경계에 닿으면 하이픈을 미리 띄운다, 2026-08-06 유저 지시)을
//   갖고 있었는데 **두 벌이 되면서 한쪽만 낡은 것**이다.
//   ⇒ 이제 `formatPhone` 결과를 받아 **앞 3자리를 뺀 숫자만 점으로 바꿔 그린다.**
//     하이픈이 언제 나오는지는 이 파일이 몰라도 된다 = 어긋날 수가 없다.
//
// ★점은 **CSS 원**으로 그린다(문자 `●` 아님). 글리프를 쓰면 표시 폰트 크기(최대 52px)에 딸려 커지고,
//   폰트에 그 글자가 없으면 폴백으로 넘어가 폭·베이스라인이 흔들려 **사이 하이픈이 짓눌린다**.
//
// ★마지막으로 누른 자리만 잠깐 숫자로 보여준다(비밀번호 입력 표준 문법). 지울 때는 노출하지 않는다.
import { useEffect, useRef, useState } from 'react'
import { formatPhone } from './kioskUtils'

const PEEK_MS = 900
const PREFIX_LEN = 3   // 통신사 접두(010)는 가리지 않는다 — 누구나 같아 식별 정보가 아니다

export default function MaskedPhone({ digits }) {
  const [peek, setPeek] = useState(-1)   // 전체 숫자 인덱스. -1 = 없음
  const prevLenRef = useRef(0)

  const raw = String(digits || '').replace(/[^0-9]/g, '')

  useEffect(() => {
    const len = raw.length
    const grew = len > prevLenRef.current
    prevLenRef.current = len
    if (!grew || len <= PREFIX_LEN) { setPeek(-1); return undefined }
    setPeek(len - 1)
    const t = setTimeout(() => setPeek(-1), PEEK_MS)
    return () => clearTimeout(t)
  }, [raw])

  if (!raw) return null
  let digitIdx = -1
  return (
    <span className="mk-masked">
      {Array.from(formatPhone(raw)).map((ch, i) => {
        if (ch < '0' || ch > '9') return <span key={i} className="mk-masked-sep">{ch}</span>
        digitIdx += 1
        if (digitIdx < PREFIX_LEN || digitIdx === peek) {
          return <span key={i} className="mk-masked-num">{ch}</span>
        }
        return <i key={i} className="mk-masked-dot" />
      })}
    </span>
  )
}
