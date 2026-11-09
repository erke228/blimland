'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Code2, ClipboardCheck, ArrowRight } from 'lucide-react';

function showStageNavigation(root: HTMLElement | null, id: string) {
  root?.scrollIntoView({ block: 'start' });
  root
    ?.querySelector<HTMLButtonElement>(`button[aria-controls="stage-${id}"]`)
    ?.focus({ preventScroll: true });
}

export function LessonStages({
  lesson,
  practice,
  quiz,
}: {
  lesson: ReactNode;
  practice?: ReactNode;
  quiz?: ReactNode;
}) {
  const stages = [
    {
      id: 'lesson-content',
      label: 'Дәріс',
      hint: 'Бейнені көріңіз немесе материалды оқыңыз.',
      icon: BookOpen,
      content: lesson,
    },
    ...(practice
      ? [
          {
            id: 'python-practice',
            label: 'Практика',
            hint: 'Мысалды іске қосып, кодты өзгертіп көріңіз.',
            icon: Code2,
            content: practice,
          },
        ]
      : []),
    ...(quiz
      ? [
          {
            id: 'knowledge-check',
            label: 'Тест',
            hint: 'Сұрақтарға жауап беріп, біліміңізді тексеріңіз.',
            icon: ClipboardCheck,
            content: quiz,
          },
        ]
      : []),
  ];
  const [active, setActive] = useState('lesson-content');
  const root = useRef<HTMLElement>(null);
  const hasPractice = Boolean(practice);
  const hasQuiz = Boolean(quiz);
  useEffect(() => {
    const sync = () => {
      const id = location.hash.slice(1);
      const available =
        id === 'lesson-content' ||
        (id === 'python-practice' && hasPractice) ||
        (id === 'knowledge-check' && hasQuiz);
      setActive(available ? id : 'lesson-content');
      // The native anchor may be hidden before hydration. Its stage button is already visible.
      if (available) showStageNavigation(root.current, id);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [hasPractice, hasQuiz]);
  const index = Math.max(
    0,
    stages.findIndex((s) => s.id === active),
  );
  function choose(id: string) {
    setActive(id);
    history.replaceState(null, '', '#' + id);
    showStageNavigation(root.current, id);
  }
  return (
    <section className="lesson-stages" ref={root} aria-label="Дәріспен жұмыс">
      <nav className="stage-navigation" aria-label="Оқу қадамдары">
        {stages.map((s, i) => (
          <button
            type="button"
            key={s.id}
            aria-pressed={i === index}
            aria-controls={`stage-${s.id}`}
            onClick={() => choose(s.id)}
          >
            <s.icon size={18} />
            <span>
              <span className="stage-number">{i + 1}. </span>
              {s.label}
            </span>
          </button>
        ))}
      </nav>
      <p className="stage-hint">{stages[index].hint}</p>
      {stages.map((s, i) => (
        <div id={`stage-${s.id}`} key={s.id} hidden={i !== index}>
          {s.content}
        </div>
      ))}
      {index < stages.length - 1 && (
        <div className="stage-next">
          <button
            type="button"
            className="button primary"
            onClick={() => choose(stages[index + 1].id)}
          >
            {stages[index + 1].label} бөліміне өту <ArrowRight size={17} />
          </button>
          <span>Қадамдар арасында кез келген уақытта ауыса аласыз.</span>
        </div>
      )}
    </section>
  );
}
