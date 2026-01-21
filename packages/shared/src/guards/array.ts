export function isArray(
  o: unknown
): o is Array<typeof o extends Array<infer T> ? T : any> {
  return Array.isArray(o)
}
