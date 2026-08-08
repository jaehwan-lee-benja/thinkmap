// 가린 전화번호 표시.
//
// ★두 가지를 여기서 해결한다(2026-08-08 실기기 피드백):
//  ⑴ 점을 **CSS 로 그린다**(문자 `●` 아님). 글리프를 쓰면 표시 폰트 크기(최대 52px)에 딸려 커지고,
//     폰트에 그 글자가 없으면 폴백으로 넘어가 폭·베이스라인이 흔들려 **사이 하이픈이 시각적으로
//     짓눌린다**. DOM 에는 하이픈이 있는데 눈에 안 보이던 이유다 — textContent 측정만으론 못 잡았고
//     **스크린샷을 봐야** 잡히는 종류였다.
//  ⑵ **마지막 입력 글자만 잠깐 숫자로** 보여주고 ●로 바꾼다(비밀번호 입력 표준 문법).
//     오입력을 즉시 알아채면서 가림은 유지된다. 백스페이스로 줄어들 때는 노출하지 않는다.
import { useEffect, useRef, useState } from 'react'
import { maskPhoneGroups } from './kioskUtils'

const PEEK_MS = 900

export default function MaskedPhone({ digits }) {
  const [peek, setPeek] = useState(-1)   // 가린 구간(rest) 안의 인덱스. -1 = 없음
  const prevLenRef = useRef(0)

  useEffect(() => {
    const len = String(digits || '').replace(/[^0-9]/g, '').length
    const grew = len > prevLenRef.current
    prevLenRef.current = len
    // 지울 때는 노출하지 않는다 — 지운 자리를 보여줄 이유가 없고, 오히려 «되살아난 것»처럼 읽힌다.
    if (!grew || len <= 3) { setPeek(-1); return undefined }
    setPeek(len - 4)                     // rest 의 마지막 인덱스
    const t = setTimeout(() => setPeek(-1), PEEK_MS)
    return () => clearTimeout(t)
  }, [digits])

  const m = maskPhoneGroups(digits)
  if (!m) return null
  let base = 0
  return (
    <span className="mk-masked">
      <span className="mk-masked-grp">{m.head}</span>
      {m.groups.map((g, i) => {
        const start = base
        base += g.length
        return (
          <span key={i} className="mk-masked-grp">
            <span className="mk-masked-sep">-</span>
            {Array.from(g).map((ch, j) => (
              start + j === peek
                ? <span key={j} className="mk-masked-num">{ch}</span>
                : <i key={j} className="mk-masked-dot" />
            ))}
          </span>
        )
      })}
    </span>
  )
}
