import { resolve } from "node:path"
import ts from "typescript"

/** Check published declarations without the repository's non-strict path aliases. */
test.each(["cjs", "esm"])(
  "%s declarations require an empty discovery result to be handled",
  format => {
    const filename = resolve(__dirname, "table-format-consumer.ts")
    const source = `
      import type { APIClient } from "../../../lib/${format}/api/Client.js"
      import type { TableRowsFormat } from "../../../lib/${format}/api/v1/Types.js"

      declare const client: APIClient

      async function readFormat(): Promise<string> {
        const result = await client.v1.chain.getTableRowsFormat({
          code: "usr.contract", table: "settings"
        })
        const empty: typeof result = undefined
        // @ts-expect-error A terminal empty probe has no format.
        result.toLowerCase()
        if (result !== undefined) {
          const known: TableRowsFormat = result
          return known.toLowerCase()
        }
        return "empty"
      }
    `
    const options: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      types: []
    }
    const host = ts.createCompilerHost(options)
    const getSourceFile = host.getSourceFile.bind(host)
    host.getSourceFile = (path, ...args) =>
      path === filename
        ? ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true)
        : getSourceFile(path, ...args)
    const program = ts.createProgram([filename], options, host)
    expect(
      ts.getPreEmitDiagnostics(program).map(diagnostic =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
      )
    ).toEqual([])
  }
)
