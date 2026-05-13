# AGENTS.md

This is the agent instruction file for the content factory project as maintained from Codex.

## Read First

Before substantial work, read:

- `MEMORY.md` - compact project memory for this repo.
- `C:\Users\хост\.claude\projects\C--Users-----\memory\project_content_factory.md` - full content-factory state, workflows, services, Supabase, Telegram, Buffer, LLM.
- `C:\Users\хост\.claude\projects\C--Users-----\memory\project_agent_runner.md` - historical context about the old Claude/GLM agent-runner workflow.
- `.project-secrets.local.md` only when credentials are needed.

Do not print secrets in chat. Refer to secrets by label unless the user explicitly asks to reveal a value.

## Project Role

This repo contains the content-factory working files and the old agent-runner/MCP server. The user is now moving project work to Codex; do not assume the old Claude/GLM subagent workflow is available.

- Main file: `index.js`.
- Workflow backups: `workflows/`.
- Historical Claude/GLM agent prompts: `agents/`.
- Codex should work directly with the files/tools available in the current session unless the user explicitly asks to use or restore agent-runner/subagents.

## Installed Codex Skills

Use these skills when relevant:

- `n8n-expression-syntax`
- `n8n-node-configuration`
- `n8n-validation-expert`
- `n8n-workflow-patterns`
- `n8n-code-javascript`
- `n8n-code-python`
- `n8n-mcp-tools-expert`
- `n8n-architect`
- Superpowers skills for debugging, planning, review, and verification.

## Workflow Validation Policy

For n8n workflow JSON, use both validators as independent read-only preflight checks:

1. `valn8n` - fast structural/integrity validation.
2. `n8n-workflow-validator` or `n8n-validate` - n8n-specific node/parameter validation.

Rules:

- Treat both validators as check-only tools.
- Do not run autofix or automatic rewrite steps unless the user explicitly asks.
- Do not choose one validator as the single source of truth.
- If validators disagree, inspect the exact warning/error and verify against n8n import/test behavior.
- `n8n-workflow-validator` can crash with a Fatal TypeError on real exported workflows that include unsupported/custom node definitions. Treat that as a validator/tooling limitation until confirmed in n8n, not as proof that the workflow JSON is invalid.
- Final acceptance requires n8n import/test execution, not just validator success.

Recommended flow:

```text
workflow JSON -> valn8n check -> n8n-workflow-validator check -> n8n import/test -> inspect execution
```

## n8n-as-code Policy

Use `n8nac` / `n8n-manager` to organize workflows as code, compare versions, and support Git-based review. Do not push/sync changes into a live n8n instance without explicit user intent for that action.

## Memory Maintenance

When the user says "обнови память по проекту", update `MEMORY.md` with durable non-secret facts and keep it concise. Put credentials only into `.project-secrets.local.md` or `.env`, never into tracked files.
