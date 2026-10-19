export const coverPresets = [
  { id: 'books', label: 'Кітаптар', accent: 'teal' },
  { id: 'video', label: 'Бейнедәріс', accent: 'violet' },
  { id: 'technology', label: 'Технология', accent: 'blue' },
  { id: 'languages', label: 'Тілдер', accent: 'violet' },
  { id: 'mathematics', label: 'Математика', accent: 'teal' },
  { id: 'university', label: 'Университет', accent: 'amber' },
  { id: 'brain', label: 'Жасанды интеллект', accent: 'rose' },
  { id: 'science', label: 'Ғылым', accent: 'blue' },
] as const;
export type CoverPreset = (typeof coverPresets)[number]['id'];
export const levels = ['Бастапқы', 'Орташа', 'Жоғары', 'Барлық деңгей'] as const;
