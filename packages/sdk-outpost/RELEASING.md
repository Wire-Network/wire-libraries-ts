# Releasing `@wireio/sdk-outpost`

`@wireio/sdk-outpost` participates in the same repository-wide release as
`@wireio/sdk-core`. Do not manually change its version or publish a workspace
directory outside this process.

## Current first-release state

As of August 10, 2026, neither exact producer artifact package nor
`@wireio/sdk-outpost` is listed on npm. The producer branches may be tested as
siblings, but the SDK lockfile and frozen-install gate must remain blocked until
the real registry packages exist. Do not generate lockfile entries from local
paths or advertise the package as installable before the registry checks pass.

## Artifact prerequisites

The package consumes exact build-time versions of:

- `@wireio/outpost-ethereum-artifacts`, published from `wire-ethereum`;
- `@wireio/outpost-solana-artifacts`, published from `wire-solana`.

Publish a new producer package when its ABI/IDL or deployable contract/program
binary changes. Publish `sdk-outpost` when its public behavior changes or a new
ABI, IDL, normalized Ethereum runtime, or Solana program binary must be compiled
into deployment verification. A same-code deployment respin, address change, or
endpoint rotation does not require either package to be republished; emit a new
immutable deployment profile for a respin and update the separate endpoint
catalog for mutable endpoints.

Before updating either dependency, verify its npm provenance, source revision,
artifact checksums, and immutable version. Keep both versions exact in
`packages/sdk-outpost/package.json` and update `pnpm-lock.yaml` through a frozen
pnpm-compatible install.

## Release requirements

- Use Node.js 24 and the repository-pinned pnpm version through Corepack.
- Keep the lockfile unchanged after a frozen install.
- Generate clients only through `scripts/sdk-outpost/generate.mjs`; never edit
  generated TypeChain, Anchor, or artifact-manifest sources by hand.
- Do not release output generated with `--deployment-artifacts-path`. That mode
  is limited to exact local integration bundles and the package verifier must
  reject it.
- Confirm the package contains no secrets, RPC credentials, private keys,
  deployment addresses, or mutable environment configuration.
- Confirm deployment profiles are distributed through the authenticated
  platform release channel; their schema and checksum-derived IDs are not
  signatures.
- Keep `repository.url` exactly equal to
  `https://github.com/Wire-Network/wire-libraries-ts` for npm provenance.

Local checkouts are verification environments, not publishing authorities. Run
the checks there, but let the protected GitHub Actions workflow create the
release.

## Before merge

From the repository root:

```sh
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm run lint
corepack pnpm run test:ci
corepack pnpm --dir packages/sdk-outpost run verify:release
corepack pnpm --dir packages/sdk-outpost pack --dry-run
```

Inspect the dry-run listing. It must contain only the README, package metadata,
and CJS/ESM build outputs. Raw producer packages and generated source trees must
not be published by `sdk-outpost`.

## First npm listing

The first successful publish creates the npm package page. Before merging:

1. Confirm both exact producer artifact versions are publicly installable.
2. Confirm the `wireio` organization exists on npm and the release owner can
   publish public packages in that scope.
3. Confirm npm two-factor authentication is enabled for the release owner.
4. Confirm the GitHub repository secret `NPM_TOKEN` can publish to the `wireio`
   organization under its required authentication policy.
5. Merge the reviewed pull request into `master`.

The `publish-npm.yaml` workflow installs the frozen workspace, generates clients
from the producer packages, builds and tests every package, verifies the public
entrypoints, increments the workspace patch versions, and publishes with npm
provenance.

Do not create the first `sdk-outpost` version manually. A failed publish must be
corrected in source and released as the next patch; published npm versions are
immutable.

## After the first publication

Verify the listing and install path:

```sh
npm view @wireio/sdk-outpost version dist-tags repository --json
npm install @wireio/sdk-outpost
```

Then configure npm trusted publishing for `publish-npm.yaml`. After a trusted
publish succeeds, remove the long-lived write token from the publish step and
restrict token-based publishing in npm package settings. Keep `id-token: write`
so npm can generate provenance.

References:

- <https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/>
- <https://docs.npmjs.com/trusted-publishers/>
