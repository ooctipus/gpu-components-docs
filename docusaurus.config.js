// @ts-check
const { themes } = require("prism-react-renderer");

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "GPU Components",
  tagline: "GPU-resident world directory, growable typed storage, virtual-memory backing, and count-driven graph replay",
  url: "https://ooctipus.github.io",
  baseUrl: "/gpu-components-docs/",
  organizationName: "ooctipus",
  projectName: "gpu-components-docs",
  trailingSlash: false,
  onBrokenLinks: "throw",
  markdown: { mermaid: true },
  themes: ["@docusaurus/theme-mermaid"],
  clientModules: [require.resolve("./src/clientModules/widgets.js")],
  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: { routeBasePath: "/", sidebarPath: require.resolve("./sidebars.js") },
        blog: false,
        theme: { customCss: require.resolve("./src/css/custom.css") },
      }),
    ],
  ],
  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: { defaultMode: "light", respectPrefersColorScheme: true },
      navbar: {
        title: "GPU Components",
        items: [
          { to: "/", label: "Docs", position: "left" },
          { to: "/api/directory", label: "API", position: "left" },
          { href: "https://github.com/ooctipus/gpu-components-docs", label: "GitHub", position: "right" },
        ],
      },
      footer: { style: "dark", copyright: "Apache-2.0. The package source is private; this site holds its documentation." },
      prism: { theme: themes.github, darkTheme: themes.dracula, additionalLanguages: ["bash", "python"] },
      mermaid: { theme: { light: "neutral", dark: "dark" } },
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
    }),
};

module.exports = config;
