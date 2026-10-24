import tseslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";

export default [
  {
    files: ["**/*.ts", "**/*.tsx", "**/.ts"]],
    languageOptions: {
      parser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: 2022,
        target: ["es2022", "dom"],
        project: true,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/strict-boolean-expressions": "off",
    },
  },
  {
    files: ["**/*.mjs", "**/.mjs"]],
    languageOptions: {
      sourceType: "module",
    },
  },
  {
    files: ["**/*.js", "**/.js"]],
    languageOptions: {
      sourceType: "module",
    },
  },
  {
    files: ["**/*.jsx", "**/.jsx"]],
    languageOptions: {
      sourceType: "module",
    },
  },
];