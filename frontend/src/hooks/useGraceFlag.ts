import { useEffect, useRef } from 'react';

// Call once per violation type. `active` = is the violation happening right now.
export function useGraceFlag(active: boolean, onFlag: () => void, graceMs = 6000) {
  const cbRef = useRef(onFlag);
  cbRef.current = onFlag;

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => cbRef.current(), graceMs);
    return () => clearTimeout(t); // violation ended before 6s -> ignored
  }, [active, graceMs]);
}