import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

const MIME: Record<string, string> = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.pdf':  'application/pdf',
  '.mp4':  'video/mp4',
  '.mov':  'video/quicktime',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
};

function isAuthorised(req: NextRequest): boolean {
  const headerPwd = req.headers.get('x-admin-password');
  const queryPwd  = new URL(req.url).searchParams.get('pwd');
  return (headerPwd ?? queryPwd) === process.env.ADMIN_PASSWORD;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  if (!isAuthorised(req)) {
    return new NextResponse('Unauthorised', { status: 401 });
  }

  const { path: pathSegments } = await params;
  const relative = pathSegments.join('/');
  const filePath = path.resolve(UPLOAD_DIR, relative);

  // Prevent path traversal attacks
  if (!filePath.startsWith(UPLOAD_DIR)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  if (!fs.existsSync(filePath)) {
    return new NextResponse('File not found', { status: 404 });
  }

  const ext      = path.extname(filePath).toLowerCase();
  const mimeType = MIME[ext] ?? 'application/octet-stream';

  // Stream the file instead of loading it entirely into memory
  const fileStream = fs.createReadStream(filePath);
  const webStream  = new ReadableStream({
    start(controller) {
      fileStream.on('data',  chunk => controller.enqueue(chunk));
      fileStream.on('end',   ()    => controller.close());
      fileStream.on('error', err   => controller.error(err));
    },
    cancel() {
      fileStream.destroy();
    }
  });

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'Content-Type':        mimeType,
      'Content-Disposition': 'inline',
      'Cache-Control':       'private, max-age=3600',
    },
  });
}
