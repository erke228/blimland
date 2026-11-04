import { currentUser } from '@/lib/auth';
import { practiceDownload } from '@/lib/practices';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const { id } = await params;
  const data = await practiceDownload(id, user?.id);
  if (!data)
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  const format = new URL(request.url).searchParams.get('format');
  const content =
    format === 'py'
      ? data.full_code
      : format === 'requirements'
        ? data.requirements
        : JSON.stringify(
            {
              nbformat: 4,
              nbformat_minor: 5,
              metadata: {
                kernelspec: { name: 'python3', display_name: 'Python 3', language: 'python' },
              },
              cells: [
                {
                  cell_type: 'markdown',
                  metadata: {},
                  source: [
                    data.title + '\n',
                    'Толық тәжірибені Python ортасында орындаңыз. TensorFlow және Streamlit браузердегі шағын ортаға кірмейді.\n',
                  ],
                },
                {
                  cell_type: 'code',
                  metadata: {},
                  execution_count: null,
                  outputs: [],
                  source: data.full_code.split(/(?<=\n)/),
                },
              ],
            },
            null,
            2,
          );
  const ext = format === 'py' ? 'py' : format === 'requirements' ? 'txt' : 'ipynb';
  return new Response(content, {
    headers: {
      'Content-Type':
        ext === 'ipynb' ? 'application/x-ipynb+json; charset=utf-8' : 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${format === 'requirements' ? 'requirements' : 'STEM-practice'}.${ext}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
