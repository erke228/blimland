export type AuditKind =
  | 'create'
  | 'edit'
  | 'remove'
  | 'restore'
  | 'publish'
  | 'access'
  | 'settings'
  | 'other';
const labels: Record<string, string> = {
  'teacher.approved': 'Оқытушы мәртебесі мақұлданды',
  'teacher.rejected': 'Оқытушы өтінімі қайтарылды',
  'course.created': 'Курс құрылды',
  'course.details.updated': 'Курс мәліметтері өңделді',
  'course.submitted': 'Курс тексеруге жіберілді',
  'course.published': 'Курс жарияланды',
  'course.draft': 'Курс өңдеуге қайтарылды',
  'course.reopened': 'Курс өңдеуге ашылды',
  'course.archived': 'Курс жасырылды',
  'course.hide': 'Курс жасырылды',
  'course.trash': 'Курс себетке көшірілді',
  'course.restore': 'Курс себеттен қайтарылды',
  'course.purged': 'Курс біржола жойылды',
  'course.demo.archived': 'Бұрынғы үлгі курс архивтелді',
  'course.cover.preset': 'Курс иллюстрациясы өзгертілді',
  'course.cover.uploaded': 'Курс мұқабасы жүктелді',
  'lesson.created': 'Дәріс қосылды',
  'lesson.updated': 'Дәріс мазмұны өңделді',
  'lesson.cover.updated': 'Дәріс мұқабасы өзгертілді',
  'lesson.cover.uploaded': 'Дәріс мұқабасы жүктелді',
  'lesson.material_uploaded': 'Дәріске құжат қосылды',
  'lesson.material_removed': 'Дәрістен құжат алынды',
  'lesson.material_restored': 'Дәріс құжаты қалпына келтірілді',
  'section.created': 'Бөлім қосылды',
  'section.updated': 'Бөлім атауы немесе реті өзгертілді',
  'section.removed': 'Бөлім жойылды',
  'section.restored': 'Бөлім қалпына келтірілді',
  'lecture.owner_imported': 'Автордың алғашқы дәрісі енгізілді',
  'lecture.owner_restored': 'Автордың алғашқы дәрісі қалпына келтірілді',
  'profile.updated': 'Жеке профиль өңделді',
  'profile.owner_name_updated': 'Бас әкімшінің аты-жөні өзгертілді',
  'profile.avatar.updated': 'Профиль суреті өзгертілді',
  'profile.password.changed': 'Құпиясөз өзгертілді',
  'profile.email.changed': 'Email өзгертілді',
  'user.updated': 'Пайдаланушы аккаунты өзгертілді',
  'user.sessions_revoked': 'Пайдаланушы сессиялары аяқталды',
  'user.demo_teacher_password_set': 'Оқытушыға жергілікті тексеру құпиясөзі орнатылды',
  'site.settings_updated': 'Сайт баптаулары өзгертілді',
  'group.created': 'Оқу тобы құрылды',
  'group.updated': 'Оқу тобы өңделді',
  'group.invite_created': 'Топқа шақыру жасалды',
  'group.invite_revoked': 'Топқа шақыру қайтарылды',
  'group.joined': 'Студент топқа қосылды',
  'group.left': 'Студент топтан шықты',
  'group.member_removed': 'Студент топтан шығарылды',
  'group.active': 'Оқу тобы қайта ашылды',
  'group.archived': 'Оқу тобы архивтелді',
  'group.course_assigned': 'Топқа курс тағайындалды',
  'group.course_removed': 'Топтан курс алынды',
};
export const auditKinds: Record<AuditKind, string> = {
  create: 'Қосу',
  edit: 'Өңдеу',
  remove: 'Жою / жасыру',
  restore: 'Қалпына келтіру',
  publish: 'Жариялау',
  access: 'Қолжетімділік',
  settings: 'Баптаулар',
  other: 'Басқа',
};
export function auditPresentation(action: string) {
  let kind: AuditKind = 'other';
  if (/restored|restore$|owner_imported|group.active/.test(action)) kind = 'restore';
  else if (/purged|removed|trash|archived|hide$/.test(action)) kind = 'remove';
  else if (/published|submitted|course.draft|course.reopened/.test(action)) kind = 'publish';
  else if (
    /teacher\.|user\.|password|email.changed|invite_|group.joined|group.left|group.course_assigned/.test(
      action,
    )
  )
    kind = 'access';
  else if (action.startsWith('site.')) kind = 'settings';
  else if (/created|uploaded/.test(action)) kind = 'create';
  else if (/updated|cover.preset/.test(action)) kind = 'edit';
  return {
    kind,
    label: labels[action] || 'Басқа басқару әрекеті',
    category: auditKinds[kind],
    permanent: action === 'course.purged',
  };
}
