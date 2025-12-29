/**
 * JSON 기반 블록 → 개별 레코드 마이그레이션 스크립트
 *
 * 실행 방법:
 * 1. Supabase에서 create-blocks-schema.sql 실행
 * 2. 이 파일을 브라우저 콘솔이나 Node.js에서 실행
 *
 * 주의: 이 스크립트는 한 번만 실행해야 합니다!
 */

import { supabase } from './src/supabaseClient.js'

/**
 * 블록 개수 재귀적 계산 (검증용)
 */
function countBlocksRecursive(blocks) {
  if (!Array.isArray(blocks)) return 0
  let count = blocks.length
  blocks.forEach(block => {
    if (Array.isArray(block.children)) {
      count += countBlocksRecursive(block.children)
    }
  })
  return count
}

/**
 * 마이그레이션 검증 함수
 */
async function validateMigration(userId) {
  console.log('\n🔍 마이그레이션 검증 시작...')

  try {
    // 1. 백업 데이터 로드
    const { data: backup, error: backupError } = await supabase
      .from('user_settings')
      .select('setting_value')
      .eq('user_id', userId)
      .eq('setting_key', 'key_thoughts_blocks_backup')
      .maybeSingle()

    if (backupError) throw backupError
    if (!backup) {
      console.error('❌ 백업 데이터가 없습니다.')
      return false
    }

    const originalBlocks = JSON.parse(backup.setting_value)

    // 2. 변환된 블록 로드
    const { data: newBlocks, error: newBlocksError } = await supabase
      .from('blocks')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true })

    if (newBlocksError) throw newBlocksError

    // 3. 블록 개수 검증
    const countOriginal = countBlocksRecursive(originalBlocks)
    const countNew = newBlocks.length

    console.log(`📊 블록 개수: 원본=${countOriginal}, 변환=${countNew}`)

    if (countOriginal !== countNew) {
      console.error(`❌ 블록 개수 불일치!`)
      return false
    }

    // 4. 계층 구조 검증 (parent_id 관계)
    const parentCheck = newBlocks.every(block => {
      if (block.parent_id === null) return true
      return newBlocks.some(b => b.id === block.parent_id)
    })

    if (!parentCheck) {
      console.error('❌ 계층 구조 오류: 존재하지 않는 parent_id 발견')
      return false
    }

    // 5. 참조 블록 검증 (is_reference가 false인지)
    const referenceCheck = newBlocks.every(block => {
      return block.is_reference === false && block.original_block_id === null
    })

    if (!referenceCheck) {
      console.error('❌ 참조 블록이 잘못 생성되었습니다.')
      return false
    }

    console.log('✅ 마이그레이션 검증 성공!')
    console.log(`   - 블록 개수: ${countNew}개`)
    console.log(`   - 계층 구조: 정상`)
    console.log(`   - 참조 블록: 없음 (정상)`)
    return true
  } catch (error) {
    console.error('❌ 검증 중 오류:', error.message)
    return false
  }
}

/**
 * JSON → 개별 레코드 마이그레이션 함수
 */
async function migrateJSONtoBlocks(userId) {
  console.log('\n🚀 마이그레이션 시작...')
  console.log(`User ID: ${userId}`)

  try {
    // 1. 기존 JSON 데이터 로드
    console.log('\n📥 기존 JSON 데이터 로드 중...')
    const { data: settings, error: fetchError } = await supabase
      .from('user_settings')
      .select('setting_value')
      .eq('user_id', userId)
      .eq('setting_key', 'key_thoughts_blocks')
      .maybeSingle()

    if (fetchError) throw fetchError

    const settingValue = settings?.setting_value || '[]'
    console.log(`   - 원본 데이터 크기: ${settingValue.length} bytes`)

    // 2. 백업 저장
    console.log('\n💾 백업 저장 중...')
    const { error: backupError } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        setting_key: 'key_thoughts_blocks_backup',
        setting_value: settingValue,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,setting_key' })

    if (backupError) throw backupError
    console.log('   ✅ 백업 완료')

    // 3. JSON 파싱
    const blocksJSON = JSON.parse(settingValue)
    console.log(`\n📝 JSON 파싱 완료: ${blocksJSON.length}개 최상위 블록`)

    // 4. 재귀적으로 평탄화
    console.log('\n🔄 블록 평탄화 중...')
    const flattenedBlocks = []
    const positionCounter = {}  // parent_id별 position 카운터

    const traverse = (blockList, parentId = null, depth = 0) => {
      blockList.forEach((block, index) => {
        // 새 UUID 생성
        const blockId = crypto.randomUUID()

        // position 계산 (부모별로 0부터 시작)
        const parentKey = parentId || 'root'
        if (!positionCounter[parentKey]) {
          positionCounter[parentKey] = 0
        }
        const position = positionCounter[parentKey]++

        // 평탄화된 블록 추가
        flattenedBlocks.push({
          id: blockId,
          user_id: userId,
          content: block.content || '',
          type: block.type || 'toggle',
          parent_id: parentId,
          position: position,
          is_open: block.isOpen !== undefined ? block.isOpen : true,
          is_reference: false,
          original_block_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

        // 자식 블록 재귀 처리
        if (Array.isArray(block.children) && block.children.length > 0) {
          traverse(block.children, blockId, depth + 1)
        }
      })
    }

    traverse(blocksJSON)

    console.log(`   ✅ ${flattenedBlocks.length}개 블록으로 변환 완료`)
    console.log(`   - 최대 깊이: ${Math.max(...Object.keys(positionCounter).length)}`)

    // 5. blocks 테이블에 일괄 삽입
    console.log('\n💾 DB에 블록 저장 중...')

    // Supabase는 1000개씩 삽입 제한이 있으므로 배치로 나누기
    const batchSize = 1000
    for (let i = 0; i < flattenedBlocks.length; i += batchSize) {
      const batch = flattenedBlocks.slice(i, i + batchSize)
      const { error: insertError } = await supabase
        .from('blocks')
        .insert(batch)

      if (insertError) throw insertError

      console.log(`   - ${i + batch.length}/${flattenedBlocks.length} 저장 완료`)
    }

    console.log('   ✅ 모든 블록 저장 완료')

    // 6. 마이그레이션 완료 플래그 설정
    console.log('\n🏁 마이그레이션 완료 플래그 설정 중...')
    const { error: flagError } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        setting_key: 'blocks_migration_completed',
        setting_value: 'true',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,setting_key' })

    if (flagError) throw flagError

    console.log('   ✅ 완료 플래그 설정')

    // 7. 검증
    const isValid = await validateMigration(userId)

    if (isValid) {
      console.log('\n🎉 마이그레이션 완료!')
      console.log(`   총 ${flattenedBlocks.length}개 블록이 성공적으로 변환되었습니다.`)
      return flattenedBlocks.length
    } else {
      console.error('\n⚠️  마이그레이션은 완료되었으나 검증에서 문제가 발견되었습니다.')
      console.error('   rollbackToJSON() 함수를 실행하여 복구할 수 있습니다.')
      return -1
    }
  } catch (error) {
    console.error('\n❌ 마이그레이션 오류:', error.message)
    console.error('   rollbackToJSON() 함수를 실행하여 복구하세요.')
    throw error
  }
}

/**
 * 롤백 함수: blocks 테이블 → JSON 방식으로 복구
 */
async function rollbackToJSON(userId) {
  console.log('\n🔄 롤백 시작...')
  console.log(`User ID: ${userId}`)

  try {
    // 1. 백업 데이터 로드
    console.log('\n📥 백업 데이터 로드 중...')
    const { data: backup, error: backupError } = await supabase
      .from('user_settings')
      .select('setting_value')
      .eq('user_id', userId)
      .eq('setting_key', 'key_thoughts_blocks_backup')
      .maybeSingle()

    if (backupError) throw backupError

    if (!backup) {
      console.error('❌ 백업 데이터를 찾을 수 없습니다.')
      return false
    }

    console.log('   ✅ 백업 데이터 로드 완료')

    // 2. blocks 테이블 데이터 삭제
    console.log('\n🗑️  blocks 테이블 데이터 삭제 중...')
    const { error: deleteError } = await supabase
      .from('blocks')
      .delete()
      .eq('user_id', userId)

    if (deleteError) throw deleteError
    console.log('   ✅ blocks 테이블 데이터 삭제 완료')

    // 3. 기존 JSON 복구
    console.log('\n💾 JSON 방식으로 복구 중...')
    const { error: restoreError } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        setting_key: 'key_thoughts_blocks',
        setting_value: backup.setting_value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,setting_key' })

    if (restoreError) throw restoreError
    console.log('   ✅ JSON 데이터 복구 완료')

    // 4. 마이그레이션 플래그 제거
    console.log('\n🏁 마이그레이션 플래그 제거 중...')
    const { error: flagError } = await supabase
      .from('user_settings')
      .delete()
      .eq('user_id', userId)
      .eq('setting_key', 'blocks_migration_completed')

    if (flagError) throw flagError
    console.log('   ✅ 플래그 제거 완료')

    console.log('\n✅ 롤백 완료! JSON 방식으로 복구되었습니다.')
    return true
  } catch (error) {
    console.error('\n❌ 롤백 오류:', error.message)
    throw error
  }
}

/**
 * 사용 예시
 */
async function main() {
  // 현재 로그인한 사용자의 session 가져오기
  const { data: { session }, error } = await supabase.auth.getSession()

  if (error || !session) {
    console.error('❌ 로그인이 필요합니다.')
    return
  }

  const userId = session.user.id
  console.log(`\n👤 현재 사용자: ${session.user.email}`)
  console.log(`   User ID: ${userId}`)

  // 마이그레이션 실행
  const confirm = window.confirm(
    '⚠️  JSON → 개별 레코드 마이그레이션을 시작하시겠습니까?\n\n' +
    '이 작업은 되돌릴 수 있지만, 한 번만 실행해야 합니다.'
  )

  if (!confirm) {
    console.log('취소되었습니다.')
    return
  }

  await migrateJSONtoBlocks(userId)
}

// 브라우저 콘솔에서 실행 시
if (typeof window !== 'undefined') {
  window.migrateJSONtoBlocks = migrateJSONtoBlocks
  window.rollbackToJSON = rollbackToJSON
  window.validateMigration = validateMigration
  console.log('\n📌 마이그레이션 함수가 window에 등록되었습니다:')
  console.log('   - window.migrateJSONtoBlocks(userId) : 마이그레이션 실행')
  console.log('   - window.rollbackToJSON(userId)      : 롤백')
  console.log('   - window.validateMigration(userId)   : 검증')
}

// ES 모듈로 export
export { migrateJSONtoBlocks, rollbackToJSON, validateMigration }
