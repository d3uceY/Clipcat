import type {ReactNode} from 'react';

/**
 * Clipcat docs — design contract (survives the production build as an HTML comment).
 * THESIS: The desk — a warm, physical clipboard object you reach for without
 *   thinking. Refuses the sterile developer-tool doc; refuses Comic-Sans energy.
 * OWN-WORLD: Warm ink on paper (never pure black/white), one signature accent —
 *   Clipcat Green from the brand mark. Bricolage Grotesque at 8:1+ scale with
 *   Fragment Mono reserved for keys, versions, and data. Hairline inked borders,
 *   soft layered shadows, 14-16px radii, authored SVG icons only.
 * STORY: A visitor feels the app is a crafted, tactile companion; believes it is
 *   fast, local, private, and free; acts on "download" or "read the docs" in seconds.
 * FIRST VIEWPORT: Huge two-line title (type is the hero), short subtitle, one
 *   primary download CTA, then the app screenshot mounted as a physical clipboard
 *   that unfolds via clip-path. No eyebrow label above the title.
 * FORM: User-pinned "warm & physical, elevated" direction — no concept roll.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 *   finish review, the verdict, and DESIGN.md
 */
export default function Root({children}: {children: ReactNode}): ReactNode {
  return (
    <>
      <div
        aria-hidden="true"
        style={{display: 'none'}}
        dangerouslySetInnerHTML={{
          __html:
            '<!-- Clipcat docs | THESIS: The desk — a warm, physical clipboard object. ' +
            'OWN-WORLD: warm ink on paper, Clipcat-Green signature accent, Bricolage Grotesque + Fragment Mono, ' +
            'hairline borders, soft shadows, authored SVG icons. STORY: visitor feels a crafted, tactile companion; ' +
            'acts on download or read-docs in seconds. FIRST VIEWPORT: huge title, one primary CTA, app screenshot ' +
            'unfolded as a physical clipboard. FORM: user-pinned warm & physical direction. ' +
            'FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->',
        }}
      />
      {children}
    </>
  );
}
