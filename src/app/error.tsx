'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h1>Бетті ашу мүмкін болмады</h1>
      <p>Қайта байқап көріңіз. Мәселе қайталанса, әкімшіге хабарлаңыз.</p>
      <button className="button primary" onClick={reset}>
        Қайта ашу
      </button>
    </div>
  );
}
