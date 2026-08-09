import { useEffect, useRef, useState } from "react";
import { useClickThrough, EMPTY_CURSOR, type GlobalCursor } from "./hooks/useClickThrough";
import { DiaryDrawer } from "./components/DiaryDrawer";
import { Mascot } from "./components/Mascot";
import { RadialMenu, type RadialMenuMode, type RadialMenuSelection } from "./components/RadialMenu";
import { WatchWidget } from "./components/WatchWidget";
import { TaskWidget } from "./components/TaskWidget";
import { RoutineWidget } from "./components/RoutineWidget";
import { startFocusDayWatcher } from "./lib/focusTimeStore";

function App() {
  const cursorRef = useRef<GlobalCursor>(EMPTY_CURSOR);
  useClickThrough(true, cursorRef);

  useEffect(() => startFocusDayWatcher(), []);

  const [mascotKey, setMascotKey] = useState(0);
  const [radialMenu, setRadialMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    wheel: RadialMenuMode;
  }>({
    open: false,
    x: 0,
    y: 0,
    wheel: "main",
  });
  const [watchVisible, setWatchVisible] = useState(false);
  const [watchMode, setWatchMode] = useState<RadialMenuSelection>("pomodoro");
  const [tasksVisible, setTasksVisible] = useState(false);
  const [routinesVisible, setRoutinesVisible] = useState(false);

  const closeRadial = () =>
    setRadialMenu((prev) => ({ ...prev, open: false, wheel: "main" }));

  return (
    <main className="overlay-shell">
      <Mascot
        key={mascotKey}
        cursorRef={cursorRef}
        onContextMenuRequest={(x, y) => {
          setRadialMenu({
            open: true,
            x,
            y,
            wheel: "main",
          });
        }}
      />
      <DiaryDrawer onRefreshMascot={() => setMascotKey((k) => k + 1)} />
      <RadialMenu
        open={radialMenu.open}
        x={radialMenu.x}
        y={radialMenu.y}
        mode={radialMenu.wheel}
        onClose={closeRadial}
        onWheelModeChange={(wheel) => setRadialMenu((prev) => ({ ...prev, wheel }))}
        onSelectTimer={(mode) => {
          setWatchMode(mode);
          setWatchVisible(true);
          closeRadial();
        }}
        onOpenTasks={() => {
          setTasksVisible(true);
          closeRadial();
        }}
        onOpenRoutines={() => {
          setRoutinesVisible(true);
          closeRadial();
        }}
      />
      <WatchWidget
        visible={watchVisible}
        mode={watchMode}
        onClose={() => setWatchVisible(false)}
      />
      <TaskWidget visible={tasksVisible} onClose={() => setTasksVisible(false)} />
      <RoutineWidget
        visible={routinesVisible}
        onClose={() => setRoutinesVisible(false)}
      />
    </main>
  );
}

export default App;
