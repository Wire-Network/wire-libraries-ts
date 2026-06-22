# AGENTS.md

## Project overview
TypeScript monorepo for Wire shared libraries, including `@wireio/sdk-core`, shared runtime utilities, wallet SDK packages, protobuf tooling, and examples.

## Working rules
- Prefer minimal, targeted changes.
- Follow existing patterns before introducing new abstractions.
- Do not add dependencies without approval.
- For non-trivial changes, inspect surrounding package code paths first.
- Follow `STYLE.md` for TypeScript style, packaging, imports, barrels, and tests.

## Commands
- install: `pnpm install`
- dev: `pnpm build:dev`
- build: `pnpm build`
- test: `pnpm test`
- lint: no root lint script currently defined
- typecheck: `pnpm --filter @wireio/sdk-core compile` for sdk-core changes

## Architecture notes
- Main entrypoints: root `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, and package-level `src/index.ts` files.
- Important modules: `packages/sdk-core/src`, `packages/shared/src`, `packages/shared-node/src`, `packages/shared-web/src`.
- Sensitive areas: package export maps, generated system contract types, serializer/runtime ABI code, and hybrid CJS/ESM publishing.
- Generated code / files to avoid editing directly: package `lib/**`, `dist/**`, `target/**`, coverage output, and generated ABI/type artifacts unless the change is explicitly about regeneration.

## Change-specific rules
- If touching API contracts, update tests and consumers.
- If touching package exports, verify TypeScript compile and import paths.
- If touching serialization or chain primitives, add focused regression coverage.
- If touching system contract helpers, prefer generated types in `packages/sdk-core/src/types/SystemContractTypes.ts` where practical.

## Verification
Before finishing:
- run relevant tests
- run lint/typecheck if relevant
- verify behavior changed as intended
- summarize assumptions and remaining risks

## Security / safety
- Never commit secrets or edit `.env` values into source.
- Be careful with destructive scripts, publishing workflows, and signer-backed live chain tests.
