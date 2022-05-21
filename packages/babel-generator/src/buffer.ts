import type SourceMap from "./source-map";
import type * as t from "@babel/types";
import * as charcodes from "charcodes";

type Pos = {
  line: number;
  column: number;
};
type Loc = {
  start?: Pos;
  end?: Pos;
  identifierName?: string;
  filename?: string;
};
type SourcePos = {
  identifierName: string | undefined;
  line: number | undefined;
  column: number | undefined;
  filename: string | undefined;
};

function SourcePos(): SourcePos {
  return {
    identifierName: undefined,
    line: undefined,
    column: undefined,
    filename: undefined,
  };
}

const SPACES_RE = /^[ \t]+$/;
export default class Buffer {
  constructor(map?: SourceMap | null) {
    this._map = map;
  }

  _map: SourceMap = null;
  _buf = "";
  _last = 0;
  _queue: Parameters<Buffer["_append"]>[] = [];

  _position = {
    line: 1,
    column: 0,
  };
  _sourcePosition = SourcePos();
  _disallowedPop: SourcePos | null = null;

  /**
   * Get the final string output from the buffer, along with the sourcemap if one exists.
   */

  get() {
    this._flush();

    const map = this._map;
    const result = {
      // Whatever trim is used here should not execute a regex against the
      // source string since it may be arbitrarily large after all transformations
      code: this._buf.trimRight(),
      // Decoded sourcemap is free to generate.
      decodedMap: map?.getDecoded(),

      // Encoding the sourcemap is moderately CPU expensive.
      get map() {
        return (result.map = map ? map.get() : null);
      },
      set map(value) {
        Object.defineProperty(result, "map", { value, writable: true });
      },
      // Retrieving the raw mappings is very memory intensive.
      get rawMappings() {
        return (result.rawMappings = map?.getRawMappings());
      },
      set rawMappings(value) {
        Object.defineProperty(result, "rawMappings", { value, writable: true });
      },
    };

    return result;
  }

  /**
   * Add a string to the buffer that cannot be reverted.
   */

  append(str: string): void {
    this._flush();
    const { line, column, filename, identifierName } = this._sourcePosition;
    this._append(str, line, column, identifierName, filename);
  }

  /**
   * Add a string to the buffer than can be reverted.
   */
  queue(str: string): void {
    // Drop trailing spaces when a newline is inserted.
    if (str === "\n") {
      while (this._queue.length > 0 && SPACES_RE.test(this._queue[0][0])) {
        this._queue.shift();
      }
    }

    const { line, column, filename, identifierName } = this._sourcePosition;
    this._queue.unshift([str, line, column, identifierName, filename]);
  }

  /**
   * Same as queue, but this indentation will never have a sourcmap marker.
   */
  queueIndentation(str: string): void {
    this._queue.unshift([str, undefined, undefined, undefined, undefined]);
  }

  _flush(): void {
    let item: Parameters<Buffer["_append"]>;
    while ((item = this._queue.pop())) {
      this._append(...item);
    }
  }

  _append(
    str: string,
    line: number | undefined,
    column: number | undefined,
    identifierName: string | undefined,
    filename: string | undefined,
  ): void {
    this._buf += str;
    this._last = str.charCodeAt(str.length - 1);

    // Search for newline chars. We search only for `\n`, since both `\r` and
    // `\r\n` are normalized to `\n` during parse. We exclude `\u2028` and
    // `\u2029` for performance reasons, they're so uncommon that it's probably
    // ok. It's also unclear how other sourcemap utilities handle them...
    let i = str.indexOf("\n");
    let last = 0;

    // If the string starts with a newline char, then adding a mark is redundant.
    // This catches both "no newlines" and "newline after several chars".
    if (i !== 0) {
      this._mark(line, column, identifierName, filename);
    }

    // Now, find each reamining newline char in the string.
    while (i !== -1) {
      this._position.line++;
      this._position.column = 0;
      last = i + 1;

      // We mark the start of each line, which happens directly after this newline char
      // unless this is the last char.
      if (last < str.length) {
        this._mark(++line, 0, identifierName, filename);
      }
      i = str.indexOf("\n", last);
    }
    this._position.column += str.length - last;
  }

  _mark(
    line: number | undefined,
    column: number | undefined,
    identifierName: string | undefined,
    filename: string | undefined,
  ): void {
    this._map?.mark(this._position, line, column, identifierName, filename);
  }

  removeTrailingNewline(): void {
    if (this._queue.length > 0 && this._queue[0][0] === "\n") {
      this._queue.shift();
    }
  }

  removeLastSemicolon(): void {
    if (this._queue.length > 0 && this._queue[0][0] === ";") {
      this._queue.shift();
    }
  }

  getLastChar(): number {
    let last;
    if (this._queue.length > 0) {
      const str = this._queue[0][0];
      last = str.charCodeAt(0);
    } else {
      last = this._last;
    }
    return last;
  }

  /**
   * check if current _last + queue ends with newline, return the character before newline
   *
   * @param {*} ch
   * @memberof Buffer
   */
  endsWithCharAndNewline(): number {
    const queue = this._queue;
    if (queue.length > 0) {
      const last = queue[0][0];
      // every element in queue is one-length whitespace string
      const lastCp = last.charCodeAt(0);
      if (lastCp !== charcodes.lineFeed) return;
      if (queue.length > 1) {
        const secondLast = queue[1][0];
        return secondLast.charCodeAt(0);
      } else {
        return this._last;
      }
    }
    // We assume that everything being matched is at most a single token plus some whitespace,
    // which everything currently is, but otherwise we'd have to expand _last or check _buf.
  }

  hasContent(): boolean {
    return this._queue.length > 0 || !!this._last;
  }

  /**
   * Certain sourcemap usecases expect mappings to be more accurate than
   * Babel's generic sourcemap handling allows. For now, we special-case
   * identifiers to allow for the primary cases to work.
   * The goal of this line is to ensure that the map output from Babel will
   * have an exact range on identifiers in the output code. Without this
   * line, Babel would potentially include some number of trailing tokens
   * that are printed after the identifier, but before another location has
   * been assigned.
   * This allows tooling like Rollup and Webpack to more accurately perform
   * their own transformations. Most importantly, this allows the import/export
   * transformations performed by those tools to loose less information when
   * applying their own transformations on top of the code and map results
   * generated by Babel itself.
   *
   * The primary example of this is the snippet:
   *
   *   import mod from "mod";
   *   mod();
   *
   * With this line, there will be one mapping range over "mod" and another
   * over "();", where previously it would have been a single mapping.
   */
  exactSource(loc: any, cb: () => void) {
    this.source("start", loc);

    cb();

    // In cases where tokens are printed after this item, we want to
    // ensure that they get the location of the _end_ of the identifier.
    // To accomplish this, we assign the location and explicitly disable
    // the standard Buffer withSource previous-position "reactivation"
    // logic. This means that if another item calls '.source()' to set
    // the location after the identifier, it is fine, but the position won't
    // be automatically replaced with the previous value.
    this.source("end", loc);
    this._disallowPop("start", loc);
  }

  /**
   * Sets a given position as the current source location so generated code after this call
   * will be given this position in the sourcemap.
   */

  source(prop: string, loc: t.SourceLocation): void {
    if (prop && !loc) return;

    // Since this is called extremely often, we re-use the same _sourcePosition
    // object for the whole lifetime of the buffer.
    this._normalizePosition(prop, loc, this._sourcePosition);
  }

  /**
   * Call a callback with a specific source location and restore on completion.
   */

  withSource(prop: string, loc: t.SourceLocation, cb: () => void): void {
    if (!this._map) return cb();

    // Use the call stack to manage a stack of "source location" data because
    // the _sourcePosition object is mutated over the course of code generation,
    // and constantly copying it would be slower.
    const originalLine = this._sourcePosition.line;
    const originalColumn = this._sourcePosition.column;
    const originalFilename = this._sourcePosition.filename;
    const originalIdentifierName = this._sourcePosition.identifierName;

    this.source(prop, loc);

    cb();

    if (
      // Verify if reactivating this specific position has been disallowed.
      !this._disallowedPop ||
      this._disallowedPop.line !== originalLine ||
      this._disallowedPop.column !== originalColumn ||
      this._disallowedPop.filename !== originalFilename
    ) {
      this._sourcePosition.line = originalLine;
      this._sourcePosition.column = originalColumn;
      this._sourcePosition.filename = originalFilename;
      this._sourcePosition.identifierName = originalIdentifierName;
      this._disallowedPop = null;
    }
  }

  /**
   * Allow printers to disable the default location-reset behavior of the
   * sourcemap output, so that certain printers can be sure that the
   * "end" location that they set is actually treated as the end position.
   */
  _disallowPop(prop: string, loc: t.SourceLocation) {
    if (prop && !loc) return;

    this._disallowedPop = this._normalizePosition(prop, loc, SourcePos());
  }

  _normalizePosition(
    prop: string,
    loc: Loc | undefined | null,
    targetObj: SourcePos,
  ) {
    const pos = loc ? loc[prop] : null;

    targetObj.identifierName =
      (prop === "start" && loc?.identifierName) || undefined;
    targetObj.line = pos?.line;
    targetObj.column = pos?.column;
    targetObj.filename = loc?.filename;

    return targetObj;
  }

  getCurrentColumn(): number {
    const extra = this._queue.reduce((acc, item) => item[0] + acc, "");
    const lastIndex = extra.lastIndexOf("\n");

    return lastIndex === -1
      ? this._position.column + extra.length
      : extra.length - 1 - lastIndex;
  }

  getCurrentLine(): number {
    const extra = this._queue.reduce((acc, item) => item[0] + acc, "");

    let count = 0;
    for (let i = 0; i < extra.length; i++) {
      if (extra[i] === "\n") count++;
    }

    return this._position.line + count;
  }
}
