'use client';

import { useEffect, useRef, useState } from 'react';

import type { Translate } from '../../i18n/messages';
import { createFrameReader } from '../../lib/console/qr-detector';
import styles from './console.module.css';
import { Button } from './ui';

type Facing = 'environment' | 'user';
const FACING_KEY = 'overoll-console-camera';
/** The same code is reported again only after this pause (a failed scan doesn't loop). */
const REPEAT_MS = 4000;
const FRAME_MS = 200;

interface Props {
  t: Translate;
  /** Called with the text of each QR code read. */
  onRead: (text: string) => void;
  /** No camera or permission refused: the screen offers typing instead. */
  onUnavailable?: () => void;
  paused?: boolean;
}

/** Live camera with QR reading: BarcodeDetector where available, jsQR otherwise. */
export function QrCamera({ t, onRead, onUnavailable, paused = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onReadRef = useRef(onRead);
  const onUnavailableRef = useRef(onUnavailable);
  const [status, setStatus] = useState<'starting' | 'running' | 'unavailable'>('starting');
  const [facing, setFacing] = useState<Facing | null>(null);

  useEffect(() => {
    onReadRef.current = onRead;
    onUnavailableRef.current = onUnavailable;
  });

  // The till remembers which camera faces the customer.
  useEffect(() => {
    setFacing(window.localStorage.getItem(FACING_KEY) === 'user' ? 'user' : 'environment');
  }, []);

  useEffect(() => {
    if (paused || !facing) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = { text: '', at: 0 };

    const fail = () => {
      if (stopped) return;
      setStatus('unavailable');
      onUnavailableRef.current?.();
    };

    void (async () => {
      setStatus('starting');
      if (!navigator.mediaDevices?.getUserMedia) return fail();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch {
        return fail();
      }
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const read = await createFrameReader();
      if (stopped) return;
      setStatus('running');

      const loop = async () => {
        if (stopped) return;
        try {
          const text = video.readyState >= 2 ? await read(video) : null;
          const now = Date.now();
          if (text && !stopped && (text !== last.text || now - last.at > REPEAT_MS)) {
            last = { text, at: now };
            onReadRef.current(text);
          }
        } catch {
          // A frame that can't be read; try the next one.
        }
        if (!stopped) timer = setTimeout(loop, FRAME_MS);
      };
      void loop();
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [paused, facing]);

  const flip = () => {
    const next: Facing = facing === 'user' ? 'environment' : 'user';
    window.localStorage.setItem(FACING_KEY, next);
    setFacing(next);
  };

  return (
    <div className={styles.column}>
      <div className={styles.camera}>
        <video ref={videoRef} muted playsInline className={facing === 'user' ? styles.mirror : undefined} />
        {status === 'running' ? <div className={styles.frame} /> : null}
        {status === 'unavailable' ? <p className={styles.cameraMessage}>{t('console.scan.noCamera')}</p> : null}
      </div>
      <div className={styles.cameraBar}>
        <p className={styles.strong}>{t('console.scan.camera')}</p>
        <Button size="small" onClick={flip} disabled={!facing}>
          {t('console.scan.flip')}
        </Button>
      </div>
    </div>
  );
}
