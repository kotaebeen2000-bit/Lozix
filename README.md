# Lozix Study App

음악 탭에 12곡의 YouTube 재생 목록이 포함된 Lozix 공부 앱입니다. 음악 탭을 벗어나도 재생이 유지되며, 볼륨 슬라이더와 음소거 버튼을 제공합니다. 한 곡이 끝나면 다음 곡이 자동 재생되고, 마지막 곡 뒤에는 첫 곡부터 다시 재생됩니다.

## 처음 한 번: 온라인 프로필 저장소 설정

1. Supabase 프로젝트의 **SQL Editor**에서 **New query**를 누릅니다.
2. 이 ZIP의 `supabase-setup.sql` 파일 내용을 모두 붙여넣고 **Run**을 누릅니다.
3. 앱을 실행하면 이름과 숫자 4자리 PIN으로 최대 10개의 프로필을 만들 수 있습니다.

프로필별 학습 기록과 목표는 Supabase에 저장되어 다른 기기에서도 이어서 사용할 수 있습니다.

## 실행 방법

1. 압축을 푼 뒤 해당 폴더를 엽니다.
2. 폴더의 빈 곳에서 명령 창을 열고 `npm install`을 한 번 실행합니다.
3. 이어서 `npm run dev`를 실행합니다.
4. 표시되는 `http://localhost:...` 주소를 브라우저에서 엽니다.

음악 탭에서 원하는 곡을 선택하면 앱 안의 YouTube 플레이어에서 재생됩니다. 인터넷 연결과 YouTube 재생 가능 여부가 필요합니다.


Music playback fix: YouTube player initialization now waits until the profile screen has been passed, so the player DOM exists before the API is created.
