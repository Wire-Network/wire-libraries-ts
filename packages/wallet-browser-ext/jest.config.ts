import type { Config } from "jest"

const config: Config = {
  displayName: "wallet-browser-ext",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.[tj]sx?$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.cjs.jest.json",
      },
    ],
  },
  transformIgnorePatterns: [
    "/node_modules/.pnpm/(?!@noble|@3fv)",
    "/node_modules/(?!(\\.pnpm|@noble|@3fv))",
  ],
  moduleNameMapper: {
    "^@wireio/sdk-core$": "<rootDir>/../sdk-core/src/index",
    "^@wireio/sdk-core/(.*)$": "<rootDir>/../sdk-core/src/$1",
    "^@wireio/wallet-browser-ext$": "<rootDir>/src/index",
    "^@wireio/wallet-browser-ext/(.*)$": "<rootDir>/src/$1",
    "\\.css$": "<rootDir>/tests/__mocks__/styleMock.ts",
    "\\.svg$": "<rootDir>/tests/__mocks__/svgMock.ts",
    "^(\\.\\.?/.*)\\.js$": "$1",
  },
  setupFiles: ["<rootDir>/tests/setup.ts"],
}

export default config
