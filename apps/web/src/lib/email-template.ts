/**
 * Branded transactional email template. Inline styles only (email clients
 * strip stylesheets); a single light design with strong contrast — the
 * plain-text body on every EmailJob remains the fallback.
 */

const PALETTE = {
  page: "#faf7f2",
  card: "#ffffff",
  border: "#f3ede2",
  text: "#3d3427",
  muted: "#6b5d4a",
  accent: "#b45309",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderBrandedEmail({
  heading,
  bodyLines,
  cta,
  footerNote,
}: {
  heading: string;
  /** Paragraphs, rendered in order. Escaped — pass plain text. */
  bodyLines: string[];
  cta?: { label: string; url: string };
  footerNote?: string;
}): string {
  const paragraphs = bodyLines
    .map(
      (line) =>
        `<p style="margin:0 0 14px; font-size:15px; line-height:1.6; color:${PALETTE.text};">${escapeHtml(line)}</p>`,
    )
    .join("");

  const button = cta
    ? `<p style="margin:22px 0;">
        <a href="${escapeHtml(cta.url)}"
           style="display:inline-block; background:${PALETTE.accent}; color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:11px 22px; border-radius:8px;">
          ${escapeHtml(cta.label)}
        </a>
      </p>
      <p style="margin:0 0 14px; font-size:12px; line-height:1.5; color:${PALETTE.muted};">
        Or copy this link into your browser:<br/>
        <a href="${escapeHtml(cta.url)}" style="color:${PALETTE.accent}; word-break:break-all;">${escapeHtml(cta.url)}</a>
      </p>`
    : "";

  const footer = footerNote
    ? `<p style="margin:14px 0 0; font-size:12px; color:${PALETTE.muted};">${escapeHtml(footerNote)}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="color-scheme" content="light"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
</head>
<body style="margin:0; padding:0; background:${PALETTE.page};">
  <div style="max-width:560px; margin:0 auto; padding:32px 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <p style="margin:0 0 18px; font-size:18px; font-weight:700; color:${PALETTE.text};">
      Family<span style="color:${PALETTE.accent};">Archive</span>
    </p>
    <div style="background:${PALETTE.card}; border:1px solid ${PALETTE.border}; border-radius:12px; padding:28px;">
      <h1 style="margin:0 0 16px; font-size:19px; line-height:1.4; color:${PALETTE.text};">${escapeHtml(heading)}</h1>
      ${paragraphs}
      ${button}
      ${footer}
    </div>
    <p style="margin:16px 0 0; text-align:center; font-size:11px; color:${PALETTE.muted};">
      Sent by your family's self-hosted FamilyArchive instance.
    </p>
  </div>
</body>
</html>`;
}
