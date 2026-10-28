import { FilePicker } from './file-picker';
export function DocumentFileInput({ required = false }: { required?: boolean }) {
  return (
    <FilePicker
      label="PDF / Word файлын таңдау"
      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      required={required}
      help="PDF немесе Word (.docx) · 20 МБ дейін. Ескі .doc файлын .docx не PDF ретінде сақтаңыз."
    />
  );
}
