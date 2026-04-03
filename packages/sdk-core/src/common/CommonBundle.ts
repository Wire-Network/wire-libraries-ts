import * as pkg from "../index.js"
const Common = {}

for (const key of Object.keys(pkg)) {
  if (key === "default") continue
  Common[key] = pkg[key]
}

export default Common
