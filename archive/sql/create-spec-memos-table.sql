-- spec_memos 테이블 생성
-- 기획서 메모 저장을 위한 테이블

CREATE TABLE IF NOT EXISTS spec_memos (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 업데이트 시간 자동 갱신을 위한 트리거
CREATE OR REPLACE FUNCTION update_spec_memos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER spec_memos_updated_at_trigger
  BEFORE UPDATE ON spec_memos
  FOR EACH ROW
  EXECUTE FUNCTION update_spec_memos_updated_at();

-- 초기 기본 데이터 삽입 (기획서 원본 내용)
INSERT INTO spec_memos (content)
VALUES ('# Todo Note 간단 기획서

## 📋 프로젝트 개요
**Todo Note** - 날짜별 투두 관리 및 루틴 트래킹 웹 애플리케이션

---

## 🎯 핵심 기능

### **투두 관리** - 날짜별 할 일 추가, 수정, 삭제 및 완료 체크

### **자동 이월** - 미완료 투두를 다음날로 자동 복사하여 놓치지 않게 관리

### **루틴 시스템** - 특정 요일마다 반복되는 작업을 자동으로 생성

### **날짜 네비게이션** - 달력으로 특정 날짜 이동 및 이전/다음 날 버튼

---

## 🛠️ 기술 스택

- **Frontend**: React 19.1.1 + Vite
- **Database**: Supabase (PostgreSQL)
- **Deployment**: GitHub Pages

---

## 🌐 접속 방법

- **배포 URL**: https://jaehwan-lee-benja.github.io/todo-note/
- **개발 서버**: `npm run dev` → http://localhost:5173/todo-note/')
ON CONFLICT DO NOTHING;