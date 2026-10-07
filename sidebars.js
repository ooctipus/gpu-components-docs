/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
module.exports = {
  docs: [
    "index",
    "alternatives",
    "lineage",
    "vocabulary",
    "structure",
    { type: "category", label: "Concepts", collapsed: false, items: ["concepts/handles", "concepts/memory", "concepts/quantities", "concepts/lifecycle", "concepts/replay"] },
    "quickstart",
    "tutorial",
    {
      type: "category",
      label: "Integration",
      link: { type: "doc", id: "integration" },
      collapsed: false,
      items: ["integration/warp"],
    },
    { type: "category", label: "API", collapsed: false, items: ["api/directory", "api/fields", "api/backing", "api/graph"] },
    "invariants",
    "background",
    "qualification",
  ],
};
