import { randomUUID, randomBytes } from 'node:crypto';
import { migrate, one, run, transaction } from '../src/lib/db';
import { hashPassword } from '../src/lib/security';

migrate();
if (one('SELECT id FROM courses WHERE id = ?', 'algebra-basics')) {
  console.log('Demo content already exists. Nothing changed.');
  process.exit(0);
}
transaction(() => {
  const teacherId = randomUUID();
  run(
    'INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)',
    teacherId,
    'demo-author@example.invalid',
    'Айдана Сәрсен',
    hashPassword(randomBytes(48).toString('hex')),
    'teacher',
    Date.now(),
  );
  const demos = [
    {
      id: 'algebra-basics',
      title: 'Алгебра: сенімді алғашқы қадам',
      category: 'Математика',
      accent: 'teal',
      level: 'Бастапқы',
      price: 0,
      desc: 'Теңдеулерді түсініп, есептерді өз бетіңізше шешуді үйреніңіз. Қысқа сабақтар, мысалдар және жүйелі тәжірибе.',
      lessons: ['Алгебраға кіріспе', 'Айнымалылар мен өрнектер', 'Сызықтық теңдеулер'],
    },
    {
      id: 'kazakh-writing',
      title: 'Қазақ тілінде сауатты жазу',
      category: 'Тілдер',
      accent: 'violet',
      level: 'Барлық деңгей',
      price: 0,
      desc: 'Ойыңызды анық жеткізіп, мәтінді дұрыс құрастырыңыз. Күнделікті жазуға арналған қарапайым тәсілдер.',
      lessons: ['Мәтіннің құрылымы', 'Сөйлем және негізгі ой', 'Мәтінді редакциялау'],
    },
    {
      id: 'digital-skills',
      title: 'Цифрлық сауаттылық негіздері',
      category: 'Технология',
      accent: 'amber',
      level: 'Бастапқы',
      price: 0,
      desc: 'Ақпаратпен қауіпсіз жұмыс істеуді, пайдалы құралдарды таңдауды және цифрлық дағдыларды дамытуды үйреніңіз.',
      lessons: ['Цифрлық ортада жұмыс істеу', 'Ақпаратты іздеу', 'Деректерді қорғау'],
    },
  ];
  demos.forEach((course, i) => {
    run(
      'INSERT INTO courses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      course.id,
      teacherId,
      course.title,
      course.desc,
      course.category,
      course.level,
      course.price,
      'published',
      course.accent,
      Date.now() + i,
      Date.now(),
    );
    const sectionId = randomUUID();
    run('INSERT INTO sections VALUES (?, ?, ?, ?)', sectionId, course.id, 'Негізгі бөлім', 0);
    course.lessons.forEach((title, index) => {
      const body =
        course.id === 'algebra-basics'
          ? `Бұл — платформаны тексеруге арналған үлгі сабақ.\n\n${title}\n\nАлгебра сандар мен олардың арасындағы байланыстарды зерттейді. Айнымалы — мәні өзгеруі мүмкін шаманың белгісі. Мысалы, x + 3 = 7 теңдеуінде x = 4.\n\nТеңдеуді шешу үшін екі жаққа да бірдей амал қолданамыз. x + 3 = 7 теңдеуінің екі жағынан 3-ті азайтсақ, x = 4 шығады.\n\nӨзіңіз байқап көріңіз: x + 5 = 12. Шешімі: x = 7. Жауапты бастапқы теңдеуге қойып тексеріңіз.\n\nСабақтың мақсаты: айнымалыны ажырату және қарапайым теңдеуді түсіндіру.`
          : `Бұл — платформаны тексеруге арналған үлгі сабақ.\n\n${title}\n\nКурстың мазмұны мен оқу кабинеті қалай жұмыс істейтінін осы үлгі арқылы тексере аласыз. Толық оқу материалын мақұлданған оқытушы қосады.\n\nҮйренгеніңізді бекіту үшін негізгі ойды өз сөзіңізбен жазып көріңіз.`;
      run(
        'INSERT INTO lessons VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        randomUUID(),
        sectionId,
        title,
        body,
        '',
        8 + index * 3,
        index,
        index === 0 ? 1 : 0,
      );
    });
  });
});
console.log('Three clearly labelled demonstration courses created. No demo login password exists.');
