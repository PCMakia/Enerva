import { useClickThrough } from "./hooks/useClickThrough";

function App() {
  useClickThrough(true);

  return (
    <main className="overlay-shell">
      <div className="hit-zone interactive" data-interactive>
        Interactive zone
      </div>
    </main>
  );
}

export default App;
