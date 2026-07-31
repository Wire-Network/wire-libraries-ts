import type { Config } from "jest"

const config: Config = {
  displayName: "@wireio/sdk-outpost",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.[tj]s$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.cjs.jest.json"
      }
    ]
  },
  moduleNameMapper: {
    "^@wireio/sdk-core$": "<rootDir>/../sdk-core/src/index",
    "^@wireio/sdk-core/(.*)$": "<rootDir>/../sdk-core/src/$1",
    "^@wireio/sdk-outpost$": "<rootDir>/src/index",
    "^@wireio/sdk-outpost/(.*)$": "<rootDir>/src/$1",
    "^(\\.\\.?/.*)\\.js$": "$1"
  }
}

export default config
