# 모의주식 | MOCK MARKET

학교 동아리 21개를 가상 기업으로 설정하는 **교육용 모의주식 프로젝트**입니다. 실제 돈이나 금융상품을 거래하지 않습니다.

> 상태: v0.1 **기본 틀**. 현재 상장, 주문 체결, 기업 투자, 배당, 랜덤 이벤트는 구현 전입니다. UI에 표시되는 가격은 테스트용입니다.

## 기술 구성

- **Frontend**: HTML/CSS/JavaScript (별도 프레임워크 없이 실행)
- **Backend**: Cloudflare Workers (`src/index.js`)
- **Database**: Cloudflare D1 (SQLite)
- **Hosting**: Worker의 정적 에셋 서빙 (프론트엔드와 API 동일 도메인)

관련 공식 문서: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/).

## 현재 구현된 항목

- 대시보드, 기업 목록(검색), 뉴스, 내 자산, 기업 경영 메뉴
- D1에 21개 임시 기업 및 1개 샘플 공지 저장
- 아이디/비밀번호 기반 로그인, 서명 대신 서버 저장 세션 토큰(해시 저장), HttpOnly 쿠키
- 인증 후 현금 잔액과 보유 주식 조회
- 관리자 수동 계정 발급 도구 (`scripts/create-user.mjs`)
- 입력 검증, 5회 실패 시 임시 로그인 잠금, 동일 출처 POST 검사

**아직 미구현**: 신규 회원가입, 비밀번호 재설정, 관리자 화면, 거래 체결, 시세 변경, 실적 정산, 배당, 리더보드, 공장 투자, 이벤트 결과 반영. `POST /api/orders`는 의도적으로 `501`을 반환합니다.

## 로컬 실행

컴퓨터에 Node.js가 설치되어 있어야 합니다.

```bash
npm install
npm run db:local
npm run dev
```

명령 후 터미널에 표시되는 로컬 주소(보통 `http://localhost:8787`)에 접속합니다.

`wrangler.jsonc`의 D1 `database_id`는 **로컬 개발을 위한 임시 자리표시자**입니다. 실제 서버 배포 시 본인의 D1 UUID로 교체해야 합니다.

### 로컬 시험용 계정 생성

새 터미널에서 프로젝트 폴더를 열고 다음 명령을 실행합니다.

```bash
node scripts/create-user.mjs teststudent "테스트 학생" student
```

실행 중 입력할 비밀번호는 화면에 출력되지 않으며, 비밀번호의 PBKDF2-SHA256 해시가 담긴 `.generated-user-teststudent.sql` 파일이 생성됩니다.

```bash
npx wrangler d1 execute stock-db --local --file=.generated-user-teststudent.sql
```

이제 `teststudent` 아이디와 방금 정한 비밀번호로 로그인할 수 있습니다. 생성된 SQL 파일에는 계정 정보와 비밀번호 **해시**가 있으므로 Git에 올리지 마세요. `.gitignore`로 제외되어 있습니다.

### 배포 방법 (나중에)

1. Cloudflare 계정에서 D1 생성: `npx wrangler d1 create stock-db`
2. 출력된 `database_id`를 `wrangler.jsonc`의 임시 UUID와 교체
3. DB 스키마 배포: `npm run db:remote`
4. 코드 배포: `npm run deploy`
5. 실제 계정 발급은 별도의 관리자 도구와 학교 정책을 갖춘 뒤 진행

**주의:** 단순 배포만으로 학생 계정이 자동 생성되지 않습니다. 학교 실사용 전에는 개인정보 최소 수집, 사용 권한, 비밀번호 재설정, 운영자 권한 관리, 서버측 접근 제한과 백업을 추가해야 합니다. 실제 학생 이름 대신 행사 전용 별칭과 무작위 ID 사용을 권장합니다.

## 주요 파일

```text
public/
  index.html           화면 레이아웃
  style.css            반응형 디자인
  app.js               프론트엔드 화면 로직
src/
  index.js             Worker API, 로그인/세션/조회
migrations/
  0001_schema.sql      테이블: 계정, 세션, 동아리, 보유 주식, 주문, 체결, 뉴스, 경영 결정
  0002_demo_data.sql   임시 기업 21개, 샘플 공지
scripts/
  create-user.mjs      수동 테스트 계정 발급
wrangler.jsonc         Cloudflare 설정
```

## API 요약

| 메서드 | 경로 | 상태 |
|---|---|---|
| GET | `/api/health` | 동작 |
| GET | `/api/companies` | 동작 |
| GET | `/api/news` | 동작 |
| POST | `/api/login` | 동작 (사전 계정 필요) |
| POST | `/api/logout` | 동작 |
| GET | `/api/me` | 동작 |
| GET | `/api/portfolio` | 로그인 필요 |
| GET | `/api/my-company` | 로그인 필요 (지정된 기업 조회) |
| POST | `/api/orders` | `501` 의도적 비활성화 |

## 확정된 기획과 미확정 사항

- 일정: 2026년 **10월 21일 ~ 27일**
- 동아리 수: **21개**
- 학생 대상: 1·2학년 330명 중 약 200명 활성 참가 예상
- 1인 초기 자금: 가상 **100만원**
- 거래 규칙, 기업 발행량, 공모 구조, 배당 방식은 아직 미확정
- 주말 운영 여부, 시장 개장시간, 회사 투자 선택지도 추후 결정

## 다음 개발 단계(권장)

1. 실제 21개 동아리 이름/회사 소개 등록
2. 학생 계정 발급/로그인 운영정책 및 관리자 기능
3. 주식 거래 규칙 확정 → 주문·체결·잔액 원자적 갱신
4. 회사 경영 투자, 매출/이익 정산, 뉴스 이벤트
5. 배당·순위·로그·테스트 및 실제 운영 점검

## GitHub 새 저장소에 올리기

새 **빈** GitHub 저장소(예: `school-mock-stock`)를 만든 뒤 이 폴더에서 실행하세요.

```bash
git init
git add .
git commit -m "Initial mock stock app scaffold"
git branch -M main
git remote add origin https://github.com/OWNER/REPO.git
git push -u origin main
```

`OWNER/REPO`는 실제 만든 저장소로 교체해야 합니다. 기존 국어 문제 사이트 `gichul` 저장소와는 별개입니다.
