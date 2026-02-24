import js from "@eslint/js";
import globals from "globals";

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.webextensions,
                ...globals.jest,
                ...globals.node,
            },
        },
        rules: {
            "no-console": "off",
            "no-unused-vars": "warn",
            "indent": ["error", 4],
            "quotes": ["error", "single"],
            "semi": ["error", "always"],
        },
    },
];
