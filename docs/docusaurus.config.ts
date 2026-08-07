import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Clipcat',
  tagline: 'Your clipboard, always at hand.',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://d3ucey.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/Clipcat/',

  // GitHub pages deployment config.
  organizationName: 'd3uceY',
  projectName: 'Clipcat',

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'ignore',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  themes: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        language: ['en'],
        indexDocs: true,
        indexPages: false,
        docsRouteBasePath: '/docs',
        searchBarPosition: 'right',
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/d3uceY/Clipcat/tree/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/app-screenshot.png',
    colorMode: {
      defaultMode: 'light',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Clipcat',
      logo: {
        alt: 'Clipcat',
        src: 'img/logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'clipcatSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/download',
          label: 'Download',
          position: 'left',
        },
        {
          href: 'https://github.com/d3uceY/Clipcat',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting Started', to: '/docs/intro' },
            { label: 'Features', to: '/docs/features' },
            { label: 'Keyboard Shortcuts', to: '/docs/keyboard-shortcuts' },
            { label: 'Settings', to: '/docs/settings' },
            { label: 'Privacy and Security', to: '/docs/privacy-security' },
          ],
        },
        {
          title: 'Download',
          items: [
            {
              label: 'Windows',
              href: 'https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-windows-amd64-installer.exe',
            },
            {
              label: 'macOS (Apple Silicon)',
              href: 'https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-macos-arm64.dmg',
            },
            {
              label: 'macOS (Intel)',
              href: 'https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-macos-amd64.dmg',
            },
            {
              label: 'Linux',
              href: 'https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-linux-amd64',
            },
          ],
        },
        {
          title: 'More',
          items: [
            { label: 'GitHub', href: 'https://github.com/d3uceY/Clipcat' },
            { label: 'Contributing', href: 'https://github.com/d3uceY/Clipcat/blob/main/CONTRIBUTING.md' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Onyekwelu Jesse.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
