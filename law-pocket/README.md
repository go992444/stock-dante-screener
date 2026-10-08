# Law Pocket (모바일 법령 참고)

법령·판례 **참고 검색** PWA. 법률 자문이 아닙니다.

- **배포:** https://law-pocket-ashen.vercel.app  
- **버전:** `version.js` · `universal+ai` (검색 계획 + 관련도 필터 + AI 정리)

## 다른 PC에서 이어서 개발

```powershell
git clone https://github.com/go992444/stock-dante-screener.git
cd stock-dante-screener\law-pocket
vercel login
vercel link          # 프로젝트 law-pocket (underts-projects)
vercel env pull .env.local --yes
npx vercel dev
```

배포:

```powershell
npx vercel deploy --prod --yes
```

### 환경 변수 (Vercel · 로컬 `.env.local`)

| 변수 | 설명 |
|------|------|
| `LAW_OC` | open.law.go.kr 발급 ID (서버만) |
| `GEMINI_API_KEY` | AI 검색 계획·정리 (서버만) |
| `GEMINI_MODEL` | (선택) 기본은 2.5-flash 등 자동 폴백 |

비밀키는 **커밋하지 않음** (`.gitignore`).

## 구조

| 경로 | 역할 |
|------|------|
| `api/ask.js` | Vercel API |
| `lib/searchPlan.mjs` | AI+규칙 검색 계획 |
| `lib/ask.mjs` | 검색·필터·조문·AI 정리 |
| `lib/relevance.mjs` | 범용 관련도 점수 |
| `lib/gemini.mjs` | AI 정리 |
| `app.js` / `index.html` | PWA UI |

## 로컬만 (Vercel 없이)

`LAW_OC`가 `.env.local`에 있어야 `/api/ask`가 동작합니다. `npx vercel dev` 사용을 권장합니다.
