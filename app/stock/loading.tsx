export default function Loading() {
  return (
    <>
      <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/>
      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '1100px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}>
        <p className="domain" style={{ textAlign: 'center', marginBottom: '2rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          재고현황
        </p>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 0', fontSize: '0.85rem' }}>
          데이터를 불러오는 중…
        </div>
      </div>
    </>
  );
}
