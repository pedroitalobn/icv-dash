"use client";

/** Logo da marca: usa /logo.png (brasão real) e cai para /logo.svg se ausente. */
export function BrandLogo({
  className,
  height,
}: {
  className?: string;
  height?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src="/logo.png"
      alt="Cruz da Vida"
      style={height ? { height } : undefined}
      onError={(e) => {
        const img = e.currentTarget as HTMLImageElement;
        if (!img.src.endsWith("/logo.svg")) img.src = "/logo.svg";
      }}
    />
  );
}
