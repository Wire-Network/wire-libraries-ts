const path = require("path");
const webpack = require("webpack");

const WIRE_PUSH_URL = process.env.WIRE_PUSH_URL;
if (!WIRE_PUSH_URL || !WIRE_PUSH_URL.trim().length) {
  console.error("Error: WIRE_PUSH_URL environment variable is required");
  process.exit(1);
}

module.exports = {
  mode: "development",
  entry: "./src/index.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js"
  },
  resolve: {
    extensions: [".ts", ".js"]
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/
      }
    ]
  },
  devServer: {
    static: { directory: path.join(__dirname, "public") },
    port: 9090,
    host: "0.0.0.0",
    hot: false
  },
  plugins: [
    new webpack.DefinePlugin({
      WIRE_PUSH_URL: JSON.stringify(WIRE_PUSH_URL)
    })
  ]
};
