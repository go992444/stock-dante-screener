# K-Pocket



**1번 방식**: 모바일 브라우저/PWA → (같은 도메인) `/api/*` → [k-skill-proxy](https://k-skill-proxy.nomadamas.org).

**UI**: 탭·폼 대신 **채팅** — 구어체 질문 → 규칙 기반 의도 분류 → 프록시 조회 → 요약 답변 (LLM 없음).



## 포함 기능 (14탭)



| 탭 | k-skill 스킬 | 비고 |

|----|----------------|------|

| 날씨 | `korea-weather` | |

| 지하철 | `seoul-subway-arrival` | |

| 혼잡도 | `seoul-density` | |

| 실거래 | `real-estate-search` | region_code·매매·전월세 등 `kind` |

| 법령 | `korean-law-search` | search / detail |

| 건축물 | `building-register-search` | PNU 또는 주소 |

| 공시가 | `housing-official-price` | VWorld BYOK 키 필요 |

| 주식 | `korean-stock-search` | search / base / trade |

| 쿠팡 | `coupang-product-search` | |

| 네이버 | `naver-shopping-search` | |

| 주유 | `cheap-gas-nearby` | Opinet 좌표 |

| 쓰레기 | `household-waste-info` | |

| 약 | `mfds-drug-safety` | |

| 공연 | `kopis-performance-search` | 공연·공연장 목록/상세 |
| LH | `lh-lease-notice-spl-info` | 임대단지 목록 + 공고번호 시 공급정보 (data.go.kr, `DATA_GO_KR_API_KEY`) |



## 배포



Root Directory = `k-pocket` → Vercel 배포 후 폰에서 홈 화면 추가.



```bash

cd k-pocket

npx vercel dev

npx vercel --prod

```



## 공시가(VWorld) 키



[vworld.kr](https://www.vworld.kr) Open API 키를 **공시가** 탭에 입력합니다. 브라우저 `localStorage`에만 저장되며, 요청 시 `x-k-skill-vworld-api-key` 헤더로 전달됩니다.


