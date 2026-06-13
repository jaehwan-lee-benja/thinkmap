// 공용 CORS 헤더 — 브라우저(클라이언트)에서 supabase.functions.invoke 로 호출하므로 필요.
// Authorization(사용자 JWT) 와 apikey 헤더를 허용한다.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
