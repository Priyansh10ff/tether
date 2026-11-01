import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ["node_modules/**", ".next/**", "drizzle/**", "packages/*/dist/**", "load/**", "examples/**", "bin/**", "src/components/landing-runtime.js", "next-env.d.ts"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Server components render once per request on the server; reading the clock there is intended.
    files: ["src/app/**/page.tsx", "src/app/**/layout.tsx", "src/app/**/route.ts"],
    rules: { "react-hooks/purity": "off" },
  },
];

export default config;
