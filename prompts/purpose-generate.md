You are helping a user set up a personal knowledge vault. Based on their description below, write the content of `purpose.md` — a configuration file that tells the AI assistant what this vault is for and how to use it.

## User's vault description

{{description}}

## Key questions they want to answer

{{questions}}

## Instructions

Write a `purpose.md` file that includes:

1. A clear, specific statement of what this vault is for (2–3 sentences)
2. A "Key questions" section listing the user's questions, cleaned up
3. A "Scope" section describing what topics belong and what to exclude
4. A "Tone for chat answers" line (e.g., direct + sourced, casual + exploratory, technical)

Keep it short — this file is read into every LLM prompt, so brevity matters. Use plain markdown with `##` headings. No preamble.
