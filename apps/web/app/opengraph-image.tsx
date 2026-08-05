import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Coursel — Launch Your Own Online Academy';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 100,
            height: 100,
            borderRadius: 26,
            background: 'rgba(255,255,255,0.15)',
            color: '#ffffff',
            fontSize: 56,
            fontWeight: 800,
            marginBottom: 36,
          }}
        >
          C
        </div>
        <div style={{ display: 'flex', color: '#ffffff', fontSize: 76, fontWeight: 800, letterSpacing: '-2px' }}>
          Coursel
        </div>
        <div style={{ display: 'flex', color: 'rgba(255,255,255,0.88)', fontSize: 34, marginTop: 18 }}>
          Launch Your Own Online Academy
        </div>
      </div>
    ),
    { ...size }
  );
}
