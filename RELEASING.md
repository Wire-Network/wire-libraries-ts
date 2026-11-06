# Releasing Wire libraries

All non-private workspace packages publish through the repository workflows.
Do not publish a workspace manually or use local artifact links in a release.

## Version and channel

**Prepare Release** bumps every package relative to its own version and opens a
`release/prep-v<core-version>` PR against `master`. It refuses a second open
bot-created preparation PR. Package tracks remain independent; review every
manifest in the generated PR.

| Intent | Bump | Prerelease identifier | Example from sdk-core 1.0.109 |
| --- | --- | --- | --- |
| Compatible fixes | patch | unused | 1.0.110 |
| Compatible additions | minor | unused | 1.1.0 |
| Public API removals or incompatible behavior | major | unused | 2.0.0 |
| Minor release candidate | preminor | rc | 1.1.0-rc.0 |
| Major release candidate | premajor | rc | 2.0.0-rc.0 |
| Next candidate in the same series | prerelease | rc | 2.0.0-rc.1 from 2.0.0-rc.0 |

The legacy-cleanup candidate removes public core APIs and older outpost pairs.
Use a major core RC rather than calling it a compatible 1.1.0 release. No version
is assigned until its preparation PR is approved. A repository-wide major bump
also advances the 0.x outpost and wallet tracks to 1.0.0; review their readiness
before choosing that bump.

Merging the preparation PR triggers **Tag Release**, which also supports manual
dispatch for recovery. Its `release` environment requires approval configured in
repository settings. It reads versions from `master`, installs the frozen
registry graph, builds/tests, publishes with npm provenance, then tags and
creates a GitHub release. Prerelease suffixes select the npm dist-tag (`rc`,
`dev`); stable versions use `latest`. Stable publication also asks
`wire-tools-ts` to open a dependency-update PR. PR merge alone is not proof of
npm publication.

## Artifact and deployment boundary

Outpost dependencies are exact producer-owned npm releases:
`@wireio/outpost-ethereum-artifacts@0.4.5` and
`@wireio/outpost-solana-artifacts@0.4.6` for this candidate. Keep source revisions,
checksums and registry integrity aligned; never regenerate producer bindings here.

A binary or ABI/IDL change requires matching producer artifacts and an SDK
release. A same-code respin needs a fresh immutable deployment profile, while RPC
rotation belongs in the application endpoint catalog. Profiles are caller-owned;
a checksum-derived profile ID is not a signature.

Older deployments must keep their compatible SDK until upgraded. Before adopting
the candidate, verify both profile interfaces and the connected family's runtime,
then run the platform flow tests and consuming application's journeys. Unit tests
do not establish mainnet acceptance.

## Verification before publication

Use Node 24 and the repository-pinned pnpm version:

```sh
pnpm install --ignore-pnpmfile --ignore-scripts --frozen-lockfile
pnpm run lint
pnpm run test:ci
```

`test:ci` includes `test:packages`: it finalizes hybrid output and imports
shared/core/outpost through both native Node module loaders.

Use a clean checkout when inspecting package contents, so deleted source cannot
leave obsolete generated files. Confirm CommonJS/ESM imports and declarations,
registry-only consumer installation, and migration of removed APIs. Published
files remain README and runtime build outputs; sdk-core excludes compiled tests
and incremental build metadata. No secrets, local links, network catalog
or duplicated producer sources.

Before approving publication, confirm npm publish credentials and repository
`release` environment reviewers. Keep package `repository.url` exactly
`https://github.com/Wire-Network/wire-libraries-ts` for provenance.

## After publication

Verify exact versions and dist-tags with `npm view`, then install those exact
versions in consumers and run their acceptance suites. An RC should remain on
the `rc` dist-tag until accepted. npm versions are immutable; a failed or
incorrect release requires a reviewed correction and new version, not replacement
of published bytes.
