import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import Link from '@docusaurus/Link';
import styles from './download.module.css';

function useLatestVersion() {
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('https://api.github.com/repos/d3uceY/Clipcat/releases/latest')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.tag_name) setVersion(d.tag_name); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  return { version, loading };
}

const RELEASES_BASE = 'https://github.com/d3uceY/Clipcat/releases/latest/download';

const PLATFORMS = [
  {
    os: 'Windows',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.801"/>
      </svg>
    ),
    variants: [
      { label: 'Windows (x64) Installer', href: `${RELEASES_BASE}/Clipcat-windows-amd64-installer.exe`, note: 'Recommended' },
    ],
    warning: 'Windows SmartScreen may show a warning on first run. Click "More info" -> "Run anyway".',
    guideHash: '/docs/intro#windows--smartscreen',
  },
  {
    os: 'macOS',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
      </svg>
    ),
    variants: [
      { label: 'Apple Silicon (.dmg)', href: `${RELEASES_BASE}/Clipcat-macos-arm64.dmg`, note: 'M1 / M2 / M3 / M4' },
      { label: 'Intel (.dmg)', href: `${RELEASES_BASE}/Clipcat-macos-amd64.dmg`, note: 'x86_64' },
    ],
    warning: 'Gatekeeper will block the app on first launch. Right-click the app -> Open -> click "Open" in the dialog.',
    guideHash: '/docs/intro#macos--gatekeeper',
  },
  {
    os: 'Linux',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
      </svg>
    ),
    variants: [
      { label: 'Linux (x64) Binary', href: `${RELEASES_BASE}/Clipcat-linux-amd64`, note: 'AppImage-style binary' },
    ],
    warning: null,
    guideHash: '/docs/intro#linux',
  },
];

export default function DownloadPage(): ReactNode {
  const { version, loading } = useLatestVersion();

  return (
    <Layout
      title="Download Clipcat"
      description="Download Clipcat — a stylish clipboard manager for Windows, macOS, and Linux."
    >
      <main className={styles.page}>
        <div className={styles.hero}>
          <Heading as="h1" className={styles.title}>Download Clipcat</Heading>
          {!loading && (
            <div className={styles.versionBadge}>
              <a
                href="https://github.com/d3uceY/Clipcat/releases/latest"
                className={styles.versionLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                {version ? `Latest: ${version}` : 'View releases'}
              </a>
              <span className={styles.versionDivider}>·</span>
              <a
                href="https://github.com/d3uceY/Clipcat/releases"
                className={styles.versionLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                All releases
              </a>
            </div>
          )}
          <p className={styles.subtitle}>
            Free &amp; open source · No account · No cloud · No tracking
          </p>
        </div>

        <div className={styles.cards}>
          {PLATFORMS.map(({ os, icon, variants, warning, guideHash }) => (
            <div key={os} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}>{icon}</span>
                <Heading as="h2" className={styles.cardTitle}>{os}</Heading>
              </div>

              <div className={styles.variants}>
                {variants.map(({ label, href, note }) => (
                  <a key={label} href={href} className={styles.downloadBtn}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    <span className={styles.btnLabel}>{label}</span>
                    {note && <span className={styles.btnNote}>{note}</span>}
                  </a>
                ))}
              </div>

              {warning && (
                <div className={styles.warningBox}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.warningIcon} aria-hidden="true">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <span>{warning}</span>
                  <Link to={guideHash} className={styles.warningLink}>First-run guide {'->'}</Link>
                </div>
              )}
            </div>
          ))}
        </div>

        <p className={styles.sourceNote}>
          All releases are built from source on GitHub.{' '}
          <a href="https://github.com/d3uceY/Clipcat/releases" className={styles.sourceLink}>
            View all releases {'->'}
          </a>
        </p>
      </main>
    </Layout>
  );
}
