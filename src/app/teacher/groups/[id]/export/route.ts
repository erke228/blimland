import { currentUser } from '@/lib/auth';
import { groupReport, ManagementError } from '@/lib/management';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  try {
    const report = groupReport(user.id, id);
    const cell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[\s]*[=+@\-]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const rows = [
      ['Студент', 'Email', 'Курс', 'Оқылған сабақтар', 'Барлық сабақтар', 'Пайыз'],
      ...report.map((r) => [
        r.name,
        r.email,
        r.course_title || '',
        r.completed,
        r.total,
        r.total ? Math.min(100, Math.round((100 * r.completed) / r.total)) : 0,
      ]),
    ];
    return new Response('\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="group-${id}-progress.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    if (e instanceof ManagementError) return new Response('Forbidden', { status: 403 });
    throw e;
  }
}
