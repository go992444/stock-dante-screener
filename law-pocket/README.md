# Law Pocket (모바일 법령 참고)

법령·판례 **참고 검색** PWA. 법률 자문이 아닙니다.

## 로컬

```powershell
cd law-pocket
npx vercel dev
```

브라우저에서 표시된 주소로 접속 (같은 Wi‑Fi의 폰에서도 PC IP로 접속 가능).

## 배포 (Vercel)

1. Vercel 프로젝트 **Root Directory** = `law-pocket`
2. 환경 변수 **`LAW_OC`** = open.law.go.kr 발급 ID (서버에만 저장, 앱에 노출 안 됨)
3. Deploy

## 사용

질문 한 줄 입력 → 관련 **법 조문** + **판례 판시·요지** 표시.
