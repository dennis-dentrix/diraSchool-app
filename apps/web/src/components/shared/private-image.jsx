'use client';

import { useSignedUrl } from '@/hooks/use-signed-url';

/**
 * Renders a private R2 image by resolving the object key to a signed URL.
 * Accepts the same props as a regular <img> tag.
 * While the URL is loading, renders a muted placeholder div of the same size.
 */
export function PrivateImage({ src, alt = '', className, style, ...props }) {
  const url = useSignedUrl(src);

  if (!url) {
    return <div className={className} style={style} aria-hidden="true" />;
  }

  return <img src={url} alt={alt} className={className} style={style} {...props} />;
}
