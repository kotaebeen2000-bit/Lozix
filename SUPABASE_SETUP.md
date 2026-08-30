# Lozix 프로필 오류 수정

현재 앱에서 `Could not find the function public.create_lozix_profile(profile_name, profile_pin) in the schema cache`가 뜨는 경우는 Supabase의 RPC 함수가 아직 데이터베이스/PostgREST 스키마에 등록되지 않았기 때문입니다.

## 한 번만 할 작업

1. Supabase Dashboard를 엽니다.
2. **SQL Editor**로 이동합니다.
3. 이 폴더의 **supabase-fix.sql** 내용을 전부 붙여넣습니다.
4. **Run**을 누릅니다.
5. Lozix 페이지를 새로고침합니다.
6. 프로필 만들기를 다시 누릅니다.

마지막의 `notify pgrst, 'reload schema';`가 RPC 스키마 캐시를 새로고침하므로 새 함수가 인식됩니다.

## CMD 실행

프로젝트 폴더에서:

```bat
npm install
npm run dev
```

그 다음 Vite가 보여주는 `http://localhost:포트번호/` 주소를 브라우저에서 엽니다.

`node_modules`는 ZIP에 포함하지 않아도 됩니다.


## 중요
Supabase에서 pgcrypto가 extensions 스키마에 설치되는 환경을 지원하도록 함수 내부에서 새 프로필 PIN은 `gen_salt()`에 의존하지 않고 PostgreSQL 기본 `md5()` 기반으로 저장하며, 기존 bcrypt PIN은 `pgcrypto`로 계속 로그인할 수 있습니다.
