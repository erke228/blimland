# Neon и Vercel

28 октября 2026 года. Репозиторий владельца: https://github.com/erke228/blimland.

## Подключения

- Neon: организация `org-bitter-pine-83057160`, проект `jolly-resonance-59529717`, ветка `production`, регион AWS us-east-2.
- Vercel: команда `vitsa`, проект `bilimhub`, ID `prj_RA61V3rNdFVuUs9gojOo6csaSZq1`. GitHub подключён командой `vercel git connect`.
- Проверенная production-версия: https://bilimhub-vitsa.vercel.app. Git push в `main` выполнен; код `0d3f88d`, deployment `dpl_xZNrJridR7PZ49sr6qzBF774ERcS`, статус READY. Защита Vercel Authentication включена.
- `neon.ts`: PostgreSQL и приватный bucket `bilimhub-files`. Существующая авторизация приложения сохранена; Neon Auth не включён.
- `neon deploy` успешно применил конфигурацию и записал 7 переменных в игнорируемый `.env.local`. На Vercel production они переданы как Secrets через stdin, вместе с `DATABASE_DRIVER=postgres`, `STORAGE_DRIVER=neon`, `COOKIE_SECURE=true`.
- `DATABASE_URL` — пул для запросов приложения, `DATABASE_URL_UNPOOLED` — только явные миграции. TLS проверяет сертификат. `pg` и `attachDatabasePool` используются в Node.js / Fluid compute; регион Vercel — cle1 рядом с БД.

## Код и данные

Запросы и серверные проверки стали асинхронными. PostgreSQL-транзакции используют Serializable с повтором конфликтов; SQLite остаётся изолированным локальным режимом. В SQLite асинхронная транзакция не выпускает промежуточные изменения другому запросу. Разрешения, пароли, прогресс, единственный главный администратор и минимальные профили одногруппников сохранены.

Версионированная схема — `db/postgres/001_initial.sql`. Применённые SQLite-миграции 001–008 не менялись. `db:migrate:postgres` идемпотентен и использует прямое подключение. `db:import:sqlite` принимает только пустые целевые таблицы, переносит строки в транзакции, сравнивает каждую строку и SHA256 каждого файла; рабочую базу не очищает.

Production перенесён из согласованной копии `.local/backups/before-neon.sqlite`. Результат импорта:

```text
status: PASS
users: 3
courses: 4
sections: 4
lessons: 10
enrollments: 1
academic_groups: 1
group_members: 1
lesson_materials: 1
verifiedPrivateAssets: 1
localSessionsTransferred: false
```

Архивные курсы и журнал сохранены. PDF соответствует оригиналу, включая 16 страниц. Пароли не менялись, пользователи при следующем входе создают новые сессии. Файлы выдаются через защищённые маршруты приложения; S3-ключи и credentials не выдаются браузеру. Объекты не лежат в `public` или Git. Исходная SQLite и файлы сохранены локально для отката; после перехода не вести параллельные рабочие изменения в двух базах.

## Проверки

- `npm run build`: успешно; компиляция, TypeScript и генерация маршрутов.
- `npm run typecheck`: успешно.
- `npm test`: 65/65, включая изоляцию асинхронной транзакции и перевод параметров SQL.
- `npm run test:integration`: успешно на SQLite и отдельно на настоящем PostgreSQL + Object Storage временной ветки `codex-bilimhub-verify`.
- `npm run test:integration -- --strict-cjs`: успешно с отключённым require(ESM), включая PDF/DOCX. Это проверяет совместимость, из-за которой первое размещение возвращало 500; sanitizer теперь собирается вместе с ESM-зависимостями. Очистка HTML сохранена.
- Проверены регистрация/вход, роли, закрытые документы, PDF больше 2 МБ, Word, обложки, собственные материалы, прогресс, группы, приглашения, CSV, блокировки, настройки, корзина/восстановление и удаление. Тестовые аккаунты не создавались в production.
- `scripts/check-postgres-services.ts`: успешно — два конкурентных принятия приглашения с лимитом 1, повторное принятие без расхода, конкурентный rate limit, rollback. Приватное хранилище: запись/чтение/удаление и отказ анонимному запросу.
- После устранения уязвимой транзитивной зависимости установлен `@vercel/functions@3.6.1`; npm сообщил `found 0 vulnerabilities`.

Проверка именно размещённого кода через авторизованный Vercel CLI:

```text
Vercel: READY
GET /learn/byte-pair-encoding: 200
GET /materials/.../file: 200 application/pdf
SHA256: 2152492cbb659e0b8d175274247bd20993fbb3f2fd0ebe99dd9109fce7e5e183
POST /login: 303 → /teacher
GET /teacher: 200
GET /profile?tab=contacts: 200
GET /admin от преподавателя: 307 forbidden
GET чужого редактора: 404
После выхода /teacher: 307 → /login
```

Пароль существующего преподавателя не менялся; проверочная сессия завершена. Тела запросов и cookie-файлы удалены после проверки, значения не печатались. Итоговый протокол — `.local/vercel-verification-result.json`. В error/fatal журнале исправленного deployment после проверочных запросов записей нет. Браузерная проверка локальной сборки с той же production-базой и хранилищем показывает 16 страниц PDF и переход 1→2; `.local/qa/neon-production-lecture.png`.

Для нативных аргументов установленного Vercel CLI нужен разделитель `--`, например `vercel curl <url> -- --silent --show-error`. Server Actions установленного Next.js принимают multipart-формы; URL-encoded тест не доказывает выполнение действия. Защиту Vercel для тестов не отключать.

Для повторной проверки использовать новую пустую временную ветку и отдельный файл переменных:

```powershell
$env:APP_ENV_FILE='.local/neon-verification.env'
npm run db:migrate:postgres
$env:BILIMHUB_POSTGRES_TEST='1'
npm run test:integration
npx tsx scripts/check-postgres-services.ts
```

Скрипты отказываются помещать фикстуры в ветку production. Уже заполненную проверочную ветку не использовать для повторной полной интеграции без её отдельного сброса. Копию production не сбрасывать ради тестов.

## Ограничения публикации

- Стандартная защита Vercel Authentication сохранена. READY, чтение PostgreSQL, выдача файла из Neon и прикладной вход проверены; открытый университетский запуск без этой защиты этим проходом не выполнялся.
- Vercel ограничивает тело запроса 4,5 МБ: https://vercel.com/docs/functions/limitations#request-body-size. В production `NEXT_PUBLIC_REQUEST_FILE_LIMIT=4194304` показывает фактические 4 МБ и предотвращает отправку большего файла. Приложение и локальный сервер сохраняют целевые 20 МБ для документов, но для этого объёма в Vercel ещё нужна прямая/составная загрузка в хранилище. Это ограничение не выдаётся за реализованные 20 МБ.
- Видео, тесты знаний, почта/восстановление пароля и прочие незавершённые этапы не стали готовыми от подключения Neon.
- Превью Vercel не должно писать в production. Переменные production настроены только для production; отдельную preview-ветку подключать явно.

## Локальный режим

При наличии `.env.local` от Neon `npm run dev` работает с production-базой. Для локальных экспериментов явно задавать `DATABASE_DRIVER=sqlite`, `STORAGE_DRIVER=local`, отдельный `DATABASE_PATH` и `UPLOAD_DIR`. CLI создания администратора читает окружение, не создаёт второго владельца и не сбрасывает существующий пароль. `preview:setup` и SQLite seed не запускать для заполнения production.

Секреты, `.local`, `.test-data`, `data`, `uploads`, `.vercel` и рабочие файлы не коммитить. Папки Unity из этого рабочего каталога к платформе не относятся и не отправляются.
