import type { Config } from "jest"

const config: Config = {
  displayName: "@wireio/opp-snapshot",
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
    "^@wireio/opp-snapshot$": "<rootDir>/src/index",
    "^@wireio/opp-snapshot/(.*)$": "<rootDir>/src/$1",
    "^@wireio/shared$": "<rootDir>/../shared/src",
    "^@wireio/shared/(.*)$": "<rootDir>/../shared/src/$1",
    "^(\\.\\.?/.*)\\.js$": "$1"
  }
}

export default config
