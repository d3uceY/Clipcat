import type {ReactNode} from 'react';
import {useState, useRef, useEffect} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function useLatestVersion() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    fetch('https://api.github.com/repos/d3uceY/Clipcat/releases/latest')
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.tag_name && setVersion(d.tag_name))
      .catch(() => {});
  }, []);
  return version;
}

const PLATFORMS = [
  {
    label: 'Windows',
    href: 'https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-windows-amd64-installer.exe',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.801"/>
      </svg>
    ),
  },
  {
    label: 'macOS',
    href: null,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
      </svg>
    ),
    dropdown: [
      { label: 'Apple Silicon', href: 'https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-macos-arm64.dmg' },
      { label: 'Intel (x86)', href: 'https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-macos-amd64.dmg' },
    ],
  },
  {
    label: 'Linux',
    href: null,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
      </svg>
    ),
    dropdown: [
      { label: 'Binary (x64)', href: 'https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-linux-amd64' },
      { label: '.deb package', href: 'https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-linux-amd64.deb' },
    ],
  },
];

// ── Download warning dialog ────────────────────────────────
type DialogInfo = { platform: 'windows' | 'mac'; href: string; label: string };

const DIALOG_CONTENT = {
  windows: {
    title: 'Heads up - Windows SmartScreen',
    body: "Because Clipcat isn't code-signed yet, Windows will show a SmartScreen warning when you run the installer. The app is fully open source and safe.",
    steps: [
      'Run the downloaded installer.',
      'Click "More info" on the SmartScreen popup.',
      'Click "Run anyway".',
    ],
    guideLabel: 'Full first-run guide ->',
    guideHash: '#windows--smartscreen',
  },
  mac: {
    title: 'Heads up - macOS Gatekeeper',
    body: "Because Clipcat isn't code-signed yet, Gatekeeper will block it on first launch. The app is fully open source and safe.",
    steps: [
      'Open the downloaded .dmg file.',
      'Right-click the app -> Open.',
      'Click "Open" in the Gatekeeper dialog.',
    ],
    guideLabel: 'Full first-run guide ->',
    guideHash: '#macos--gatekeeper',
  },
};

function DownloadDialog({ info, onClose }: { info: DialogInfo; onClose: () => void }) {
  const content = DIALOG_CONTENT[info.platform];

  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.dialogBackdrop} onClick={handleBackdrop} role="dialog" aria-modal="true" aria-labelledby="dl-dialog-title">
      <div className={styles.dialogBox}>
        <button className={styles.dialogClose} onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
          </svg>
        </button>

        <p className={styles.dialogIcon}>{info.platform === 'windows' ? '!' : '?'}</p>
        <h2 id="dl-dialog-title" className={styles.dialogTitle}>{content.title}</h2>
        <p className={styles.dialogBody}>{content.body}</p>

        <ol className={styles.dialogSteps}>
          {content.steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>

        <Link
          to={`/docs/intro${content.guideHash}`}
          className={styles.dialogGuideLink}
          onClick={onClose}
        >
          {content.guideLabel}
        </Link>

        <div className={styles.dialogActions}>
          <button className={styles.dialogCancelBtn} onClick={onClose}>Cancel</button>
          <a
            href={info.href}
            className={styles.dialogDownloadBtn}
            onClick={onClose}
          >
            Download anyway
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Platform dropdown ──────────────────────────────────────
function PlatformDropdownBtn({ label, onDownload }: { label: string; onDownload: (info: DialogInfo) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const platform = PLATFORMS.find(p => p.label === label)!;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className={styles.dropdownWrapper}>
      <button
        className={clsx(styles.ctaBtn, styles.dropdownTrigger)}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {platform.icon}
        {label}
        <svg
          className={clsx(styles.dropdownChevron, open && styles.dropdownChevronOpen)}
          width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"
        >
          <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className={styles.dropdownMenu}>
          {platform.dropdown!.map(opt => (
            label === 'macOS' ? (
              <button
                key={opt.label}
                className={styles.dropdownItem}
                onClick={() => {
                  setOpen(false);
                  onDownload({ platform: 'mac', href: opt.href, label: `macOS ${opt.label}` });
                }}
              >
                {opt.label}
              </button>
            ) : (
              <a
                key={opt.label}
                href={opt.href}
                className={styles.dropdownItem}
                onClick={() => setOpen(false)}
              >
                {opt.label}
              </a>
            )
          ))}
        </div>
      )}
    </div>
  );
}

const FEATURES = [
  {
    title: 'Auto-Capture',
    desc: 'Everything you copy — text and images — is saved instantly with no setup needed.',
  },
  {
    title: 'Quick Paste',
    desc: 'Summon Clipcat from any app, pick a clip, and it pastes directly then vanishes.',
  },
  {
    title: 'Pin and Label',
    desc: 'Pin important clips to the top and tag them with labels to keep your history organised.',
  },
  {
    title: 'Instant Search',
    desc: 'Filter your entire clipboard history in real time with a single keyboard shortcut.',
  },
  {
    title: 'Privacy Mode',
    desc: 'Blur all clip content instantly for screen sharing or shoulder-surfing situations.',
  },
  {
    title: 'Auto-hide Secrets',
    desc: 'Detects and collapses passwords, API keys, tokens, and JWTs automatically.',
  },
  {
    title: 'Blocked Apps',
    desc: 'Exclude any app by process name so its clipboard activity is never captured.',
  },
  {
    title: 'Edit Clips',
    desc: 'Fix typos or update any saved clip without re-copying from the source.',
  },
  {
    title: 'Image Support',
    desc: 'Copied images are saved as previews and can be pasted back just like text clips.',
  },
  {
    title: 'LAN Sync',
    desc: 'Sync your clipboard across devices on the same local network, end-to-end encrypted.',
  },
  {
    title: 'Command Palette',
    desc: 'Press Ctrl+K to open a command palette and control Clipcat without the mouse.',
  },
];

function HeroSection() {
  const heroImg = useBaseUrl('/img/app-screenshot.png');
  const [dlDialog, setDlDialog] = useState<DialogInfo | null>(null);
  const latestVersion = useLatestVersion();

  return (
    <section className={styles.heroWrapper}>
      {/* ── gradient sky background ── */}
      <div className={styles.heroBg} aria-hidden="true" />

      <div className={styles.heroContent}>
        <div className={styles.heroBadge}>
          <span>Clipboard Manager</span>
          <span className={styles.heroBadgeDot} />
          <span>Windows · macOS · Linux</span>
          {latestVersion && (
            <>
              <span className={styles.heroBadgeDot} />
              <a
                href="https://github.com/d3uceY/Clipcat/releases/latest"
                className={styles.heroBadgeVersion}
                target="_blank"
                rel="noopener noreferrer"
              >
                {latestVersion}
              </a>
            </>
          )}
        </div>

        <Heading as="h1" className={styles.heroTitle}>
          Your clipboard,<br />
          <span className={styles.heroTitleAccent}>always at hand.</span>
        </Heading>

        <p className={styles.heroSubtitle}>
          Everything you copy - text and images - saved instantly.<br />
          Find it, reuse it, and manage it without thinking about it.
        </p>

        <div className={styles.heroCtas}>
          {PLATFORMS.map((p) => {
            if (p.dropdown) {
              return <PlatformDropdownBtn key={p.label} label={p.label} onDownload={setDlDialog} />;
            }
            if (p.label === 'Windows') {
              return (
                <button
                  key="Windows"
                  className={clsx(styles.ctaBtn, styles.ctaBtnPrimary)}
                  onClick={() => setDlDialog({ platform: 'windows', href: p.href!, label: 'Windows' })}
                >
                  {p.icon}
                  Get for Windows
                </button>
              );
            }
            return (
              <a key={p.label} href={p.href!} className={styles.ctaBtn}>
                {p.icon}
                {p.label}
              </a>
            );
          })}
        </div>

        <p className={styles.heroNote}>
          Free &amp; open source · No cloud · No account · No tracking
        </p>

        <div className={styles.heroScreenshotWrapper}>
          <div className={styles.heroScreenshot}>
            <img src={heroImg} alt="Clipcat main window" />
          </div>
        </div>
      </div>

      {dlDialog && <DownloadDialog info={dlDialog} onClose={() => setDlDialog(null)} />}
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className={styles.featuresSection}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>
          Everything you need from a clipboard manager
        </Heading>
        <p className={styles.sectionSubtitle}>
          Quietly captures everything, then gets out of your way.
        </p>
        <div className={styles.featuresGrid}>
          {FEATURES.map(({title, desc}) => (
            <div key={title} className={styles.featureCard}>
              <Heading as="h3" className={styles.featureTitle}>{title}</Heading>
              <p className={styles.featureDesc}>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ShortcutsSection() {
  const SHORTCUTS = [
    {keys: ['Ctrl / ⌘', 'Shift', 'V'], label: 'Summon Clipcat (system-wide)'},
    {keys: ['Ctrl / ⌘', 'F'], label: 'Focus search'},
    {keys: ['Alt', 'M'], label: 'Toggle Mini Clip mode'},
    {keys: ['Alt', 'H'], label: 'Toggle Privacy Mode'},
    {keys: ['Alt', 'S'], label: 'Toggle sound effects'},
  ];

  return (
    <section className={styles.shortcutsSection}>
      <div className={clsx('container', styles.shortcutsContainer)}>
        <div className={styles.shortcutsLeft}>
          <Heading as="h2" className={styles.sectionTitle}>
            Keyboard shortcuts
          </Heading>
          <p className={styles.sectionSubtitle}>
            Fast by design — every essential action is one key combo away.
          </p>
          <Link className={styles.shortcutsLink} to="/docs/keyboard-shortcuts">
            View all shortcuts {'->'}
          </Link>
        </div>
        <div className={styles.shortcutsList}>
          {SHORTCUTS.map(({keys, label}) => (
            <div key={label} className={styles.shortcutRow}>
              <span className={styles.shortcutLabel}>{label}</span>
              <div className={styles.shortcutKeys}>
                {keys.map((k, i) => (
                  <span key={i} className={styles.shortcutKeyGroup}>
                    {i > 0 && <span className={styles.shortcutPlus}>+</span>}
                    <kbd className={styles.key}>{k}</kbd>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScreenshotBand() {
  const screenshots = [
    {src: useBaseUrl('/img/screenshot-search.png'), label: 'Search & Filter'},
    {src: useBaseUrl('/img/screenshot-privacy.png'), label: 'Privacy Mode'},
    {src: useBaseUrl('/img/screenshot-mini.png'),   label: 'Mini Clip'},
  ];
  return (
    <section className={styles.screenshotBand}>
      <div className="container">
        <Heading as="h2" className={clsx(styles.sectionTitle, styles.centered)}>
          See it in action
        </Heading>
        <p className={clsx(styles.sectionSubtitle, styles.centered)}>
          Stays out of your way until you need it.
        </p>
        <div className={styles.screenshotGrid}>
          {screenshots.map(({src, label}) => (
            <div key={label} className={styles.screenshotCard}>
              <img src={src} alt={label} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className={styles.ctaSection}>
      <div className={clsx('container', styles.ctaContainer)}>
        <Heading as="h2" className={clsx(styles.sectionTitle, styles.ctaTitle)}>
          Never lose a copy again
        </Heading>
        <p className={clsx(styles.sectionSubtitle, styles.ctaSubtitle)}>
          Free, open source, and takes thirty seconds to install.
        </p>
        <div className={styles.heroCtas}>
          <a
            href="https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-windows-amd64-installer.exe"
            className={clsx(styles.ctaBtn, styles.ctaBtnPrimary)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.801"/>
            </svg>
            Download for Windows
          </a>
          <Link className={clsx(styles.ctaBtn)} to="/docs/intro">
            Read the docs
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.tagline}
      description="Clipcat - a stylish clipboard manager that automatically saves everything you copy. Text and images, instantly captured. Find it, reuse it, manage it.">
      <HeroSection />
      <main>
        <FeaturesSection />
        <ShortcutsSection />
        <ScreenshotBand />
        <CTASection />
      </main>
    </Layout>
  );
}
