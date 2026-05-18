# Retrieval Eval

Run with real Anthropic calls against a pre-populated vault.

```bash
RARE_EVAL=1 \
  ANTHROPIC_API_KEY=sk-ant-... \
  RARE_EVAL_VAULT=/path/to/vault \
  npx vitest run eval/
```

Threshold: ≥70% of cases must pass.

Update `cases.json` to reflect questions you'd actually ask. Run at 10/50/100 source milestones to detect retrieval degradation.
