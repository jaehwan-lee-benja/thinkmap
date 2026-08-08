// 화면키패드 입력 누적 — 순수 함수(상태·네트워크 무관). SeatNumpad 가 로컬 draft 에 적용한다.
//   ★왜 분리했나: 예전 키패드는 «서버에서 온 order 값(raw)» 을 읽어 `raw + 누른키` 로 다음 값을 만들고
//   곧바로 서버로 보냈다(read-modify-write). 빠르게 연타하면 두 번째 키가 **아직 갱신되지 않은 raw** 를
//   읽어 앞 글자가 통째로 날아간다("132" → "3"). 누적을 순수 함수로 빼고 로컬 state 에 함수형으로 적용하면
//   직전 눌림이 항상 반영된 값 위에 쌓인다(React 가 큐를 순서대로 적용).
export const NUMPAD_MAX_LEN = 6

// cur = 현재 입력 문자열, key = '0'~'9' | 'back' | 'clear'
export function applyNumpadKey(cur = '', key, maxLen = NUMPAD_MAX_LEN) {
  const s = cur ?? ''
  if (key === 'clear') return ''
  if (key === 'back') return s.slice(0, -1)
  if (!/^[0-9]$/.test(String(key))) return s // 알 수 없는 키는 무시(값 보존)
  return (s + key).slice(0, maxLen)
}

// 여러 키를 순서대로 적용(테스트·일괄 처리용).
export const applyNumpadKeys = (cur, keys = [], maxLen = NUMPAD_MAX_LEN) =>
  keys.reduce((acc, k) => applyNumpadKey(acc, k, maxLen), cur ?? '')
