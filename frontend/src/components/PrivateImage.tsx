import { useEffect, useState } from 'react';
import { fetchPrivateImage } from '../api';

/** A condition photo: fetched with the bearer token and shown through an object URL (revoked on unmount). */
export function PrivateImage({ path, alt, className = '' }: { path: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchPrivateImage(path)
      .then((u) => {
        objectUrl = u;
        if (cancelled) URL.revokeObjectURL(u);
        else setUrl(u);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (failed) {
    return <div className={`flex items-center justify-center bg-slate-100 p-2 text-sm text-slate-700 ${className}`}>Photo unavailable</div>;
  }
  if (!url) {
    return <div className={`animate-pulse bg-slate-200 ${className}`} role="img" aria-label={`Loading: ${alt}`} />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Open full size">
      <img src={url} alt={alt} className={`object-cover ${className}`} />
    </a>
  );
}
