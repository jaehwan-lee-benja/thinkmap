// [A] docToBlocks — 자식 콘텐츠 visibility 가 조상 섹션을 강제 상속하는지 검증.
// 섹션 = 공유 단위. 타이핑된 블록(기본 'all')이 master 섹션 아래에서 'master' 로 강제돼야
// RLS 누수(공개로 떠다니는 고아 토글)가 없다.

import { describe, test, expect } from 'vitest'
import { docToBlocks } from '../../src/utils/docToBlocks.js'

const ctx = { pageId: 'p-0001', pageDate: '2026-06-28', userId: 'u-0001' }

const para = (t) => ({ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : [] })

function section(blockId, visibility, children = []) {
  return {
    type: 'toggle',
    attrs: { blockType: 'h2', blockId, visibility, sectionMasterId: 'm-' + blockId, isOpen: true },
    content: [para('S'), ...children],
  }
}
function toggle(blockId, visibility, children = []) {
  return {
    type: 'toggle',
    attrs: { blockId, visibility, isOpen: true },
    content: [para('x'), ...children],
  }
}
const doc = (content) => ({ type: 'doc', content })

describe('docToBlocks 자식 visibility 상속 ([A] 섹션=공유 단위)', () => {
  test('master 섹션의 자식은 visibility=master 강제 (타이핑 누수 차단)', () => {
    const next = doc([section('sec1', 'master', [toggle('c1', 'all')])])
    const { insert } = docToBlocks(null, next, ctx)
    expect(insert.find(r => r.blockId === 'c1').visibility).toBe('master')
  })

  test('all 섹션의 자식은 visibility=all', () => {
    const next = doc([section('sec2', 'all', [toggle('c2', 'master')])])
    const { insert } = docToBlocks(null, next, ctx)
    expect(insert.find(r => r.blockId === 'c2').visibility).toBe('all')
  })

  test('손자(중첩 토글)까지 섹션 visibility 상속', () => {
    const next = doc([section('sec3', 'master', [toggle('c3', 'all', [toggle('g3', 'all')])])])
    const { insert } = docToBlocks(null, next, ctx)
    expect(insert.find(r => r.blockId === 'g3').visibility).toBe('master')
  })

  test('섹션 헤더 자신의 visibility 는 보존', () => {
    const next = doc([section('sec4', 'master', [toggle('c4', 'all')])])
    const { insert } = docToBlocks(null, next, ctx)
    expect(insert.find(r => r.blockId === 'sec4').visibility).toBe('master')
  })
})
