import type { Config } from "jest"

const config: Config = {
  displayName: "wallet-ext-sdk",
  testEnvironment: "jsdom",
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
    "^@wireio/wallet-ext-sdk$": "<rootDir>/src/index",
    "^@wireio/wallet-ext-sdk/(.*)$": "<rootDir>/src/$1",
  },
}

export default config
