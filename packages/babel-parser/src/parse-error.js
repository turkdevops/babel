// @flow

import { Position } from "./util/location";
import type { NodeBase } from "./types";
import {
  instantiate,
  type ParseErrorCode,
  ParseErrorCodes,
  type ParseErrorCredentials,
} from "./parse-error/credentials";

// Babel uses "normal" SyntaxErrors for it's errors, but adds some extra
// functionality. This functionality is defined in the
// `ParseErrorSpecification` interface below. We may choose to change to someday
// give our errors their own full-blown class, but until then this allow us to
// keep all the desirable properties of SyntaxErrors (like their name in stack
// traces, etc.), and also allows us to punt on any publicly facing
// class-hierarchy decisions until Babel 8.
interface ParseErrorSpecification<ErrorDetails> {
  // Look, these *could* be readonly, but then Flow complains when we initially
  // set them. We could do a whole dance and make a special interface that's not
  // readonly for when we create the error, then cast it to the readonly
  // interface for public use, but the previous implementation didn't have them
  // as readonly, so let's just not worry about it for now.
  code: ParseErrorCode;
  reasonCode: string;
  syntaxPlugin?: string;

  missingPlugin?: string | string[];

  loc: Position;
  details: ErrorDetails;

  // We should consider removing this as it now just contains the same
  // information as `loc.index`.
  // pos: number;
}

export type ParseError<ErrorDetails> = SyntaxError &
  ParseErrorSpecification<ErrorDetails>;

// By `ParseErrorConstructor`, we mean something like the new-less style
// `ErrorConstructor`[1], since `ParseError`'s are not themselves actually
// separate classes from `SyntaxError`'s.
//
// 1. https://github.com/microsoft/TypeScript/blob/v4.5.5/lib/lib.es5.d.ts#L1027
export type ParseErrorConstructor<ErrorDetails> = ({
  loc: Position,
  details: ErrorDetails,
}) => ParseError<ErrorDetails>;

function toParseErrorConstructor<ErrorDetails: Object>({
  toMessage,
  ...properties
}: ParseErrorCredentials<ErrorDetails>): ParseErrorConstructor<ErrorDetails> {
  type ConstructorArgument = { loc: Position, details: ErrorDetails };
  return function constructor({ loc, details }: ConstructorArgument) {
    return instantiate<ParseError<ErrorDetails>>(
      SyntaxError,
      { ...properties, loc },
      {
        clone(overrides: { loc?: Position, details?: ErrorDetails } = {}) {
          const loc = overrides.loc || {};
          return constructor({
            loc: new Position(
              "line" in loc ? loc.line : this.loc.line,
              "column" in loc ? loc.column : this.loc.column,
              "index" in loc ? loc.index : this.loc.index,
            ),
            details: { ...this.details, ...overrides.details },
          });
        },
        details: { value: details, enumerable: false },
        message: {
          get() {
            return `${toMessage(this.details)} (${this.loc.line}:${
              this.loc.column
            })`;
          },
          set(value: string) {
            Object.defineProperty(this, "message", { value });
          },
        },
        pos: { reflect: "loc.index", enumerable: true },
        missingPlugin: "missingPlugin" in details && {
          reflect: "details.missingPlugin",
          enumerable: true,
        },
      },
    );
  };
}

// This part is tricky. You'll probably notice from the name of this function
// that it is supposed to return `ParseErrorCredentials`, but instead these.
// declarations seem to instead imply that they return
// `ParseErrorConstructor<ErrorDetails>` instead. This is because in Flow we
// can't easily extract parameter types (either from functions, like with
// Typescript's Parameters<f> utility type, or from generic types either). As
// such, this function does double duty: packaging up the credentials during
// its actual runtime operation, but pretending to return the
// `ParseErrorConstructor<ErrorDetails>` that we won't actually have until later
// to the type system, avoiding the need to do so with $ObjMap (which doesn't
// work) in `ParseErrorEnum`. This hack won't be necessary when we switch to
// Typescript.
declare function toParseErrorCredentials<T: string>(
  T,
  ?{ code?: ParseErrorCode, reasonCode?: string } | boolean,
): ParseErrorConstructor<{||}>;

// ESLint seems to erroneously think that Flow's overloading syntax is an
// accidental redeclaration of the function:
// https://github.com/babel/eslint-plugin-babel/issues/162
// eslint-disable-next-line no-redeclare
declare function toParseErrorCredentials<ErrorDetails>(
  (ErrorDetails) => string,
  ?{ code?: ParseErrorCode, reasonCode?: string } | boolean,
): ParseErrorConstructor<ErrorDetails>;

// See comment about eslint and Flow overloading above.
// eslint-disable-next-line no-redeclare
export function toParseErrorCredentials(toMessageOrMessage, credentials) {
  return {
    toMessage:
      typeof toMessageOrMessage === "string"
        ? () => toMessageOrMessage
        : toMessageOrMessage,
    ...credentials,
  };
}

// This is the templated form.
declare function ParseErrorEnum(string[]): typeof ParseErrorEnum;

// See comment about eslint and Flow overloading above.
// eslint-disable-next-line no-redeclare
declare function ParseErrorEnum<T>(
  toParseErrorCredentials: (typeof toParseErrorCredentials) => T,
  syntaxPlugin?: string,
): T;

// You call `ParseErrorEnum` with a mapping from `ReasonCode`'s to either error
// messages, or `toMessage` functions that define additional necessary `details`
// needed by the `ParseError`:
//
// ParseErrorEnum`optionalSyntaxPlugin` (_ => ({
//   ErrorWithStaticMessage: _("message"),
//   ErrorWithDynamicMessage: _<{ type: string }>(({ type }) => `${type}`),
// });
//
// See comment about eslint and Flow overloading above.
// eslint-disable-next-line no-redeclare
export function ParseErrorEnum(argument, syntaxPlugin) {
  // If the first parameter is an array, that means we were called with a tagged
  // template literal. Extract the syntaxPlugin from this, and call again in
  // the "normalized" form.
  if (Array.isArray(argument)) {
    return toParseErrorCredentialsMap =>
      ParseErrorEnum(toParseErrorCredentialsMap, argument[0]);
  }

  const partialCredentials = argument(toParseErrorCredentials);
  const ParseErrorConstructors = {};

  for (const reasonCode of Object.keys(partialCredentials)) {
    ParseErrorConstructors[reasonCode] = toParseErrorConstructor({
      code: ParseErrorCodes.SyntaxError,
      reasonCode,
      ...(syntaxPlugin ? { syntaxPlugin } : {}),
      ...partialCredentials[reasonCode],
    });
  }

  return ParseErrorConstructors;
}

export type RaiseProperties<ErrorDetails> = {|
  ...ErrorDetails,
  at: Position | NodeBase,
|};

import ModuleErrors from "./parse-error/module-errors";
import StandardErrors from "./parse-error/standard-errors";
import StrictModeErrors from "./parse-error/strict-mode-errors";
import PipelineOperatorErrors from "./parse-error/pipeline-operator-errors";

export const Errors = {
  ...ParseErrorEnum(ModuleErrors),
  ...ParseErrorEnum(StandardErrors),
  ...ParseErrorEnum(StrictModeErrors),
  ...ParseErrorEnum`pipelineOperator`(PipelineOperatorErrors),
};

export type { LValAncestor } from "./parse-error/standard-errors";

export * from "./parse-error/credentials";
