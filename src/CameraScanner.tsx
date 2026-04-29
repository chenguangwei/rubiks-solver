import { useEffect, useRef, useState } from 'react'
import { FACES } from './cube'
import type { Face } from './cube'
import { parseFace } from './parser'

interface CameraScannerProps {
  onComplete: (state: string) => void
  onCancel: () => void
}

export default function CameraScanner({ onComplete, onCancel }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [scannedFaces, setScannedFaces] = useState<Partial<Record<Face, Face[]>>>({})
  const [currentFaceIndex, setCurrentFaceIndex] = useState(0)

  const targetFace = FACES[currentFaceIndex]

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
    const canvas = document.createElement('canvas')
    const size = Math.min(video.videoWidth, video.videoHeight)
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
    
    const colors = parseFace(imgBuffer)
    const newScanned = { ...scannedFaces, [targetFace]: colors }
    setScannedFaces(newScanned)

    if (currentFaceIndex < 5) {
      setCurrentFaceIndex(currentFaceIndex + 1)
    } else {
      // All faces scanned, construct state string
      const stateString = FACES.map(f => newScanned[f]!.join('')).join('')
      onComplete(stateString)
    }
  }

  function handleUndo() {
    if (currentFaceIndex > 0) {
      setCurrentFaceIndex(currentFaceIndex - 1)
    }
  }

  if (error) {
    return (
      <div className="camera-scanner error-state panel">
        <h3>Camera Error</h3>
        <p>{error}</p>
        <button onClick={onCancel}>Close</button>
      </div>
    )
  }

  return (
    <div className="camera-scanner panel">
      <div className="camera-header">
        <div className="face-thumbnails">
          {FACES.map((face, idx) => (
            <div 
              key={face} 
              className={`face-thumb ${idx === currentFaceIndex ? 'active' : ''} ${scannedFaces[face] ? 'done' : ''}`}
            >
              {face}
            </div>
          ))}
        </div>
        <button className="close-btn" onClick={onCancel}>✕</button>
      </div>

      <div className="camera-viewport">
        <video ref={videoRef} autoPlay playsInline muted />
        <div className="ar-overlay">
          <div className="ar-grid">
             {Array.from({length: 9}).map((_, i) => <div key={i} className="ar-cell" />)}
          </div>
        </div>
      </div>

      <div className="camera-controls">
        <p className="instruction">Scan <strong>{targetFace}</strong> face (ensure white center is U, green is F)</p>
        <div className="camera-actions">
          <button disabled={currentFaceIndex === 0} onClick={handleUndo}>Undo</button>
          <button className="primary" onClick={handleCapture}>Capture {targetFace}</button>
        </div>
      </div>
    </div>
  )
}
