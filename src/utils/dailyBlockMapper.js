// daily_blocks row ↔ DB row 변환 (camelCase ↔ snake_case).
// WORKLOG-SPEC.md §3.7.1 의 DailyBlock 타입과 §3.2.1 의 SQL 컬럼을 잇는 thin layer.
//
// 변환 표:
//   blockId         ↔ block_id
//   pageId          ↔ page_id
//   pageDate        ↔ page_date
//   userId          ↔ user_id
//   blockType       ↔ block_type
//   parentBlockId   ↔ parent_block_id
//   sectionId       ↔ section_id            (uuid, self-ref §9.9)
//   sectionMasterId ↔ section_master_id     (text, → worklog_sections, section row 만)
//   position        ↔ position
//   textContent     ↔ text_content
//   richContent     ↔ rich_content
//   isTodo          ↔ is_todo
//   todoChecked     ↔ todo_checked
//   todoStatus      ↔ todo_status
//   isCarryOver     ↔ is_carry_over
//   carryOverFrom   ↔ carry_over_from
//   originBlockId   ↔ origin_block_id
//   isPinned        ↔ is_pinned
//   isOpen          ↔ is_open
//   visibility      ↔ visibility
//   isFixedSection  ↔ is_fixed_section
//   createdAt       ↔ created_at
//   updatedAt       ↔ updated_at
//   deletedAt       ↔ deleted_at

const FIELD_MAP_TO_DB = Object.freeze({
  blockId:        'block_id',
  pageId:         'page_id',
  pageDate:       'page_date',
  userId:         'user_id',
  blockType:      'block_type',
  parentBlockId:   'parent_block_id',
  sectionId:       'section_id',
  sectionMasterId: 'section_master_id',
  position:        'position',
  textContent:    'text_content',
  richContent:    'rich_content',
  isTodo:         'is_todo',
  todoChecked:    'todo_checked',
  todoStatus:     'todo_status',
  isCarryOver:    'is_carry_over',
  carryOverFrom:  'carry_over_from',
  originBlockId:  'origin_block_id',
  isPinned:       'is_pinned',
  isOpen:         'is_open',
  visibility:     'visibility',
  isFixedSection: 'is_fixed_section',
  createdAt:      'created_at',
  updatedAt:      'updated_at',
  deletedAt:      'deleted_at',
})

const FIELD_MAP_FROM_DB = Object.freeze(
  Object.fromEntries(Object.entries(FIELD_MAP_TO_DB).map(([k, v]) => [v, k]))
)

// camelCase row → snake_case DB row
export function rowToDb(row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    const dbKey = FIELD_MAP_TO_DB[k]
    if (dbKey) out[dbKey] = v
  }
  return out
}

// snake_case DB row → camelCase row
export function rowFromDb(db) {
  const out = {}
  for (const [k, v] of Object.entries(db)) {
    const camelKey = FIELD_MAP_FROM_DB[k]
    if (camelKey) {
      out[camelKey] = camelKey === 'position' && typeof v === 'string' ? parseFloat(v) : v
    }
  }
  return out
}

// patch (변경된 필드만) 의 변환
export function patchToDb(patch) {
  const out = {}
  for (const [k, v] of Object.entries(patch)) {
    const dbKey = FIELD_MAP_TO_DB[k]
    if (dbKey) out[dbKey] = v
  }
  return out
}
