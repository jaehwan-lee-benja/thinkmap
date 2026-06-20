import React, { useState } from 'react'
import { Bot, Copy, Check } from 'lucide-react'
import { Modal, ModalHeader, ModalBody } from '../Common/Modal/Modal'
import './GoalClaudeAccess.css'

// 목표 페이지 전용 — "클로드 앱(claude.ai)에서 이 페이지를 직접 편집"하도록
// 필요한 안내문을 만들어 복사해 준다.
//
// 이 프로젝트의 Supabase 는 claude.ai 계정 커넥터(mcp__claude_ai_Supabase__*)로
// 연결돼 있어, 클로드 앱이 pages.content_tiptap 을 직접 read/write 할 수 있다
// (커넥터가 RLS 를 우회하는 관리자급 연결). 따라서 "권한"을 새로 만들 건 없고,
// 클로드 앱이 어느 행을 어떤 포맷으로 고쳐야 하는지 알려주는 안내문이 곧 "환경 셋팅"이다.

const projectRef = (import.meta.env.VITE_SUPABASE_URL || '')
  .replace(/^https?:\/\//, '')
  .split('.')[0] || ''

function buildPrompt(pageId) {
  return `[ThinkMap 목표 페이지 편집 권한]

너는 연결된 Supabase 커넥터로 내 ThinkMap '목표' 페이지를 직접 편집한다.

· 프로젝트 ref: ${projectRef}
· 대상 행: pages 테이블, id = '${pageId}' (page_type='goal')
· 본문 컬럼: content_tiptap (JSONB, TipTap 문서)

편집 절차 (매 수정마다):
1) 현재 내용을 먼저 읽는다:
   select content_tiptap from pages where id = '${pageId}';
2) 내 요청을 반영한 새 TipTap 문서(JSON 전체)를 만든다. 기존 내용을 유지하려면 1)에서 읽은 것을 포함한다.
3) 저장한다:
   update pages set content_tiptap = '<새 JSON>'::jsonb, updated_at = now() where id = '${pageId}';

TipTap 포맷 규칙 (★ 이 사이트의 모든 최상위 블록은 '토글'이다 — 최상위에 절대 paragraph 를 두지 마라):
· 최상위 문서: {"type":"doc","content":[ <toggle>, <toggle>, ... ]}  — content 원소는 전부 toggle
· 한 줄(블록) = 토글 1개:
  {"type":"toggle","attrs":{"isOpen":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"내용"}]}]}
· 토글의 첫 자식은 반드시 paragraph(헤더 텍스트). 빈 줄도 paragraph 를 가진 토글로 만든다.
· 제목:  attrs 에 "blockType":"h1" | "h2" | "h3"
· 할 일: attrs 에 "isTodo":true (완료면 "todoChecked":true 추가)
· 굵게:  텍스트에 "marks":[{"type":"bold"}]
· 중첩(하위 항목): 부모 toggle 의 content 에 자식 toggle 를 넣는다 (단 첫 자식은 paragraph, 그 뒤에 toggle):
  {"type":"toggle","attrs":{"isOpen":true},"content":[
    {"type":"paragraph","content":[{"type":"text","text":"부모"}]},
    {"type":"toggle","attrs":{"isOpen":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"자식"}]}]}
  ]}
· 금지: 최상위 paragraph, 그리고 bulletList/orderedList/listItem (목록은 attrs "blockType":"bullet" 또는 "ordered" 로 표현). 그 외 attrs 는 생략해도 로드 시 기본값이 채워진다.

주의:
· 이 페이지를 브라우저 편집기에서 열어둔 채 수정하면 충돌할 수 있다 — 닫아두고 진행한다.
· content_tiptap 전체를 교체하므로 기존 내용 보존에 유의한다.

준비됐으면 "확인"이라고만 답하고, 이후 내가 보내는 수정 요청을 위 절차대로 실행해줘.`
}

export default function GoalClaudeAccess({ pageId }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!pageId) return null

  const promptText = buildPrompt(pageId)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 클립보드 권한 거부 시: textarea 선택 폴백
      const ta = document.getElementById('goal-claude-prompt')
      if (ta) { ta.focus(); ta.select() }
    }
  }

  return (
    <>
      <button
        className="tiptap-btn tiptap-btn-secondary"
        onClick={() => setOpen(true)}
        title="클로드 앱(claude.ai)에서 이 목표 페이지를 직접 편집하도록 안내문 복사"
      >
        <Bot size={16} />
        <span className="tiptap-btn-label">클로드 편집 허용</span>
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} className="goal-claude-modal">
        <ModalHeader icon={Bot} title="클로드 편집 허용" onClose={() => setOpen(false)} />
        <ModalBody>
          <ol className="goal-claude-steps">
            <li>클로드 앱(claude.ai)에서 <b>Supabase 커넥터</b>가 켜져 있는지 확인합니다.</li>
            <li>아래 안내문을 <b>복사</b>해 클로드 채팅에 붙여넣습니다.</li>
            <li>이후 “이 부분을 이렇게 바꿔줘”라고 말하면 클로드가 이 페이지를 직접 수정합니다.</li>
          </ol>

          <textarea
            id="goal-claude-prompt"
            className="goal-claude-prompt"
            readOnly
            value={promptText}
            rows={16}
            onFocus={(e) => e.target.select()}
          />

          <button className="tiptap-btn tiptap-btn-primary goal-claude-copy" onClick={handleCopy}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copied ? '복사됨' : '안내문 복사'}</span>
          </button>

          <p className="goal-claude-note">
            ⚠ 클로드가 수정하는 동안에는 이 페이지를 편집기에서 닫아두세요(동시 편집 충돌 방지).
          </p>
        </ModalBody>
      </Modal>
    </>
  )
}
