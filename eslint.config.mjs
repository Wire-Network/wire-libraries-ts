// =============================================================================
// wire-libraries-ts eslint — MECHANICAL enforcement of the recurring violation
// classes from STYLE.md + wire-platform-manifest/.claude/rules/*.md
// (ts-style-idioms.md is the injected pointer to both). Ported from
// wire-tools-ts/eslint.config.mjs (2026-07-18) — the two repos share the law;
// a ban added there lands here in the same change.
//
// Scope discipline:
//  - Formatting belongs to prettier (.prettierrc.js): eslint-config-prettier
//    is applied LAST so no rule here can fight it.
//  - The tsconfig compiles with `strictNullChecks: false` (etc/tsconfig/
//    tsconfig.base.json) — no rule below assumes strict-null semantics, and
//    `eqeqeq` allows `!= null` (the sanctioned both-nullish guard).
//  - Syntactic rules only (no type-checked linting).
//  - `error` means the class is BANNED; pre-existing debt is grandfathered
//    per-FILE (see the ratchet block) — prefer-null-over-undefined.md forbids
//    sweeping untouched code, so the lists burn down as files are touched,
//    never via a bulk sweep. Entries are only ever REMOVED.
// =============================================================================
import eslint from "@eslint/js"
import tseslint from "typescript-eslint"
import prettier from "eslint-config-prettier"

// prefer-lodash-identity.md (author law, 2026-07-21): an identity arrow `x => x`
// IS lodash `identity` — import { identity } from "lodash". A custom rule because
// no-restricted-syntax (esquery) cannot assert body-name === param-name.
const wireLocalPlugin = {
  meta: { name: "wire-local" },
  rules: {
    "no-identity-arrow": {
      meta: {
        type: "problem",
        docs: { description: "Use lodash `identity` instead of an `x => x` arrow." },
        messages: {
          useLodashIdentity:
            "Use `identity` from lodash instead of an `x => x` arrow (prefer-lodash-identity.md)."
        },
        schema: []
      },
      create(context) {
        return {
          ArrowFunctionExpression(node) {
            const [param] = node.params
            if (
              node.params.length === 1 &&
              param.type === "Identifier" &&
              node.body.type === "Identifier" &&
              node.body.name === param.name
            ) {
              context.report({ node, messageId: "useLodashIdentity" })
            }
          }
        }
      }
    }
  }
}

// STYLE.md "match() over switch always".
const BanSwitch = {
  selector: "SwitchStatement",
  message: "Use match() from ts-pattern (STYLE.md 'match() over switch always')."
}

// STYLE.md extracted-helper discipline: an immediately-invoked function
// expression hides a nameable operation inside an expression slot — extract a
// named local helper or use asOption().tap().get().
const BanInlineIife = {
  selector:
    "CallExpression[callee.type='ArrowFunctionExpression'], CallExpression[callee.type='FunctionExpression']",
  message:
    "No inline IIFEs — extract a named local helper (STYLE.md 'Extracted Helper Functions')."
}

// prefer-null-over-undefined.md, strictNullChecks:false section: NEVER add a
// `| null` union to a return type — the compiler doesn't enforce it, so it is
// dead ceremony; write the plain type, callers guard with `!= null`.
const BanNullUnionReturn = {
  selector: ":function > TSTypeAnnotation.returnType TSUnionType > TSNullKeyword",
  message:
    "No `| null` return-type ceremony — strictNullChecks is OFF, the union is unenforced clutter; write the plain type (prefer-null-over-undefined.md)."
}

// Author law (2026-07-15): no inline (anonymous) object types — every object
// shape gets a NAMED interface/type. Inline function types in parameter
// position stay allowed.
const BanInlineTypeLiteral = {
  selector: "TSTypeLiteral",
  message:
    "No inline object types — declare a named interface/type (author law; see STYLE.md 'Interface Design')."
}

// no-pick-in-parameter-types.md (author law, 2026-07-17): a parameter demands
// the minimum REAL data — one field → the indexed-access type, several
// optional fields → Partial<T>, the real object → T.
const BanPickParameter = {
  selector:
    ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, TSDeclareFunction, TSEmptyBodyFunctionExpression, TSMethodSignature, TSFunctionType) > :matches(Identifier, ObjectPattern, ArrayPattern, RestElement, AssignmentPattern, TSParameterProperty) TSTypeReference[typeName.name='Pick']",
  message:
    'No Pick<T,K> parameter contracts — one field → indexed access (T["field"]), several optional fields → Partial<T>, otherwise T (no-pick-in-parameter-types.md).'
}

// string-unions-derive-from-enums.md (author law, 2026-07-18): a hand-written
// union of string literals is a closed set without its enum. Declare the
// identity enum and use its members — or derive the union from an existing
// enum (`${Enum}` template / keyof typeof Enum / a union of Enum.member
// types) or reuse the generated type that already carries the spellings.
const BanStringLiteralUnion = {
  selector: "TSUnionType > TSLiteralType > Literal[raw=/^[\"']/]",
  message:
    "No hand-written string-literal unions — declare the identity enum, or derive the union from one (`${Enum}` / keyof typeof Enum) (string-unions-derive-from-enums.md)."
}

// STYLE.md "asOption" carve-out (author law, 2026-07-18): wrapping an
// ALREADY-AWAITED value in asOption just to tap a side effect and get() it
// back is ceremony — bind the value and use plain statements (or a genuine
// Future pipeline when composing async stages).
const BanAsOptionAwait = {
  selector: "CallExpression[callee.name='asOption'] > AwaitExpression",
  message:
    "Never asOption(await …) — bind the awaited value and use plain statements (or a genuine Future pipeline) (STYLE.md 'asOption')."
}

// STYLE.md "Destructuring over member-coalesce" (author law, 2026-07-18):
// `const local = obj.member ?? Default` re-spells the member name at every
// pull — destructure with defaults/renames instead:
// `const { member: local = Default } = obj`. Computed members (`arr[0]`) and
// optional chains stay accessor-form.
const BanMemberCoalesceDeclarator = {
  selector:
    "VariableDeclarator > LogicalExpression.init[operator='??'] > MemberExpression.left[computed=false]",
  message:
    "Destructure with a default — `const { member: local = Default } = obj` — not `const local = obj.member ?? Default` (STYLE.md 'Destructuring over member-coalesce')."
}

// nested-error-preserve-cause.md (author law, 2026-07-21): NEVER rewrite a caught
// error into a bare Error that restrings it — the root cause + its stack + message
// are SWALLOWED. Wrap it: NestedError(message, { cause, context }). (a) the restring
// tell — a caught error's `.message`/`.stack` (or `toMessage(err)`) interpolated
// into a new Error.
const BanErrorMessageRestring = {
  selector:
    "NewExpression[callee.name=/^(Error|TypeError|RangeError|EvalError|SyntaxError|URIError)$/] :matches(CallExpression[callee.name='toMessage'], MemberExpression[property.name=/^(message|stack)$/][object.name=/^(err|error|e|ex|cause|reason)$/])",
  message:
    "Don't restring a caught error into a bare Error — use NestedError(message, { cause, context }) so the root cause + its stack survive (nested-error-preserve-cause.md)."
}
// (b) a bare (no-cause) native Error constructed inside an error handler that
// RECEIVES the error (Either.mapLeft/ifLeft/recoverWith, Promise.catch,
// Future.onFailure) — it discards the very error being handled. Throw a
// NestedError with { cause }. NOT Option's orElse/ifNone — those handle ABSENCE
// (a None is not an error), so a fresh Error there has no cause to preserve.
const BanBareErrorInHandler = {
  selector:
    "CallExpression[callee.property.name=/^(mapLeft|ifLeft|catch|recoverWith|onFailure)$/] NewExpression[callee.name=/^(Error|TypeError|RangeError|EvalError|SyntaxError|URIError)$/][arguments.length<2]",
  message:
    "A bare Error in an error handler (mapLeft/ifLeft/catch/recoverWith/onFailure) SWALLOWS the handled error — throw a NestedError with { cause } (nested-error-preserve-cause.md)."
}

// Pre-existing debt, grandfathered per file per ban — RATCHETS: touch a listed
// file → pay its debt → DELETE its entry. Never add an entry. Computed from
// the 2026-07-18 baseline lint run.
const SwitchDebtFiles = [
  "packages/sdk-core/src/api/v1/Chain.ts",
  "packages/sdk-core/src/api/v1/Types.ts",
  "packages/sdk-core/src/chain/Asset.ts",
  "packages/sdk-core/src/chain/Blob.ts",
  "packages/sdk-core/src/chain/Integer.ts",
  "packages/sdk-core/src/chain/KeyType.ts",
  "packages/sdk-core/src/chain/PrivateKey.ts",
  "packages/sdk-core/src/chain/PublicKey.ts",
  "packages/sdk-core/src/chain/Signature.ts",
  "packages/sdk-core/src/chain/Transaction.ts",
  "packages/sdk-core/src/crypto/Curves.ts",
  "packages/sdk-core/src/crypto/Generate.ts",
  "packages/sdk-core/src/crypto/GetPublic.ts",
  "packages/sdk-core/src/crypto/Recover.ts",
  "packages/sdk-core/src/crypto/SharedSecret.ts",
  "packages/sdk-core/src/crypto/Sign.ts",
  "packages/sdk-core/src/crypto/Verify.ts",
  "packages/sdk-core/src/serializer/Builtins.ts",
  "packages/sdk-core/src/serializer/Decoder.ts",
  "packages/sdk-core/src/serializer/Encoder.ts",
  "packages/sdk-core/src/serializer/index.ts",
  "packages/sdk-core/src/signing/SigningRequest.ts",
  "packages/wallet-browser-ext/src/background/Background.ts",
  "packages/wallet-browser-ext/src/popup/App.tsx"
]
const InlineIifeDebtFiles = ["packages/wallet-browser-ext/src/inject/Provider.ts"]
const NullUnionReturnDebtFiles = [
  "packages/sdk-core/src/contracts/Contract.ts",
  "packages/sdk-core/src/contracts/sysio/msig/Capabilities.ts",
  "packages/sdk-core/src/contracts/sysio/msig/Hash.ts",
  "packages/sdk-core/src/contracts/sysio/msig/Proposal.ts",
  "packages/sdk-core/src/contracts/sysio/msig/Status.ts",
  "packages/sdk-core/src/contracts/sysio/msig/Transaction.ts",
  "packages/sdk-core/src/signing/SigningRequest.ts"
]
const InlineTypeLiteralDebtFiles = [
  "packages/sdk-core/src/Utils.ts",
  "packages/sdk-core/src/api/Client.ts",
  "packages/sdk-core/src/api/Provider.ts",
  "packages/sdk-core/src/api/Types.ts",
  "packages/sdk-core/src/api/v1/Chain.ts",
  "packages/sdk-core/src/api/v1/History.ts",
  "packages/sdk-core/src/api/v1/Types.ts",
  "packages/sdk-core/src/api/v2/Types.ts",
  "packages/sdk-core/src/chain/Abi.ts",
  "packages/sdk-core/src/chain/Action.ts",
  "packages/sdk-core/src/chain/Asset.ts",
  "packages/sdk-core/src/chain/Authority.ts",
  "packages/sdk-core/src/chain/BlockId.ts",
  "packages/sdk-core/src/chain/Bytes.ts",
  "packages/sdk-core/src/chain/Integer.ts",
  "packages/sdk-core/src/chain/PermissionLevel.ts",
  "packages/sdk-core/src/chain/PublicKey.ts",
  "packages/sdk-core/src/chain/Signature.ts",
  "packages/sdk-core/src/chain/Transaction.ts",
  "packages/sdk-core/src/common/Connect.ts",
  "packages/sdk-core/src/common/Types.ts",
  "packages/sdk-core/src/contracts/sysio/msig/Capabilities.ts",
  "packages/sdk-core/src/contracts/sysio/msig/Proposal.ts",
  "packages/sdk-core/src/contracts/sysio/msig/Status.ts",
  "packages/sdk-core/src/contracts/sysio/msig/Transaction.ts",
  "packages/sdk-core/src/contracts/sysio/msig/Types.ts",
  "packages/sdk-core/src/crypto/Curves.ts",
  "packages/sdk-core/src/p2p/Client.ts",
  "packages/sdk-core/src/p2p/Provider.ts",
  "packages/sdk-core/src/serializer/Builtins.ts",
  "packages/sdk-core/src/serializer/Decoder.ts",
  "packages/sdk-core/src/serializer/Encoder.ts",
  "packages/sdk-core/src/serializer/Serializable.ts",
  "packages/sdk-core/src/signing/SigningRequest.ts",
  "packages/sdk-core/src/types/SysioContractTypes.ts",
  "packages/sdk-core/tests/api/Provider.test.ts",
  "packages/sdk-core/tests/api/v1/Chain.test.ts",
  "packages/sdk-core/tests/chain/Integer.test.ts",
  "packages/sdk-core/tests/contracts/sysio/msig/Capabilities.test.ts",
  "packages/sdk-core/tests/crypto/crypto.test.ts",
  "packages/shared/src/guards/class.ts",
  "packages/shared/src/guards/guard-tools.ts",
  "packages/shared/src/guards/primitive.ts",
  "packages/shared/src/guards/types.ts",
  "packages/shared/src/logging/Formatter.ts",
  "packages/shared/src/logging/LogRecord.ts",
  "packages/shared/src/node/logging/appenders/FileAppender.ts",
  "packages/wallet-browser-ext/src/Types.ts",
  "packages/wallet-browser-ext/src/inject/Provider.ts",
  "packages/wallet-browser-ext/src/popup/slices/WalletSlice.ts",
  "packages/wallet-ext-sdk/src/Client.ts",
  "packages/wallet-ext-sdk/src/Types.ts"
]
const StringLiteralUnionDebtFiles = [
  "packages/sdk-core/src/api/Client.ts",
  "packages/sdk-core/src/api/Types.ts",
  "packages/sdk-core/src/api/v1/Types.ts",
  "packages/sdk-core/src/api/v2/Types.ts",
  "packages/sdk-core/src/chain/Bytes.ts",
  "packages/sdk-core/src/chain/Integer.ts",
  "packages/sdk-core/src/common/Logo.ts",
  "packages/sdk-core/src/contracts/Contract.ts",
  "packages/sdk-core/src/contracts/sysio/msig/Capabilities.ts",
  "packages/sdk-core/src/contracts/sysio/msig/Types.ts",
  "packages/shared/src/logging/context/LogContext.ts",
  "packages/wallet-browser-ext/src/popup/slices/WalletSlice.ts",
  "packages/wallet-ext-sdk/src/Types.ts"
]
const MemberCoalesceDebtFiles = [
  "packages/sdk-core/src/chain/Abi.ts",
  "packages/sdk-core/src/chain/PackedTransactionCompression.ts"
]

// Pre-existing NON-ban rule debt — same ratchet semantics: touch a listed
// file → fix its hits for that rule → DELETE its entry. Never add one.
const RuleDebt = [
  {
    rule: "@typescript-eslint/no-unused-vars",
    files: [
      "examples/web-logging-example/src/web-logging-example.ts",
      "packages/sdk-core/src/Utils.ts",
      "packages/sdk-core/src/chain/PrivateKey.ts",
      "packages/sdk-core/src/crypto/Sign.ts",
      "packages/sdk-core/tests/chain/Abi.test.ts",
      "packages/sdk-core/tests/chain/Asset.test.ts",
      "packages/sdk-core/tests/crypto/crypto.test.ts",
      "packages/shared/src/guards/guard-tools.ts",
      "packages/shared/src/guards/types.ts",
      "packages/shared/src/logging/InternalLogger.ts",
      "packages/shared/src/logging/appenders/ConsoleAppender.ts",
      "packages/shared/src/logging/appenders/aws-firehose/AWSFirehoseAppender.ts",
      "packages/shared/src/logging/appenders/push/PushLogRecordsAppender.ts",
      "packages/shared/src/logging/context/LogContext.ts",
      "packages/shared/src/logging/examples/example-file-appender.ts",
      "packages/shared/src/node/logging/appenders/FileAppender.ts",
      "packages/wallet-ext-sdk/src/Types.ts"
    ]
  },
  {
    rule: "eqeqeq",
    files: [
      "packages/sdk-core/src/Utils.ts",
      "packages/sdk-core/src/api/Client.ts",
      "packages/sdk-core/src/chain/Abi.ts",
      "packages/sdk-core/src/chain/Bytes.ts",
      "packages/sdk-core/src/chain/PublicKey.ts",
      "packages/sdk-core/src/crypto/Sign.ts"
    ]
  },
  {
    rule: "no-console",
    files: [
      "packages/sdk-core/src/chain/Signature.ts",
      "packages/shared/src/guards/assert.ts",
      "packages/shared/src/logging/Logger.ts",
      "packages/shared/src/logging/context/LogContextProvider.ts",
      "packages/shared/src/node/logging/appenders/FileAppender.ts"
    ]
  },
  {
    rule: "no-restricted-imports",
    files: [
      "packages/wallet-browser-ext/tests/Storage.test.ts",
      "packages/wallet-browser-ext/tests/Types.test.ts",
      "packages/wallet-browser-ext/tests/Validation.test.ts",
      "packages/wallet-browser-ext/tests/background/Background.test.ts"
    ]
  },
  {
    rule: "no-useless-assignment",
    files: [
      "packages/sdk-core/src/api/Client.ts",
      "packages/sdk-core/src/chain/PrivateKey.ts",
      "packages/shared/src/node/logging/appenders/FileAppender.ts"
    ]
  },
  {
    rule: "no-extra-boolean-cast",
    files: [
      "packages/shared/src/logging/appenders/aws-firehose/AWSFirehoseAppender.ts",
      "packages/shared/src/node/logging/appenders/FileAppender.ts"
    ]
  },
  {
    rule: "prefer-const",
    files: ["packages/shared/src/node/logging/appenders/FileAppender.ts"]
  },
  {
    rule: "@typescript-eslint/no-this-alias",
    files: ["packages/sdk-core/src/chain/Integer.ts"]
  },
  {
    rule: "@typescript-eslint/no-unsafe-function-type",
    files: [
      "packages/shared/src/guards/primitive.ts",
      "packages/shared/src/logging/appenders/ConsoleAppender.ts"
    ]
  },
  {
    rule: "@typescript-eslint/no-array-constructor",
    files: ["packages/shared/tests/guards/array.test.ts"]
  },
  {
    rule: "@typescript-eslint/no-wrapper-object-types",
    files: [
      "packages/sdk-core/src/chain/Asset.ts",
      "packages/sdk-core/tests/chain/Integer.test.ts",
      "packages/shared/src/guards/primitive.ts"
    ]
  }
]

// One config block per exemption signature: a debt file keeps every ban
// EXCEPT the one(s) it is grandfathered for. Computed, so the ratchet lists
// compose without a hand-maintained matrix.
const AllBans = [
  BanSwitch,
  BanInlineIife,
  BanNullUnionReturn,
  BanInlineTypeLiteral,
  BanPickParameter,
  BanStringLiteralUnion,
  BanAsOptionAwait,
  BanMemberCoalesceDeclarator,
  BanErrorMessageRestring,
  BanBareErrorInHandler
]
const DebtListsBySelector = [
  [BanSwitch.selector, SwitchDebtFiles],
  [BanInlineIife.selector, InlineIifeDebtFiles],
  [BanNullUnionReturn.selector, NullUnionReturnDebtFiles],
  [BanInlineTypeLiteral.selector, InlineTypeLiteralDebtFiles],
  [BanStringLiteralUnion.selector, StringLiteralUnionDebtFiles],
  [BanMemberCoalesceDeclarator.selector, MemberCoalesceDebtFiles]
]
const debtExemptionBlocks = (() => {
  const exemptionsByFile = new Map()
  DebtListsBySelector.forEach(([selector, files]) =>
    files.forEach(file => {
      if (!exemptionsByFile.has(file)) exemptionsByFile.set(file, new Set())
      exemptionsByFile.get(file).add(selector)
    })
  )
  const filesBySignature = new Map()
  exemptionsByFile.forEach((exempted, file) => {
    const signature = [...exempted].sort().join("|")
    if (!filesBySignature.has(signature)) filesBySignature.set(signature, [])
    filesBySignature.get(signature).push(file)
  })
  return [...filesBySignature.entries()].map(([signature, files]) => ({
    files,
    rules: {
      "no-restricted-syntax": [
        "error",
        ...AllBans.filter(ban => !signature.includes(ban.selector))
      ]
    }
  }))
})()

export default tseslint.config(
  {
    ignores: [
      "**/lib/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/*.d.ts",
      // TypeScript is the enforcement target: the style laws + tsconfig
      // govern .ts/.tsx. Plain JS (configs, .pnpmfile.cjs, Node CLI scripts —
      // whose console IS their user interface per the use-logging-framework.md
      // carve-out) is prettier/tsc territory.
      "**/*.js",
      "**/*.cjs",
      "**/*.mjs",
      "**/*.jsx",
      "scripts/**",
      "packages/*/scripts/**"
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "wire-local": wireLocalPlugin },
    rules: {
      // use-logging-framework.md: console is banned; the framework writes
      // through (jest buffers console.*). Carve-outs below.
      "no-console": "error",

      // prefer-lodash-identity.md: an `x => x` arrow IS lodash `identity`.
      "wire-local/no-identity-arrow": "error",

      "no-restricted-syntax": ["error", ...AllBans],

      // standard-names-not-invented.md: get-or-throw helpers are assert*,
      // NEVER require* (collides with the Node global; author standard).
      "id-match": [
        "error",
        "^(?!require[A-Z]).*$",
        { properties: false, classFields: false, onlyDeclarations: true }
      ],

      // STYLE.md "No src/ traversal in import/export — EVER".
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/src/*", "**/src"],
              message:
                "No src/ in import specifiers — use the package alias or the barrel (STYLE.md 'No src/ traversal')."
            }
          ]
        }
      ],

      // prefer-null-over-undefined.md prescribes `!= null` as the guard —
      // eqeqeq must not fight it.
      eqeqeq: ["error", "always", { null: "ignore" }],

      // `any` OFF by design (author directive, 2026-07-21; parity with
      // wire-tools-ts): the explicit `any` in this codebase is strongly-typed
      // usage — generic type arguments (`IMessageType<any>` accepts any
      // conforming message class), boundary casts, rest args (`...args: any[]`),
      // and generic defaults — NOT lazy typing. `no-explicit-any` is blunt: no
      // option distinguishes a type-argument `any` from a lazy `x: any`, so
      // allowing those legitimate patterns globally means the rule is off. The
      // precise-types discipline (no `any`/`unknown` where a real type exists)
      // stays enforced by precise-types-no-unknown-shortcut.md + review.
      "@typescript-eslint/no-explicit-any": "off",

      // Defaults that fight house idioms or the loose tsconfig.
      "@typescript-eslint/no-namespace": "off", // companion namespaces ARE the style
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      "@typescript-eslint/no-require-imports": "off", // CJS package family
      // Off deliberately: the house style USES empty object shapes as
      // semantic structure — `interface FooConfig extends Required<FooOptions>
      // {}` (STYLE.md three-layer options) and `{}` generic defaults.
      "@typescript-eslint/no-empty-object-type": "off",
      // nested-error-preserve-cause.md (author law, 2026-07-21): a catch clause
      // that rethrows a bare Error SWALLOWS the original (its message + stack).
      // Preserve it as `{ cause }` — pair with NestedError for the
      // { cause, context } form.
      "preserve-caught-error": "error",
      "prefer-const": "error",
      "no-var": "error"
    }
  },
  ...debtExemptionBlocks,
  // Non-ban rule debt blocks (later blocks win, so "off" overrides the base).
  ...RuleDebt.map(({ rule, files }) => ({ files, rules: { [rule]: "off" } })),
  {
    // Browser-context code (the wallet extension UI + web helpers): console
    // lands in the browser devtools, which IS the diagnostic surface there —
    // the Node-side logging framework does not apply. ConsoleAppender IS the
    // framework's console sink, and logging/examples are runnable demo
    // scripts whose console is their user interface.
    files: [
      "packages/wallet-browser-ext/src/**",
      "packages/shared-web/src/**",
      "packages/*/src/bin/**",
      "packages/*/bin/**",
      "**/logging/appenders/ConsoleAppender.ts",
      "**/logging/examples/**"
    ],
    rules: { "no-console": "off" }
  },
  {
    // The sanctioned raw-stream homes (per-file-logger-and-std-streams.md):
    // the routing/file appenders + logger setup — plus the tests that stub or
    // assert ON those streams by design.
    files: [
      "**/logging/*Appender.ts",
      "**/logger.ts",
      "**/logging/logger.ts",
      "**/tests/logging/*Appender.test.ts",
      "**/tests/jest.setup.ts"
    ],
    rules: { "no-restricted-properties": "off" }
  },
  prettier
)
