import type {ReactNode} from 'react';
import {useState, useRef, useEffect} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import gsap from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import {useGSAP} from '@gsap/react';
import styles from './index.module.css';

gsap.registerPlugin(useGSAP, ScrollTrigger);

/* ── Latest version ─────────────────────────────────────── */
function useLatestVersion() {
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('https://api.github.com/repos/d3uceY/Clipcat/releases/latest')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.tag_name && setVersion(d.tag_name))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  return {version, loading};
}

const RELEASES_BASE = 'https://github.com/d3uceY/Clipcat/releases/latest/download';

/* ── Authored icon set (24px, 1.5 stroke, round) ────────── */
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const ICONS = {
  capture: (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9" />
      <path d="M9 13.5l2-2 3 3" />
    </svg>
  ),
  paste: (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="5" y="4" width="14" height="16" rx="2.5" />
      <path d="M9 4.6V3h6v1.6" />
      <path d="M9.5 11.5l2 2 3-3.5" />
      <path d="M9 16.5h6" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M9 4h6l-1 6 3 3H7l3-3-1-6Z" />
      <path d="M12 16v4" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  ),
  privacy: (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z" />
      <path d="M9.5 12a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0Z" />
    </svg>
  ),
  sync: (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M4 8a8 8 0 0 1 13.5-2.5L20 8" />
      <path d="M20 16a8 8 0 0 1-13.5 2.5L4 16" />
      <path d="M20 3.5V8h-4.5" />
      <path d="M4 20.5V16h4.5" />
    </svg>
  ),
  secret: (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l8-8" />
      <path d="M15.5 8.5l3 3" />
      <path d="M16.5 5.5l1-1" />
    </svg>
  ),
  block: (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8.5 8.5l7 7" />
      <path d="M15.5 8.5l-7 7" />
    </svg>
  ),
  edit: (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M4 20l1-4.5L16.5 4a2.1 2.1 0 0 1 3 3L8 19l-4 1Z" />
      <path d="M14.5 6l3.5 3.5" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 18l5-5 3.5 3.5L16 13l4 4" />
    </svg>
  ),
  palette: (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8 8v0M12 8v0M16 8v0M16 12v0" strokeWidth="2.2" />
    </svg>
  ),
};

type Platform = {
  label: string;
  href: string | null;
  icon: ReactNode;
  dropdown?: {label: string; href: string}[];
};

const PLATFORMS: Platform[] = [
  {
    label: 'Windows',
    href: `${RELEASES_BASE}/Clipcat-windows-amd64-installer.exe`,
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.801" />
      </svg>
    ),
  },
  {
    label: 'macOS',
    href: null,
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
      </svg>
    ),
    dropdown: [
      {label: 'Apple Silicon', href: `${RELEASES_BASE}/Clipcat-macos-arm64.dmg`},
      {label: 'Intel (x86)', href: `${RELEASES_BASE}/Clipcat-macos-amd64.dmg`},
    ],
  },
  {
    label: 'Linux',
    href: null,
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
      </svg>
    ),
    dropdown: [
      {label: 'Binary (x64)', href: `${RELEASES_BASE}/Clipcat-linux-amd64`},
      {label: '.deb package', href: `${RELEASES_BASE}/Clipcat-linux-amd64.deb`},
    ],
  },
];

const FEATURES = [
  {
    title: 'Auto-Capture',
    desc: 'Everything you copy, text and images, is saved the instant it hits your clipboard. Zero setup.',
    icon: ICONS.capture,
    span: 'spot',
  },
  {
    title: 'Quick Paste',
    desc: 'Summon Clipcat from any app, pick a clip, and it pastes into your previous window, then vanishes.',
    icon: ICONS.paste,
    span: 'six',
  },
  {
    title: 'Instant Search',
    desc: 'Filter your entire history in real time with one shortcut. It matches clip content, not just titles.',
    icon: ICONS.search,
    span: 'six',
  },
  {
    title: 'Privacy Mode',
    desc: 'Blur all clip content instantly for screen sharing or shoulder-surfing. One keystroke away.',
    icon: ICONS.privacy,
    span: 'four',
  },
  {
    title: 'LAN Sync',
    desc: 'Sync across devices on your local network, end-to-end encrypted. No server, no account.',
    icon: ICONS.sync,
    span: 'four',
  },
  {
    title: 'Auto-hide Secrets',
    desc: 'Passwords, API keys, JWTs and high-entropy strings collapse into their own section automatically.',
    icon: ICONS.secret,
    span: 'four',
  },
  {
    title: 'Pin & Label',
    desc: 'Pin important clips to the top, tag with labels, filter with one click.',
    icon: ICONS.pin,
    span: 'three',
  },
  {
    title: 'Edit Clips',
    desc: 'Fix typos or rewrite any clip without re-copying from the source.',
    icon: ICONS.edit,
    span: 'three',
  },
  {
    title: 'Image Support',
    desc: 'Copied images save as previews and paste back just like text.',
    icon: ICONS.image,
    span: 'three',
  },
  {
    title: 'Blocked Apps',
    desc: 'Exclude any app by process name so its clipboard is never captured.',
    icon: ICONS.block,
    span: 'three',
  },
  {
    title: 'Command Palette',
    desc: 'Ctrl+K opens every action in a fuzzy-searchable palette. No mouse needed.',
    icon: ICONS.palette,
    span: 'six',
  },
] as const;

/* ── Download warning dialog ─────────────────────────────── */
type DialogInfo = {platform: 'windows' | 'mac'; href: string; label: string};

const DIALOG_CONTENT = {
  windows: {
    title: 'Heads up: Windows SmartScreen',
    body: "Clipcat isn't code-signed yet, so Windows shows a SmartScreen warning on first run. The app is fully open source and safe.",
    steps: [
      'Run the downloaded installer.',
      'Click "More info" on the SmartScreen popup.',
      'Click "Run anyway".',
    ],
    guideLabel: 'Full first-run guide →',
    guideHash: '#windows--smartscreen',
  },
  mac: {
    title: 'Heads up: macOS Gatekeeper',
    body: "Clipcat isn't code-signed yet, so Gatekeeper blocks it on first launch. The app is fully open source and safe.",
    steps: [
      'Open the downloaded .dmg file.',
      'Right-click the app → Open.',
      'Click "Open" in the Gatekeeper dialog.',
    ],
    guideLabel: 'Full first-run guide →',
    guideHash: '#macos--gatekeeper',
  },
};

function DownloadDialog({info, onClose}: {info: DialogInfo; onClose: () => void}) {
  const content = DIALOG_CONTENT[info.platform];

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={styles.dialogBackdrop}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dl-dialog-title"
    >
      <div className={styles.dialogBox}>
        <button className={styles.dialogClose} onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="1" y1="1" x2="13" y2="13" />
            <line x1="13" y1="1" x2="1" y2="13" />
          </svg>
        </button>

        <p className={styles.dialogIcon}>{info.platform === 'windows' ? '!' : '?'}</p>
        <h2 id="dl-dialog-title" className={styles.dialogTitle}>
          {content.title}
        </h2>
        <p className={styles.dialogBody}>{content.body}</p>

        <ol className={styles.dialogSteps}>
          {content.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>

        <Link to={`/docs/intro${content.guideHash}`} className={styles.dialogGuideLink} onClick={onClose}>
          {content.guideLabel}
        </Link>

        <div className={styles.dialogActions}>
          <button className={styles.dialogCancelBtn} onClick={onClose}>
            Cancel
          </button>
          <a href={info.href} className={styles.dialogDownloadBtn} onClick={onClose}>
            Download anyway
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Platform dropdown (macOS / Linux) ───────────────────── */
function PlatformDropdownBtn({
  label,
  onDownload,
}: {
  label: string;
  onDownload: (info: DialogInfo) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const platform = PLATFORMS.find((p) => p.label === label)!;

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
        className={clsx(styles.ctaBtn, styles.ctaBtnGhost, styles.dropdownTrigger)}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {platform.icon}
        {label}
        <svg
          className={clsx(styles.dropdownChevron, open && styles.dropdownChevronOpen)}
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M1.5 3.5l3.5 3.5 3.5-3.5" />
        </svg>
      </button>
      {open && (
        <div className={styles.dropdownMenu}>
          {platform.dropdown!.map((opt) =>
            label === 'macOS' ? (
              <button
                key={opt.label}
                className={styles.dropdownItem}
                onClick={() => {
                  setOpen(false);
                  onDownload({platform: 'mac', href: opt.href, label: `macOS ${opt.label}`});
                }}
              >
                {opt.label}
              </button>
            ) : (
              <a key={opt.label} href={opt.href} className={styles.dropdownItem} onClick={() => setOpen(false)}>
                {opt.label}
              </a>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* ── Hero ────────────────────────────────────────────────── */
function HeroSection() {
  const heroImg = useBaseUrl('/img/app-screenshot.png');
  const [dlDialog, setDlDialog] = useState<DialogInfo | null>(null);
  const {version, loading} = useLatestVersion();
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({defaults: {ease: 'expo.out'}});
        tl.from('.hero-line-inner', {yPercent: 112, duration: 1.15, stagger: 0.12}, 0.05)
          .from('.hero-sub', {y: 26, opacity: 0, duration: 0.7}, '-=0.55')
          .from('.hero-cta', {y: 20, opacity: 0, duration: 0.55, stagger: 0.08}, '-=0.35')
          .from('.hero-note', {opacity: 0, duration: 0.5}, '-=0.2')
          .from(
            '.hero-frame-img',
            {
              clipPath: 'inset(100% 0% 0% 0%)',
              scale: 0.975,
              opacity: 0.4,
              duration: 1.0,
              ease: 'power3.out',
            },
            '-=0.4',
          )
          .from('.hero-chip', {y: 16, opacity: 0, duration: 0.5, stagger: 0.12}, '-=0.55')
          .from('.hero-caption', {opacity: 0, duration: 0.4}, '-=0.15');

        gsap.to('.hero-chip', {
          y: '-=9',
          duration: 2.6,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
          stagger: 0.5,
        });

        gsap.to('.hero-orb', {
          yPercent: 22,
          ease: 'none',
          scrollTrigger: {trigger: scope.current, start: 'top top', end: 'bottom top', scrub: true},
        });
      });
    },
    {scope},
  );

  return (
    <section ref={scope} className={styles.heroWrapper}>
      <div className={clsx(styles.heroOrb, 'hero-orb')} aria-hidden="true" />

      <div className={styles.heroContent}>
        <Heading as="h1" className={styles.heroTitle}>
          <span className={styles.heroLineMask}>
            <span className={clsx(styles.heroLineInner, 'hero-line-inner')}>Your clipboard,</span>
          </span>
          <span className={styles.heroLineMask}>
            <span className={clsx(styles.heroLineInner, styles.heroAccent, 'hero-line-inner')}>
              always at hand.
            </span>
          </span>
        </Heading>

        <p className={clsx(styles.heroSub, 'hero-sub')}>
          Everything you copy, text and images, is saved instantly on your machine.
          <br className={styles.heroBreak} />
          Find it, reuse it, and move on.
        </p>

        <div className={clsx(styles.heroCtas, 'hero-cta')}>
          <button
            key="Windows"
            className={clsx(styles.ctaBtn, styles.ctaBtnPrimary)}
            onClick={() =>
              setDlDialog({
                platform: 'windows',
                href: PLATFORMS[0].href!,
                label: 'Windows',
              })
            }
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download for Windows
          </button>
          <PlatformDropdownBtn label="macOS" onDownload={setDlDialog} />
          <PlatformDropdownBtn label="Linux" onDownload={setDlDialog} />
          <Link className={clsx(styles.ctaBtn, styles.ctaBtnGhost, styles.ctaDocs)} to="/docs/intro">
            Read the docs
          </Link>
        </div>

        <p className={clsx(styles.heroNote, 'hero-note')}>
          Free &amp; open source · No cloud · No account · No tracking
          <span className={styles.heroPlatforms}>Windows · macOS · Linux</span>
        </p>

        <div className={styles.heroStage}>
          <div className={styles.heroFrame}>
            <svg className={styles.paperclip} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 4.5h8a3 3 0 0 1 0 6H7a1.5 1.5 0 0 1 0-3h8.5" />
            </svg>
            <div className={clsx(styles.heroFrameImg, 'hero-frame-img')}>
              <img src={heroImg} alt="Clipcat main window" />
            </div>
            <div className={clsx(styles.heroCaption, 'hero-caption')}>
              <span className={styles.heroCaptionDot} />
              {loading ? 'checking latest release…' : version ? `Latest: ${version}` : 'latest release'}
            </div>
          </div>

          <div className={clsx(styles.heroChip, styles.heroChipLeft, 'hero-chip')}>
            <kbd className={styles.chipKey}>⌘ ⇧ V</kbd>
            <span>Quick paste</span>
          </div>
          <div className={clsx(styles.heroChip, styles.heroChipRight, 'hero-chip')}>
            <kbd className={styles.chipKey}>Ctrl K</kbd>
            <span>Command palette</span>
          </div>
        </div>
      </div>

      {dlDialog && <DownloadDialog info={dlDialog} onClose={() => setDlDialog(null)} />}
    </section>
  );
}

/* ── Marquee ─────────────────────────────────────────────── */
const MARQUEE = [
  ['Ctrl+C', 'Capture'],
  ['Ctrl+F', 'Search'],
  ['Alt+M', 'Mini Clip'],
  ['Alt+H', 'Privacy'],
  ['Ctrl+K', 'Palette'],
  ['Ctrl+Shift+V', 'Paste'],
] as const;

function MarqueeStrip() {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tween = gsap.to('.marquee-track', {
          xPercent: -50,
          duration: 34,
          ease: 'none',
          repeat: -1,
        });
        const el = scope.current!;
        const pause = () => tween.pause();
        const resume = () => tween.resume();
        el.addEventListener('mouseenter', pause);
        el.addEventListener('mouseleave', resume);
      });
    },
    {scope},
  );

  const items = (
    <>
      {MARQUEE.map(([key, label]) => (
        <span key={key} className={styles.marqueeItem}>
          <span className={styles.marqueeKey}>{key}</span>
          <span className={styles.marqueeLabel}>{label}</span>
          <span className={styles.marqueeDot} aria-hidden="true" />
        </span>
      ))}
    </>
  );

  return (
    <div ref={scope} className={styles.marquee} aria-hidden="true">
      <div className={clsx(styles.marqueeTrack, 'marquee-track')}>
        <div className={styles.marqueeGroup}>{items}</div>
        <div className={styles.marqueeGroup}>{items}</div>
      </div>
    </div>
  );
}

/* ── Features ────────────────────────────────────────────── */
function FeaturesSection() {
  const scope = useRef<HTMLElement>(null);
  const captureImg = useBaseUrl('/img/feature-capture.png');

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.feature-card', {
          y: 26,
          opacity: 0,
          duration: 0.65,
          ease: 'power3.out',
          stagger: 0.05,
          clearProps: 'transform',
          scrollTrigger: {trigger: scope.current, start: 'top 80%', once: true},
        });
      });
    },
    {scope},
  );

  return (
    <section ref={scope} className={styles.featuresSection}>
      <div className="container">
        <div className={styles.sectionHead}>
          <Heading as="h2" className={styles.sectionTitle}>
            Quietly captures everything,
            <br className={styles.headBreak} />
            then gets out of your way.
          </Heading>
          <p className={styles.sectionSub}>
            No setup. No accounts. Every feature is one copy, one key, or one click away.
          </p>
        </div>

        <div className={styles.featuresGrid}>
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={clsx(
                styles.featureCard,
                styles[`fc-${f.span}`],
                f.span === 'spot' && styles.featureSpot,
                'feature-card',
              )}
            >
              <div className={styles.featureIcon}>{f.icon}</div>
              <Heading as="h3" className={styles.featureTitle}>
                {f.title}
              </Heading>
              <p className={styles.featureDesc}>{f.desc}</p>
              {f.span === 'spot' && (
                <div className={styles.featureShot}>
                  <img src={captureImg} alt="Clipcat auto-capture list" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Shortcuts ───────────────────────────────────────────── */
const SHORTCUTS = [
  {keys: ['Ctrl / ⌘', 'Shift', 'V'], label: 'Summon Clipcat (system-wide)'},
  {keys: ['Ctrl / ⌘', 'F'], label: 'Focus search'},
  {keys: ['Alt', 'M'], label: 'Toggle Mini Clip mode'},
  {keys: ['Alt', 'H'], label: 'Toggle Privacy Mode'},
  {keys: ['Alt', 'S'], label: 'Toggle sound effects'},
];

function ShortcutsSection() {
  return (
    <section className={styles.shortcutsSection}>
      <div className={clsx('container', styles.shortcutsContainer)}>
        <div className={styles.shortcutsLeft}>
          <Heading as="h2" className={styles.sectionTitle}>
            Fast by design.
            <br />
            <span className={styles.sectionAccent}>Every action is a key away.</span>
          </Heading>
          <p className={styles.sectionSub}>
            No hunting through menus. The essential actions are at your fingertips, even when Clipcat is tucked
            away in the tray.
          </p>
          <Link className={styles.shortcutsLink} to="/docs/keyboard-shortcuts">
            View all shortcuts
            <span aria-hidden="true" className={styles.shortcutsArrow}>
              →
            </span>
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

/* ── Screenshots ─────────────────────────────────────────── */
function ScreenshotBand() {
  const screenshots = [
    {src: useBaseUrl('/img/screenshot-search.png'), label: 'Search & filter'},
    {src: useBaseUrl('/img/screenshot-privacy.png'), label: 'Privacy mode'},
    {src: useBaseUrl('/img/screenshot-mini.png'), label: 'Mini clip'},
  ];
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.polaroid', {
          y: 44,
          opacity: 0,
          rotation: (i: number) => (i % 2 ? 7 : -7),
          duration: 0.9,
          ease: 'back.out(1.7)',
          stagger: 0.14,
          clearProps: 'transform',
          scrollTrigger: {trigger: scope.current, start: 'top 82%', once: true},
        });
      });
    },
    {scope},
  );

  return (
    <section ref={scope} className={styles.screenshotBand}>
      <div className="container">
        <div className={clsx(styles.sectionHead, styles.centered)}>
          <Heading as="h2" className={styles.sectionTitle}>
            See it in action.
          </Heading>
          <p className={styles.sectionSub}>Stays out of your way until you need it.</p>
        </div>
        <div className={styles.polaroidGrid}>
          {screenshots.map(({src, label}, i) => (
            <figure
              key={label}
              className={clsx(styles.polaroid, i % 2 ? styles.polaroidTiltR : styles.polaroidTiltL, 'polaroid')}
            >
              <div className={styles.polaroidImg}>
                <img src={src} alt={label} />
              </div>
              <figcaption className={styles.polaroidCaption}>{label}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── CTA ─────────────────────────────────────────────────── */
function CTASection() {
  const [dlDialog, setDlDialog] = useState<DialogInfo | null>(null);

  return (
    <section className={styles.ctaSection}>
      <div className={clsx('container', styles.ctaContainer)}>
        <Heading as="h2" className={styles.ctaTitle}>
          Never lose a copy
          <br />
          <span className={styles.ctaAccent}>again.</span>
        </Heading>
        <p className={styles.ctaSubtitle}>
          Free, open source, and thirty seconds to install.
          <span className={styles.ctaMeta}>SQLite · local-first · encrypted sync</span>
        </p>
        <div className={styles.heroCtas}>
          <button
            className={clsx(styles.ctaBtn, styles.ctaBtnPrimary)}
            onClick={() =>
              setDlDialog({platform: 'windows', href: PLATFORMS[0].href!, label: 'Windows'})
            }
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download for Windows
          </button>
          <PlatformDropdownBtn label="macOS" onDownload={setDlDialog} />
          <PlatformDropdownBtn label="Linux" onDownload={setDlDialog} />
          <Link className={clsx(styles.ctaBtn, styles.ctaBtnGhost, styles.ctaOnDark)} to="/docs/intro">
            Read the docs
          </Link>
        </div>
      </div>
      {dlDialog && <DownloadDialog info={dlDialog} onClose={() => setDlDialog(null)} />}
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.tagline}
      description="Clipcat, a clipboard manager that automatically saves everything you copy. Text and images, instantly captured, entirely on your machine."
    >
      <main>
        <HeroSection />
        <MarqueeStrip />
        <FeaturesSection />
        <ShortcutsSection />
        <ScreenshotBand />
        <CTASection />
      </main>
    </Layout>
  );
}
