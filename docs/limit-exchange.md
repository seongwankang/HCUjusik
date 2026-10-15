# 지정가 테스트 시장

현재 거래 화면은 `server/`의 신뢰 서버로 지정가 주문을 보냅니다. GitHub Pages는 화면과 Firebase 로그인·기존 조회를 계속 제공합니다. 이전 기준가격 즉시 매매는 화면/API에서 종료했습니다. 기존 `portfolios`, `tradeTests` 데이터는 이전하거나 삭제하지 않습니다. 지정가 테스트는 별도의 `exchangeState/limit-v1`을 사용합니다.

## 거래 규칙

- 종목: test-a, test-b. 테스트 계좌 최초 주문 시 가상 현금 100만 원을 한 번 생성합니다. 현금/주식 리셋 기능은 제공하지 않습니다.
- 최초 발행: 기업 문서의 `issuedShares` 전량을 `referencePrice`의 발행자 매도 주문(접수 순번 0)으로 제공합니다. 적격 매수 주문이 서버에서 먼저 확정되는 순서대로 배분합니다. 최초 설정을 저장한 후 발행량·초기가격은 재생성하지 않습니다. 클라이언트 시간·화면 클릭 시간으로 선착순을 판단하지 않습니다.
- 매수 지정가 ≥ 매도 지정가이면 체결합니다. 매수는 높은 가격, 매도는 낮은 가격 우선, 같은 가격은 서버 접수 순번 우선입니다. 체결가격은 먼저 대기한 반대 주문의 가격입니다.
- 부분 체결 후 잔량은 계속 대기합니다. 매수는 지정가 × 잔량 현금, 매도는 잔량 주식을 예약합니다. 유리한 가격의 체결 차액은 즉시 주문 가능 잔액으로 반환됩니다.
- 미체결 잔량만 취소할 수 있습니다. 완료/취소된 주문 재취소는 자산에 영향을 주지 않습니다. 자기 주문끼리는 체결되지 않습니다.
- 정수 원/정수 주, 1원 단위, 주문가격 1~100만 원, 수량 1~100만 주, 주문금액 최대 10억 원. 수수료·시장가·주문 정정·자동 만료는 없습니다. 정정은 취소 후 새 주문으로 접수합니다.
- 거래정지 종목 신규 주문 거부, 기존 주문 취소 허용. 비활성 계정은 요청을 거부하고, 그 계정의 남은 주문은 다음 정상 변경 트랜잭션에서 취소·예약 해제합니다.
- 호가/내 체결은 새로고침 버튼으로 갱신합니다. 자동 폴링으로 무료 Firestore 한도를 계속 쓰지 않습니다.

## 서버와 원자성

`server/exchange.js`는 순수 매칭 로직, `server/store.js`는 Firestore Admin SDK 트랜잭션, `server/api.js`는 인증·CORS·입력 검증, `server/start.mjs`는 Node HTTP 진입점입니다.

소규모 테스트의 전체 계좌·주문·체결을 한 서버 전용 문서에서 직렬화합니다. 계좌 생성, 매도 물량, 주문장, 매수/매도 양쪽 자산, 예약금, 체결 기록이 하나의 트랜잭션으로 확정됩니다. 여러 서버 인스턴스에서도 Firestore 충돌 재시도를 사용하므로 메모리 락을 신뢰하지 않습니다. 주문 ID는 인증 UID에 묶고 같은 ID/내용 재전송은 기존 주문을 반환합니다. 취소도 같은 방식으로 중복에 안전합니다. 재시작 후에도 상태는 Firestore에 남습니다.

용량은 의도적으로 제한합니다: 계좌 최대 250, 전체 누적 주문 500, 동시 미체결 100, 누적 체결 1,000, 상태 JSON 700KB. 한도 초과 신규 주문은 원자적으로 거부하고 기존 주문 취소는 유지합니다. 정식 200명 행사에 장기간 쓰기 전 종목별 주문 저장/체결 감사 보관/분산 처리·더 엄격한 공유 요청 제한으로 확장해야 합니다. 이 버전은 두 기업의 짧은 기능 테스트용입니다.

## 인증과 비밀키

클라이언트는 로그인 사용자의 Firebase ID 토큰을 HTTPS 서버의 Authorization Bearer 헤더로 전송합니다. 서버는 Google 공개 키로 RS256 서명·issuer·audience·만료·UID를 검증하고, Firestore의 본인 active/role 및 학교 이메일 인증을 다시 검사합니다. 요청 body의 UID나 관리자 역할은 신뢰하지 않습니다. 체결 상대의 active 상태도 트랜잭션 안에서 읽습니다. 호가는 가격별 합계만, 주문·체결은 본인 것만 반환합니다. 원본 주문장의 UID/다른 학생 잔액은 공개하지 않습니다.

Firestore Admin SDK는 Rules를 우회하므로 서버가 모든 거래 검증을 담당합니다. `exchangeState/**`에는 클라이언트 읽기/쓰기 허용 규칙을 추가하지 않습니다. 기존 default-deny 규칙이 이 경로를 막고 있습니다. 새 서버 연결에는 Rules 완화/추가 게시가 필요하지 않습니다. 이전 즉시 매매 규칙을 새 서버 활성화 수단으로 게시하지 마세요.

서버 전용 서비스 계정을 별도로 만들고 해당 프로젝트의 `roles/datastore.user`만 부여합니다. Owner/Firebase Admin 역할이나 사용자의 로그인 비밀번호를 쓰지 않습니다. 서비스 계정 JSON은 Render 환경 비밀 `FIREBASE_SERVICE_ACCOUNT_JSON`에만 넣습니다. GitHub, Pages 설정, 브라우저, 채팅, 로그, `dist`에 넣지 않습니다. 최소 권한도 프로젝트 데이터 접근 권한이므로 서비스 계정 키 생성/Render 전달은 사용자 확인 후 처리합니다. 키가 노출되면 삭제·재발급합니다.

서버는 credential의 project_id 일치를 확인하고 production에서 Emulator 환경변수를 거부합니다. 로그에 토큰/본문/자격 증명을 출력하지 않습니다. CORS는 `https://seongwankang.github.io` 하나만 허용하고 쿠키를 사용하지 않습니다. UID당 분당 40회 요청 제한은 인스턴스 메모리 기준이며 다중 인스턴스 공용 한도가 아닙니다. CORS 자체가 인증 방어를 대신하지 않습니다.

## 무료 호스팅 연결 (사용자 계정 필요)

Render Free Node Web Service + 기존 Firestore Spark를 사용합니다. Cloudflare/Cloud Functions/Blaze는 필요 없습니다. [Render 무료 정책](https://render.com/docs/free)은 유휴 15분 후 정지, 공유 월 750시간, 빌드/네트워크 한도가 있습니다. 무료 서버 첫 요청은 시작이 느릴 수 있습니다. 유료 인스턴스·카드·자동 과금은 연결하지 않고, 무료 제공을 사용할 수 없는 계정이면 중단합니다. Spark 무료 한도 초과 시도 제한되므로 무료가 무제한을 의미하지 않습니다.

1. Render에 직접 로그인/회원가입합니다. GitHub 연결 시 이 저장소만 선택합니다. 약관 동의·추가 권한 승인·자격 증명 입력은 사용자가 수행합니다.
2. 이 저장소의 `render.yaml` Blueprint로 `hcujusik-exchange` **Free** Web Service를 생성합니다. Node 24, build `npm install --global pnpm@11.25.0 && pnpm install --frozen-lockfile`, start `node server/start.mjs`, health `/health`. DB/Redis/유료 디스크는 만들지 않습니다.
3. 환경변수 `FIREBASE_PROJECT_ID=hcujusik`, `ALLOWED_ORIGIN=https://seongwankang.github.io`를 설정하고 승인한 전용 서비스 계정 JSON을 비밀 환경변수 `FIREBASE_SERVICE_ACCOUNT_JSON`에 저장합니다. 프로젝트 문서를 삭제하거나 기존 자산을 초기화하지 않습니다.
4. Render 서비스가 제공한 실제 HTTPS 주소의 `/health`가 `{ok:true,mode:"limit-v1"}`인지 확인합니다. 예상 주소를 임의로 만들어 연결하지 않습니다.
5. `public/firebase.config.json`의 `tradingApiUrl`에 그 서버의 **origin만** 입력합니다. 예: `https://실제서비스.onrender.com`. 여기에 비밀키를 넣지 않습니다. GitHub Pages를 재배포합니다. 미연결이면 가격/수량 화면은 보이되 주문 접수는 비활성화됩니다.
6. 인증된 두 계정으로 아래 순서를 확인합니다. 서비스 계정/대상 프로젝트 연결이 끝나기 전에는 원격 거래가 열린 것으로 간주하지 않습니다.

## 검증 시나리오

1. A가 초기 판매 가격 이상으로 5주 매수 → 초기 물량에서 5주 차감, 가격 차액 예약 없음.
2. A가 초기 판매 가격보다 낮은 가격에 2주 매도 → 호가창 대기, 2주 예약.
3. B가 그 매도 가격에 1주 매수 → A/B 자산 이동, A의 잔량 1주 대기.
4. A가 잔량 취소 → 주식 예약 반환. 미체결 매수 취소도 현금 예약 반환.
5. 같은 주문 재전송, 동시에 현금 초과 주문, 초기 물량보다 많은 동시 주문을 확인합니다.

로컬 자동 검증: `pnpm test`, 루프백 Firestore emulator에서 `pnpm test:rules`, `pnpm build`. 테스트는 demo 프로젝트만 사용합니다. 엔진 테스트는 현금 총량(발행자 현금 포함), 총 발행 주식, 각 주문 예약 합계 보존을 확인합니다. Emulator에서 동시 초기 배분·같은 계정 중복 지출·취소·재시작 후 중복 주문·비활성 참가자·클라이언트 settlement 직접 접근 거부를 검증합니다. 로컬 브라우저 모의 서버에서 지정가 입력 → 상대 주문 가격 체결 → 미체결 현금 예약 → 취소 반환을 확인했습니다. 원격 Render/Firebase 연결은 별도 승인·계정 연결 후 검증합니다.

공식 자료: [Firebase Admin 서버 설정](https://firebase.google.com/docs/admin/setup), [서버 Firestore 인증](https://firebase.google.com/docs/firestore/quickstart-server), [Render Web Service](https://render.com/docs/web-services).
