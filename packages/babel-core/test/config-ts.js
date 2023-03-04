import { loadPartialConfigSync } from "../lib/index.js";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import semver from "semver";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// We skip older versions of node testing for two reasons.
// 1. ts-node does not support the old version of node.
// 2. In the old version of node, jest has been registered in `require.extensions`, which will cause babel to disable the transforming as expected.

const lessThanNode12 = semver.lt(process.version, "12.0.0");

(lessThanNode12 ? describe : describe.skip)(
  "@babel/core config with ts [dummy]",
  () => {
    it("dummy", () => {
      expect(1).toBe(1);
    });
  },
);

(lessThanNode12 ? describe.skip : describe)(
  "@babel/core config with ts",
  () => {
    it("should work with simple .cts", () => {
      const config = loadPartialConfigSync({
        configFile: path.join(
          __dirname,
          "fixtures/config-ts/simple-cts/babel.config.cts",
        ),
      });

      expect(config.options.targets).toMatchInlineSnapshot(`
          Object {
            "node": "12.0.0",
          }
        `);
    });

    it("should throw with invalid .ts register", () => {
      require.extensions[".ts"] = () => {
        throw new Error("Not support .ts.");
      };
      try {
        expect(() => {
          loadPartialConfigSync({
            configFile: path.join(
              __dirname,
              "fixtures/config-ts/invalid-cts-register/babel.config.cts",
            ),
          });
        }).toThrow(/Unexpected identifier.*/);
      } finally {
        delete require.extensions[".ts"];
      }
    });

    it("should work with ts-node", async () => {
      const service = require("ts-node").register({
        experimentalResolver: true,
        compilerOptions: {
          module: "CommonJS",
        },
      });
      service.enabled(true);

      try {
        require(path.join(
          __dirname,
          "fixtures/config-ts/simple-cts-with-ts-node/babel.config.cts",
        ));

        const config = loadPartialConfigSync({
          configFile: path.join(
            __dirname,
            "fixtures/config-ts/simple-cts-with-ts-node/babel.config.cts",
          ),
        });

        expect(config.options.targets).toMatchInlineSnapshot(`
            Object {
              "node": "12.0.0",
            }
          `);
      } finally {
        service.enabled(false);
      }
    });
  },
);
