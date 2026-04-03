import type { Config } from "jest"

const config: Config = {
  displayName: "shared-web",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.cjs.jest.json",
      },
    ],
  },
  moduleNameMapper: {
    "^@wireio/shared-web$": "<rootDir>/src/index",
    "^@wireio/shared-web/(.*)$": "<rootDir>/src/$1",
    "^@wireio/shared$": "<rootDir>/../shared/src",
    "^@wireio/shared/(.*)$": "<rootDir>/../shared/src/$1",
    "^(\\.\\.?/.*)\\.js$": "$1",
  },
}

export default config
