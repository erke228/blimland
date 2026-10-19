import { Catalog } from '@/components/catalog';
export default async function Courses({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  return <Catalog {...await searchParams} />;
}
