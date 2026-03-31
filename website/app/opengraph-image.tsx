import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'YT DeClicker — silence keyboard noise on YouTube'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#111',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          fontFamily: 'monospace',
        }}
      >
        {/* Badge */}
        <div
          style={{
            background: '#FFE500',
            color: '#111',
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: 4,
            padding: '8px 18px',
            marginBottom: 32,
          }}
        >
          CHROME EXTENSION
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 80,
            fontWeight: 900,
            color: '#fff',
            lineHeight: 1,
            letterSpacing: -3,
            marginBottom: 12,
          }}
        >
          YT DeCLICKER
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 32,
            color: '#FFE500',
            fontWeight: 700,
            letterSpacing: -1,
            marginBottom: 40,
          }}
        >
          Kill keyboard noise on YouTube — instantly
        </div>

        {/* Pills */}
        <div style={{ display: 'flex', gap: 16 }}>
          {['EQ Lite', 'RNNoise ML', 'DeepFilterNet3 AI'].map((label) => (
            <div
              key={label}
              style={{
                background: '#1a1a1a',
                border: '2px solid #333',
                color: '#ccc',
                fontSize: 18,
                fontWeight: 700,
                padding: '8px 20px',
                letterSpacing: 1,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Domain */}
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            right: 80,
            color: '#555',
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: 2,
          }}
        >
          ytdeclicker.com
        </div>
      </div>
    ),
    { ...size }
  )
}
