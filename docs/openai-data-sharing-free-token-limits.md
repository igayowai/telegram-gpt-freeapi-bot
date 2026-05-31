# OpenAI data sharing complimentary token limits

Source: https://help.openai.com/en/articles/10306912
Checked: 2026-05-28 Asia/Seoul

## Eligibility

- Data sharing must be enabled for API inputs and outputs.
- The organization must be eligible and enrolled for complimentary daily tokens.
- Only traffic on enabled projects qualifies.
- A positive account balance is still required.
- Free token usage appears in Usage grouped by Service Tier as `data sharing incentive tier - input/output tokens`.

## Daily limits

| Group | Usage tiers 3-5 | Usage tiers 1-2 | Shared models |
| --- | ---: | ---: | --- |
| Large model group | 1,000,000 tokens/day | 250,000 tokens/day | `gpt-5.5-2026-04-23`, `gpt-5.4-2026-03-05`, `gpt-5.2-2025-12-11`, `gpt-5.1-2025-11-13`, `gpt-5.1-codex`, `gpt-5-codex`, `gpt-5-2025-08-07`, `gpt-5-chat-latest`, `gpt-4.5-preview-2025-02-27`, `gpt-4.1-2025-04-14`, `gpt-4o-2024-05-13`, `gpt-4o-2024-08-06`, `gpt-4o-2024-11-20`, `o3-2025-04-16`, `o1-preview-2024-09-12`, `o1-2024-12-17` |
| Mini/nano model group | 10,000,000 tokens/day | 2,500,000 tokens/day | `gpt-5.4-mini-2026-03-17`, `gpt-5.4-nano-2026-03-17`, `gpt-5.1-codex-mini`, `gpt-5-nano-2025-08-07`, `gpt-4.1-mini-2025-04-14`, `gpt-4.1-nano-2025-04-14`, `gpt-4o-mini-2024-07-18`, `o4-mini-2025-04-16`, `o1-mini-2024-09-12`, `codex-mini-latest` |

## Counting rules

- Input and output tokens are counted together.
- Limits are shared across each model group, not per model.
- If one request would exceed the remaining daily quota, the whole request is billed at normal rates.
- The counter resets daily at 00:00 UTC. Bot calculations use this UTC boundary internally and display the period in KST.
- Fine-tuned models, fine-tuning training, evals, and tool use are excluded.

## Bot mapping

- `/hi`: `gpt-5.5`, web search enabled, large model group.
- `/lo`: `gpt-5.4-mini`, web search enabled, mini/nano group.
- `/ez`: `gpt-5.4-mini`, web search disabled, mini/nano group.
- `/free`, `/usage`, `/limits`: show today's `incentivized-tier` usage, this month's non-incentivized usage/cost, and remaining daily quota estimates.
- Set `OPENAI_USAGE_TIER_BAND=1-2` or `OPENAI_USAGE_TIER_BAND=3-5` to show one quota band; leave unset to show both.
- `OPENAI_FREE_TOKEN_GUARD_RESERVE`: fallback `/hi` to the low-level model when high-level remaining complimentary quota is at or below this reserve; refuse `/lo` and `/ez` when low-level quota is at or below this reserve.
