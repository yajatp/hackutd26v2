import Image from "next/image";

// The Brine wordmark (public/brand/brine-wordmark.png, from the brand sheet): lowercase "brine",
// its i dotted with the brand's blue square. White on transparent, so it sits on any dark surface.
// `height` sets the size (a number in px or any CSS length); the width follows.
export function BrineLogo({ height = 22, className = "" }: { height?: number | string; className?: string }) {
  return (
    <Image src="/brand/brine-wordmark.png" alt="Brine" width={560} height={250} priority
      className={className} style={{ height, width: "auto", display: "inline-block", verticalAlign: "middle" }} />
  );
}
