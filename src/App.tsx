import { useClickThrough } from "./hooks/useClickThrough";
import { DiaryDrawer } from "./components/DiaryDrawer";

function App() {
  useClickThrough(true);

  return (
    <main className="overlay-shell">
      <DiaryDrawer />
    </main>
  );
}

export default App;
