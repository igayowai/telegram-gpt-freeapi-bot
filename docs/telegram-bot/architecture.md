# Telegram Bot Architecture

## Runtime

- Node.js ESM project.
- Main file: `src/bot.mjs`.
- Telegram library: `grammy`.
- OpenAI library: `openai`.
- Environment file: `.env.local`.
- Polling startup drops pending Telegram updates so old commands from downtime are not processed later.
- Startup verifies the Telegram token with `getMe`.
- Telegram `401 Unauthorized` stops the process to prevent invalid-token polling loops.
- Long polling uses an explicit 30-second timeout.

## OpenAI Models

Configured defaults:

- low-level: `gpt-5.4-mini`
- high-level: `gpt-5.5`

Commands:

- `/hi`: high-level with `web_search`
- `/lo`: low-level with `web_search`
- `/ez`: low-level without `web_search`

For all model commands, the bot first sends `답변 생성 중` before usage-guard and OpenAI API work. This makes the local bot process being alive visible in Telegram.
After the command reaches a final answer or error message, the bot tries to delete this temporary message unless it was changed into a low-level fallback notice.

For `/hi`, `/lo`, and `/ez`, the bot keeps one previous successful Q&A in process memory per chat and user. This context is passed to the next model request only as short-term follow-up context, is never written to disk, and is cleared when the operator PC/server turns off or the Node process restarts.

Model answers begin with `현재 모델: <model>`. `/ez` adds `(검색X)`, and `/hi` fallback to the low-level model adds `(고수준 한도 소진)`.

## Prompting

Every answer request includes a compact style prompt:

- Korean unless requested otherwise.
- concise, factual, high-density.
- Korean task-log tone.
- no praise, jokes, small talk, or long explanations.
- use the previous Q&A only when the new user message is a follow-up or ambiguous.
- if asked about memory, say it is lost when the operator PC/server turns off or the Node process restarts.
- do not write raw URLs, Markdown links, or source lists in answer text; source links are appended from API citation metadata.
- prefer direct sources about the entity in the user question; avoid broad background sources unless essential.

## Usage And Guard Logic

`/free` uses the OpenAI organization usage/cost endpoints through `OPENAI_ADMIN_KEY`.

Daily free-token logic:

- internal boundary: UTC day
- display timezone: KST
- service tier counted as free: `incentivized-tier`
- usage count: input plus output tokens
- model groups:
  - large group: `gpt-5.5`
  - mini/nano group: `gpt-5.4-mini`

Guard:

- Before `/hi`, `/lo`, and `/ez`, the bot checks remaining daily free quota for the selected model group.
- If `/hi` high-level quota is at or below `OPENAI_FREE_TOKEN_GUARD_RESERVE`, the bot changes the temporary status message to a low-level fallback notice and answers with the low-level model.
- If `/lo` or `/ez` low-level quota is at or below the reserve, the bot refuses the response.
- If guard usage lookup fails, the bot fails closed.

## Formatting

- normal model replies are sent as Telegram HTML after converting simple `**bold**` to `<b>`.
- Markdown links and bare URLs in model replies are converted to Telegram HTML links so long URLs are not shown in chat.
- web-search source lists prefer output-text annotation URLs over broad search-action source candidates.
- source links are filtered by query-term relevance when possible; if no source matches, the bot falls back to the unfiltered source list.
- model replies are capped to a small number of chunks and paced between chunks to reduce burst risk.
- `/free` uses Telegram Markdown for selected bold labels and percentages.
- `/formattest` sends Markdown, MarkdownV2, and HTML samples for client comparison.

## Known Limits

- No image input.
- No image generation/output.
- No long-term conversation memory.
- No cloud hosting.
- Bot stops when the Windows PC or Node process stops.
