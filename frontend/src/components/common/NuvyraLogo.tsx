import React from 'react';
import { NUVYRA_LOGO_DATA_URL } from '../../assets/nuvyraLogoAsset';

interface NuvyraLogoProps {
  className?: string;
  showWordmark?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Uses the approved NUVYRA master artwork so the website and app shell
 * share one consistent brand asset.
 */
export const NuvyraLogo: React.FC<NuvyraLogoProps> = ({
  className = '',
  showWordmark = true,
  size = 'md',
}) => {
  const dimensions = {
    sm: 'w-[112px]',
    md: 'w-[156px]',
    lg: 'w-[210px]',
  };

  return (
    <div className={`inline-flex items-center justify-center select-none ${className}`} aria-label="NUVYRA">
      <img
        src={NUVYRA_LOGO_DATA_URL}
        alt="NUVYRA"
        className={`block h-auto max-w-full object-contain ${dimensions[size]}`}
        draggable={false}
        loading="eager"
        decoding="async"
        data-wordmark={showWordmark ? 'full' : 'compact'}
      />
    </div>
  );
};
