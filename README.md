# WHHW.co.kr

Coming soon 페이지 + 관리자 승인 기반 회원 시스템.

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19**
- **Supabase** — Auth + PostgreSQL (profiles 테이블)
- **Tailwind CSS v4**
- **TypeScript**

## 주요 기능

- 회원가입 / 로그인 (Supabase Auth)
- 신규 가입 시 `pending` 상태로 대기
- 관리자 승인 후 대시보드 접근 가능
- 관리자 페이지(`/admin`)에서 승인 / 거부 / 상태 변경
- `proxy.ts`로 경로별 접근 제어

## 환경 변수

`.env.local` 파일에 아래 값을 설정하세요.

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## 실행

```bash
npm install
npm run dev
```
