# 헬스헬스 (HealthHealth)

> 가족(2~4인)을 위한 **달력 기반 식단 + AI 건강 분석** 웹앱.
> Galaxy S24 같은 모바일에 최적화되어 있고, 노트북 브라우저에서도 잘 작동합니다.
> **GitHub Pages로 100% 무료 호스팅**됩니다.

## ✨ 주요 기능

- 📅 **달력 메인 화면** — 월별 달력에서 매일의 식단을 한눈에. 평균 별점도 표시.
- 🍱 **식사 6슬롯 기록** — 아침 / 오전 간식 / 점심 / 오후 간식 / 저녁 / 야식. 모바일 카메라로 바로 촬영해 업로드.
- 🤖 **AI 식단 분석 (Gemini)** — 사진 → 메뉴 텍스트 변환, 5점 만점 별점, 한 줄 평, 칼로리/탄단지 추정.
- ❤️ **건강 프로필** — 건강검진표 / 인바디 사진을 올리면 OCR + 100점 만점 건강 점수 자동 평가, 강점·주의·권장 코멘트 제공.
- 👨‍👩‍👧 **가족 다중 사용자** — 2~4명 가족을 색깔별로 구분 관리.
- 📲 **PWA** — 모바일 홈 화면에 설치 가능, 오프라인 캐시 지원.
- 🔒 **100% 클라이언트 사이드** — 모든 데이터(사진 포함)는 브라우저 IndexedDB 에 저장. 서버 없음. API 키도 본인 기기에만.

## 🚀 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속.

## 🔑 Gemini API 키 발급 (1분, 무료)

1. <https://aistudio.google.com/apikey> 접속 (Google 계정 로그인)
2. **Create API key** 클릭 → 새 프로젝트 선택 → 키 복사
3. 앱 첫 실행 시 온보딩 화면 또는 **설정 → Gemini API 키** 에 붙여넣고 저장

> Gemini 2.0 Flash 무료 한도: **분당 15회, 일일 1,500회** — 가족 4명이 매끼 찍어도 충분합니다.

## ☁️ GitHub Pages 배포 (무료)

이미 `.github/workflows/deploy.yml` 이 있어서, **저장소만 만들고 푸시 + Pages 소스 한 번 지정**하면 됩니다.

### 자동 배포 설정 (1회)

1. **GitHub에서 새 저장소**를 만듭니다. (이름이 곧 URL 경로가 됩니다. 예: 저장소 `healthhealth` → `https://<아이디>.github.io/healthhealth/`)
   - 이미 로컬에 Git이 있다면 README/라이선스만 있는 저장소를 만들 때 **“Add a README” 체크는 끄는 것**이 푸시할 때 덜 헷갈립니다.

2. **원격 저장소 연결 후 `main` 브랜치로 푸시**합니다. (PowerShell에서 `npm` 대신 `npm.cmd`를 쓰는 환경이면 그대로 두고, 아래는 Git만 해당합니다.)

   ```bash
   git branch -M main
   git remote add origin https://github.com/<YOUR_ID>/<REPO_NAME>.git
   git add .
   git commit -m "chore: GitHub Pages 배포용 푸시"
   git push -u origin main
   ```

   아직 `git init`을 안 했다면 프로젝트 폴더에서 한 번만 `git init` 후 커밋·푸시하면 됩니다.

3. GitHub 웹에서 해당 저장소 → **Settings → Pages → Build and deployment → Source** 를 **Deploy from a branch** 가 아니라 **GitHub Actions** 로 바꿉니다.

4. **Actions** 탭을 열어 **“Deploy to GitHub Pages”** 워크플로가 초록색으로 끝났는지 확인합니다.  
   처음 한 번 **“Approve and deploy”** / 환경(`github-pages`) 승인을 요구하면 승인합니다.

5. 같은 **Settings → Pages** 에서 **Visit site** 또는 표시된 URL로 접속합니다.  
   배포 반영까지 **1~3분** 걸릴 수 있습니다.

이후에는 **`main`에 푸시할 때마다** 같은 워크플로가 빌드 후 자동 배포합니다.  
배포 URL 형태: `https://<YOUR_ID>.github.io/<REPO_NAME>/` (저장소가 `<USER>.github.io` 특수 저장소면 루트 `/` 로 빌드됩니다.)

### base path 자동 처리

- 워크플로우가 저장소 이름을 감지해 Vite 의 `base` 를 자동 설정합니다.
  - 일반 저장소 → `/<REPO_NAME>/`
  - `<USER>.github.io` 저장소 → `/`
- SPA 라우팅은 `HashRouter` + `404.html` fallback 으로 새로고침해도 안전합니다.

### 커스텀 도메인 사용시

`public/CNAME` 파일에 도메인을 한 줄로 적고, 워크플로우 환경변수에서 `VITE_BASE_PATH=/` 로 설정하세요.

## 🧱 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 프레임워크 | React 18 + TypeScript + Vite |
| 라우팅 | react-router-dom (HashRouter) |
| 스타일 | Tailwind CSS, Pretendard 폰트 |
| 데이터 저장 | IndexedDB (Dexie.js) — 사진은 Blob 으로 저장 |
| AI | Google Gemini API (`@google/generative-ai`), 클라이언트 직접 호출 |
| PWA | vite-plugin-pwa |
| 호스팅 | GitHub Pages + GitHub Actions |

## 📂 폴더 구조

```
src/
├── components/     # Calendar, BottomNav, PhotoUpload, UserSelector, HealthScoreRing
├── pages/          # Home, Day(식사), Health, Settings, Onboarding
├── lib/
│   ├── db.ts       # Dexie 스키마 + getSettings/patchSettings
│   ├── ai.ts       # Gemini 식단/건강 분석
│   ├── image.ts    # 이미지 압축, 썸네일, blob URL 캐시
│   └── utils.ts    # 날짜, 점수, 색상 유틸
├── types.ts        # User, Meal, HealthRecord, MealSlot 등
├── App.tsx         # 라우터 + 온보딩 가드
├── main.tsx
└── index.css       # Tailwind + 공용 컴포넌트 클래스
```

## 🛡️ 데이터 / 프라이버시

- 모든 사진과 텍스트는 **여러분의 브라우저 IndexedDB** 에만 저장됩니다.
- API 키는 본인 기기에만 저장되며, AI 분석을 요청할 때만 Google 서버로 전송됩니다.
- 데이터를 다른 기기로 옮기려면 같은 Google 계정에 다시 로그인하는 게 아니라, 새 기기에서 다시 사진을 찍어야 합니다 (백업/동기화는 v0.1 기준 미지원, 향후 옵션 검토).
- "설정 → 모든 데이터 삭제" 로 깨끗하게 초기화 가능.

## 🗺️ 향후 로드맵 (선택)

- [ ] 데이터 JSON 내보내기/가져오기 (간이 백업)
- [ ] 주간/월간 영양 통계 차트
- [ ] 가족 공유용 클라우드 옵션 (Firebase, Supabase 무료 티어)
- [ ] 음성 메모, 식사 시간 자동 기록
- [ ] 건강 점수 추세 그래프

## 📄 라이선스

MIT
