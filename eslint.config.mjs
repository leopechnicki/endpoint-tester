import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/", "tests/", "node_modules/"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
