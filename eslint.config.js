import nextPlugin from "eslint-config-next";
import securityPlugin from "eslint-plugin-security";
import tseslint from "typescript-eslint";

export default [
  { ignores: [".next/", "node_modules/", "out/", "*.config.js"] },
  // Use eslint-config-next but override React settings to avoid version detection issues
  ...nextPlugin.map((config) => {
    if (config.settings?.react?.version === "detect") {
      return {
        ...config,
        settings: {
          ...config.settings,
          react: {
            version: "19.1",
          },
        },
      };
    }
    return config;
  }),
  {
    plugins: {
      security: securityPlugin,
    },
    rules: {
      ...securityPlugin.configs.recommended.rules,
      "security/detect-object-injection": "warn",
      "security/detect-non-literal-regexp": "error",
      "security/detect-unsafe-regex": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-child-process": "error",
    },
  },
  ...tseslint.configs.recommended,
];