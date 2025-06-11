module.exports = {
  env: {
    es2020: true,
    node: true,
    jest: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
  extends: ["eslint:recommended"],
  rules: {
    "indent": ["error", 2],
    quotes: ["error", "double", {avoidEscape: true}],
    semi: ["error", "always"],
    "require-jsdoc": "off",
    "object-curly-spacing": ["error", "never"],
    "no-unused-vars": ["warn"],
  },
};
