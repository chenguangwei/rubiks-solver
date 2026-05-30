import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { FACE_COLORS, FACES } from './cube'
import type { Face } from './cube'
import { useI18n } from './i18n'
import {
  classifyScannedFaces,
  classifyScannedFaces2x2,
  classifyScannedFaces4x4,
  classifyScannedFaces5x5,
  parseFace,
  sampleFace,
} from './parser'
import type { ParseResult, RgbSample } from './parser'

interface CameraScannerProps {
  onComplete: (state: string) => void
  onCancel: () => void
  gridSize?: 2 | 3 | 4 | 5
}

export default function CameraScanner({ onComplete, onCancel, gridSize = 3 }: CameraScannerProps) {
  const { t } = useI18n()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [scannedFaces, setScannedFaces] = useState<Partial<Record<Face, Face[]>>>({})
  const [sampledFaces, setSampledFaces] = useState<Partial<Record<Face, RgbSample[]>>>({})
  const [currentFaceIndex, setCurrentFaceIndex] = useState(0)
  const [videoReady, setVideoReady] = useState(false)

  const targetFace = FACES[currentFaceIndex]
  const capturedCount = Object.keys(scannedFaces).length

  useEffect(() => {
    let stream: MediaStream | null = null
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 720 }, height: { ideal: 720 } },
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
    startCamera()
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  function handleCapture() {
    if (!videoRef.current) return
    const video = videoRef.current
    const size = Math.min(video.videoWidth, video.videoHeight)
    if (!videoReady || size <= 0) {
      setError(t('camera.frameNotReady'))
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Crop the center square of the video
    const startX = (video.videoWidth - size) / 2
    const startY = (video.videoHeight - size) / 2
    ctx.drawImage(video, startX, startY, size, size, 0, 0, size, size)

    const imageData = ctx.getImageData(0, 0, size, size)
    const imgBuffer = {
      width: size,
      height: size,
      data: imageData.data,
    }
    
    const samples = sampleFace(imgBuffer, { gridSize })
    const colors = parseFace(imgBuffer, { gridSize })
    const newScanned = { ...scannedFaces, [targetFace]: colors }
    const newSamples = { ...sampledFaces, [targetFace]: samples }
    setScannedFaces(newScanned)
    setSampledFaces(newSamples)

    if (currentFaceIndex < 5) {
      setCurrentFaceIndex(currentFaceIndex + 1)
    } else {
      let result: ParseResult
      if (gridSize === 2) {
        result = classifyScannedFaces2x2(newSamples)
      } else if (gridSize === 4) {
        result = classifyScannedFaces4x4(newSamples)
      } else if (gridSize === 5) {
        result = classifyScannedFaces5x5(newSamples)
      } else {
        result = classifyScannedFaces(newSamples)
      }
      if (result.ok) {
        onComplete(result.state)
      } else {
        setError(result.reason)
      }
    }
  }

  function handleUndo() {
    if (currentFaceIndex > 0) {
      const previousFace = FACES[currentFaceIndex - 1]
      setCurrentFaceIndex(currentFaceIndex - 1)
      setScannedFaces((current) => {
        const next = { ...current }
        delete next[previousFace]
        return next
      })
      setSampledFaces((current) => {
        const next = { ...current }
        delete next[previousFace]
        return next
      })
      setError(null)
    }
  }

  if (error) {
    return (
      <div className="camera-scanner error-state panel">
        <h3>{t('camera.errorTitle')}</h3>
        <p>{error}</p>
        <button onClick={onCancel}>{t('camera.close')}</button>
      </div>
    )
  }

  return (
    <div className="camera-scanner panel">
      <div className="camera-header">
        <div>
          <strong>{t('camera.title')}</strong>
          <p>{t('camera.progress', { current: capturedCount, total: FACES.length })}</p>
        </div>
        <button className="close-btn" onClick={onCancel}>✕</button>
      </div>

      <div className="face-thumbnails" aria-label={t('camera.faces')}>
        {FACES.map((face, idx) => (
          <div 
            key={face} 
            className={`face-thumb ${idx === currentFaceIndex ? 'active' : ''} ${scannedFaces[face] ? 'done' : ''}`}
            title={`${face} ${t(`face.name.${face}`)}`}
          >
            {scannedFaces[face] ? (
              <>
                <span
                  className="face-thumb-grid"
                  aria-hidden="true"
                  style={{ '--grid-size': gridSize } as CSSProperties}
                >
                  {scannedFaces[face]!.map((sticker, stickerIndex) => (
                    <span
                      key={`${face}-${stickerIndex}`}
                      style={{ '--face-color': FACE_COLORS[sticker] } as CSSProperties}
                    />
                  ))}
                </span>
                <span className="face-thumb-label">
                  <strong>{face}</strong>
                  <small>{t(`face.name.${face}`)}</small>
                </span>
              </>
            ) : (
              <span className="face-thumb-label">
                <strong>{face}</strong>
                <small>{t(`face.name.${face}`)}</small>
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="camera-viewport">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setVideoReady(true)}
          onCanPlay={() => setVideoReady(true)}
        />
        <div className="ar-overlay">
          <div className="ar-grid" style={{ '--grid-size': gridSize } as CSSProperties}>
             {Array.from({ length: gridSize * gridSize }).map((_, i) => <div key={i} className="ar-cell" />)}
          </div>
        </div>
      </div>

      <div className="camera-controls">
        <p className="instruction">
          {t('camera.scanInstruction', { face: targetFace })}
        </p>
        <p className="camera-tip">{t('camera.tip')}</p>
        <div className="camera-actions">
          <button disabled={currentFaceIndex === 0} onClick={handleUndo}>{t('camera.undo')}</button>
          <button className="primary" disabled={!videoReady} onClick={handleCapture}>
            {videoReady ? t('camera.capture', { face: targetFace }) : t('camera.loading')}
          </button>
        </div>
      </div>
    </div>
  )
}
