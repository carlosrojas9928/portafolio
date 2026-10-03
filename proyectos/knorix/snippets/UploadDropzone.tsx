'use client';
import { useState, useRef } from 'react';
import { storageApi, lessonsApi } from '@/lib/api';

interface Props {
  courseId: string;
  lessonId: string;
  onUploaded: (key: string) => void;
}

export default function UploadDropzone({ courseId, lessonId, onUploaded }: Props) {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    // Validar que sea un video
    if (!file.type.startsWith('video/')) {
      setError('Solo se permiten archivos de video (mp4, mov, webm)');
      return;
    }
    // Validar tamano maximo: 2GB
    if (file.size > 2 * 1024 * 1024 * 1024) {
      setError('El video no puede superar 2GB');
      return;
    }

    setUploading(true);
    setError('');
    setProgress(0);

    try {
      // 1. Pedir URL de upload al backend
      const { uploadUrl, key } = await storageApi.getUploadUrl(courseId, file.name);

      // 2. Subir el archivo DIRECTAMENTE a S3 con XMLHttpRequest
      //    (fetch no permite monitorear el progreso, XHR si)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status === 200) resolve();
          else reject(new Error(`Error S3: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Error de red al subir el video'));
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      // 3. Guardar la key del video en la leccion
      await lessonsApi.update(courseId, lessonId, { videoUrl: key });

      onUploaded(key);
    } catch (err: any) {
      setError(err.message || 'Error al subir el video');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className='border-2 border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer
        hover:border-[#f0c040]/50 transition'
      onClick={() => !uploading && inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
    >
      <input
        ref={inputRef}
        type='file'
        accept='video/*'
        className='hidden'
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {uploading ? (
        <div className='space-y-3'>
          <p className='text-white font-semibold'>Subiendo video... {progress}%</p>
          <div className='w-full bg-white/10 rounded-full h-2'>
            <div
              className='bg-[#f0c040] h-2 rounded-full transition-all duration-300'
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <div className='space-y-2'>
          <p className='text-4xl'>🎬</p>
          <p className='text-white font-semibold'>
            Arrastra tu video aqui o haz click para seleccionar
          </p>
          <p className='text-gray-500 text-sm'>MP4, MOV o WEBM — maximo 2GB</p>
        </div>
      )}

      {error && <p className='text-red-400 text-sm mt-3'>{error}</p>}
    </div>
  );
}
