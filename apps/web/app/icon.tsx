import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const size        = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '6px',
        color: '#ffffff',
        fontSize: '18px',
        fontWeight: '700',
        fontFamily: 'sans-serif',
        letterSpacing: '-0.5px',
      }}
    >
      C
    </div>,
    { ...size }
  );
}
