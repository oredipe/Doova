// Shown the instant someone taps a link, while the next screen loads.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="skel" style={{ height: 28, width: "45%" }} />
      <div className="skel" style={{ height: 120 }} />
      <div className="skel" style={{ height: 72 }} />
      <div className="skel" style={{ height: 72 }} />
    </div>
  );
}
