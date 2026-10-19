import { requireRole } from '@/lib/auth';
import { settings } from '@/lib/management';
import { saveSettingsAction } from '@/app/management-actions';
import { PageHeading, Notice } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { AdminTabs } from '@/components/admin-tabs';
export default async function SiteSettings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireRole('admin');
  const site = settings();
  return (
    <>
      <PageHeading
        eyebrow="БАС ӘКІМШІ"
        title="Сайт баптаулары"
        description="Оқу кеңістігінің атауы, хабарландыруы және тіркелу тәртібі."
      />
      <AdminTabs active="settings" />
      <Notice {...await searchParams} />
      <div className="panel narrow-panel">
        <form action={saveSettingsAction} className="form-stack">
          <label>
            Платформа атауы
            <input
              name="siteName"
              required
              minLength={2}
              maxLength={40}
              defaultValue={site.site_name}
            />
          </label>
          <label>
            Университет атауы
            <input
              name="institutionName"
              required
              minLength={2}
              maxLength={150}
              defaultValue={site.institution_name}
            />
          </label>
          <label>
            Барлық бетте көрсетілетін хабарландыру
            <textarea
              name="announcement"
              rows={4}
              maxLength={1000}
              defaultValue={site.announcement}
            />
            <small>Жасыру үшін бос қалдырыңыз.</small>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="registrationOpen"
              defaultChecked={!!site.registration_open}
            />
            Ашық тіркелуге рұқсат беру
          </label>
          <p className="help-text">
            Өшірілсе, жаңа аккаунт тіркелмейді. Бар пайдаланушылар кіре алады; шақыруды қабылдау
            үшін аккаунт қажет.
          </p>
          <SubmitButton>Баптауларды сақтау</SubmitButton>
        </form>
        <div className="font-specimen">
          <span>Қазақша мәтіннің көрінісі</span>
          <p>Әә Ғғ Ққ Ңң Өө Ұұ Үү Һһ Іі</p>
          <small>
            Қаріп сайтпен бірге жергілікті жүктеледі, сыртқы Google Fonts сұрауы қажет емес.
          </small>
        </div>
      </div>
    </>
  );
}
