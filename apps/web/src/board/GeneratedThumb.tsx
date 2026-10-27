import { useEffect, useState } from "react";

interface Props {
  blob: Blob;
  alt?: string;
  className?: string;
}

export function GeneratedThumb({ blob, alt = "", className }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (!url) return <span className="generated-missing" />;
  return <img src={url} alt={alt} className={className} />;
}
