'use client';
import { useEffect, useState } from 'react';
import ReactPlayer from 'react-player';
import { storageApi, enrollmentsApi } from '@/lib/api';

interface Props {
  lessonKey: string;   // la key del video en S3
  lessonId: string;
  courseId: string;
  onComplete?: () => void;
}

export default function VideoPlayer({ lessonKey, lessonId, courseId, onComplete }: Props) {
  const [videoUrl, setVideoUrl] = useState('');
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Obtener URL firmada del backend cada vez que cambia la leccion
    setLoading(true);
    setCompleted(false);
    storageApi.getViewUrl(lessonKey)
      .then((url: string) => setVideoUrl(url))
      .finally(() => setLoading(false));
  }, [lessonKey]);

  async function handleProgress({ played }: { played: number }) {
    // Al llegar al 90% marcar como completada (una sola vez)
    if (played >= 0.9 && !completed) {
      setCompleted(true);
      try {
        await enrollmentsApi.completeLesson(courseId, lessonId);
        onComplete?.();
      } catch (err) {
        console.error('Error al marcar leccion completa:', err);
      }
    }
  }

  if (loading) {
    return (
      <div className='aspect-video bg-[#07080f] rounded-xl flex items-center justify-center'>
        <p className='text-gray-500'>Cargando video...</p>
      </div>
    );
  }

  return (
    <div className='aspect-video bg-black rounded-xl overflow-hidden'>
      <ReactPlayer
        url={videoUrl}
        width='100%'
        height='100%'
        controls
        onProgress={handleProgress}
        progressInterval={5000}
        config={{
          file: {
            attributes: {
              controlsList: 'nodownload',  // deshabilita el boton de descarga
              onContextMenu: (e: any) => e.preventDefault(), // deshabilita click derecho
            },
          },
        }}
      />
    </div>
  );
}
