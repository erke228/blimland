import { migrate } from '../src/lib/db';
import { archiveDemoContent } from '../src/lib/demo-content';
migrate();
const count = archiveDemoContent();
console.log(
  `Database ready. Archived ${count} old demonstration courses. No sample content or accounts created.`,
);
