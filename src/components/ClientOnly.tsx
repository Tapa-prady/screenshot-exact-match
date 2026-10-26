import { useEffect, useState, type ReactNode } from "react";

/**
 * Hydration-safe ClientOnly wrapper.
 * Renders fallback during SSR and initial hydration pass,
 * then safely swaps to client-only children after mount.
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode | (() => ReactNode);
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{fallback}</>;
  }

  return <>{typeof children === "function" ? children() : children}</>;
}
