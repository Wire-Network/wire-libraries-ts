import path from "path"
import webpack from "webpack"
import { fileURLToPath } from "url"
import CopyPlugin from "copy-webpack-plugin"
import HtmlWebpackPlugin from "html-webpack-plugin"
import MiniCssExtractPlugin from "mini-css-extract-plugin"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default (_, argv) => ({
  entry: {
    background: "./src/background/index.ts",
    content: "./src/content/index.ts",
    inject: "./src/inject/Provider.ts",
    popup: "./src/popup/index.tsx",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
    globalObject: "globalThis",
  },
  devtool: argv.mode === "development" ? "cheap-module-source-map" : false,
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    alias: {
      // hash.js/elliptic use a `global` polyfill that calls
      // new Function("return this") — forbidden in MV3 extensions
      [path.resolve(__dirname, "node_modules", "global")]:
        path.resolve(__dirname, "src", "shims", "GlobalShim.ts"),
    },
    fallback: {
      crypto: false,
      buffer: false,
    },
  },
  node: false,
  module: {
    rules: [
      { test: /\.tsx?$/, use: "ts-loader", exclude: /node_modules/ },
      { test: /\.css$/, use: [MiniCssExtractPlugin.loader, "css-loader"] },
      { test: /\.svg$/, type: "asset/source" },
      { test: /\.js$/, resolve: { fullySpecified: false } },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      "process.env.NODE_ENV": JSON.stringify("production"),
    }),
    new CopyPlugin({
      patterns: [
        { from: "manifest.json", to: "manifest.json" },
        { from: "icons", to: "icons" },
      ],
    }),
    new HtmlWebpackPlugin({
      template: "./src/popup/index.html",
      filename: "popup.html",
      chunks: ["popup"],
    }),
    new MiniCssExtractPlugin({ filename: "[name].css" }),
  ],
  optimization: { splitChunks: false },
})
