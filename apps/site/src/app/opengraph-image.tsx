import { ImageResponse } from "next/og";

export const alt = "FamilyArchive — self-hosted family history and photo archive";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Static OG card, generated at build time (all routes inherit it). */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#faf7f2",
        color: "#3d3427",
        fontFamily: "Georgia, serif",
      }}
    >
      {/* The three-person tree mark from the app icon. */}
      <svg width="120" height="120" viewBox="0 0 64 64">
        <rect width="64" height="64" rx="14" fill="#b45309" />
        <circle cx="32" cy="17" r="6" fill="#faf7f2" />
        <circle cx="18" cy="41" r="6" fill="#faf7f2" />
        <circle cx="46" cy="41" r="6" fill="#faf7f2" />
        <path
          d="M32 23v8M32 31H18v4M32 31h14v4"
          stroke="#faf7f2"
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      <div style={{ display: "flex", fontSize: 76, fontWeight: 600, marginTop: 36 }}>
        <span>Family</span>
        <span style={{ color: "#b45309" }}>Archive</span>
      </div>
      <div style={{ fontSize: 32, color: "#6b5d4a", marginTop: 20 }}>
        Your family&apos;s history. Your server. Forever.
      </div>
    </div>,
    size,
  );
}
