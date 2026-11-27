import React from 'react';

interface MedScribeLogoProps {
  /** 'icon' = pastel squircle emblem only; 'horizontal' = emblem + MedScribe text side-by-side; 'stacked' = emblem centered above MedScribe text; 'watermark' = large background watermark emblem + wordmark */
  variant?: 'icon' | 'horizontal' | 'stacked' | 'watermark';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showSubtitle?: boolean;
  subtitleText?: string;
  className?: string;
}

export const MedScribeLogo: React.FC<MedScribeLogoProps> = ({
  variant = 'horizontal',
  size = 'md',
  showSubtitle = true,
  subtitleText = 'Local OPD & IPD EMR',
  className = '',
}) => {
  const iconSizes: Record<NonNullable<MedScribeLogoProps['size']>, string> = {
    xs: 'w-8 h-8',
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-18 h-18',
    xl: 'w-28 h-28',
    '2xl': 'w-44 h-44',
  };

  const titleSizes: Record<NonNullable<MedScribeLogoProps['size']>, string> = {
    xs: 'text-sm',
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
    xl: 'text-3xl',
    '2xl': 'text-4xl',
  };

  const subSizes: Record<NonNullable<MedScribeLogoProps['size']>, string> = {
    xs: 'text-[9px]',
    sm: 'text-[10px]',
    md: 'text-[11px]',
    lg: 'text-xs',
    xl: 'text-sm',
    '2xl': 'text-base',
  };

  const emblem = (
    <svg
      viewBox="0 0 240 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${iconSizes[size]} shrink-0 select-none ${variant === 'watermark' ? '' : 'drop-shadow-xs'}`}
      aria-label="MedScribe Local OPD and IPD EMR Logo"
    >
      {/* Outer Pastel Rounded Squircle Container */}
      <rect
        x="12"
        y="12"
        width="216"
        height="216"
        rx="50"
        fill="#FBF9F6"
        stroke="#CEDEDB"
        strokeWidth="3.5"
      />

      {/* Inner Pastel Ice-Cyan Clipboard Sheet */}
      <path
        d="M65 74C65 65.1634 72.1634 58 81 58H161C169.837 58 177 65.1634 177 74V177C177 185.837 169.837 193 161 193H97L57 153V74H65Z"
        fill="#E1F7FC"
      />

      {/* Pastel Cornflower Sky Clipboard Outer Frame (Top-Left, Bottom-Left & Right Border) */}
      {/* Top-left & upper-left vertical bar (above ECG line) */}
      <path
        d="M86 60H73C63.0589 60 55 68.0589 55 78V114H66V79C66 73.4772 70.4772 69 76 69H86V60Z"
        fill="#A9CFF7"
      />
      {/* Top-right & upper-right vertical bar (above soundwaves) */}
      <path
        d="M154 60H165C174.941 60 183 68.0589 183 78V104.5C179 101 173 102.5 172 107V79C172 73.4772 167.523 69 162 69H154V60Z"
        fill="#A9CFF7"
      />

      {/* Lower-left frame & bottom-left folded page corner */}
      <path
        d="M55 129.5H66V141C66 146.523 70.4772 151 76 151H85C92.732 151 99 157.268 99 165V176C99 180.971 103.029 185 108 185H125L115 195H73C63.0589 195 55 186.941 55 177V129.5Z"
        fill="#A9CFF7"
      />
      {/* Folded Corner Inner Pastel Periwinkle Triangle */}
      <path
        d="M66 157H84C88.4183 157 92 160.582 92 165V183L66 157Z"
        fill="#D6DDF8"
      />
      {/* Folded Corner Bottom-Left Cream Cutout Triangle */}
      <path
        d="M64 162L88 186H72C67.5817 186 64 182.418 64 178V162Z"
        fill="#FBF9F6"
      />

      {/* Top Clipboard Clasp with Keyhole Circle */}
      <path
        d="M93 48H108C108.8 39.5 114.2 34 120 34C125.8 34 131.2 39.5 132 48H147C150.866 48 154 51.134 154 55V66C154 69.866 150.866 73 147 73H93C89.134 73 86 69.866 86 66V55C86 51.134 89.134 48 93 48Z"
        fill="#A9CFF7"
      />
      <circle cx="120" cy="48" r="5" fill="#FBF9F6" />

      {/* Cream Halo Cutout Behind Right-Side Soundwave Bars Crossing the Frame */}
      <rect x="167" y="96" width="22" height="52" rx="11" fill="#FBF9F6" />

      {/* Center ECG Heartbeat Line Transitioning to Voice Soundwave Bars (Pastel Sage-Teal #93B5B3) */}
      <path
        d="M58 122H76L81.5 111L88 129L96 90L104.5 145L112.5 111.5L116.5 122H126"
        stroke="#93B5B3"
        strokeWidth="6.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 10 Vertical Rounded Equalizer Bars + Trailing Dot */}
      <rect x="123" y="106" width="5.5" height="32" rx="2.75" fill="#93B5B3" />
      <rect x="131.5" y="113" width="5.5" height="19" rx="2.75" fill="#93B5B3" />
      <rect x="140" y="109" width="5.5" height="27" rx="2.75" fill="#93B5B3" />
      <rect x="148.5" y="96" width="6" height="52" rx="3" fill="#93B5B3" />
      <rect x="157.5" y="106" width="5.5" height="32" rx="2.75" fill="#93B5B3" />
      <rect x="166" y="111.5" width="5.5" height="21" rx="2.75" fill="#93B5B3" />
      <rect x="174.5" y="106" width="5.5" height="32" rx="2.75" fill="#93B5B3" />
      <rect x="183" y="99" width="6" height="46" rx="3" fill="#93B5B3" />
      <rect x="192" y="109" width="5.5" height="26" rx="2.75" fill="#93B5B3" />
      <rect x="200.5" y="114.5" width="5.5" height="15" rx="2.75" fill="#93B5B3" />
      <rect x="209" y="118" width="5.5" height="8" rx="2.75" fill="#93B5B3" />

      {/* Bottom-Right Camera Viewfinder Brackets & Pastel Periwinkle Lens */}
      {/* Top-left bracket */}
      <path
        d="M140 163V156C140 154.343 141.343 153 143 153H150"
        stroke="#4B6385"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* Top-right bracket */}
      <path
        d="M174 162V158.5C174 157.119 172.881 156 171.5 156H168"
        stroke="#4B6385"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      {/* Bottom-left bracket */}
      <path
        d="M146 181V184.5C146 185.881 147.119 187 148.5 187H152"
        stroke="#4B6385"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      {/* Bottom-right bracket */}
      <path
        d="M174 181V184.5C174 185.881 172.881 187 171.5 187H168"
        stroke="#4B6385"
        strokeWidth="2.8"
        strokeLinecap="round"
      />

      {/* Camera Lens Circles */}
      <circle cx="160" cy="171.5" r="11.5" fill="#9BB2DC" />
      <circle cx="160" cy="171.5" r="9.2" fill="#4B6385" />
      <circle cx="160" cy="171.5" r="6.5" fill="#98B4E3" />
      <circle cx="157.8" cy="169.2" r="1.9" fill="#FFFFFF" />
    </svg>
  );

  if (variant === 'icon') {
    return <div className={`inline-flex items-center justify-center ${className}`}>{emblem}</div>;
  }

  if (variant === 'watermark') {
    return (
      <div className={`inline-flex flex-col items-center text-center select-none pointer-events-none ${className}`}>
        {emblem}
        <div className={`${titleSizes[size]} font-extrabold tracking-tight leading-none mt-1.5`}>
          <span className="text-[#3B5273]">Med</span>
          <span className="text-[#6B9E9B]">Scribe</span>
        </div>
        {showSubtitle && (
          <div className={`${subSizes[size]} font-semibold text-[#5A718E] tracking-wide mt-0.5`}>
            {subtitleText}
          </div>
        )}
      </div>
    );
  }

  if (variant === 'stacked') {
    return (
      <div className={`inline-flex flex-col items-center text-center ${className}`}>
        {emblem}
        <div className={`${titleSizes[size]} font-extrabold tracking-tight leading-none mt-2`}>
          <span className="text-[#3B5273]">Med</span>
          <span className="text-[#6B9E9B]">Scribe</span>
        </div>
        {showSubtitle && (
          <div className={`${subSizes[size]} font-semibold text-[#5A718E] tracking-wide mt-1`}>
            {subtitleText}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {emblem}
      <div className="min-w-0 text-left">
        <div className={`${titleSizes[size]} font-extrabold tracking-tight leading-tight truncate`}>
          <span className="text-[#3B5273]">Med</span>
          <span className="text-[#6B9E9B]">Scribe</span>
        </div>
        {showSubtitle && (
          <div className={`${subSizes[size]} font-medium text-[#5A718E] truncate`}>
            {subtitleText}
          </div>
        )}
      </div>
    </div>
  );
};
