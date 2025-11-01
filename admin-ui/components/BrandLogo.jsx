"use client";

import Image from "next/image";
import PanelBrand from "./PanelBrand";

const SIZE_MAP = {
  sm: { px: 28, gap: 10, font: 16 },
  md: { px: 40, gap: 12, font: 18 },
  lg: { px: 72, gap: 16, font: 24 },
};

export default function BrandLogo({
  size = "sm",
  showLabel = true,
  showPrefix = true,
  style,
}) {
  const preset = SIZE_MAP[size] || SIZE_MAP.sm;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: preset.gap,
        fontWeight: 700,
        fontSize: preset.font,
        lineHeight: 1.1,
        ...style,
      }}
    >
      <Image
        src="/slimy-admin-logo.svg"
        alt="slimy.ai panel logo"
        width={preset.px}
        height={preset.px}
        priority={size !== "sm"}
      />
      {showLabel && (
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          <PanelBrand showPrefix={showPrefix} />
        </span>
      )}
    </div>
  );
}
