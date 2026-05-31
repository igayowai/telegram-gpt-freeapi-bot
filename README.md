# Telegram GPT API Bot / 텔레그램 GPT API 봇

Local polling Telegram bot powered by OpenAI Responses API.  
OpenAI Responses API로 동작하는 로컬 폴링 방식 Telegram 봇입니다.

## What this project is / 이 프로젝트는 무엇?

텔레그램에서 텍스트 기반 AI 어시스턴트를 쓰기 위한 로컬 폴링 봇임.

- `/hi`, `/lo`, `/ez` 3가지 방식으로 동작함.
- `/hi`, `/lo`는 질문에 대해 웹 검색을 자동 수행함.
- `/free`, `/usage`, `/limits`, `/costs`로 사용량/비용을 확인할 수 있음.
- `/helpai`로 사용법을 확인하고, 예외 상황은 안전하게 처리함.

### 모델 정책

- `/hi`: `OPENAI_ADVANCED_MODEL` 사용 (기본값 `gpt-5.5`)
- `/lo`, `/ez`: `OPENAI_MODEL` 사용 (기본값 `gpt-5.4-mini`)

### 왜 이렇게 나뉨

- `OPENAI_ADVANCED_MODEL`: `gpt-5.5` 계열 고성능 라인.  
  추론 정밀도와 검색 기반 응답 품질을 우선함.
- `OPENAI_MODEL`: `gpt-5.4-mini` 계열 경량 라인.  
  응답 속도, 사용량 효율, 운영 여유를 우선함.

### 한도와 모델군 매핑

- 공식 무료 API 한도는 [OpenAI Usage Tiers](https://platform.openai.com/docs/guides/rate-limits/usage-tiers) 기준으로 티어별 제한이 달라짐.
- 프로젝트에서 실제로 사용되는 모델군은 [docs/openai-data-sharing-free-token-limits.md](docs/openai-data-sharing-free-token-limits.md)에서 확인 가능함.

### 모델 업데이트 운영 가이드

- 동일 한도 범위에서 같은 계열보다 성능·효율이 개선된 모델이 나오면 비용 구조가 같을 때 전환 가능함.
- 신규 모델/한도 정책은 공식 문서를 주기적으로 확인하여 유저가 직접 업데이트하는 것을 추천함.

## Requirements / 준비물

- Node.js 20+  
- Telegram bot token (from BotFather)  
- OpenAI API key  
- OpenAI admin key (needed for `/free`, `/usage`, `/limits`, `/costs`)
- Node.js 20 이상, BotFather 봇 토큰, OpenAI API 키, 해당 요약 명령 사용 시 OpenAI 관리자 키 필요

## OpenAI Platform Setup / OpenAI 플랫폼 초보자 설정

1. OpenAI 플랫폼 로그인: https://platform.openai.com/overview
2. 결제/국가/전화 인증을 완료한다 (필요 시 카드 등록, 결제 한도 정책 확인).
3. Organization(조직)을 확인한다.
   - 처음엔 기본 조직이 하나 만들어져 있음.
   - 필요하면 `Organization settings`에서 이름만 변경.
4. Project(프로젝트) 만들기:
   - 왼쪽 메뉴 `Projects` → `Create` 또는 `New project`  
   - 이름만 입력하고 생성.
5. API 키 발급:
   - Project 또는 Organization의 `API keys` 화면으로 이동
   - `Create new secret key` 클릭
   - 키 이름 입력 후 생성, 발급 직후 1회만 표시되므로 즉시 `.env.local` 입력 준비
6. `.env.local`에 입력:
   - `OPENAI_API_KEY`에 사용할 키 저장
   - `/free`, `/usage`, `/limits`, `/costs`는 `OPENAI_ADMIN_KEY` 필요(같은 키를 사용해도 됨)
7. 데이터 공유/보관 설정(선택):
   - 기본은 API 학습 미사용(추가 동의 시 사용)임.  
   - 조직 승인 대상이면 `Settings → Organization → Data controls`에서 retention 옵션 확인.
   - 없으면 해당 메뉴가 비활성일 수 있음(계정·요금제·승인 상태 의존).

## BotFather Fast Setup / BotFather 빠른 생성법

1. Telegram에서 `@BotFather` 검색 후 `Start`  
2. `\newbot` 입력  
3. Bot name 입력 (예: `My GPT Bot`)  
4. Bot username 입력 (반드시 `...bot` 또는 `..._bot`로 끝남)  
5. 안내되는 API 토큰 복사  
6. `.env.local`의 `TELEGRAM_BOT_TOKEN`에 붙여넣고 실행  
7. Telegram에서 봇 열기 후 `/start` 전송으로 동작 확인
8. `@BotFather`로 돌아가 `\setcommands`로 사용 설명 명령 등록(선택)
   - 예: `hi - 질문 답변 (웹 검색)`, `lo - 빠른 답변 (웹 검색)`, `ez - 빠른 답변`, `helpai - 도움말`
9. 토큰 분실/유출 시 `@BotFather`에서 해당 봇을 열고 `Revoke`(재생성) 처리
10. 토큰은 절대 채팅에 공유하지 않음

## Quick Start / 빠른 시작

1. Open terminal and go to folder / 터미널에서 프로젝트 폴더로 이동  
   `Set-Location "C:\Users\PKreset\Documents\Telegram-OpenAPI\public-release"`
2. (Optional) install dependencies / 의존성 설치: `npm install`
3. Copy template env file / 환경설정 템플릿 복사  
   `Copy-Item .env.local.example .env.local`
4. Fill `.env.local` locally / `.env.local`에 키를 직접 입력  
   (Do not paste keys in chat / 채팅에 키를 입력하지 않음)
5. Run checks / 기본 점검  
   `npm run check`, `npm run test:safety`
6. Start bot / 봇 실행  
   `npm start`
7. Send `/helpai` in Telegram / Telegram에서 `/helpai` 전송

### Example `.env` / `.env.local` 예시 항목

```env
OPENAI_API_KEY=
OPENAI_ADMIN_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_USER_ID=
TELEGRAM_BOT_ID=
OPENAI_MODEL=gpt-5.4-mini
OPENAI_ADVANCED_MODEL=gpt-5.5
OPENAI_USAGE_TIER_BAND=
OPENAI_FREE_TOKEN_GUARD_RESERVE=50000
```

## Preflight Checklist / 설치 전 체크리스트

- Node.js 20+ installed  
  Node.js 20 이상 설치 확인  
- BotFather에서 Telegram 봇 토큰 준비  
- OpenAI API 키 / OpenAI 관리자 키 준비  
- `.env.local` 파일 직접 작성 완료  
- `npm run check`와 `npm run test:safety` 통과

## Commands / 명령

- `/hi question` : Advanced model + web search / 고급 모델 + 웹 검색  
- `/lo question` : Fast model + web search / 경량 모델 + 웹 검색  
- `/ez question` : Fast model, no web search / 경량 모델, 검색 없음  
- `/free`, `/usage`, `/limits` : Usage summary / 사용량 요약  
- `/costs` : DM-only cost summary / DM 전용 비용 요약  
- `/helpai` : Help / 도움말  
- `/start` : Welcome message / 시작 메시지

Group mention example / 그룹 언급 예시:  
`/hi@YourBotName question`, `/lo@YourBotName question`

## Ops Notes / 운영 메모

- Local polling only, no webhook. / webhook이 아닌 로컬 롱폴링 방식입니다.
- One poller per token. If `HTTP 401 Unauthorized`, stop old process and fix token once.  
  토큰당 폴러는 1개만 실행하고, `401 Unauthorized` 발생 시 기존 프로세스 종료 후 토큰 갱신 후 1회만 재시작.
- Do not commit secrets. `.env.local`, logs, `node_modules` are ignored / 비밀값 커밋 금지. `.env.local`/로그/`node_modules`는 `.gitignore`로 제외됨.

## Memory (컨텍스트)

Only the previous successful Q&A is kept per chat/user.  
채팅/유저별로 직전 성공 Q&A 1개만 메모리에 보관됨.
- Not written to disk, not logged. / 디스크 저장 없음, 로그 기록 없음
- Cleared on restart. / 재시작 시 초기화됨

## Windows Helpers / Windows 보조 명령

```powershell
npm run bot:status
npm run bot:restart
```

## Documentation / 문서

- `docs/telegram-bot/architecture.md`  
- `docs/telegram-bot/operations.md`  
- `docs/openai-data-sharing-free-token-limits.md`

## GitHub Repo Polish / GitHub 저장소 다듬기

- On GitHub repo page: `Settings` → `General`  
  - Description: "Telegram bot (Responses API) with hi/lo/ez commands and usage checks."  
  - 이모지/짧은 요약 한 줄 정도로 간단히 작성
- `Settings` → `General` → `Features`  
  - Wiki/Discussions 필요 시만 켜기
- `Settings` → `General` → `Topics`  
  - 추천 태그: `telegram`, `telegram-bot`, `openai-api`, `nodejs`
- README 상단 제목/링크는 변경 없이 그대로 두고, 필요하면 설치 난이도 1줄 추가

## For Codex / Codex 시작 문구

- Use the standalone prompt file: [CODEX_START_PROMPT.txt](C:\\Users\\PKreset\\Documents\\Telegram-OpenAPI\\public-release\\CODEX_START_PROMPT.txt)

## License / 라이선스

MIT
