'use client';
import { Children, useId, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';

const steps = ['Атауы және құжат', 'Дәріс мазмұны', 'Қосымша мәліметтер'];
export function LectureEditorSteps({ children }: { children: ReactNode }) {
  const panels = Children.toArray(children);
  const [step, setStep] = useState(0);
  const id = useId();
  return (
    <div
      className="lecture-composer"
      onInvalidCapture={(event) => {
        const panel = (event.target as HTMLElement).closest<HTMLElement>('[data-lecture-step]');
        if (panel) flushSync(() => setStep(Number(panel.dataset.lectureStep)));
      }}
    >
      <div className="lecture-step-nav" aria-label="Дәрісті дайындау қадамдары">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-current={step === index ? 'step' : undefined}
            aria-controls={`${id}-${index}`}
            onClick={() => setStep(index)}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </div>
      <p className="help-text">
        {step + 1} / 3 · Қадамдарды ауыстырғанда енгізілген мәтін сақталады. Серверге сақтау үшін
        төмендегі батырманы басыңыз.
      </p>
      {panels.map((panel, index) => (
        <div
          key={index}
          id={`${id}-${index}`}
          data-lecture-step={index}
          hidden={step !== index}
          className="lecture-composer-panel form-stack"
        >
          <h3>{steps[index]}</h3>
          {panel}
        </div>
      ))}
      <div className="lecture-step-actions">
        {step > 0 && (
          <button className="button outline" type="button" onClick={() => setStep(step - 1)}>
            ← Алдыңғы қадам
          </button>
        )}
        {step < 2 && (
          <button className="button outline" type="button" onClick={() => setStep(step + 1)}>
            Келесі қадам →
          </button>
        )}
        {step === 2 && (
          <span className="help-text">Дайын. Дәрісті төмендегі батырмамен сақтаңыз.</span>
        )}
      </div>
    </div>
  );
}
