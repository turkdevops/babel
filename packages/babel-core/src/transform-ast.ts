import gensync, { type Handler } from "gensync";

import loadConfig from "./config";
import type { InputOptions, ResolvedConfig } from "./config";
import { run } from "./transformation";
import type * as t from "@babel/types";

import type { FileResult, FileResultCallback } from "./transformation";
type AstRoot = t.File | t.Program;

type TransformFromAst = {
  (ast: AstRoot, code: string, callback: FileResultCallback): void;
  (
    ast: AstRoot,
    code: string,
    opts: InputOptions | undefined | null,
    callback: FileResultCallback,
  ): void;
  (ast: AstRoot, code: string, opts?: InputOptions | null): FileResult | null;
};

const transformFromAstRunner = gensync(function* (
  ast: AstRoot,
  code: string,
  opts: InputOptions | undefined | null,
): Handler<FileResult | null> {
  const config: ResolvedConfig | null = yield* loadConfig(opts);
  if (config === null) return null;

  if (!ast) throw new Error("No AST given");

  return yield* run(config, code, ast);
});

export const transformFromAst: TransformFromAst = function transformFromAst(
  ast,
  code,
  optsOrCallback?: InputOptions | null | undefined | FileResultCallback,
  maybeCallback?: FileResultCallback,
) {
  let opts: InputOptions | undefined | null;
  let callback: FileResultCallback | undefined;
  if (typeof optsOrCallback === "function") {
    callback = optsOrCallback;
    opts = undefined;
  } else {
    opts = optsOrCallback;
    callback = maybeCallback;
  }

  if (callback === undefined) {
    if (process.env.BABEL_8_BREAKING) {
      throw new Error(
        "Starting from Babel 8.0.0, the 'transformFromAst' function expects a callback. If you need to call it synchronously, please use 'transformFromAstSync'.",
      );
    } else {
      // console.warn(
      //   "Starting from Babel 8.0.0, the 'transformFromAst' function will expect a callback. If you need to call it synchronously, please use 'transformFromAstSync'.",
      // );
      return transformFromAstRunner.sync(ast, code, opts);
    }
  }

  transformFromAstRunner.errback(ast, code, opts, callback);
};

export const transformFromAstSync = transformFromAstRunner.sync;
export const transformFromAstAsync = transformFromAstRunner.async;
