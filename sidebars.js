/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
module.exports = {
  docs: [
    "index",
    "vocabulary",
    "structure",
    { type: "category", label: "Concepts", collapsed: false, items: ["concepts/handles", "concepts/memory", "concepts/quantities", "concepts/lifecycle", "concepts/replay"] },
    "quickstart",
    "tutorial",
    { type: "category", label: "API", collapsed: false, items: ["api/directory", "api/fields", "api/backing", "api/graph"] },
    "invariants",
    "background",
    "qualification",
  ],
};
