# Telegram GPT API Bot / 텔레그램 GPT API 봇

Local polling Telegram bot powered by OpenAI Responses API.  
OpenAI Responses API로 동작하는 로컬 폴링 방식 Telegram 봇입니다.

## What this project is / 이 프로젝트는 무엇?

- High/low command modes (`/hi`, `/lo`) and no-web mode (`/ez`).  
  고성능/경량 모드(`/hi`, `/lo`)와 검색 비사용 모드(`/ez`)를 제공합니다.
- Auto web search for `/hi` and `/lo` and compact source formatting for answers.  
  `/hi`, `/lo`에 자동 웹 검색이 붙고, 긴 URL은 짧은 출처 링크로 정리됩니다.
- Usage summary commands (`/free`, `/usage`, `/limits`) and DM-only cost command (`/costs`).  
  토큰/사용량 요약(`/free`, `/usage`, `/limits`)과 DM 전용 비용 요약(`/costs`)을 제공합니다.
- `/helpai` help command, command safety checks, and safe Telegram error behavior.  
  `/helpai`, 안전성 체크, Telegram 오류 대응을 포함합니다.

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

## Memory / 메모리

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

## For Codex / Codex 시작 문구

- Use the standalone prompt file: [CODEX_START_PROMPT.txt](C:\\Users\\PKreset\\Documents\\Telegram-OpenAPI\\public-release\\CODEX_START_PROMPT.txt)

## License / 라이선스

MIT
