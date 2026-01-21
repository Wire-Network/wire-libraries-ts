const path = require("path");

module.exports = {
  mode: "development",
  entry: "./src/index.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js"
  },
  devServer: {
    static: { directory: path.join(__dirname, "public") },
    port: 8080,
    host: "0.0.0.0",
    hot: false
  }
};
