// @ts-check
import eslint from "@eslint/js";
import { flatConfigs as importX } from "eslint-plugin-import-x";
import { config as defineConfig, configs as tsConfigs } from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "**/node_modules/",
      "**/dist/",
      "**/coverage/",
      "**/.wrangler/",
      "apps/worker/worker-configuration.d.ts",
      "playwright-report/",
      "test-results/",
    ],
  },
  eslint.configs.recommended,
  tsConfigs.strictTypeChecked,
  tsConfigs.stylisticTypeChecked,
  importX.recommended,
  importX.typescript,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      "import-x/resolver": {
        typescript: true,
        node: true,
      },
      "import-x/core-modules": ["cloudflare:test", "cloudflare:workers"],
    },
    rules: {
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import-x/no-duplicates": "error",
      // Numbers interpolate deterministically; forbidding them adds String() noise for no safety.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // TypeScript itself reports undefined identifiers; no-undef false-positives on
      // runtime globals like console/crypto in Workers code (typescript-eslint FAQ).
      "no-undef": "off",
    },
  },
  {
    files: ["**/*.{js,mjs}"],
    extends: [tsConfigs.disableTypeChecked],
  },
);
