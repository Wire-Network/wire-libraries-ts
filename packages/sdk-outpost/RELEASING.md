# Releasing `@wireio/sdk-outpost`

`@wireio/sdk-outpost` participates in the same repository-wide release as
`@wireio/sdk-core`. Do not manually change its version or publish a workspace
directory outside this process.

## Release requirements

- Use Node.js 24 and the repository-pinned pnpm version through Corepack.
- Keep the lockfile unchanged after a frozen install.
- Import deployment assets through `import:deployment`; never edit generated
  ABI, IDL, catalog, or client files by hand.
- Confirm the package contains no secrets, RPC credentials, private keys, or
  mutable environment configuration.
- Keep `repository.url` exactly equal to
  `https://github.com/Wire-Network/wire-libraries-ts` for npm provenance.

Codespaces and local checkouts are verification environments, not publishing
authorities. Run the checks there, but let the protected GitHub Actions workflow
create the release.

## Before merge

From the repository root:

```sh
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm run lint
corepack pnpm run test:ci
corepack pnpm --dir packages/sdk-outpost run verify:release
corepack pnpm --dir packages/sdk-outpost pack --dry-run
```

Inspect the package listing from the dry run. It must contain only the README,
package metadata, and the CJS/ESM build outputs.

## First npm listing

The first successful publish creates the npm package page. Before merging:

1. Confirm the `wireio` organization exists on npm and the release owner can
   publish public packages in that scope.
2. Confirm npm two-factor authentication is enabled for the release owner.
3. Confirm the GitHub repository secret `NPM_TOKEN` is a valid granular token
   with read/write access to the `wireio` organization and permission to publish
   with the organization's required 2FA policy.
4. Merge the reviewed pull request into `master`.

The `publish-npm.yaml` workflow then:

1. installs the frozen workspace with Node.js 24 and pnpm 10.34.5;
2. builds and tests every package;
3. verifies generated deployment sources and both package entrypoints;
4. changes `sdk-outpost` from `0.0.0` to `0.0.1` as part of the shared patch
   increment;
5. commits the workspace version update with `[skip release]`;
6. publishes every changed public package with public access and provenance.

Do not create `0.0.1` manually. A failed publish must be corrected in source and
released as the next patch; published npm versions are immutable.

## After the first publication

Verify the listing and install path:

```sh
npm view @wireio/sdk-outpost version dist-tags repository --json
npm install @wireio/sdk-outpost
```

Then configure npm trusted publishing for the package:

- provider: GitHub Actions
- organization: `Wire-Network`
- repository: `wire-libraries-ts`
- workflow filename: `publish-npm.yaml`
- allowed action: `npm publish`

After a trusted publish succeeds, remove the long-lived write token from the
publish step and restrict token-based publishing in npm package settings. Keep
`id-token: write`; npm will generate provenance automatically for the public
package from the public repository.

References:

- <https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/>
- <https://docs.npmjs.com/trusted-publishers/>
