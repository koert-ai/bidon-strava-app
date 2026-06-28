const today = () => new Date().toISOString().slice(0, 10);

const PRESETS = [
  {
    label: 'This week',
    getRange: () => {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return { from: d.toISOString().slice(0, 10), to: today() };
    },
  },
  {
    label: 'This month',
    getRange: () => {
      const d = new Date();
      d.setDate(1);
      return { from: d.toISOString().slice(0, 10), to: today() };
    },
  },
  {
    label: 'This season',
    getRange: () => ({ from: `${new Date().getFullYear()}-01-01`, to: today() }),
  },
  {
    label: 'All time',
    getRange: () => ({ from: '2010-01-01', to: today() }),
  },
];

export default function DatePresets({ onSelect, active }) {
  return (
    <div className="date-presets">
      {PRESETS.map(p => (
        <button
          key={p.label}
          className={`btn-small preset-btn${active === p.label ? ' preset-btn-active' : ''}`}
          onClick={() => { const r = p.getRange(); onSelect(r.from, r.to, p.label); }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
