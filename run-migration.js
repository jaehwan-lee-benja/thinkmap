import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://sqisntxippjzcekyhqyo.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxaXNudHhpcHBqemNla3locXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyMDYyMzQsImV4cCI6MjA4MTc4MjIzNH0.wMdFeuYbxBJnJUeON0ccOiULDhEA88R25ewnIeb9dPg'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function runMigration() {
  console.log('🚀 Starting migration...')
  console.log('📍 Supabase URL:', supabaseUrl)

  try {
    // Step 1: 새 컬럼 추가
    console.log('\n1️⃣ Adding content_tiptap column...')
    const { data: alterData, error: alterError } = await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE pages ADD COLUMN IF NOT EXISTS content_tiptap JSONB DEFAULT NULL;`
    })

    // RPC가 없으면 직접 SQL 실행 (Supabase는 DDL을 직접 지원하지 않음)
    // 대신 확인만 하겠습니다
    console.log('⚠️  Note: DDL commands must be run in Supabase Dashboard SQL Editor')
    console.log('   Please run the following SQL manually:')
    console.log('')
    console.log('   ALTER TABLE pages')
    console.log('     ADD COLUMN IF NOT EXISTS content_tiptap JSONB DEFAULT NULL;')
    console.log('')
    console.log('   CREATE INDEX IF NOT EXISTS idx_pages_content_tiptap_search')
    console.log('     ON pages USING gin(content_tiptap);')
    console.log('')

    // Step 2: pages 테이블 구조 확인
    console.log('2️⃣ Checking pages table structure...')
    const { data: columns, error: columnsError } = await supabase
      .from('pages')
      .select('*')
      .limit(1)

    if (columnsError) {
      console.error('❌ Error checking table:', columnsError.message)
    } else {
      console.log('✅ Pages table accessible')
      if (columns && columns.length > 0) {
        console.log('📋 Sample page columns:', Object.keys(columns[0]))
      }
    }

    // Step 3: 테스트 데이터 확인
    console.log('\n3️⃣ Checking existing pages...')
    const { data: pages, error: pagesError } = await supabase
      .from('pages')
      .select('id, name, content_tiptap')
      .limit(5)

    if (pagesError) {
      if (pagesError.message.includes('content_tiptap')) {
        console.log('⚠️  content_tiptap column does not exist yet')
        console.log('   Please run the SQL in Supabase Dashboard first!')
      } else {
        console.error('❌ Error:', pagesError.message)
      }
    } else {
      console.log(`✅ Found ${pages.length} pages`)
      pages.forEach(page => {
        console.log(`   - ${page.name}: content_tiptap = ${page.content_tiptap ? 'EXISTS' : 'NULL'}`)
      })
    }

    console.log('\n✨ Migration check complete!')

  } catch (err) {
    console.error('❌ Unexpected error:', err.message)
  }
}

runMigration()
