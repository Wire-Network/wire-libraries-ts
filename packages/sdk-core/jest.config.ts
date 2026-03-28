import type { Config } from "jest"

const config: Config = {
  displayName: "@wireio/sdk-core",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.[tj]s$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/../../etc/tsconfig/tsconfig.base.jest.json",
      },
    ],
  },
  transformIgnorePatterns: [
    "/node_modules/.pnpm/(?!@noble)",
    "/node_modules/(?!(\\.pnpm|@noble))"
  ],
  moduleNameMapper: {
    "^@wireio/sdk-core$": "<rootDir>/src/index",
    "^@wireio/sdk-core/(.*)$": "<rootDir>/src/$1",
    "^@noble/curves/bls12-381$": "@noble/curves/bls12-381.js",
  },
}

export default config
