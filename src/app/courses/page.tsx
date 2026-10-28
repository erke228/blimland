import { LectureCatalog } from '@/components/lecture-catalog';
import type { CatalogFilters } from '@/lib/lecture-catalog';
export default async function Courses({ searchParams }: { searchParams: Promise<CatalogFilters> }) {
  const raw = await searchParams;
  const filters = Object.fromEntries(
    Object.entries(raw)
      .filter(([, v]) => typeof v === 'string')
      .map(([key, value]) => [key, value!.slice(0, 200)]),
  );
  return <LectureCatalog filters={filters} />;
}
