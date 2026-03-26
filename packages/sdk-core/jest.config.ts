import type { Config } from "jest"

const config: Config = {
  displayName: "@wireio/sdk-core",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/../../etc/tsconfig/tsconfig.base.jest.json",
      },
    ],
  },
  moduleNameMapper: {
    "^@wireio/sdk-core$": "<rootDir>/src/index",
    "^@wireio/sdk-core/(.*)$": "<rootDir>/src/$1",
  },
}

export default config
