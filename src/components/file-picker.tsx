'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { FileCheck2, ImagePlus, UploadCloud, X } from 'lucide-react';

export function FilePicker({
  label,
  accept,
  help,
  required = false,
  image = false,
  previewImage = false,
  onFile,
}: {
  label: string;
  accept: string;
  help: string;
  required?: boolean;
  image?: boolean;
  previewImage?: boolean;
  onFile?: (file?: File) => void;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>(),
    [preview, setPreview] = useState('');
  const requestLimit = Number(process.env.NEXT_PUBLIC_REQUEST_FILE_LIMIT || 0);
  useEffect(() => {
    if (!file || !previewImage) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, previewImage]);
  function choose(next?: File) {
    input.current?.setCustomValidity(
      requestLimit && next && next.size > requestLimit
        ? 'Бұл нұсқада файл 4 МБ-тан аспауы тиіс. Үлкен файлды жүктеу кейін қосылады.'
        : '',
    );
    setFile(next);
    setPreview('');
    onFile?.(next);
  }
  return (
    <div className={`file-picker ${file ? 'has-file' : ''}`}>
      <label className="file-picker-target" htmlFor={id}>
        <span className="file-picker-icon" aria-hidden="true">
          {file ? (
            <FileCheck2 size={23} />
          ) : image ? (
            <ImagePlus size={23} />
          ) : (
            <UploadCloud size={23} />
          )}
        </span>
        <span>
          <strong>{label}</strong>
          <small>
            {file
              ? 'Басқа файлды таңдау үшін басыңыз'
              : 'Құрылғыңыздан файл таңдаңыз немесе осында сүйреп әкеліңіз'}
          </small>
        </span>
        <input
          ref={input}
          id={id}
          name="file"
          type="file"
          accept={accept}
          required={required}
          aria-label={label}
          onChange={(event) => choose(event.target.files?.[0])}
        />
      </label>
      {file && (
        <div className="file-picker-selection" aria-live="polite">
          <FileCheck2 size={16} />
          <span>
            {file.name}
            <small>{(file.size / (1024 * 1024)).toFixed(2)} МБ</small>
          </span>
          <button
            type="button"
            aria-label="Таңдалған файлды алып тастау"
            onClick={() => {
              if (input.current) input.current.value = '';
              choose();
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {preview && <img className="file-picker-preview" src={preview} alt="Таңдалған сурет" />}
      <p className="help-text">
        {requestLimit
          ? help.replace(/(?:5|20) МБ дейін/g, `${Math.floor(requestLimit / 1024 / 1024)} МБ дейін`)
          : help}
      </p>
    </div>
  );
}
