import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

// ─── DRIVER ───────────────────────────────────────────────────────────────────
// STORAGE_DRIVER=local  → guarda en public/ del frontend (desarrollo)
// STORAGE_DRIVER=s3     → sube a AWS S3; si S3 falla, cae a local automáticamente
const DRIVER = (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3';

// ─── MODO LOCAL ───────────────────────────────────────────────────────────────
// Los archivos se guardan en:  FRONTEND_PUBLIC_DIR/uploads/<key>
// Y son accesibles en:         FRONTEND_URL/uploads/<key>
const FRONTEND_PUBLIC_DIR =
  process.env.FRONTEND_PUBLIC_DIR ??
  path.resolve(process.cwd(), '..', 'frontend', 'public');

const LOCAL_UPLOADS_DIR = path.join(FRONTEND_PUBLIC_DIR, 'uploads');
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

@Injectable()
export class StorageService {
  // ── S3 client ────────────────────────────────────────────────────────────────
  private s3 = new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  // ── Helpers locales ─────────────────────────────────────────────────────────

  private ensureDir(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private localUploadUrl(key: string): string {
    const apiBase = process.env.API_URL ?? 'http://localhost:3001';
    return `${apiBase}/storage/local-upload?key=${encodeURIComponent(key)}`;
  }

  private localViewUrl(key: string): string {
    return `${FRONTEND_URL}/uploads/${key}`;
  }

  // ── Fallback S3 → local ──────────────────────────────────────────────────────
  // Si S3 está configurado pero falla (sin credenciales, sin red, bucket ausente),
  // devuelve la URL de subida local automáticamente y lo registra en el log.
  private async s3UploadUrl(
    key: string,
    contentType: string,
    expiresIn = 3600,
  ): Promise<{ uploadUrl: string; key: string; storage: 'local' | 's3' }> {
    if (DRIVER === 'local') {
      return { uploadUrl: this.localUploadUrl(key), key, storage: 'local' };
    }
    try {
      const command = new PutObjectCommand({
        Bucket:      process.env.AWS_BUCKET_NAME,
        Key:         key,
        ContentType: contentType,
      });
      const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn });
      return { uploadUrl, key, storage: 's3' };
    } catch (err) {
      console.warn(
        `[Storage] S3 no disponible (${(err as Error).message}). ` +
        `Usando almacenamiento local como fallback.`,
      );
      return { uploadUrl: this.localUploadUrl(key), key, storage: 'local' };
    }
  }

  // ── getUploadUrl (videos de cursos) ─────────────────────────────────────────
  async getUploadUrl(courseId: string, filename: string) {
    const ext = filename.split('.').pop() ?? 'mp4';
    const key = `courses/${courseId}/videos/${randomUUID()}.${ext}`;
    return this.s3UploadUrl(key, 'video/mp4', 3600);
  }

  // ── getCourseThumbnailUploadUrl ──────────────────────────────────────────────
  // No requiere courseId porque la portada se sube ANTES de crear el curso.
  // Ruta: thumbnails/<uuid>.<ext>
  async getCourseThumbnailUploadUrl(filename: string, contentType: string) {
    const ext = filename.split('.').pop() ?? 'jpg';
    const key = `thumbnails/${randomUUID()}.${ext}`;
    return this.s3UploadUrl(key, contentType, 600); // 10 min son suficientes
  }

  // ── getAvatarUploadUrl ───────────────────────────────────────────────────────
  async getAvatarUploadUrl(filename: string, contentType: string) {
    const ext = filename.split('.').pop() ?? 'jpg';
    const key = `avatars/${randomUUID()}.${ext}`;
    return this.s3UploadUrl(key, contentType, 300);
  }

  // ── getLessonVideoUploadUrl ──────────────────────────────────────────────────
  async getLessonVideoUploadUrl(
    courseId: string,
    lessonId: string,
    filename: string,
    contentType: string,
  ) {
    const ext = filename.split('.').pop() ?? 'mp4';
    const key = `courses/${courseId}/lessons/${lessonId}/video/${randomUUID()}.${ext}`;
    return this.s3UploadUrl(key, contentType, 3600);
  }

  // ── getLessonAttachmentUploadUrl ─────────────────────────────────────────────
  async getLessonAttachmentUploadUrl(
    courseId: string,
    lessonId: string,
    filename: string,
    contentType: string,
  ) {
    const ext = filename.split('.').pop() ?? 'bin';
    const key = `courses/${courseId}/lessons/${lessonId}/attachments/${randomUUID()}.${ext}`;
    return this.s3UploadUrl(key, contentType, 3600);
  }

  // ── getViewUrl ───────────────────────────────────────────────────────────────
  // Retorna { url } (objeto JSON, no string plano) para que el cliente lo parsee correctamente.
  // Si S3 falla al firmar, cae a la URL pública local como fallback.
  async getViewUrl(key: string): Promise<{ url: string }> {
    if (DRIVER === 'local') {
      return { url: this.localViewUrl(key) };
    }
    try {
      const command = new GetObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key:    key,
      });
      const url = await getSignedUrl(this.s3, command, { expiresIn: 7200 });
      return { url };
    } catch (err) {
      console.warn(
        `[Storage] S3 getViewUrl falló (${(err as Error).message}). ` +
        `Devolviendo URL local.`,
      );
      return { url: this.localViewUrl(key) };
    }
  }

  // ── saveLocalFile ────────────────────────────────────────────────────────────
  saveLocalFile(key: string, buffer: Buffer) {
    const filePath = path.join(LOCAL_UPLOADS_DIR, key);
    this.ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, buffer);
  }

  // ── readLocalFile ────────────────────────────────────────────────────────────
  readLocalFile(key: string): { buffer: Buffer; ext: string } {
    const filePath = path.join(LOCAL_UPLOADS_DIR, key);
    if (!fs.existsSync(filePath)) throw new Error('Archivo no encontrado');
    return {
      buffer: fs.readFileSync(filePath),
      ext:    path.extname(filePath).replace('.', ''),
    };
  }
}
