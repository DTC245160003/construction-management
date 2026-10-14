const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
    {
        ignores: ["coverage/**"]
    },
    js.configs.recommended,
    {
        files: ["**/*.{js,cjs}"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "commonjs",
            globals: globals.node
        }
    },
    {
        files: ["tests/**/*.test.js"],
        languageOptions: {
            globals: globals.jest
        }
    }
];
