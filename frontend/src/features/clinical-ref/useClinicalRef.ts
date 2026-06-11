import { useMemo } from 'react';
import type { ClinicalProtocol } from './types';
import { getProtocolByActName } from '../../data/clinical-protocols';

export const useClinicalRef = (actName?: string): ClinicalProtocol | undefined => {
  const protocol = useMemo(
    () => (actName ? getProtocolByActName(actName) : undefined),
    [actName]
  );
  return protocol;
};
