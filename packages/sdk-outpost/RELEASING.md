# Releasing `@wireio/sdk-outpost`

`@wireio/sdk-outpost` participates in the same repository-wide release as
`@wireio/sdk-core`. Do not manually change its version or publish a workspace
directory outside this process.

## Current first-release state

As of August 18, 2026, both exact producer artifact packages are public on npm
at `0.1.1`. The first `@wireio/sdk-outpost` release is still pending. Its
workspace version remains `0.0.0` until the existing repository-wide patch
workflow bumps and publishes it; do not create a one-off version or publish the
workspace directory manually.

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

Before updating either dependency, verify its registry integrity/signature,
source revision, artifact checksums, and immutable version. The producer repos
are non-public, so their current npm releases do not carry public provenance.
Keep both versions exact in `packages/sdk-outpost/package.json`, update
`pnpm-lock.yaml` with the repository-pinned pnpm version, and then prove the
result with a frozen install.

## Release requirements

- Use Node.js 24 and the repository-pinned pnpm version through Corepack.
- Keep the lockfile unchanged after a frozen install.
- Generate clients only through `scripts/sdk-outpost/generate.mjs`; never edit
  generated TypeChain, Anchor, or artifact-manifest sources by hand.
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

The first successful publish creates the npm package page. Release sequence:

1. Confirm both exact `0.1.1` producer artifact versions are publicly
   installable.
2. Confirm the `wireio` organization exists on npm and the release owner can
   publish public packages in that scope.
3. Confirm npm two-factor authentication is enabled for the release owner.
4. Confirm the GitHub repository secret `NPM_TOKEN` can publish to the `wireio`
   organization under its required authentication policy.
5. Confirm the GitHub `release` environment exists with required reviewers; the
   environment approval is the second release gate.
6. Merge the reviewed feature pull request into `master`.
7. Dispatch **Prepare Release** with the intended bump, approve its checks, and
   merge the generated version-bump pull request.
8. Dispatch **Tag Release** and approve the `release` environment gate.

The preparation gate keeps each package on its existing version track. A patch
bump therefore makes the first SDK release `@wireio/sdk-outpost@0.0.1`, while
`@wireio/sdk-core` advances by one patch on its independent track. `workspace:*`
is rewritten to that concrete `sdk-core` version in the published SDK manifest.
The Tag Release gate must install the frozen workspace, generate clients from
the producer packages, build and test every package, verify public entrypoints,
and publish with npm provenance.

Do not create the first `sdk-outpost` version manually. A failed publish must be
corrected in source and released as the next patch; published npm versions are
immutable.

## After the first publication

Verify the listing and install path:

```sh
npm view @wireio/sdk-outpost version dist-tags repository --json
npm install @wireio/sdk-outpost
```

Then configure npm trusted publishing for `tag-release.yaml`. After a trusted
publish succeeds, remove the long-lived write token from the publish step and
restrict token-based publishing in npm package settings. Keep `id-token: write`
so npm can generate provenance.

References:

- <https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/>
- <https://docs.npmjs.com/trusted-publishers/>
