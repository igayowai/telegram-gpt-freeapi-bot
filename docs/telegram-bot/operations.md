# Telegram Bot Operations

## Normal Status Check

```powershell
npm run bot:status
```

This checks:

- running `node src/bot.mjs` process
- recent stdout/stderr
- Telegram webhook status without printing the bot token

Expected:

- one running bot process
- stdout includes `Telegram GPT bot started as @your_bot_username`
- stderr is empty
- webhook URL is absent because the bot uses polling

## Controlled Restart

```powershell
npm run bot:restart
```

Restart order:

1. `npm run check`
2. stop existing local bot process
3. start `node src/bot.mjs`
4. drop pending Telegram updates from downtime
5. write `logs/telegram-bot/bot.pid`
6. print safe status summary

## Runtime Logs

Log path:

```text
logs/telegram-bot/stdout.log
logs/telegram-bot/stderr.log
```

Command lifecycle format:

```text
cmd=free phase=start duration_ms=0 chat_type=supergroup chat_id=-10...000
cmd=free phase=end duration_ms=5968 chat_type=supergroup chat_id=-10...000
cmd=hi phase=error duration_ms=1234 chat_type=private chat_id=123...000 status=... code=... message=...
```

Interpretation:

- no `start`: Telegram did not deliver the update to this process.
- `start` only: handler is still running or blocked.
- `error`: handler threw; inspect status/code/message.
- `end`: handler completed from the bot perspective.

Privacy:

- message text is not logged.
- token/key values are not logged.
- chat id is masked.

## Alive Signal

For `/hi`, `/lo`, and `/ez`, the bot should immediately send:

```text
답변 생성 중
```

Normally, after the final answer or error message is sent, the bot tries to delete this temporary message. Deletion may require Telegram chat permissions.
If `/hi` high-level quota is protected by the reserve, this temporary message is changed to `고수준 한도가 소진되어 저수준으로 출력합니다`, kept as a notice, and the answer is generated with the low-level model.

If this message does not appear after a model command, check whether the local PC and `node src/bot.mjs` process are running, then run:

```powershell
npm run bot:status
```

## Current Bot Behavior

- polling, not webhook
- pending updates are dropped on startup
- no conversation memory
- group ordinary messages ignored
- slash commands accepted with and without bot username mention
- `/free` allowed in DM/groups/channels
- `/costs` DM only
- `/helpai` is used instead of `/help`

## Common Checks

```powershell
npm run check
npm run test:safety
npm run bot:status
Get-Content .\logs\telegram-bot\stderr.log -Tail 80
Get-Content .\logs\telegram-bot\stdout.log -Tail 80
```

Do not paste full logs to chat. Summarize only the relevant lines.

## Telegram Safety

- Startup verifies the bot token with `getMe`.
- `HTTP 401 Unauthorized` is terminal: the process exits instead of polling forever with an invalid/reset/frozen token.
- `HTTP 429 Too Many Requests` diagnostics include `retry_after` when available.
- `HTTP 403 Forbidden` is reported as an unauthorized chat/action and should not be retried as a loop.
- Telegram token-like strings and full Bot API URLs are redacted in safety log formatting.
- Status output redacts stdout/stderr tails before printing.
- Process matching is scoped to the pid file and this project's `src\bot.mjs`.
