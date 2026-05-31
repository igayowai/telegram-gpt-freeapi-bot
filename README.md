# Telegram GPT API Bot

Local polling Telegram bot powered by the OpenAI Responses API.

It supports high/low model commands, optional web search, OpenAI usage summaries, source-link cleanup, and conservative Telegram Bot API safety handling.

## Features

- `/hi question`: advanced model with automatic web search.
- `/lo question`: lightweight model with automatic web search.
- `/ez question`: lightweight model without web search.
- `/free`, `/usage`, `/limits`: complimentary token and paid usage summary.
- `/costs`: recent OpenAI API cost summary, DM only.
- `/helpai`: command help.
- Web-search answers hide long raw URLs and append compact clickable sources.
- Startup checks the Telegram token with `getMe`.
- Telegram `HTTP 401 Unauthorized` is terminal to avoid invalid-token polling loops.
- Long model replies are chunked, capped, and lightly paced.

## Requirements

- Node.js 20 or newer.
- Telegram bot token from BotFather.
- OpenAI API key.
- OpenAI admin key if you want `/free`, `/usage`, `/limits`, or `/costs`.

## Quick Start

1. Download this repository and open the folder in a terminal.
2. Install Node.js 20 or newer if `node -v` does not work.
3. Create your Telegram bot with BotFather and copy its bot token.
4. Create an OpenAI API key.
5. Copy `.env.local.example` to `.env.local`.
6. Fill in `.env.local` on your computer. Do not paste API keys or bot tokens into chat.
7. Run `npm install`.
8. Run `npm run check` and `npm run test:safety`.
9. Run `npm start`.
10. Open Telegram and send your bot `/helpai`.

## Setup

Create `.env.local` from `.env.local.example`:

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

Install dependencies:

```powershell
npm install
```

Run the bot:

```powershell
npm start
```

Optional Windows helper scripts:

```powershell
npm run check
npm run test:safety
npm run bot:status
npm run bot:restart
```

## Operation Notes

This bot uses local long polling, not webhook hosting. It works only while the machine running `node src/bot.mjs` is online.

Run only one polling process per Telegram bot token. If Telegram resets, revokes, freezes, or rejects the token with `HTTP 401 Unauthorized`, stop the old process, update `.env.local`, and restart once.

Do not commit `.env.local`, logs, or tokens. The included `.gitignore` excludes local env files and runtime logs.

## Commands

- DM: `/start` or `/helpai`
- DM or group: `/hi question`
- DM or group: `/lo question`
- DM or group: `/ez question`
- Group mention form: `/hi@YourBotName question`, `/lo@YourBotName question`
- Any chat: `/free`, `/usage`, `/limits`
- DM only: `/costs`

The bot ignores ordinary group messages and keeps no long-term conversation memory.

For `/hi`, `/lo`, and `/ez`, the bot keeps only the previous successful Q&A in process memory per chat and user. This short-term context is never written to disk, is not logged, and disappears when the operator PC/server turns off or the Node process restarts.

Model answers start with `현재 모델: ...`. `/ez` appends `(검색X)`, and `/hi` fallback appends `(고수준 한도 소진)`.

## Documentation

- `docs/telegram-bot/architecture.md`
- `docs/telegram-bot/operations.md`
- `docs/openai-data-sharing-free-token-limits.md`

## License

MIT
